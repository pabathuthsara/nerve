/**
 * The ending, withheld from the grader (PERSONA-REALISM-REPORT S1, rule 2).
 *
 * ── WHAT S1 FOUND ────────────────────────────────────────────────────────
 *
 * Rule 2 says outcome is worth zero, and it had never been tested. The
 * outcome-invariance pairs (`lib/grade/calibration/outcome-pairs.ts`) cut real
 * reps before their ending and finish them twice — his words and every
 * timestamp identical, her last line either offering her number or leaving —
 * and the judged 40% moved every time, the same way: +14.8 on `close`, +13.8 on
 * `signalReading`, +2.8 on the composite, on a rubric that says in capitals to
 * score the process and never the outcome.
 *
 * A model told not to reward the ending, and then shown it, rewards it. So the
 * grader is no longer shown it. Her reply to his LAST line is the ending by
 * construction — on the wind-down it is the product's rule-3 decision, not a
 * signal he could have read differently — and it is replaced with a marker that
 * says a closing line happened and why it is not on the page. Everything she
 * said BEFORE his last line stays: that is every signal he had to read, which
 * is what `signalReading` scores.
 *
 * Pure, and applied by the dating grade route only. The interview arm's close
 * is a question the candidate asks, and its answer is part of the round.
 */

import type { TranscriptTurn } from '@/lib/voice/types'

/** What the grader sees where her ending was. */
export const ENDING_WITHHELD =
  '[her closing line — withheld: how it ended is decided by the product and is not scored]'

/**
 * The transcript with her reply to his last line replaced by the marker.
 *
 * Unchanged when she never answered his last line, or when he never spoke.
 * Returns new turn objects; nothing the caller holds is mutated.
 */
export function withEndingWithheld(transcript: readonly TranscriptTurn[]): TranscriptTurn[] {
  let lastUser = -1
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    if (transcript[i]?.speaker === 'user') { lastUser = i; break }
  }
  if (lastUser < 0) return [...transcript]
  const tail = transcript.slice(lastUser + 1)
  const hers = tail.filter((turn) => turn.speaker === 'agent')
  if (hers.length === 0) return [...transcript]
  const first = hers[0]!
  return [
    ...transcript.slice(0, lastUser + 1),
    { ...first, text: ENDING_WITHHELD, t_end: hers[hers.length - 1]!.t_end },
  ]
}
