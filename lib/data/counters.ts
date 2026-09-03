/**
 * The two numbers that only ever go up (RETENTION-AUDIT R7).
 *
 * `rejectionsCollected` is the best-designed idea in the build: it cannot be
 * lost at, it reframes refusal as accumulation, and it lives **entirely in the
 * offline half**. The in-app half had no equivalent — every other reward runs
 * on a multi-week clock (rank at two qualifying reps a tier, the baseline
 * re-test at day 28, the letter on Sunday, the milestones at 10/25/50/100) and
 * the one thing that happens today is a judgement.
 *
 * So: reps run, and minutes spent under pressure. Neither resets, neither can
 * go down, and neither is a verdict on anything. They are printed on the loss
 * screen on purpose — a number that went up because you showed up, on the
 * screen where you lost, is this product's whole argument in one line.
 *
 * Pure functions with tests, like `rep-rules.ts`, because they are copy the
 * user reads at their lowest motivation point in the loop.
 */

/**
 * Whole minutes of conversation, floored at one once anything has happened.
 *
 * Flooring rather than rounding everywhere would print `0 minutes` after a rep
 * that ran fifty seconds, which reads as the rep not counting — and a counter
 * whose first increment is zero is a counter nobody trusts afterwards. Zero is
 * reserved for genuinely nothing.
 */
export function pressureMinutes(totalMs: number): number {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return 0
  return Math.max(1, Math.round(totalMs / 60_000))
}

/**
 * `Rep 7 · 19 minutes under pressure`.
 *
 * The rep count is the ordinal of the rep just finished rather than a total,
 * which is the same number said the more useful way round: "you have done 7"
 * and "this was your 7th" are the same fact, and the second one is about the
 * thing that just happened.
 */
export function lifetimeLine(input: { reps: number; totalMs: number }): string | null {
  if (input.reps <= 0) return null
  const minutes = pressureMinutes(input.totalMs)
  if (minutes <= 0) return `Rep ${input.reps}`
  return `Rep ${input.reps} · ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} under pressure`
}

/**
 * The streak as it actually stands today (R15).
 *
 * `streaks.current` is only ever rewritten when somebody trains, so an account
 * that stopped a fortnight ago still holds the number it stopped on. Every
 * screen read that column straight, which meant a user who had been away for
 * two weeks was shown a live six-day streak — and the audit's observation that
 * "the streak is silently zero" was only true in the database.
 *
 * Broken is broken and it is said plainly: the stored number stands while the
 * last active day is today or yesterday, and is zero after that. The row is
 * left alone — a read must not repair a record, because `longest` is history
 * and the write path is service-role for the reason §14 gives.
 */
export function currentStreak(input: {
  stored: number
  lastActiveOn: string | null
  today: string
  daysBetween: (from: string, to: string) => number
}): number {
  if (!input.lastActiveOn) return 0
  const gap = input.daysBetween(input.lastActiveOn, input.today)
  // A negative gap is a clock that moved backwards — a timezone change, or a
  // device with the wrong date. Trust the stored number rather than wiping a
  // streak over it.
  if (gap < 0) return input.stored
  return gap <= 1 ? input.stored : 0
}
