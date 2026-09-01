/**
 * How many reps an account may run today, which is not always what the plan says.
 *
 * §14 meters voice and `entitlements.reps_per_day` is the plan's number. There
 * is exactly one exception to it, and this file is the whole of it: **the
 * sign-up rep.**
 *
 * ── WHAT THIS REPLACES, AND WHY ──────────────────────────────────────────
 *
 * It used to be three reps on the account's first calendar day, for everybody.
 * The reasoning was the product rather than generosity: a rep is three minutes,
 * the arc the gym exists to teach is fail-adjust-succeed, and that cannot
 * happen inside one attempt.
 *
 * That reasoning was right about the arc and wrong about who pays for it. Free
 * was also one voice rep a day forever, so day one's three was the loud half of
 * a quiet recurring cost of about $2.64 a month for every user who never paid.
 * Voice is sold by the account now (`lib/site/plans.ts`), free grants zero reps
 * a day, and the fail-adjust-succeed arc is what Pro is *for* — it is the
 * argument for the plan rather than something given away in front of it.
 *
 * So the grant is **one rep, once ever**. Not one a day, and not three on a
 * calendar day: a single voice rep during sign-up, against the character
 * authored to be won (`lib/personas/tess.ts`), so that nobody is asked to
 * decide about a voice product they have never heard.
 *
 * ── WHY IT IS A STAMP AND NOT A DATE COMPARISON ──────────────────────────
 *
 * The old rule keyed off `entitlements.created_at` and the account's local day,
 * which was safe because a user cannot mint a second day one. A one-off grant
 * has a sharper failure mode: somebody who abandons onboarding on Tuesday and
 * resumes on Thursday must get the rep they never spent, and somebody who
 * spends it must not get another by starting the run again. Neither is a
 * question about dates, so `entitlements.onboarding_rep_used_at` records the
 * fact directly. That column lives on a table with a read policy and no write
 * policy, so it is the service role's to set and nobody else's (rule 9).
 *
 * It is ADDITIVE rather than a floor. A paying account signing up this morning
 * gets its plan's reps and this one, because the sign-up rep is not part of any
 * plan — it is the thing that happens before a plan is chosen.
 *
 * ── WHY THE GRANT IS COUNTED SEPARATELY FROM THE PLAN'S REPS ─────────────
 *
 * The grant is additive, and `entitlements.reps_used_today` is one counter for
 * both. That is fine while the plan's number does not move — the grant is spent
 * last, so anything past `reps_per_day` is the grant. It breaks the moment
 * somebody upgrades on the day they signed up, which is the single most likely
 * day for them to do it: the sign-up rep is already sitting in the counter, so
 * Pro's three reps arrive with one of them apparently spent and the account is
 * handed two. The grant would have been taken out of the plan it is supposed to
 * sit on top of.
 *
 * So the counter is read as two buckets rather than one. `signupSpentToday`
 * says whether the one-off grant is inside today's number, and the plan's own
 * use is the counter minus it. That is a read-side derivation and needs no
 * write when a plan changes — which matters, because the webhook that grants
 * Pro must not have to know anything about the rep counter to be correct.
 *
 * Pure and isomorphic, like `day.ts` and for the same reason: the Server Action
 * that spends a rep and the pill that counts them down have to agree, and one
 * implementation is the only way to guarantee that.
 */

import { localDay } from './day'

/** What the sign-up rep is worth. One, once, per account. */
export const SIGNUP_REPS = 1

export interface AllowanceInput {
  /** `entitlements.reps_per_day`. Zero on free, and that is the voice lock. */
  repsPerDay: number
  /**
   * `entitlements.onboarding_rep_used_at`. Null means the sign-up rep is
   * unspent and is still owed to this account.
   */
  onboardingRepUsedAt: string | null
}

/** Whether this account still has its one sign-up rep. */
export function signupRepAvailable(onboardingRepUsedAt: string | null): boolean {
  return onboardingRepUsedAt === null
}

/**
 * The reps this account may run today.
 *
 * The plan's number, plus the sign-up rep if it has never been spent. There is
 * no day-boundary arithmetic left in here at all — the sign-up rep does not
 * come back tomorrow, which is the entire difference between it and a quota.
 */
export function repsAllowedToday(input: AllowanceInput): number {
  const plan = Math.max(0, input.repsPerDay)
  return plan + (signupRepAvailable(input.onboardingRepUsedAt) ? SIGNUP_REPS : 0)
}

export interface DailyUseInput extends AllowanceInput {
  /**
   * `entitlements.reps_used_today`, already rolled: zero when the counter
   * belongs to a day that is not today. Both buckets are in here.
   */
  usedToday: number
  /**
   * Whether the one-off grant is one of the reps inside `usedToday` — that is,
   * `onboarding_rep_used_at` falls on today's local day. Use
   * `signupRepSpentOn` to work it out from the stamp.
   */
  signupSpentToday: boolean
}

