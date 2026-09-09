'use server'

/**
 * The account controls.
 *
 * Everything here writes something rule 11 says has no user write path — a
 * plan, a quota, an interview balance, a spend halt, an account's existence.
 * That is precisely why they are here and not on a screen a customer can
 * reach: the service role is the only writer, and `adminUser()` is the only
 * thing that decides who may ask it.
 *
 * Four rules, applied to every action in this file:
 *
 *   1. **The gate is re-checked inside the action, not in the page.** A Server
 *      Action is a public endpoint with a generated name; a component that
 *      does not render is not a permission. `guard()` is the first line of
 *      every one of them.
 *   2. **They return `{ ok, message }` and never throw.** A thrown Server
 *      Action reaches the browser as an opaque digest, which on this screen
 *      would mean "did the plan change?" with no way to tell.
 *   3. **Every one writes to `admin_actions` afterwards.** Money moved by hand
 *      with no record is the thing that cannot be reconstructed later.
 *   4. **They reuse the product's own writers wherever one exists** —
 *      `issueInterviewCredits`, `voidInterviewCredits` — rather than inserting
 *      rows shaped like theirs. The credit ledger's expiry rule is subtle
 *      enough that a second implementation of it would be wrong.
 */

import { revalidatePath } from 'next/cache'
import { adminUser } from '@/lib/db/admin-gate'
import { supabaseAdmin } from '@/lib/db/admin'
import { logAdminAction } from '@/lib/db/admin-metrics'
import { issueInterviewCredits, voidInterviewCredits } from '@/lib/db/credits'
import { PUBLIC_PLANS, planById } from '@/lib/site/plans'
import type { Plan } from '@/lib/data/types'

export interface AdminResult {
  ok: boolean
  message: string
}

const PLAN_IDS = PUBLIC_PLANS.map((plan) => plan.id)

/** The most credits one click may move. A slip should cost a round, not a pack. */
const MAX_CREDITS = 50

interface Actor {
  email: string
  id: string
}

async function guard(): Promise<Actor | null> {
  const user = await adminUser()
  if (!user?.email) return null
  return { email: user.email, id: user.id }
}

