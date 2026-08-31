/**
 * Grants a plan.
 *
 *   npm run db:plan -- you@example.com pro
 *
 * `entitlements` has a read policy and nothing else, on purpose: a user who can
 * write their own plan has a free product (§14). So there is no UI for this and
 * there should not be — until a merchant of record is wired (§14), a plan is
 * granted by whoever runs the database, which today is one person with the
 * service key.
 *
 * It is also the reason building this is possible at all: a fresh account is
 * free, and free has no voice reps at all since they moved behind Pro — so a
 * dev account that needs a microphone needs this script.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { PUBLIC_PLANS } from '@/lib/site/plans'
import type { Plan as PlanId } from '@/lib/data/types'
import { loadEnvLocal } from './env'

/**
 * The rep counts, read from the authored plan record rather than repeated.
 *
 * `lib/site/plans.ts` is what `/pricing` and `/profile/subscription` quote and
 * what `applyBillingEvent` writes when a webhook lands. A fourth copy of the
 * number here is a way for a dev account to be granted a quota the product does
 * not sell — and free is 0 now, which is exactly the kind of change a stale
 * literal would have swallowed.
 */
const PLANS = Object.fromEntries(
  PUBLIC_PLANS.map((plan) => [plan.id, plan.repsPerDay]),
) as Record<PlanId, number>
type Plan = PlanId

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const email = args.find((arg) => arg.includes('@'))
  const plan = args.find((arg): arg is Plan => arg in PLANS) ?? 'pro'

  if (!email) {
    console.error(`Which email? e.g.  npm run db:plan -- you@example.com pro\n`
      + `Plans: ${Object.entries(PLANS).map(([name, reps]) => `${name} (${reps}/day)`).join(', ')}`)
    process.exit(1)
  }

  const admin = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = users?.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(`No user with the address ${email}.`)
    process.exit(1)
  }

  const { error } = await admin
    .from('entitlements')
    .upsert(
      {
        user_id: user.id,
        plan,
        reps_per_day: PLANS[plan],
        // A plan change is not a refill: today's counter stands, so granting
        // yourself Elite mid-afternoon does not undo the reps already spent.
        renews_at: plan === 'free' ? null : new Date(Date.now() + 30 * 86_400_000).toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error(`Could not set the plan: ${error.message}`)
    process.exit(1)
  }

  console.log(`${email} is on ${plan} — ${PLANS[plan]} voice rep${PLANS[plan] === 1 ? '' : 's'} a day.`)
}

void main()
