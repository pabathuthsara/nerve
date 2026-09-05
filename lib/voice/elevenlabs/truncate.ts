/**
 * What she actually said, as opposed to what she was going to say.
 *
 * This is the load-bearing piece of barge-in. When the user speaks over her we
 * stop playback and cancel the synthesis, and at that moment her conversation
 * history has to be cut back to the words that physically reached the ear. If
 * it is not, she "remembers" saying things the user never heard, and every
 * later turn is answering a conversation that did not happen.
 *
 * Two levels of precision, in preference order:
 *
 *  1. **Alignment.** The `/with-timestamps` endpoint returns a start and end
 *     time for every character it synthesised. Given a playhead we know exactly
 *     which characters left the speaker. This is sample-accurate.
 *  2. **Proportional.** If alignment does not arrive, fall back to the share of
 *     the clip that played, mapped onto the string. Approximate, and it is why
 *     the word-boundary rule below is not optional.
 *
 * Round 8 on the managed API cut a line mid-word — "Depends, a lot's just sad
 * people in". A cut mid-*sentence* is honest; the user really did interrupt
 * there. A cut mid-*word* is a bug, and it is the one thing this module refuses
 * to produce.
 *
 * Pure. No DOM, no audio, no network.
 *
 * The two string helpers this uses are shared with the OpenAI arm — see
 * `lib/voice/truncate.ts`. They are re-exported here so this module stays the
 * one import for anything working on barge-in.
 */

import { proportionalPrefix, snapToWordBoundary } from '../truncate'

export { proportionalPrefix, snapToWordBoundary }

/**
 * Words, counted the way the transcript and the stability meter count them.
 *
 * Bracketed spans go first: a delivery tag is prosody the vendor echoes back,
 * never speech, and it is already stripped before anything reaches the record
 * (see `stripDeliveryTags`). Counting it here would spend a word of her budget
 * on something nobody hears.
 */
