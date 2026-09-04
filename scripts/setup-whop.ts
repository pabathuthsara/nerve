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

import { OFFERS, PUBLIC_PLANS, TRIAL_DAYS, planById } from '@/lib/site/plans'
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
  industry_type: 'public_speaking_coaching',
  description:
    'Confidence training for conversation. Timed three-minute voice reps against AI characters, scored on how the conversation was handled rather than on whether it succeeded, plus graded real-world challenges. Training, not therapy or clinical care.',
  target_audience:
    'Adults practising social confidence and conversation skills. 18+, moderated, PG-13.',
  route: 'nerve',
} as const

/**
 * The affiliate programme (MARKETING-PLAN.md, Day 2).
 *
 * These four fields live on the PRODUCT, not on the account — there is no
 * account-level affiliate rate, which is worth knowing because the dashboard
 * presents it as a company setting. Read one real product payload and it is
 * plain: `global_affiliate_percentage`, `global_affiliate_status`,
 * `member_affiliate_percentage`, `member_affiliate_status`.
 *
 * **Why 40 and not Whop's default 30.** Affiliates are the only part of the
 * acquisition machine that keeps running when the one person posting stops,
 * and the plan's highest-severity risk is precisely that he is the whole
 * engine. 30% is the default every other seller offers, so it is the rate a
 * faceless creator scrolls past. 40% recurring on a $19 subscription is a
 * legible offer to somebody who already knows what those numbers mean.
 *
 * **50% for members**, because a member who converts has used the product and
 * their recommendation carries what an unpaid stranger's cannot.
 *
 * The cost is zero until it earns: an affiliate is paid out of revenue that
 * would not exist without them. This is the one growth lever in the plan with
 * no cash outlay and no ceiling set by available hours.
 *
 * **`disabled` is the state this account shipped in**, not an accident —
 * the product was created with both statuses off because there was nothing to
 * affiliate for. Turning them on is a deliberate change, which is why it is
 * here and reviewed rather than clicked.
 */
const AFFILIATES = {
  global_affiliate_percentage: 40,
  global_affiliate_status: 'enabled',
  member_affiliate_percentage: 50,
  member_affiliate_status: 'enabled',
} as const

/**
 * What an affiliate is told, on the company record.
 *
 * Authored here for the same reason the account description is: it is a public
 * representation of the business, and a dashboard textarea somebody edited once
 * is not reviewable. Lead with communication coaching and never with dating —
 * `PAYMENTS-APPROVAL.md` §3, and the same rule the store description follows.
 *
 * The footage folder is the one thing this cannot supply: it has to be a real
 * URL to real screen-recorded reps, and it is the single thing that decides
 * whether an affiliate can post without talking to us first. Fill it in and
 * re-run.
 */
const AFFILIATE_INSTRUCTIONS = [
  'Nerve is confidence training for conversation. Users take timed three-minute voice reps against AI characters and get scored on how they handled it — never on whether they succeeded.',
  '',
  'WHAT YOU EARN',
  '40% of every payment, for as long as your referral keeps paying. 50% if you are a Nerve member yourself. Pro is $19/month and Elite is $49/month, both with a 7-day free trial, so a single referral on Pro is $7.60 a month to you for as long as they stay.',
  '',
  'WHAT WORKS',
  'Screen-record an actual rep and cut it. The warmth meter moving in real time is the product, and no other app in this category can show a real recording — everything else is fabricated text over B-roll. The strongest angle is the contradiction at the heart of the scoring: a conversation that ends in rejection can still score 92, because the score is for process and never for outcome.',
  '',
  'WHAT NOT TO DO',
  'No manipulation framing, no scripts for pushing past a no, and nothing that reads as a technique for wearing somebody down. The product itself refuses to train that and scores it down. Keep it about the skill, never about the target. Content that breaks this gets the affiliate link revoked, because it puts our payment processing at risk.',
].join('\n')

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
/**
 * The webhook endpoint, on the host that does NOT redirect.
 *
 * The apex 308s to `www`, and this was registered against the apex on the first
 * run. A browser follows that without noticing; a webhook sender is a different
 * animal — plenty treat any 3xx as a failed delivery, and a billing webhook
 * that fails every delivery is a product where nobody who pays ever gets their
 * plan. It is the most expensive kind of bug: silent, total, and invisible
 * until somebody has already been charged.
 */
