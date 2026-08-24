/**
 * Cutting a turn back to the words that actually reached the ear.
 *
 * Shared, because it is string arithmetic about speech and not about a vendor.
 * It lived inside the ElevenLabs adapter, which meant the OpenAI arm — the one
 * running in production — had no equivalent at all: a reply the user heard one
 * syllable of was committed to the transcript in full, and then graded.
 *
 * The two adapters interrupt very differently and only one of them can be
 * sample-accurate:
 *
 *  - **ElevenLabs** synthesises the clip itself and can ask for per-character
 *    timings, so `SpokenTurn` cuts exactly where the playhead stopped.
 *  - **OpenAI Realtime** hands us audio over a peer connection with no
 *    alignment. All we know is when her audio started, when it was cut off, and
 *    what she was going to say — so the cut is proportional, and the word
 *    boundary rule below is what keeps it honest.
 *
 * A cut mid-*sentence* is truthful; the user really did interrupt there. A cut
 * mid-*word* is a bug, and neither path is allowed to produce one.
 */

/**
 * Cut `text` at `share` of its length, by characters.
 *
 * Characters rather than duration because that is all there is without
 * alignment. It is wrong in proportion to how uneven her pacing is, which is a
 * real error on a voice tuned to trail off — hence alignment being preferred
 * wherever it exists, and this being the fallback.
 */
export function proportionalPrefix(text: string, share: number): string {
  if (share <= 0) return ''
  if (share >= 1) return text
  return text.slice(0, Math.floor(text.length * share))
}

/**
 * Never end inside a word.
 *
 * If the first character being dropped continues the word being kept, walk back
 * to the last space. Everything else — punctuation, a completed word, the end of
 * the clip — is left exactly where it fell, because the user really did
 * interrupt there and the transcript should say so.
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

/* ------------------------------------------------------------------ *
 * Estimating a spoken duration, for the arm that has no alignment
 * ------------------------------------------------------------------ */

/**
 * Words per second of synthesised speech at `speed: 1`.
 *
 * Around 165 words a minute, which is unhurried conversational English and is
 * where both realtime voices sit when they are not being pushed. This is an
 * estimate and it is used in exactly one direction: to decide how much of a
 * sentence had been spoken when it was cut off.
 *
 * Deliberately a little SLOW. Under-estimating the rate over-estimates how long
 * the full line would have taken, which keeps MORE of the text — and the error
 * that keeps a word the user did hear is much cheaper than the error that
 * deletes one. `snapToWordBoundary` catches the rest.
 */
export const WORDS_PER_SECOND = 2.75

/** How long this text would take to say, at this pace. */
export function estimateSpokenSeconds(text: string, pace = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return 0
  const rate = WORDS_PER_SECOND * (pace > 0 ? pace : 1)
  return words / rate
}

export interface ClipResult {
  /** The words that reached the ear. */
  text: string
  /** Did the cut actually remove anything? */
  truncated: boolean
  /** Milliseconds of her audio the user heard. What `item.truncate` wants. */
  playedMs: number
}

/**
 * The heard prefix of a line that was cut off part-way through.
 *
 * `playedSeconds` is measured from her first audio frame to the moment the
 * output buffer was cleared, so it is wall-clock reality rather than anything
 * the model reports. The expected duration is estimated from the text, because
 * the Realtime arm has no alignment to ask.
 *
 * Returns the full text unchanged whenever the estimate says she finished, so a
 * normal turn is never trimmed by a rounding error.
 */
export function clipToPlayed(
  fullText: string,
  playedSeconds: number,
  pace = 1,
): ClipResult {
  const text = fullText.trim()
  const playedMs = Math.max(0, Math.round(playedSeconds * 1000))

  if (text === '') return { text: '', truncated: false, playedMs }
  if (playedSeconds <= 0) return { text: '', truncated: true, playedMs: 0 }

  const expected = estimateSpokenSeconds(text, pace)
  if (expected <= 0 || playedSeconds >= expected) {
    return { text, truncated: false, playedMs }
  }

  const share = playedSeconds / expected
  const kept = proportionalPrefix(text, share)
  const clipped = snapToWordBoundary(kept, text[kept.length] ?? '')

  // A cut that removed everything is still a truncation — she was audible for a
  // moment and said nothing complete. The caller decides whether an empty turn
  // is worth committing; `TurnAssembler.commit` already drops it.
  return { text: clipped, truncated: clipped !== text, playedMs }
}
