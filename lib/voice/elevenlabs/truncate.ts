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
 */

export interface AlignmentChunk {
  characters: string[]
  /** Seconds from the start of this clip. */
  characterStartTimesSeconds: number[]
  characterEndTimesSeconds: number[]
}

/** A character and the moment it finished leaving the speaker. */
interface TimedChar {
  ch: string
  endSeconds: number
}

export class SpokenTurn {
  /** Characters we have alignment for, in order. */
  private readonly timed: TimedChar[] = []
  /** Text we have no alignment for. Kept separately: it can only ever be
   *  truncated proportionally, and mixing the two would silently downgrade the
   *  precision of the aligned part. */
  private unaligned = ''
  /** Audio seconds scheduled for the unaligned part. */
  private unalignedSeconds = 0
  /** Seconds of audio handed to the player, aligned and not. */
  private scheduledSeconds = 0

  /** One `/with-timestamps` frame. */
  appendAligned(chunk: AlignmentChunk): void {
    const { characters, characterEndTimesSeconds } = chunk
    const offset = this.scheduledSeconds
    for (let i = 0; i < characters.length; i += 1) {
      const ch = characters[i]
      const end = characterEndTimesSeconds[i]
      if (ch === undefined) continue
      this.timed.push({ ch, endSeconds: (end ?? 0) + offset })
    }
    const last = characterEndTimesSeconds[characterEndTimesSeconds.length - 1]
    if (typeof last === 'number') this.scheduledSeconds = offset + last
  }

  /** Fallback frame: text with no per-character timing. */
  appendUnaligned(text: string, audioSeconds: number): void {
    this.unaligned += text
    this.unalignedSeconds += audioSeconds
    this.scheduledSeconds += audioSeconds
  }

  /** Everything synthesised so far, played or not. */
  get fullText(): string {
    return this.alignedText() + this.unaligned
  }

  get audioSeconds(): number {
    return this.scheduledSeconds
  }

  get hasAlignment(): boolean {
    return this.timed.length > 0
  }

  /**
   * The text that had left the speaker at `playedSeconds`.
   *
   * `playedSeconds` is the player's own playhead — audio actually rendered, not
   * audio scheduled. The two differ by exactly the buffer we throw away on a
   * barge-in, which is the whole reason this function exists.
   */
  playedText(playedSeconds: number): string {
    if (playedSeconds <= 0) return ''
    if (playedSeconds >= this.scheduledSeconds) return this.fullText.trim()

    const alignedEnd = this.timed.length > 0
      ? (this.timed[this.timed.length - 1] as TimedChar).endSeconds
      : 0

    if (playedSeconds <= alignedEnd || this.unaligned === '') {
      const kept = this.timed.filter((entry) => entry.endSeconds <= playedSeconds)
      const nextChar = this.timed[kept.length]?.ch ?? this.unaligned[0] ?? ''
      return snapToWordBoundary(kept.map((entry) => entry.ch).join(''), nextChar)
    }

    // Past the aligned portion: everything aligned played, and some share of
    // the unaligned tail did.
    const intoUnaligned = playedSeconds - alignedEnd
    const share = this.unalignedSeconds > 0 ? intoUnaligned / this.unalignedSeconds : 1
    const tail = proportionalPrefix(this.unaligned, share)
    return snapToWordBoundary(
      this.alignedText() + tail,
      this.unaligned[tail.length] ?? '',
    )
  }

  /** True when the playhead stopped short of everything synthesised. */
  wasTruncated(playedSeconds: number): boolean {
    return playedSeconds < this.scheduledSeconds && this.fullText.trim().length > 0
  }

  private alignedText(): string {
    return this.timed.map((entry) => entry.ch).join('')
  }
}

/**
 * Cut `text` at `share` of its length, by characters.
 *
 * Characters rather than duration because that is all we have without
 * alignment. It is wrong in proportion to how uneven her pacing is, which is a
 * real error on a voice tuned to trail off — hence alignment being the default
 * and this the fallback.
 */
export function proportionalPrefix(text: string, share: number): string {
  if (share <= 0) return ''
  if (share >= 1) return text
  return text.slice(0, Math.floor(text.length * share))
}

/**
 * Never end inside a word.
 *
 * If the first character we are dropping continues the word we are keeping,
 * walk back to the last space. Everything else — punctuation, a completed word,
 * the end of the clip — is left exactly where it fell, because the user really
 * did interrupt there and the transcript should say so.
 */
export function snapToWordBoundary(kept: string, nextChar: string): string {
  if (kept === '') return ''
  const lastChar = kept[kept.length - 1] ?? ''
  const midWord = isWordChar(lastChar) && isWordChar(nextChar)
  if (!midWord) return kept.trimEnd()

  const lastSpace = kept.replace(/\s+$/, '').lastIndexOf(' ')
  if (lastSpace < 0) return ''
  return kept.slice(0, lastSpace).trimEnd()
}

/** Apostrophes count: "a lot's" must not become "a lot" plus a stray "s". */
function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}'’-]/u.test(ch)
}
