/**
 * Creating the Whop product, plans and webhook — once, correctly (§7 of
 * docs/PAYMENTS-WHOP.md).
 *
 *   npm run whop:setup              # says what it would do, writes nothing
 *   npm run whop:setup -- --apply   # does it
 *
 * This exists instead of a dashboard checklist because every value it sets is
 * one somebody could get wrong by hand, and two of them are expensive:
 *
 *   - `trial_period_days` missing charges the card on day zero, on a product
 *     whose pricing page, terms clause 07 and subscription screen all promise
 *     seven free days. §14 calls that the pattern that closes a merchant
 *     account.
 *   - `renewal_price` in the wrong unit sells Pro for $1,900 or $0.19. Whop
 *     takes major units — 19 means $19 — and the only defence against a typo
 *     is reading the price from `lib/site/plans.ts` rather than retyping it.
 *
 * So the prices, the trial length and the rep counts all come from
 * `PUBLIC_PLANS`, which is the same record `/pricing`, the subscription screen
 * and `applyBillingEvent` read. There is one authored source for what a plan
 * costs and this script is a consumer of it, not a second copy.
 *
 * **Idempotent, and safe to re-run.** It looks for what it is about to create
 * and updates rather than duplicates. It never deletes anything. A second run
 * against a configured account is a no-op that prints the ids.
 *
 * It needs a WHOP_API_KEY with write access. That is the one thing that cannot
 * be minted from here — see the handover note at the bottom of the output.
 */

import { PUBLIC_PLANS, TRIAL_DAYS } from '@/lib/site/plans'
import { apiBase, apiVersionDate, isLiveBase } from '@/lib/billing/plans'

/**
 * How the account describes itself to Whop.
 *
 * Authored here and reviewed in a pull request, per the content rule in
 * CLAUDE.md — this is a representation to a payment processor about what the
 * business does, and it belongs in the repo rather than in a dashboard field
 * somebody edited once.
 *
 * The account was created as `health_and_wellness / mental_health_app`, which
 * is wrong twice over: rule 10 forbids clinical claims anywhere, and clause 08
 * of the terms says in as many words that no part of this product treats a
 * condition. A processor's own record of us should not say the opposite of our
 * legal page.
 */
const ACCOUNT = {
  business_type: 'software',
  industry_group: 'personal_development',
  industry_type: 'communication_coaching',
  description:
    'Confidence training for conversation. Timed three-minute voice reps against AI characters, scored on how the conversation was handled rather than on whether it succeeded, plus graded real-world challenges. Training, not therapy or clinical care.',
  target_audience:
    'Adults practising social confidence and conversation skills. 18+, moderated, PG-13.',
  route: 'nerve',
} as const

/**
 * The product's slug on Whop, which is global across every seller rather than
 * scoped to this account. `nerve` was already taken by somebody else — the
 * account had no products at all and creation still failed with "this whop link
 * is already in use", which is the only way to discover it.
 *
 * It barely matters what this is: the product is unlisted and we sell through a
 * checkout configuration, so nobody navigates to it. It matches the domain so
 * that the one place it does surface reads as ours.
 */
const PRODUCT_ROUTE = 'hellonerve'
const WEBHOOK_URL = 'https://hellonerve.com/api/webhooks/whop'

/** Every event `lib/billing/events.ts` acts on. Fewer would be a silent gap. */
const WEBHOOK_EVENTS = [
  'membership.activated',
  'membership.deactivated',
  'membership.trial_ending_soon',
  'membership.cancel_at_period_end_changed',
  'payment.succeeded',
  'payment.failed',
  'invoice.past_due',
  'refund.created',
  'dispute.created',
]

const PRODUCT_DESCRIPTION = `Nerve is confidence training for conversation. You take three-minute voice reps against AI characters who can lose interest, get distracted, and say no — then you get a score for how you handled it.

The score is for process, never outcome. A clean rep that ends in a polite rejection can score in the nineties. You are graded on how you opened, how you handled the turn and whether you asked — not on whether the character said yes.

A paid plan adds volume and nothing else. Every tier sees the same characters; the roster opens by scoring well, never by paying. Pro is three voice reps a day, Elite is six. The free plan keeps everything that does not use a microphone — the real-world challenges, the log, text mode, your streak, your history and your transcripts — and needs no card.

Both paid plans start with a ${TRIAL_DAYS}-day free trial. Your card is authorised when the trial starts and charged for the first month on the day it ends, unless you cancel first. Cancelling takes one tap on your own subscription screen — no email and no form — and access stays open to the end of the period you have paid for. Ask us within 14 days of any charge and we will refund it.

18+ only. Conversations are moderated on both sides and kept PG-13.

Nerve is training, not therapy, treatment or clinical care. It does not diagnose or treat anything and is not a substitute for working with a clinician.

Support: support@hellonerve.com`