export function spokenWordCount(text: string): number {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

/**
 * The band's word ceiling, made true rather than merely stated.
 *
 * `lib/warmth/bands.ts` argues the case: every cap in that table was authored
 * against a speech-to-speech model that ran at half of whatever it was allowed,
 * so the number was a guardrail nobody touched. The writer on this arm hits
 * whatever number it is given and then keeps climbing, because its own replies
 * come back as the conversation and become the example of how she talks —
 * measured within a single rep, three-sentence turns went from 30% to 67% while
 * the realtime arm stayed at 2%.
 *
 * So the ceiling is enforced where the words are actually produced. Two rules,
 * and both matter:
 *
 *  1. **Never mid-sentence.** Generation is already flushed sentence by
 *     sentence (`shouldFlush`), so the stop lands on a boundary she chose. A
 *     reply cut mid-clause is worse than a long one — that is the same rule
 *     this module exists to enforce for barge-in.
 *  2. **Always at least one sentence.** The first flush is spent before the
 *     budget can refuse anything, so a low band can never produce silence.
 *
 * The consequence is that a single long sentence still goes out whole. That is
 * deliberate: this is a ceiling on how much she PILES ON, not a shredder.
 */
export class ReplyBudget {
  private spent = 0

  constructor(private readonly cap: number) {}

  /** Record a sentence that has gone to synthesis. True when she has reached
   *  her ceiling and generation should stop here. */
  spend(text: string): boolean {
    this.spent += spokenWordCount(text)
    return this.spent >= this.cap
  }

  get words(): number {
    return this.spent
  }
}

/**
 * The same ceiling applied to a reply that arrived whole.
 *
 * The live pipeline stops GENERATION at the flush that reaches the budget, so
 * it never has a complete reply to trim. Anything holding one — the audition
 * harness, an offline measurement — has to reach the same answer by the same
 * rule, or it reports numbers no customer experiences. Sentences are split on
 * terminal punctuation, which is the boundary `shouldFlush` uses.
 */
export function capToBudget(text: string, cap: number): string {
  const sentences = text.trim().split(/(?<=[.!?]["'’”)]?)\s+/).filter(Boolean)
  const budget = new ReplyBudget(cap)
  const kept: string[] = []
  for (const sentence of sentences) {
    kept.push(sentence)
    if (budget.spend(sentence)) break
  }
  return kept.join(' ')
}

export interface AlignmentChunk {
  characters: string[]
  /** Seconds from the start of this clip. */
  characterStartTimesSeconds: number[]
  characterEndTimesSeconds: number[]
}

interface SpeechSegment {
  text: string
  startSeconds: number
  endSeconds: number
  /** End times on the turn clock, only when the vendor supplied alignment. */
  characterEnds: number[] | null
  characters: string[] | null
}

export class SpokenTurn {
  /** Preserve arrival order even when a vendor mixes aligned and raw chunks. */
  private readonly segments: SpeechSegment[] = []
  private scheduledSeconds = 0

  /** One `/with-timestamps` frame. Actual PCM duration, when known, is the
   *  playback clock: the last spoken character can end before the audio does. */
  appendAligned(chunk: AlignmentChunk, audioSeconds?: number): void {
    const offset = this.scheduledSeconds
    const last = chunk.characterEndTimesSeconds[chunk.characterEndTimesSeconds.length - 1] ?? 0
    const duration = Number.isFinite(audioSeconds) ? Math.max(0, audioSeconds!) : Math.max(0, last)
    this.segments.push({
      text: chunk.characters.join(''),
      startSeconds: offset,
      endSeconds: offset + duration,
      characters: [...chunk.characters],
      characterEnds: chunk.characters.map((_, i) => offset + (chunk.characterEndTimesSeconds[i] ?? 0)),
    })
    this.scheduledSeconds += duration
  }

  /** Fallback frame. Audio-only trailing frames add time without duplicating
   *  text already received through alignment. */
  appendUnaligned(text: string, audioSeconds: number): void {
    const duration = Number.isFinite(audioSeconds) ? Math.max(0, audioSeconds) : 0
    const previous = this.segments[this.segments.length - 1]
    if (text === '' && previous?.characterEnds === null) {
      // A raw clip's full text arrives with its first chunk. The subsequent
      // audio extends that same proportional window, not a textless new clip.
      previous.endSeconds += duration
      this.scheduledSeconds += duration
      return
    }
    this.segments.push({
      text,
      startSeconds: this.scheduledSeconds,
      endSeconds: this.scheduledSeconds + duration,
      characters: null,
      characterEnds: null,
    })
    this.scheduledSeconds += duration
  }

  get fullText(): string {
    return this.segments.map((segment) => segment.text).join('')
  }

  get audioSeconds(): number {
    return this.scheduledSeconds
  }

  get hasAlignment(): boolean {
    return this.segments.some((segment) => segment.characters !== null && segment.characters.length > 0)
  }

  /** Keep words on the actual playhead, never words waiting in a later clip. */
  playedText(playedSeconds: number): string {
    if (playedSeconds <= 0) return ''
    if (playedSeconds >= this.scheduledSeconds) return this.fullText.trim()

    let prefix = ''
    for (const segment of this.segments) {
      if (playedSeconds >= segment.endSeconds) {
        prefix += segment.text
        continue
      }
      if (playedSeconds < segment.startSeconds) break
      if (segment.characters && segment.characterEnds) {
        for (let i = 0; i < segment.characters.length; i += 1) {
          if ((segment.characterEnds[i] ?? 0) > playedSeconds) break
          prefix += segment.characters[i] ?? ''
        }
      } else {
        const duration = segment.endSeconds - segment.startSeconds
        prefix += proportionalPrefix(segment.text,
          duration > 0 ? (playedSeconds - segment.startSeconds) / duration : 1)
      }
      break
    }
    return snapToWordBoundary(prefix, this.fullText[prefix.length] ?? '')
  }

  wasTruncated(playedSeconds: number): boolean {
    return playedSeconds < this.scheduledSeconds && this.fullText.trim().length > 0
  }
}
