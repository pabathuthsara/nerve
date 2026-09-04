/**
 * The merchant-of-record preflight (§14, docs/PAYMENTS-WHOP.md §6.9).
 *
 *   npm run whop:verify
 *
 * `db:billing` proves our half: that a signed event moves the right plan on the
 * real tables. It proves nothing about the vendor, because it builds its own
 * payloads and injects its own plan ids. This checks the other half — that the
 * account we are about to sell through is actually configured the way the
 * product claims it is.
 *
 * It exists because the failure it catches is silent and expensive. Every
 * surface in the app promises a free trial: the pricing page, `TRIAL_NOTE`, the
 * countdown on `/profile/subscription`, and clause 07 of the terms. A payment
 * page that promises seven free days and takes the money on day zero is not a
 * bug, it is the exact pattern §14 says closes a merchant-of-record account.
 *
 * Unlike the Creem version, the trial IS verifiable from here: Whop puts
 * `trial_period_days` on the plan and the plans API returns it. The two-step
 * "confirm this by hand in a dashboard" note that ended the old script is gone,
 * and that is the single biggest thing this migration bought.
 *
 * Run it before any deploy that can take money. It reads only; it creates
 * nothing and charges nothing.
 *
 *   npm run whop:verify -- --checkout
 *
 * adds the one step that is not a read: it opens a real checkout configuration
 * through `createCheckout`, the same function the buy button calls, and reports
 * the URL. Opt-in rather than default, because it leaves an abandoned
 * configuration in the vendor dashboard every time it runs. Against the sandbox
 * it can charge nothing; it is refused outright on the live base.
 */

import { OFFERS, PUBLIC_PLANS, TRIAL_DAYS, planById } from '@/lib/site/plans'
import {
  apiBase,
  apiVersionDate,
  checkoutConfigured,
  isLiveBase,
  rehearsing,
  takingRealPayments,
} from '@/lib/billing/plans'
import { createCheckout } from '@/lib/billing/checkout'
import { FROM } from '@/lib/email/send'

let failures = 0
let warnings = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

function warn(clear: boolean, description: string): void {
  console.log(`  ${clear ? 'pass' : 'WARN'}  ${description}`)
  if (!clear) warnings += 1
}

/** A statement of fact. Counts as neither a pass nor a problem. */
function note(description: string): void {
  console.log(`  ----  ${description}`)
}

/** Every event `lib/billing/events.ts` acts on. The webhook must carry all nine. */
const REQUIRED_EVENTS = [
  'membership.activated',
  'membership.deactivated',
  'membership.trial_ending_soon',
  'membership.cancel_at_period_end_changed',
  'payment.succeeded',
  'payment.failed',
  'invoice.past_due',
  'refund.created',
  'dispute.created',
] as const

interface WhopPlan {
  id: string
  title: string | null
  plan_type: string
  billing_period: number | null
  initial_price: number
  renewal_price: number
  currency: string
  trial_period_days: number | null
  visibility: string
  tax_type: string
  product: { id: string } | null
}

interface WhopWebhook {
  id: string
  url: string
  events: string[]
  enabled: boolean
  api_version_date: string | null
  consecutive_failures: number
  disabled_at: string | null
}

