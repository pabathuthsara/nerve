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
 * Hesitation, which is not something she says. It is something she does.
 *
 * Measured across 1,274 real agent turns: SIX contained a disfluency, five a
 * self-repair, three were a bare "Yeah." A person waiting for a dryer is
 * inarticulate constantly; she was inarticulate 0.5% of the time, and that —
 * not her sentence length, which was fine at a median of 8 words — is the
 * loudest reason she reads as a machine.
 *
 * Part of the cause is arithmetic. At a six-word ceiling "Um, I dunno. Work
 * stuff." spends a third of its budget on nothing, so a writer optimising for
 * informative density under a hard cap correctly drops the filler and produces
 * an epigram. The cap and the register were fighting and the cap always won.
 *
 * So filler is FREE. It costs no budget, and a reply that spends four real
 * words and two "um"s is a four-word reply. This does not make her hesitate —
 * only the authored examples in her contract do that — but it stops the ceiling
 * from deleting the hesitation when she does.
 */
const BUDGET_FREE =
  /^(?:um+|uh+|er+|erm+|ah+|oh+|hm+|mm+|mhm+|hmm+|well|so|like|right|yeah|okay|ok|i mean|you know|sort of|kind of)$/i

/**
 * What a reply costs against its band ceiling.
 *
 * The same count as `spokenWordCount` with the hesitation removed. Deliberately
 * a SECOND function rather than a change to the first: `spokenWordCount` is
 * what the telemetry records and what the drift detector reads, and those want
 * the honest number. Only the budget forgives filler.
 *
 * `BUDGET_FREE` is capped at a third of the reply so the discount cannot be
 * farmed: "Well, so, like, you know, right, yeah" is not a free sentence.
 */
export function budgetedWordCount(text: string): number {
  const words = text
    .replace(/\[[^\]]*\]/g, ' ')
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
  if (words.length === 0) return 0
  const free = words.filter((word) => BUDGET_FREE.test(word)).length
  return words.length - Math.min(free, Math.floor(words.length / 3))
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
 *  1. **Never mid-sentence.** The reply is split on terminal punctuation and
 *     kept whole sentence by whole sentence, so the stop lands on a boundary
 *     she chose. A reply cut mid-clause is worse than a long one — that is the
 *     same rule this module exists to enforce for barge-in.
 *  2. **Always at least one sentence.** The first is spent before the budget
 *     can refuse anything, so a low band can never produce silence.
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
 * The ceiling, applied to a reply that arrived whole. **This is the live path.**
 *
 * It used to be the offline one. The pipeline flushed sentence by sentence and
 * stopped generating at the flush that reached the budget, so it never held a
 * complete reply to trim, and this existed for the audition harness alone.
 * Since a turn became one prosodic unit (`combined.ts`) the buffered reply is
 * exactly what both need — so the harness and the customer now go through the
 * same function rather than through two implementations of one rule.
 */
/**
 * The punctuation rule, ENFORCED rather than requested.
 *
 * `PUNCTUATION_RULES` has said "Never use em-dashes. They produce an unnatural
 * clipped pause when spoken." in every contract on the roster since it was
 * written. Measured across 1,274 real agent turns: 42 em-dashes, 3.3% of her
 * speech, including "You sound like a thrill, John—what's your hobby to beat
 * that?" and "Flat white, oat milk — because I'm always arguing about it."
 *
 * That is the same lesson as `maxWords` and `maxSentences` a third time. A rule
 * stated once in a wall of forty prohibitions is a rule the writer obeys most of
 * the time, and "most of the time" is a defect when the failure is audible.
 *
 * A COMMA, not a full stop. The dash is nearly always joining a clause to the
 * one before it, and a full stop there makes two fragments out of one sentence
 * — which would then be counted as two sentences by the ceiling above and get
 * the second half deleted. A comma keeps the prosody and the arithmetic honest.
 *
 * Applied before the ceiling and before synthesis, so the transcript and the
 * audio agree. Everything else the model can emit that is not speech — markdown
 * emphasis, a stray bullet — goes here for the same reason: the contract asks
 * for "spoken words only" and asking has a measured hit rate.
 */
export function sanitiseForSpeech(text: string): string {
  return text
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/\*+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    // A dash between two clauses can leave ", ," or " ,". Neither is speakable.
    .replace(/,\s*,+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function capToBudget(
  text: string,
  cap: number,
  options: { sentences?: number } = {},
): string {
  const sentences = text.trim().split(/(?<=[.!?]["'’”)]?)\s+/).filter(Boolean)
  const first = sentences[0]
  if (!first) return ''

  // ALWAYS ONE WHOLE SENTENCE, so a low band can never produce silence and a
  // single long sentence still goes out intact. This is a ceiling on how much
  // she PILES ON, not a shredder.
  const kept = [first]
  let spent = budgetedWordCount(first)
  // A sentence ceiling as well as a word one. `maxWords` was made true in code
  // because a stated maximum that is only ever hoped for is not a maximum, and
  // "never two [sentences]" was stated at four bands and disobeyed on 55% of
  // turns for exactly the same reason. Absent means no sentence limit.
  const sentenceCap = Math.max(1, options.sentences ?? Number.POSITIVE_INFINITY)

  // ASK BEFORE SPENDING, NOT AFTER.
  //
  // This loop used to push a sentence and THEN test the running total, so the
  // sentence that broke the budget was always the one already added: with a cap
  // of six, "Hello." spent one word, the check passed, and the whole seven-word
  // second sentence went out — eight words against a six-word ceiling, reported
  // as `capped: false`. Measured over 487 production turns, 67 exceeded their
  // cap and only 17 were flagged as having been trimmed at all.
  for (let i = 1; i < sentences.length; i += 1) {
    const sentence = sentences[i]
    if (sentence === undefined) break
    if (kept.length >= sentenceCap) break
    const cost = budgetedWordCount(sentence)
    if (spent + cost > cap) break
    kept.push(sentence)
    spent += cost
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