const apply = process.argv.includes('--apply')
let failures = 0

function step(name: string): void {
  console.log(`\n${name}`)
}

function done(detail: string): void {
  console.log(`  ${apply ? 'done' : 'would'}  ${detail}`)
}

function fail(detail: string): void {
  console.log(`  FAIL  ${detail}`)
  failures += 1
}

function note(detail: string): void {
  console.log(`  ----  ${detail}`)
}

/** Price in the plan's own major units, from the authored string. */
function dollars(price: string | null): number {
  return Number(price?.replace(/[^0-9.]/g, '') ?? '0')
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const key = process.env['WHOP_API_KEY']?.trim()
  const accountId = process.env['WHOP_ACCOUNT_ID']?.trim()
  const base = apiBase()
  const version = apiVersionDate()

  if (!key || !accountId) {
    console.error(
      '\nNeed WHOP_API_KEY and WHOP_ACCOUNT_ID.\n\n'
      + 'The API key is the one thing that cannot be created through the API:\n'
      + '  https://whop.com/dashboard/'
      + (accountId ?? '<biz_…>')
      + '/developer/  →  Create API key  →  full access\n'
      + 'Put it in .env.local as WHOP_API_KEY, then run this again.\n',
    )
    process.exit(1)
  }

  /**
   * One request, with an idempotency key that names the OBJECT and not just the
   * endpoint.
   *
   * The first run of this script keyed on `POST:/plans` for both plans, so the
   * Elite creation came back "This Idempotency-Key was already used with a
   * different request" and no Elite plan existed. An idempotency key that is
   * not unique per logical operation is worse than none: it does not just fail,
   * it fails the SECOND of two things that both needed to happen.
   */
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        ...(version ? { 'api-version-date': version } : {}),
        // Stable across re-runs so a second invocation cannot create a second
        // product, and unique per object so two creations never collide.
        ...(body && idempotencyKey ? { 'idempotency-key': `nerve-setup:${idempotencyKey}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    let data: Record<string, unknown> = {}
    try { data = text ? JSON.parse(text) as Record<string, unknown> : {} } catch { data = { raw: text } }
    return { ok: response.ok, status: response.status, data }
  }

  console.log(`\nWhop setup — ${base}`)
  console.log(apply ? 'APPLYING. This writes to the live account.\n' : 'Dry run. Nothing is written. Add --apply to do it.\n')

  // ── the account is real and the key can see it ───────────────────────────
  step('the account')
  const account = await call('GET', `/accounts/${encodeURIComponent(accountId)}`)
  if (!account.ok) {
    fail(`the key cannot read ${accountId} (${account.status}) — ${JSON.stringify(account.data).slice(0, 200)}`)
    console.log('\nNothing else can run without a working key.\n')
    process.exit(1)
  }
  console.log(`  ok    ${accountId} — "${account.data['title']}" (${account.data['status']})`)
  if (!isLiveBase()) {
    note('this is the SANDBOX base — ids created here do not exist in production')
  }

  // ── how the account describes itself ─────────────────────────────────────
  step('how the account describes itself to Whop')
  const industryWrong = account.data['industry_type'] !== ACCOUNT.industry_type
  if (industryWrong) {
    console.log(`  now   ${account.data['industry_group']} / ${account.data['industry_type']}`)
    console.log(`  next  ${ACCOUNT.industry_group} / ${ACCOUNT.industry_type}`)
  }
  if (apply) {
    const updated = await call('PATCH', `/accounts/${encodeURIComponent(accountId)}`, ACCOUNT, 'account')
    if (updated.ok) {
      done('account description, audience and industry set')
    } else {
      /**
       * Not a failure of the setup, and not something a different key fixes.
       *
       * An Account API key can update its CONNECTED accounts and not itself —
       * so this endpoint answers 404 for our own `biz_`, however much access the
       * key has. The account's own description is editable by a signed-in
       * person in the dashboard, or by a user token. Reported and stepped over
       * rather than failed, because the product, the plans and the webhook are
       * what make checkout work and none of them depend on it.
       */
      note(`the account's own description is not editable by an API key (${updated.status}). Set it here:`)
      note(`      https://whop.com/dashboard/${accountId}/settings/  →  Business`)
      note(`      industry     ${ACCOUNT.industry_group} / ${ACCOUNT.industry_type}`)
      note(`      NOT "mental health app" — it contradicts terms clause 08 and rule 10`)
    }
  } else {
    done('set the industry, description, target audience and route')
  }

  // Not settable through the API at all — checked against the account update
  // schema, which has no field for any of them.
  note('terms, privacy and refund URLs are DASHBOARD-ONLY. Set them by hand:')
  note(`      https://whop.com/dashboard/${accountId}/settings/  →  Business`)
  note('      terms   https://hellonerve.com/legal/terms')
  note('      privacy https://hellonerve.com/legal/privacy')
  note('      refunds https://hellonerve.com/legal/terms  (clause 07 — 14 days)')

  // ── one product ──────────────────────────────────────────────────────────
  step('the product')
  const products = await call('GET', `/products?account_id=${encodeURIComponent(accountId)}&first=100`)
  const existingProducts = (products.data['data'] as Record<string, unknown>[] | undefined) ?? []
  let productId = existingProducts.find((p) => p['route'] === PRODUCT_ROUTE || p['title'] === 'Nerve')?.['id'] as string | undefined

  if (productId) {
    console.log(`  ok    "Nerve" already exists — ${productId}`)
    if (apply) {
      const patched = await call('PATCH', `/products/${encodeURIComponent(productId)}`, {
        description: PRODUCT_DESCRIPTION,
        visibility: 'hidden',
      }, `product-update:${productId}`)
      if (patched.ok) done('its description and visibility refreshed')
      else fail(`could not update the product (${patched.status})`)
    }
  } else if (apply) {
    const created = await call('POST', '/products', {
      account_id: accountId,
      title: 'Nerve',
      headline: 'Timed voice reps against AI characters, scored on how you handled it',
      description: PRODUCT_DESCRIPTION,
      route: PRODUCT_ROUTE,
      // Unlisted. We sell from our own pricing page through a checkout
      // configuration; the marketplace listing is a second public page for a
      // reviewer to read and a second place for the description to drift.
      visibility: 'hidden',
      custom_statement_descriptor: 'WHOP*NERVE',
      redirect_purchase_url: 'https://hellonerve.com/profile/subscription?bought=1',
      global_affiliate_status: 'disabled',
      member_affiliate_status: 'disabled',
    }, `product:${PRODUCT_ROUTE}`)
    if (created.ok) {
      productId = created.data['id'] as string
      done(`created "Nerve" — ${productId}`)
    } else {
      fail(`could not create the product (${created.status}) — ${JSON.stringify(created.data).slice(0, 300)}`)
    }
  } else {
    done('create the product "Nerve", unlisted, statement descriptor WHOP*NERVE')
  }

  // ── two plans ────────────────────────────────────────────────────────────
  step('the plans')
  const paid = PUBLIC_PLANS.filter((plan) => plan.id !== 'free')
  const planIds: Record<string, string> = {}

  const plans = await call('GET', `/plans?account_id=${encodeURIComponent(accountId)}&first=100`)
  const existingPlans = (plans.data['data'] as Record<string, unknown>[] | undefined) ?? []

  for (const plan of paid) {
    const price = dollars(plan.price)
    const body = {
      account_id: accountId,
      ...(productId ? { product_id: productId } : {}),
      title: `Nerve ${plan.name}`,
      description: `${plan.repsPerDay} voice reps a day. ${plan.tagline}`,
      plan_type: 'renewal',
      billing_period: 30,
      currency: 'usd',
      // Nothing is charged when the trial starts. A non-zero initial price
      // takes the money on day zero, which is the promise broken in a
      // different field from the obvious one.
      initial_price: 0,
      renewal_price: price,
      trial_period_days: TRIAL_DAYS,
      // Hidden, for the same reason the product is: this is sold from our
      // pricing page, not from Whop's marketplace.
      visibility: 'hidden',
      release_method: 'buy_now',
      unlimited_stock: true,
      metadata: { nerve_plan: plan.id },
    }

    const found = existingPlans.find(
      (p) => (p['metadata'] as Record<string, unknown> | null)?.['nerve_plan'] === plan.id
        || p['title'] === `Nerve ${plan.name}`,
    )

    console.log(`\n  ${plan.name} — $${price}/mo, ${TRIAL_DAYS}-day trial, ${plan.repsPerDay} reps a day`)

    if (found) {
      const id = found['id'] as string
      planIds[plan.id] = id
      console.log(`  ok    already exists — ${id}`)
      if (apply) {
        const patched = await call('PATCH', `/plans/${encodeURIComponent(id)}`, body, `plan-update:${plan.id}`)
        if (patched.ok) done('price, trial and visibility refreshed')
        else fail(`could not update the plan (${patched.status}) — ${JSON.stringify(patched.data).slice(0, 200)}`)
      }
    } else if (apply) {
      const created = await call('POST', '/plans', body, `plan:${plan.id}`)
      if (created.ok) {
        planIds[plan.id] = created.data['id'] as string
        done(`created — ${created.data['id']}`)
      } else {
        fail(`could not create the plan (${created.status}) — ${JSON.stringify(created.data).slice(0, 300)}`)
      }
    } else {
      done(`create it`)
    }
  }

  // ── one webhook ──────────────────────────────────────────────────────────
  step('the webhook')
  // `account_id` is required on this one, unlike /products and /plans where it
  // is a filter. Without it the API answers 400, not an empty list.
  const hooks = await call('GET', `/webhooks?account_id=${encodeURIComponent(accountId)}&first=100`)
  const existingHooks = (hooks.data['data'] as Record<string, unknown>[] | undefined) ?? []
  const ours = existingHooks.find((h) => h['url'] === WEBHOOK_URL)

  if (ours) {
    console.log(`  ok    already pointing at ${WEBHOOK_URL} — ${ours['id']}`)
    const missing = WEBHOOK_EVENTS.filter((e) => !(ours['events'] as string[] ?? []).includes(e))
    if (missing.length && apply) {
      const patched = await call('PATCH', `/webhooks/${encodeURIComponent(ours['id'] as string)}`, {
        events: WEBHOOK_EVENTS,
        enabled: true,
        ...(version ? { api_version_date: version } : {}),
      }, `webhook-update:${ours['id']}`)
      if (patched.ok) done(`subscribed it to the ${missing.length} events it was missing`)
      else fail(`could not update the webhook (${patched.status})`)
    } else if (missing.length) {
      done(`subscribe it to ${missing.join(', ')}`)
    } else {
      console.log('  ok    subscribed to all nine events')
    }
    note('the signing secret is shown ONCE, at creation. If you do not have it,')
    note('      delete this webhook in the dashboard and re-run to mint a new one.')
  } else if (apply) {
    const created = await call('POST', '/webhooks', {
      account_id: accountId,
      url: WEBHOOK_URL,
      events: WEBHOOK_EVENTS,
      ...(version ? { api_version_date: version } : {}),
    }, 'webhook')
    if (created.ok) {
      done(`created — ${created.data['id']}`)
      console.log('\n  ┌─────────────────────────────────────────────────────────────────')
      console.log('  │ THE SIGNING SECRET, SHOWN ONCE AND NEVER AGAIN.')
      console.log('  │ Store it now as WHOP_WEBHOOK_SECRET, prefix included.')
      console.log('  │')
      console.log(`  │   ${created.data['webhook_secret']}`)
      console.log('  └─────────────────────────────────────────────────────────────────')
    } else {
      fail(`could not create the webhook (${created.status}) — ${JSON.stringify(created.data).slice(0, 300)}`)
    }
  } else {
    done(`create a webhook at ${WEBHOOK_URL} for all nine events`)
  }

  // ── what to put in the environment ───────────────────────────────────────
  if (apply && failures === 0) {
    step('the environment block')
    console.log('\n  Put these in .env.local AND in Vercel (production scope), then REDEPLOY —')
    console.log('  Vercel does not apply new variables to an existing deployment.\n')
    console.log(`    WHOP_API_KEY=${'<the key you created>'}`)
    console.log(`    WHOP_API_BASE=${base}`)
    console.log(`    WHOP_API_VERSION_DATE=${version ?? '2026-08-31'}`)
    console.log(`    WHOP_WEBHOOK_SECRET=${'<printed above, once>'}`)
    console.log(`    WHOP_ACCOUNT_ID=${accountId}`)
    console.log(`    WHOP_PLAN_PRO=${planIds['pro'] ?? '<not created>'}`)
    console.log(`    WHOP_PLAN_ELITE=${planIds['elite'] ?? '<not created>'}`)
    console.log('\n  Then: npm run whop:verify')
  }

  console.log(`\n${failures} failed.`)
  if (failures > 0) {
    console.log('Setup did not complete.\n')
    process.exit(1)
  }
  console.log(apply ? 'Setup complete.\n' : 'Nothing was written. Re-run with --apply.\n')
}

void main()
