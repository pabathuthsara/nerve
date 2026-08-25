/**
 * How many reps a day is worth, which is not always what the plan says.
 *
 * §14 meters voice minutes and `entitlements.reps_per_day` is the plan's
 * number. This is the one deliberate exception to it: **the first day is three
 * reps for everybody.**
 *
 * The reason is the product, not generosity. A rep is three minutes, and the
 * arc the gym exists to teach is fail, adjust, succeed — which cannot happen
 * inside one attempt. Rationing day one to a single rep means a new user's
 * only evidence about whether this works is one conversation that probably
 * went badly, and the next attempt is tomorrow. The rank card even names a
 * target — "score 70+ in 2 reps at level 1" — that a free account could not
 * reach in fewer than two calendar days.
 *
 * The ceiling after that is unchanged. This buys the first sitting and nothing
 * else, which is why it keys off the account's own first day rather than off
 * a counter that could be reset: `entitlements.created_at` is written by the
 * sign-up trigger, has no user write path, and is the same row the quota lives
 * on, so a user cannot mint a second day one.
 *
 * Pure and isomorphic, like `day.ts` and for the same reason: the Server
 * Action that spends a rep and the pill that counts them down have to agree,
 * and one implementation is the only way to guarantee that.
 */

/** What day one is worth, on any plan. */
export const DAY_ONE_REPS = 3

/**
 * The reps this account may run today.
 *
 * `never fewer than the plan` is the shape on purpose — this is a floor under
 * day one, not an override of it. An Elite account's six reps are not quietly
 * cut to three because they signed up this morning.
 */
export function repsAllowedToday(input: {
  /** `entitlements.reps_per_day`. */
  repsPerDay: number
  /** The local day the account was created, `YYYY-MM-DD`. Null if unknown. */
  createdOn: string | null
  /** Today, in the same local zone. */
  today: string
}): number {
  const plan = Math.max(0, input.repsPerDay)
  if (!input.createdOn || input.createdOn !== input.today) return plan
  return Math.max(plan, DAY_ONE_REPS)
}

/** Whether today is this account's first day — what the copy keys off. */
export function isDayOne(createdOn: string | null, today: string): boolean {
  return createdOn !== null && createdOn === today
}
