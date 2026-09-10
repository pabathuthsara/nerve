/**
 * One spelling, so a pattern written once matches text from either source.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * Every second-person pattern in `./triggers.ts` is written with a straight
 * apostrophe — `you(?:'?re| are)` — and two of the three text sources in this
 * product do not use one:
 *
 *   OpenAI STT (his turns)      "You're making me miserable."   U+0027
 *   The character model (hers)  "Quiet's fine by me."           U+2019
 *
 * A callback is matched against HER stored line, and a hostility marker against
 * HIS — so the filters worked in testing, where everything is typed with a
 * straight quote, and were one keystroke from silently failing on live text.
 * The same class of bug is why `bandFor` scanned downward on `min` alone: a
 * predicate that fails open on a character nobody can see is worse than one
 * that fails loudly.
 *
 * Applied at the front of every lexical predicate rather than at the transcript
 * seam, deliberately. The stored transcript is EVIDENCE — it is what she said,
 * character for character, and the grader, the share card and the memory line
 * all read it. Rewriting punctuation on the way in would make the record
 * disagree with the audio.
 */

/**
 * Curly punctuation, flattened. Nothing else changes — not case, not
 * whitespace, not accents.
 *
 * The ellipsis is here for the same reason the apostrophes are: a model writes
 * `…` and a transcriber writes `...`, and `trailsOff` would have to be written
 * twice to see both.
 */
export function flattenPunctuation(text: string): string {
  return text
    .replace(/[‘’‛ʼ′]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—‒―]/g, '-')
    .replace(/…/g, '...')
}