/**
 * Was the sign-up rep spent on this local day?
 *
 * The stamp is an instant and the counter is a day, so the two only line up
 * through the account's own timezone — the same one `day.ts` counts the quota
 * in. A grant spent at 23:50 in Colombo belongs to that day's counter, not to
 * whatever day it was in UTC.
 */
export function signupRepSpentOn(
  onboardingRepUsedAt: string | null,
  timeZone: string | null | undefined,
  day: string,
): boolean {
  if (!onboardingRepUsedAt) return false
  const at = new Date(onboardingRepUsedAt)
  if (Number.isNaN(at.getTime())) return false
  return localDay(at, timeZone) === day
}

/**
 * The plan's own reps used today, with the sign-up rep taken back out.
 *
 * This is the number that must not move when a plan does. Somebody who spends
 * the grant and then buys Pro an hour later has used none of Pro's three.
 */
export function planRepsUsedToday(input: Pick<DailyUseInput, 'usedToday' | 'signupSpentToday'>): number {
  const used = Math.max(0, input.usedToday)
  return Math.max(0, used - (input.signupSpentToday ? SIGNUP_REPS : 0))
}

/**
 * What is actually left today: the plan's unused reps, plus the grant if it is
 * still unspent.
 *
 * Not `repsAllowedToday - usedToday`. That subtraction is what charged the
 * sign-up rep to the plan somebody had just bought — see the third block of
 * this file's header. Every caller that answers "may I run a rep" or "how many
 * are left" goes through here.
 */
export function repsRemainingToday(input: DailyUseInput): number {
  const plan = Math.max(0, input.repsPerDay)
  const planLeft = Math.max(0, plan - planRepsUsedToday(input))
  return planLeft + (signupRepAvailable(input.onboardingRepUsedAt) ? SIGNUP_REPS : 0)
}

/**
 * Is the rep being handed back the sign-up one?
 *
 * `consumeRep` spends the plan first and the grant last, so under a plan that
 * has not moved this is just "the counter is past the plan's number". The
 * second clause is for the plan that HAS moved: an account that spent the grant
 * and then bought Pro has one rep in today's counter and three plan reps it has
 * not touched, so the rep it is giving back can only be the grant.
 *
 * Getting this wrong costs the user their one-off rep and leaves the stamp set,
 * which is why it is a named function with a test rather than a comparison
 * inlined at the call site.
 */
export function refundingSignupRep(
  input: Pick<DailyUseInput, 'repsPerDay' | 'usedToday' | 'signupSpentToday'>,
): boolean {
  if (!input.signupSpentToday) return false
  return planRepsUsedToday(input) === 0 || input.usedToday > Math.max(0, input.repsPerDay)
}

/**
 * Would spending the next rep spend the sign-up one?
 *
 * The sign-up rep is spent LAST, after the plan's own reps, which makes this a
 * comparison rather than a flag: anything at or past the plan's allowance is
 * coming out of the one-off grant. `consumeRep` uses it to decide whether to
 * stamp the column, and `refundRep` uses the same comparison in reverse to
 * decide whether to clear it, so the two cannot disagree about which rep was
 * just handed back.
 *
 * On free, where the plan grants nothing, this is true for the very first rep —
 * which is correct, and is the only voice rep a free account ever gets.
 */
export function spendingSignupRep(input: AllowanceInput & { usedToday: number }): boolean {
  if (!signupRepAvailable(input.onboardingRepUsedAt)) return false
  return input.usedToday >= Math.max(0, input.repsPerDay)
}

/** Does this plan grant any voice at all? */
export function voicelessPlan(repsPerDay: number): boolean {
  return Math.max(0, repsPerDay) === 0
}

/**
 * Why a rep was refused, and what to say about it.
 *
 * Two refusals wear the same HTTP status and mean entirely different things.
 * "You are out of reps for today" is right for a Pro account at three of three:
 * the counter resets at their own local midnight and waiting works. It is
 * exactly wrong for a free account, whose reps do not come back at midnight
 * because there were never any — telling that person to wait is telling them to
 * wait forever, and it hides the only thing they can actually do about it.
 *
 * That second case is the upgrade moment and, per the payments plan, the
 * highest-value screen in the funnel. So the two are separate `kind`s all the
 * way from `consumeRep` to the sheet the user sees, rather than one string that
 * the UI has to guess the meaning of.
 *
 * Hand-authored, like every user-facing string here (§02).
 */
export type RefusalKind = 'daily' | 'upgrade'

export interface VoiceRefusal {
  kind: RefusalKind
  message: string
}

export function voiceRefusal(repsPerDay: number): VoiceRefusal {
  if (voicelessPlan(repsPerDay)) {
    return {
      kind: 'upgrade',
      message: 'Voice reps are part of Pro. Everything else on your account stays open.',
    }
  }
  return { kind: 'daily', message: 'You are out of reps for today.' }
}
