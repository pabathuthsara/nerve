/**
 * The deterministic 60%, for an interview.
 *
 * ── FOUR OF THE EIGHT DATING BANDS PUNISH CORRECT INTERVIEW BEHAVIOUR ────
 *
 * `lib/grade/metrics.ts` holds one band table, written about a three-minute
 * conversation with a stranger in a shop, and it decides sixty percent of the
 * composite. Applied to an interview it is not merely imprecise, it is
 * inverted:
 *
 *   · **talk ratio 40–55%.** A candidate is supposed to hold the floor — the
 *     interviewer asks a two-sentence question and then is quiet. A rep where
 *     the candidate talked 68% of the time is a rep they did correctly, and it
 *     scored **zero** on this band. (`INTERVIEW-TECHNICAL-PLAN.md` §11.)
 *   · **questions 3–8 per three minutes.** A candidate who asks a question
 *     every twenty seconds is not interviewing well, they are deflecting. Real
 *     candidates ask almost nothing until the close, and this band scored that
 *     at or near zero for the whole rep.
 *   · **open : closed ≥ 2.** The same mistake one level down, and usually
 *     unmeasured anyway because a candidate asks so few questions that the
 *     ratio has no denominator.
 *   · **"the ask" and "the exit"** — `planQuality` is *"Coffee Thursday?"
 *     beats "we should hang out sometime"* and `exitQuality` is *warm, no
 *     push*. Neither exists in an interview. Both are detected by dating
 *     vocabulary, so both come back `null` on every interview and drag nothing
 *     — but they render as two empty rows on the scorecard, which is worse than
 *     a wrong number because it looks like a measurement that failed.
 *
 * ── SO IT IS A NEW TABLE, NOT A PARAMETER ────────────────────────────────
 *
 * The same shape as everything else on this arm (rule 19, `INTERVIEW-PLAN.md`
 * §0): a parallel file, selected at the existing `lib/grade/track.ts` seam,
 * with `lib/grade/metrics.ts` reading exactly as it did — `scoreMetrics()`
 * called with no band table is the dating table, byte for byte, and
 * `dating-arm.test.ts` pins the numbers it produces.
 *
 * **What is measured is unchanged.** `computeDeterministicMetrics` is shared
 * and stays shared: it counts seconds, questions, fillers and gaps, and those
 * mean the same thing in both rooms. Only the TARGETS move, which is the whole
 * point — a band is a claim about what good looks like, and good looks
 * different when you are the one answering.
 */

import type { MetricBand } from '../metrics'

/**
 * Five bands, not eight, and each one is a thing a candidate can act on.
 *
 * The two dating-only metrics are dropped outright rather than left in as
 * permanent blanks, and the two question bands collapse into one that asks a
 * different question: **did you ask anything back at all.** That is a real
 * interview beat — people lose offers on it — and it is deliberately the
 * cheap half of it. Whether the questions were any good is the CLOSE dimension
 * in the judgement layer, which is where a judgement belongs.
 */
export const INTERVIEW_METRIC_BANDS: readonly MetricBand[] = [
  {
    key: 'talkRatio',
    label: 'answer share',
    // She asks and is quiet; you answer. Below 55% you are being drawn out
    // rather than offering anything, and past 78% she has stopped being able
    // to steer the interview she is running.
    min: 0.55,
    max: 0.78,
    tolerance: 0.15,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'longestMonologue',
    label: 'longest answer',
    // A real answer to "walk me through something you built" is not fifteen
    // seconds long, and a two-minute one has stopped being an answer. Both
    // ends are failures here, which is why this band has a floor and the
    // dating one does not: under-answering is the more common interview
    // mistake and the dating table cannot see it at all.
    //
    // The tolerance is one number for both sides, so it is set by the side
    // that matters more. At 35 a nine-second longest answer lands at 48 — a
    // clear fail, which is right, because it means no example ever got told —
    // while a hundred-and-ten-second one lands at 25 rather than zero, because
    // rambling is a fixable habit and not the same failure as saying nothing.
    min: 25,
    max: 85,
    tolerance: 35,
    format: (value) => `${value.toFixed(1)}s`,
  },
  {
    key: 'fillerRate',
    label: 'fillers / min',
    // Unchanged from the dating band. Delivery is delivery, and the number was
    // never about who was listening.
    max: 4,
    tolerance: 4,
    format: (value) => value.toFixed(1),
  },
  {
    key: 'meanResponseLatency',
    label: 'thinking time',
    // 1.8s is the dating target and it is wrong here in the kind way: taking a
    // beat before answering a hard question reads as considered, not as
    // struggling, and "let me think about that" is explicitly good practice.
    // Three seconds is where a pause starts costing the room.
    max: 3,
    tolerance: 2.5,
    format: (value) => `${value.toFixed(2)}s`,
  },
  {
    key: 'questionsAsked',
    label: 'questions back',
    // One is the whole bar. "Do you have any questions for me?" answered with
    // "no" is the single most common avoidable mistake in an interview, and it
    // is a yes-or-no fact rather than a judgement — so it is measured here and
    // judged in CLOSE, which reads whether the questions were about the work.
    min: 1,
    tolerance: 1,
    target: '≥ 1',
    format: (value) => (value === 1 ? '1' : `${Math.round(value)}`),
  },
]