const WEBHOOK_URL = 'https://www.hellonerve.com/api/webhooks/whop'

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
        // Hidden is a DECISION, not a default — see MARKETING-PLAN.md §4.1.
        // Public discoverability raises our visibility to processor review and
        // this account watched Creem decline it on 1 September.
        visibility: 'hidden',
        ...AFFILIATES,
      }, `product-update:${productId}`)
      if (patched.ok) done('its description, visibility and affiliate rates refreshed')
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
      redirect_purchase_url: 'https://www.hellonerve.com/profile/subscription?bought=1',
      ...AFFILIATES,
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

  // ── the affiliate programme ──────────────────────────────────────────────
  //
  // Read back rather than assumed. The rates are set on the product above; this
  // reports what the account actually holds now, because "I sent a PATCH" and
  // "the rate is 40" are different claims and only the second one earns money.
  step('the affiliate programme')
  if (productId) {
    const check = await call('GET', `/products/${encodeURIComponent(productId)}`)
    if (check.ok) {
      const gs = check.data['global_affiliate_status']
      const gp = check.data['global_affiliate_percentage']
      const ms = check.data['member_affiliate_status']
      const mp = check.data['member_affiliate_percentage']
      const want = AFFILIATES
      const line = (label: string, status: unknown, pct: unknown, wantStatus: string, wantPct: number) => {
        if (status === wantStatus && pct === wantPct) console.log(`  ok    ${label} — ${pct}%, ${status}`)
        else if (apply) fail(`${label} is ${pct}% ${status}, wanted ${wantPct}% ${wantStatus}`)
        else done(`${label}: ${pct}% ${status} → ${wantPct}% ${wantStatus}`)
      }
      line('global affiliates', gs, gp, want.global_affiliate_status, want.global_affiliate_percentage)
      line('member affiliates', ms, mp, want.member_affiliate_status, want.member_affiliate_percentage)
    }
  }

  // The brief lives on the COMPANY record, which is the same id under a
  // different representation — `affiliate_instructions` does not exist on
  // /accounts.
  const company = await call('GET', `/companies/${encodeURIComponent(accountId)}`)
  const briefNow = company.ok ? company.data['affiliate_instructions'] : undefined
  if (briefNow === AFFILIATE_INSTRUCTIONS) {
    console.log('  ok    the affiliate brief is current')
  } else if (apply) {
    const wrote = await call('PATCH', `/companies/${encodeURIComponent(accountId)}`, {
      affiliate_instructions: AFFILIATE_INSTRUCTIONS,
    }, 'affiliate-brief')
    if (wrote.ok) done('the affiliate brief written')
    else fail(`could not write the affiliate brief (${wrote.status}) — ${JSON.stringify(wrote.data).slice(0, 200)}`)
  } else {
    done(briefNow ? 'update the affiliate brief' : 'write the affiliate brief (currently empty)')
  }
  note('whether commission recurs on renewals is not exposed on any payload this script can read — confirm it once in the dashboard')

  // ── one vendor plan per OFFER ────────────────────────────────────────────
  //
  // Not one per plan. Pro is sold by the week and by the month, which is two
  // vendor plans resolving to one entitlement — see `OFFERS` in
  // `lib/site/plans.ts`. Everything below reads the offer rather than the plan
  // so that price, billing period and trial length come from one authored
  // record and cannot be typed twice.
  step('the plans')
  const planIds: Record<string, string> = {}

  const plans = await call('GET', `/plans?account_id=${encodeURIComponent(accountId)}&first=100`)
  const existingPlans = (plans.data['data'] as Record<string, unknown>[] | undefined) ?? []

  for (const offer of OFFERS) {
    const plan = planById(offer.plan)
    // The key that survives a rename. Titles get edited in dashboards; this
    // does not, and it is what stops a second run creating a duplicate plan
    // beside the one somebody renamed.
    const key = `${offer.plan}-${offer.period}`
    const periodWord = offer.period === 'weekly' ? 'week' : 'month'

    const body = {
      account_id: accountId,
      ...(productId ? { product_id: productId } : {}),
      title: `Nerve ${plan.name} ${offer.period === 'weekly' ? 'Weekly' : 'Monthly'}`,
      description: `${plan.repsPerDay} voice reps a day, billed by the ${periodWord}.`
        + (offer.trialDays === 0 ? ' No trial — the week is the trial.' : ` ${offer.trialDays} days free first.`),
      plan_type: 'renewal',
      billing_period: offer.billingDays,
      currency: 'usd',
      // Nothing is charged when a TRIAL starts. On an offer with no trial this
      // is still 0 and still correct: Whop takes the renewal price at the start
      // of the first period, so a non-zero initial price here would charge the
      // week's price twice on day zero.
      initial_price: 0,
      renewal_price: offer.priceUsd,
      // Zero means no trial. Weekly Pro is sold without one on purpose — a
      // seven-day trial in front of a seven-day period charges on day 7 and
      // again on day 14, which is incoherent to read and worse to dispute.
      trial_period_days: offer.trialDays,
      // Hidden, for the same reason the product is: this is sold from our
      // pricing page, not from Whop's marketplace.
      visibility: 'hidden',
      release_method: 'buy_now',
      unlimited_stock: true,
      metadata: { nerve_plan: offer.plan, nerve_period: offer.period },
    }

    const found = existingPlans.find((p) => {
      const meta = p['metadata'] as Record<string, unknown> | null
      if (meta?.['nerve_plan'] === offer.plan && meta?.['nerve_period'] === offer.period) return true
      // The plans created before periods existed carry `nerve_plan` and no
      // `nerve_period`. They are the MONTHLY ones — adopt them rather than
      // creating a duplicate beside a plan somebody is already paying on.
      return meta?.['nerve_plan'] === offer.plan && !meta?.['nerve_period'] && offer.period === 'monthly'
    })

    console.log(`\n  ${plan.name} ${offer.period} — $${offer.priceUsd}/${periodWord}, `
      + `${offer.trialDays === 0 ? 'no trial' : `${offer.trialDays}-day trial`}, ${plan.repsPerDay} reps a day`)

    if (found) {
      const id = found['id'] as string
      planIds[key] = id
      console.log(`  ok    already exists — ${id}`)
      if (apply) {
        const patched = await call('PATCH', `/plans/${encodeURIComponent(id)}`, body, `plan-update:${key}`)
        if (patched.ok) done('price, period, trial and visibility refreshed')
        else fail(`could not update the plan (${patched.status}) — ${JSON.stringify(patched.data).slice(0, 200)}`)
      }
    } else if (apply) {
      const created = await call('POST', '/plans', body, `plan:${key}`)
      if (created.ok) {
        planIds[key] = created.data['id'] as string
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
    // One line per offer, keyed off the same record the app reads, so a new
    // period cannot be created here and then be unbuyable for want of a
    // variable nobody was told to set.
    for (const offer of OFFERS) {
      const id = planIds[`${offer.plan}-${offer.period}`] ?? '<not created>'
      console.log(`    ${offer.env}=${id}`)
    }
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
