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