/** Price in the plan's own major units, from the authored string. */
function dollars(price: string | null): number {
  return Number(price?.replace(/[^0-9.]/g, '') ?? '0')
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const key = process.env['WHOP_API_KEY']?.trim() ?? ''
  const secret = process.env['WHOP_WEBHOOK_SECRET']?.trim() ?? ''
  const accountId = process.env['WHOP_ACCOUNT_ID']?.trim() ?? ''
  const base = apiBase()
  const version = apiVersionDate()

  const get = async (path: string): Promise<Response> =>
    fetch(`${base}${path}`, {
      headers: {
        authorization: `Bearer ${key}`,
        ...(version ? { 'api-version-date': version } : {}),
      },
    })

  console.log('\nWhop preflight\n')
  console.log('configuration')

  check(!!key, 'WHOP_API_KEY is set')
  check(!!secret, 'WHOP_WEBHOOK_SECRET is set — the webhook refuses with 503 without it')
  check(!!accountId, 'WHOP_ACCOUNT_ID is set — every event is checked against it')
  check(checkoutConfigured(), 'checkoutConfigured() is true, so the buy button is live')
  // Pinning is what makes a field rename the provider's problem rather than an
  // outage of ours, and several endpoints here are still shipping.
  warn(!!version, `Api-Version-Date is pinned (${version ?? 'unpinned — the API key\'s stored pin applies'})`)

  if (!key) {
    console.log('\nNothing else can be checked without an API key.\n')
    process.exit(1)
  }

  const live = isLiveBase()
  console.log(`        environment: ${live ? 'LIVE' : 'SANDBOX'} (${base})`)

  /**
   * A sandbox base in a production deployment is the worst outcome available.
   * `sandbox-api.whop.com` accepts any card and takes no money, so the checkout
   * "succeeds", the webhook fires, and `applyBillingEvent` grants a real paid
   * plan against a payment that never happened. Free Pro for anyone who finds
   * the button, and no revenue to reconcile it against.
   */
  const rehearsal = rehearsing()
  if (rehearsal) {
    // Deliberate, named, and never quiet. The flag is how a full-dress rehearsal
    // runs on the production domain; it is also, by construction, a deployment
    // that cannot take money, so it can never be reported as ready.
    warn(false, 'WHOP_TEST_MODE_IN_PRODUCTION is SET — this deployment is a rehearsal and cannot take real payments')
    console.log('        /profile/subscription is showing the test-mode banner to every visitor.')
    console.log('        Unset it in the same edit that points the base at the live host (§7.C).')
  } else if (process.env['VERCEL_ENV'] === 'production' || process.env['NODE_ENV'] === 'production') {
    check(live, 'a production deployment is pointed at the LIVE base, not the sandbox')
  } else if (live) {
    /**
     * Not a warning, and definitely not the sandbox sentence.
     *
     * The first version of this passed `live` into `warn()` alongside a message
     * that began "this is the SANDBOX base" — so a correctly configured live
     * deployment printed `pass  this is the SANDBOX base`, which is the exact
     * opposite of the truth about whether a card gets charged. A check that
     * reports backwards is worse than one that does not run.
     */
    note('this is the LIVE base. A checkout opened from here charges a real card.')
  } else {
    warn(false, 'this is the SANDBOX base — it takes no real money, so it must never reach production')
  }

  console.log('\nthe account')

  const accountResponse = await get(`/accounts/${encodeURIComponent(accountId)}`)
  if (!accountResponse.ok) {
    check(false, `WHOP_ACCOUNT_ID resolves at the provider (${accountResponse.status})`)
  } else {
    const account = (await accountResponse.json()) as {
      id: string; title: string | null; status?: string
      industry_group?: string; industry_type?: string
      logo_url?: string | null; banner_image_url?: string | null; opengraph_image_url?: string | null
    }
    check(account.id === accountId, `the key can read ${accountId} — "${account.title ?? 'untitled'}"`)
    if (account.status) {
      check(account.status === 'active', `the account is active (${account.status})`)
    }

    // How the account describes itself, asserted rather than trusted.
    //
    // This is not cosmetic and it does not stay put. Rule 10 forbids clinical
    // claims anywhere, clause 08 of the terms says in as many words that no
    // part of this product treats a condition, and `mental_health_app` is the
    // first thing a compliance reviewer reads. It has now reverted to that
    // value TWICE: once from saving Whop's Business settings form, and once
    // from an API PATCH that set nothing but an OpenGraph image.
    //
    // So it is checked here, in the preflight that runs before money moves,
    // because the revert is silent and the cost of missing it is the payment
    // account.
    check(
      account.industry_type === 'communication_coaching'
        && account.industry_group === 'personal_development',
      `it is classified as personal_development / communication_coaching`
      + ` (${account.industry_group} / ${account.industry_type})`,
    )
    if (account.industry_type === 'mental_health_app') {
      console.log('  ----        REVERTED. Run `npm run whop:setup -- --apply`, and if that')
      console.log('  ----        cannot write it, fix it through the MCP or the dashboard.')
      console.log('  ----        It contradicts terms clause 08 and CLAUDE.md rule 10.')
    }

    // The images. A blank logo is not a launch blocker, but a link that renders
    // as an empty card is the difference between a shared post and a dead one,
    // and every channel in MARKETING-PLAN.md is a shared link.
    check(Boolean(account.logo_url), 'it has a logo')
    check(Boolean(account.opengraph_image_url), 'it has an OpenGraph image, so shared links are not blank')
  }

  console.log('\nplans')

  const productIds = new Set<string>()

  for (const offer of OFFERS) {
    const plan = planById(offer.plan)
    const variable = offer.env
    const id = process.env[variable]?.trim()
    const periodWord = offer.period === 'weekly' ? 'week' : 'month'
    console.log(`\n  ${plan.name} ${offer.period} — ${variable}`)
    if (!id) {
      check(false, `${variable} is set`)
      continue
    }

    const response = await get(`/plans/${encodeURIComponent(id)}`)
    if (!response.ok) {
      check(false, `${id} resolves at the provider (${response.status})`)
      continue
    }

    const vendor = (await response.json()) as WhopPlan
    check(true, `${id} resolves — "${vendor.title ?? 'untitled'}"`)
    check(vendor.plan_type === 'renewal', `it is a subscription, not a one-off (${vendor.plan_type})`)
    check(vendor.billing_period === offer.billingDays,
      `it bills every ${offer.billingDays} days (${vendor.billing_period ?? 'unset'})`)

    /**
     * The price on the receipt and the price on the pricing page are the same
     * number, or we are advertising one thing and charging another — which §14
     * has a human reading the public page specifically to catch.
     *
     * Major units, not cents: Whop's own plan example is `"renewal_price": 29`
     * for a $29 plan. Getting this backwards would have created plans at 1900×
     * the intended price, which is the reason it is asserted rather than
     * assumed.
     */
    const expected = offer.priceUsd
    check(vendor.renewal_price === expected,
      `it renews at what lib/site/plans.ts advertises ($${vendor.renewal_price} vs $${expected})`)
    check(vendor.currency.toLowerCase() === 'usd', `it is priced in USD (${vendor.currency})`)

    /**
     * THE ONE THIS SCRIPT EXISTS FOR.
     *
     * Four surfaces promise seven free days. A plan created without a trial
     * looks identical from every other angle and charges the card on day zero.
     */
    /**
     * `null` and `0` both mean "no trial", and only one of them is what we sent.
     *
     * The weekly plan was created with `trial_period_days: 0` and Whop stored
     * `null` — a vendor's payload disagreeing with the vendor's own input, which
     * is rule 12 in miniature. Comparing strictly against 0 would fail a plan
     * that is exactly right, and a preflight that cries wolf on a correct plan
     * is a preflight people start ignoring.
     */
    const vendorTrial = vendor.trial_period_days ?? 0
    if (offer.trialDays === 0) {
      check(vendorTrial === 0,
        `it has NO trial, because the ${periodWord} is the trial (${vendorTrial})`)
    } else {
      check(vendorTrial === offer.trialDays,
        `it gives the ${offer.trialDays} free days every surface promises (${vendorTrial})`)
    }

    // Nothing is taken up front. On a trial plan a non-zero initial price
    // charges on day zero; on a no-trial plan it charges the period's price
    // twice. Same field, two different broken promises.
    check(vendor.initial_price === 0,
      `nothing is charged before the first period (initial_price ${vendor.initial_price})`)

    // Inclusive tax silently cuts each tier by the local VAT rate, and §14's
    // margin arithmetic treats the price as gross revenue.
    check(vendor.tax_type !== 'inclusive',
      `tax is not inclusive, so we keep the full ${offer.price} (${vendor.tax_type})`)

    // We sell from our own pricing page through a checkout configuration. A
    // visible plan is a listing on Whop's public marketplace, which §16 and
    // PAYMENTS-APPROVAL.md both want us off.
    check(vendor.visibility !== 'visible',
      `it is not listed on Whop's public marketplace (${vendor.visibility})`)

    if (vendor.product?.id) productIds.add(vendor.product.id)
  }

  // One product, two plans (D1). Two products would mean two storefront pages
  // for a reviewer to read and two places for the description to drift.
  check(productIds.size <= 1,
    `both plans belong to one product (${productIds.size === 0 ? 'none resolved' : [...productIds].join(', ')})`)

  console.log('\nthe webhook')

  // `account_id` is REQUIRED here, unlike /products and /plans where it merely
  // filters. Without it the API answers 400 and this check reported the webhook
  // as unreadable on a correctly configured account.
  const webhookResponse = await get(`/webhooks?account_id=${encodeURIComponent(accountId)}&first=100`)
  if (!webhookResponse.ok) {
    check(false, `the webhook list is readable (${webhookResponse.status})`)
  } else {
    const { data: hooks = [] } = (await webhookResponse.json()) as { data?: WhopWebhook[] }
    const enabled = hooks.filter((hook) => hook.enabled && !hook.disabled_at)
    check(enabled.length === 1,
      `exactly one enabled webhook (${enabled.length} of ${hooks.length})`)

    for (const hook of enabled) {
      console.log(`\n  ${hook.id} — ${hook.url}`)
      // A webhook that still points at a tunnel is the failure that looks like
      // nothing: checkout works, money moves, and no plan is ever granted.
      check(/^https:\/\//i.test(hook.url) && !/ngrok|trycloudflare|localhost/i.test(hook.url),
        'it points at a real host rather than a development tunnel')
      check(hook.url.endsWith('/api/webhooks/whop'), 'it points at the route this repo serves')

      const missing = REQUIRED_EVENTS.filter((event) => !hook.events.includes(event))
      check(missing.length === 0,
        missing.length === 0
          ? `it is subscribed to all ${REQUIRED_EVENTS.length} events we act on`
          : `it is missing ${missing.join(', ')}`)

      warn(!!hook.api_version_date, `it pins a payload version (${hook.api_version_date ?? 'unpinned'})`)
      check(hook.consecutive_failures === 0,
        `it has no run of failed deliveries (${hook.consecutive_failures})`)

      const deliveries = await get(`/webhooks/${encodeURIComponent(hook.id)}/deliveries?first=10`)
      if (deliveries.ok) {
        const { data: recent = [] } = (await deliveries.json()) as {
          data?: { success: boolean; response_code: number; event: string | null }[]
        }
        const failed = recent.filter((delivery) => !delivery.success)
        check(failed.length === 0,
          failed.length === 0
            ? `its last ${recent.length} deliveries all succeeded`
            : `${failed.length} of its last ${recent.length} deliveries failed (${failed.map((d) => `${d.event ?? '?'} ${d.response_code}`).join(', ')})`)
      }
    }
  }

  /**
   * The email before the first charge, and whether it can actually leave.
   *
   * This check exists because the thing it catches already happened: the sender
   * was `nerve@send.hellonerve.com`, that subdomain was never verified on the
   * Resend account, and Resend refuses to send from an unverified domain.
   * `sendEmail` swallows the failure on purpose — an email provider must never
   * turn a billing webhook into a 500 — so the result was a route answering 200
   * and a promised email that did not exist. Silent, and it would have stayed
   * silent until a customer disputed a charge they were never warned about.
   */
  console.log('\nthe email before the first charge')
  const resendKey = process.env['RESEND_API_KEY']?.trim()
  if (!resendKey) {
    warn(false, 'RESEND_API_KEY is unset IN THIS SHELL — the email cannot be checked from here')
    note('      This reads the local environment, and the email is sent by the')
    note('      DEPLOYMENT. An unset key here says nothing about production —')
    note('      check with `vercel env ls production` before believing it.')
    note('      If it is unset there too, terms clause 07 and TRIAL_NOTE both')
    note('      promise an email that will not arrive.')
  } else {
    const sender = FROM.match(/<([^>]+)>/)?.[1] ?? FROM
    const domain = sender.split('@')[1] ?? ''
    const domains = await fetch('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${resendKey}` },
    })
    if (!domains.ok) {
      check(false, `Resend accepts the API key (${domains.status})`)
    } else {
      const { data = [] } = (await domains.json()) as { data?: { name: string; status: string }[] }
      const match = data.find((d) => d.name === domain)
      check(!!match, `the sender's domain is on the Resend account (${domain})`)
      if (match) {
        check(match.status === 'verified',
          `and it is verified, so mail can actually leave (${match.status})`)
      } else {
        note(`      verified domains: ${data.map((d) => `${d.name} (${d.status})`).join(', ') || 'none'}`)
        note(`      the sender is ${sender} — set in lib/email/send.ts`)
      }
    }
  }

  /**
   * The buy path, end to end, through our own code.
   *
   * `whopPlanIdFor` -> the provider -> a `purchase_url`. It is the half of the
   * test plan that does not need a public URL: everything up to the redirect can
   * be proven from a laptop, and what is left after this is the webhook coming
   * back.
   */
  if (process.argv.includes('--checkout')) {
    console.log('\nthe buy path (--checkout)')
    if (live) {
      check(false, 'refused: --checkout opens a real session and this is the LIVE base')
    } else {
      for (const offer of OFFERS) {
        const plan = planById(offer.plan)
        // Same trap the Server Action fell into: `NEXT_PUBLIC_SITE_URL` is set
        // to an empty string here, and `??` does not fall back on `''`.
        const site = [process.env['NEXT_PUBLIC_SITE_URL'], process.env['NEXT_PUBLIC_APP_URL']]
          .map((value) => value?.trim())
          .find((value) => value && /^https?:\/\//i.test(value))
          ?? 'http://localhost:3000'
        const result = await createCheckout({
          userId: `preflight-${Date.now()}`,
          plan: offer.plan,
          period: offer.period,
          successUrl: `${site.replace(/\/+$/, '')}/profile/subscription?bought=1`,
        })
        check(result.ok && !!result.url,
          `${plan.name} ${offer.period}: createCheckout returns a URL${result.ok ? '' : ` — ${result.message}`}`)
        if (result.url) console.log(`        ${result.url}`)
      }
    }
  }

  console.log(`\n${failures} failed, ${warnings} warning(s).`)
  if (failures > 0) {
    console.log('This deployment is NOT ready to take money.\n')
    process.exit(1)
  }
  if (rehearsal || !takingRealPayments()) {
    console.log(
      'Configuration is sound FOR A REHEARSAL. This deployment takes no real\n'
      + 'money — going live is the variable block in PAYMENTS-WHOP.md §7.C.\n',
    )
    return
  }
  console.log('Configuration is sound, the trial is real, and the webhook is delivering.\n')
}

void main()