const DENIED: AdminResult = { ok: false, message: 'Not signed in as an admin.' }

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function refresh(): void {
  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

/**
 * Grant a plan.
 *
 * The same write `scripts/set-plan.ts` makes and the same write
 * `applyBillingEvent` makes, including the rule that a plan change is not a
 * refill: today's `reps_used_today` stands, so moving somebody to Elite at
 * four in the afternoon does not hand back the reps they already spent.
 *
 * **It grants the entitlement and does not touch `subscriptions`.** That table
 * is the provider's mirror, and a row in it that no membership at Whop backs
 * would make `whop:verify` and the subscription screen disagree about whether
 * somebody is paying. A comped account is an entitlement with no subscription,
 * which is exactly what it is.
 */
export async function setPlan(userId: string, plan: string): Promise<AdminResult> {
  const actor = await guard()
  if (!actor) return DENIED
  if (!isUuid(userId)) return { ok: false, message: 'That is not an account id.' }
  if (!PLAN_IDS.includes(plan as Plan)) return { ok: false, message: `No plan called "${plan}".` }

  const target = plan as Plan
  const reps = planById(target).repsPerDay

  const { error } = await supabaseAdmin().from('entitlements').upsert(
    {
      user_id: userId,
      plan: target,
      reps_per_day: reps,
      renews_at: target === 'free' ? null : new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) return { ok: false, message: `Could not set the plan: ${error.message}` }

  await logAdminAction({ actor: actor.email, action: 'plan.set', subject: userId, detail: { plan: target, repsPerDay: reps } })
  refresh()
  return { ok: true, message: `On ${target} — ${reps} voice rep${reps === 1 ? '' : 's'} a day.` }
}

/**
 * Add interview credits by hand.
 *
 * Written as a `grant`, never a `purchase`, and that distinction is the one
 * thing to get right here. A purchase never expires (§5.5) and the column has a
 * CHECK saying so; a comped credit that never expires is a permanent
 * entitlement handed out by a click. Grants carry an expiry, and this one
 * defaults to thirty days.
 *
 * The reference is unique per click, so pressing the button twice grants twice
 * — which is what somebody pressing it twice means. Idempotency belongs to the
 * webhook, where the same event genuinely arrives more than once.
 *
 * The interview track opens by itself when this lands: a trigger on the ledger
 * does it, so all four credit paths obey one rule
 * (`20260907041000_interview_track_on_credit.sql`).
 */
export async function grantCredits(userId: string, amount: number, days = 30): Promise<AdminResult> {
  const actor = await guard()
  if (!actor) return DENIED
  if (!isUuid(userId)) return { ok: false, message: 'That is not an account id.' }

  const count = Math.round(Number(amount))
  if (!Number.isFinite(count) || count < 1 || count > MAX_CREDITS) {
    return { ok: false, message: `Between 1 and ${MAX_CREDITS} credits.` }
  }
  const life = Math.min(365, Math.max(1, Math.round(Number(days) || 30)))

  const result = await issueInterviewCredits({
    userId,
    kind: 'grant',
    amount: count,
    reference: `admin:${actor.id}:${Date.now()}`,
    expiresAt: new Date(Date.now() + life * 86_400_000).toISOString(),
    metadata: { by: actor.email, reason: 'granted from the admin panel' },
  })
  if (!result.ok) return { ok: false, message: 'The ledger refused the write. Nothing was granted.' }

  await logAdminAction({ actor: actor.email, action: 'credits.grant', subject: userId, detail: { amount: count, expiresInDays: life } })
  refresh()
  return { ok: true, message: `Granted ${count} interview credit${count === 1 ? '' : 's'}, expiring in ${life} days.` }
}

/**
 * Take credits back.
 *
 * Through `voidInterviewCredits`, which clamps to what is actually live and
 * writes one negative row per lot — the invariant that keeps a void from
 * coming back to life when the earlier lot expires. Reimplementing that here
 * is how an account ends up with a negative balance that silently eats the
 * next pack they buy.
 *
 * Grants first, then purchases: a comped credit is ours to take back and a
 * bought one is theirs. Somebody revoking a purchase has usually refunded it,
 * and this says so in the ledger.
 */
export async function revokeCredits(userId: string, amount: number): Promise<AdminResult> {
  const actor = await guard()
  if (!actor) return DENIED
  if (!isUuid(userId)) return { ok: false, message: 'That is not an account id.' }

  let budget = Math.round(Number(amount))
  if (!Number.isFinite(budget) || budget < 1 || budget > MAX_CREDITS) {
    return { ok: false, message: `Between 1 and ${MAX_CREDITS} credits.` }
  }

  let taken = 0
  for (const source of ['grant', 'screener', 'purchase'] as const) {
    if (budget <= 0) break
    const result = await voidInterviewCredits({
      userId,
      source,
      kind: 'revoke',
      upTo: budget,
      reference: `admin:${actor.id}:${Date.now()}:${source}`,
      reason: `revoked from the admin panel by ${actor.email}`,
    })
    taken += result.credits
    budget -= result.credits
  }

  if (taken === 0) return { ok: false, message: 'Nothing to take back — the balance is already empty.' }

  await logAdminAction({ actor: actor.email, action: 'credits.revoke', subject: userId, detail: { amount: taken } })
  refresh()
  return { ok: true, message: `Took back ${taken} credit${taken === 1 ? '' : 's'}.` }
}

/**
 * Open or close the interview track.
 *
 * Closing is the one thing here with no product equivalent — nothing else in
 * the app ever removes a track — and it is why the toggle exists at all: the
 * ledger trigger only ever adds, so without this a credit granted for a test
 * leaves the door open for good.
 */
export async function setInterviewTrack(userId: string, open: boolean): Promise<AdminResult> {
  const actor = await guard()
  if (!actor) return DENIED
  if (!isUuid(userId)) return { ok: false, message: 'That is not an account id.' }

  const admin = supabaseAdmin()
  const { data: profile } = await admin.from('profiles').select('unlocked_tracks, active_track').eq('id', userId).maybeSingle()
  const current = profile?.unlocked_tracks ?? ['dating']
  const next = open
    ? Array.from(new Set([...current, 'interview']))
    : current.filter((track) => track !== 'interview')

  const update: { unlocked_tracks: string[]; active_track?: string } = { unlocked_tracks: next }
  // Closing the door on somebody standing in it. `ProductProvider` adopts the
  // profile's track on every shared route (`LAUNCH-GAP.md` E2), so leaving
  // `active_track` pointing at a track the guard now refuses is a redirect loop
  // rather than a closed door.
  if (!open && profile?.active_track === 'interview') update.active_track = 'dating'

  const { error } = await admin.from('profiles').update(update).eq('id', userId)
  if (error) return { ok: false, message: `Could not change the track: ${error.message}` }

  await logAdminAction({ actor: actor.email, action: open ? 'track.open' : 'track.close', subject: userId, detail: { tracks: next } })
  refresh()
  return { ok: true, message: open ? 'Interview track open.' : 'Interview track closed.' }
}

/**
 * Give today's reps back.
 *
 * The support answer to "it cut out and it still counted". It moves the
 * counter and never the plan, so it cannot be used to hand somebody a quota
 * the product does not sell.
 */
export async function resetDailyReps(userId: string): Promise<AdminResult> {
  const actor = await guard()
  if (!actor) return DENIED
  if (!isUuid(userId)) return { ok: false, message: 'That is not an account id.' }

  const { error } = await supabaseAdmin().from('entitlements').update({ reps_used_today: 0 }).eq('user_id', userId)
  if (error) return { ok: false, message: `Could not reset the counter: ${error.message}` }

  await logAdminAction({ actor: actor.email, action: 'reps.reset', subject: userId })
  refresh()
  return { ok: true, message: "Today's rep counter is back to zero." }
}

/**
 * Stop, or restart, one account's spending.
 *
 * `lib/db/spend.ts` reads these two columns before any paid route runs, so
 * this is the per-account equivalent of `NERVE_SPEND_HALT` — the switch for a
 * single account behaving like a bill rather than a customer, without taking
 * the product down for everybody else.
 */
export async function setSpendHalt(userId: string, halted: boolean): Promise<AdminResult> {
  const actor = await guard()
  if (!actor) return DENIED
  if (!isUuid(userId)) return { ok: false, message: 'That is not an account id.' }

  const { error } = await supabaseAdmin()
    .from('entitlements')
    .update(
      halted
        ? { spend_halted_at: new Date().toISOString(), spend_halt_reason: `halted from the admin panel by ${actor.email}` }
        : { spend_halted_at: null, spend_halt_reason: null },
    )
    .eq('user_id', userId)
  if (error) return { ok: false, message: `Could not change the halt: ${error.message}` }

  await logAdminAction({ actor: actor.email, action: halted ? 'spend.halt' : 'spend.resume', subject: userId })
  refresh()
  return { ok: true, message: halted ? 'Spending halted on this account.' : 'Spending resumed.' }
}

/**
 * Delete an account, and everything hanging off it.
 *
 * `auth.admin.deleteUser` is the only correct way in: every table in this
 * schema keys on `auth.users(id)` with `on delete cascade`, so removing the
 * auth row removes the profile, the sessions, the transcripts, the audio rows,
 * the ledger and the credits. Deleting `profiles` instead would leave an
 * account that can still sign in and has nothing behind it.
 *
 * **The address has to be typed back.** This is the one irreversible control
 * on the screen and the rows next to each other look alike; a confirmation
 * that is a second click is not a confirmation.
 *
 * **An admin cannot delete themselves.** Not for their sake — because the
 * allowlist is an environment variable, and an admin who deletes their own
 * account locks the panel until somebody redeploys.
 */
export async function deleteAccount(userId: string, confirmEmail: string): Promise<AdminResult> {
  const actor = await guard()
  if (!actor) return DENIED
  if (!isUuid(userId)) return { ok: false, message: 'That is not an account id.' }
  if (userId === actor.id) return { ok: false, message: 'You cannot delete the account you are signed in as.' }

  const admin = supabaseAdmin()
  const { data: found, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError || !found?.user) return { ok: false, message: 'No such account.' }

  const email = found.user.email ?? ''
  if (confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
    return { ok: false, message: 'That address does not match the account. Nothing was deleted.' }
  }

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { ok: false, message: `Could not delete the account: ${error.message}` }

  // Written after the deletion, and it survives it: `admin_actions.subject` is
  // a bare uuid with no foreign key, precisely so the record of a deletion is
  // not deleted by it.
  await logAdminAction({ actor: actor.email, action: 'account.delete', subject: userId, detail: { email } })
  refresh()
  return { ok: true, message: `${email} is gone, along with everything behind it.` }
}
