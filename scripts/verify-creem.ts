/**
 * The merchant-of-record preflight (§14, docs/PAYMENTS-NEW-INTEGRATION.md §6).
 *
 *   npm run creem:verify
 *
 * `db:billing` proves our half: that a signed event moves the right plan on the
 * real tables. It proves nothing about the vendor, because it builds its own
 * payloads and injects its own product ids. This checks the other half — that
 * the account we are about to sell through is actually configured the way the
 * product claims it is.
 *
 * It exists because the failure it catches is silent and expensive. Every
 * surface in the app promises a free trial: the pricing page, `TRIAL_NOTE`, the
 * countdown on `/profile/subscription`, and clause 07 of the terms. A trial is
 * configured on the PRODUCT, in Creem's dashboard, and neither the CLI nor the
 * API exposes the field — so a product created without one looks identical from
 * here and charges the card immediately. A payment page that promises seven free
 * days and takes the money on day zero is not a bug, it is the exact pattern §14
 * says closes a merchant-of-record account.
 *
 * Run it before any deploy that can take money. It reads only; it creates
 * nothing and charges nothing.
 *
 *   npm run creem:verify -- --checkout
 *
 * adds the one step that is not a read: it opens a real checkout session
 * through `createCheckout`, the same function the buy button calls, and reports
 * the URL. Opt-in rather than default, because it leaves an abandoned session
 * in the vendor dashboard every time it runs. On a test key it can charge
 * nothing; it is refused outright on a live one.
 */

import { PUBLIC_PLANS } from '@/lib/site/plans'
import { checkoutConfigured, rehearsing, takingRealPayments } from '@/lib/billing/plans'
import { apiBase, createCheckout } from '@/lib/billing/checkout'

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

interface CreemProduct {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  billing_type: string
  billing_period: string
  status: string
  tax_mode: string
  tax_category: string
  default_success_url: string | null
  mode: string
}

/** Price in cents, from the authored string the pricing page renders. */
function cents(price: string | null): number {
  return Math.round(Number(price?.replace(/[^0-9.]/g, '') ?? '0') * 100)
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const key = process.env['CREEM_API_KEY']?.trim() ?? ''
  const secret = process.env['CREEM_WEBHOOK_SECRET']?.trim() ?? ''

  console.log('\nCreem preflight\n')
  console.log('configuration')

  check(!!key, 'CREEM_API_KEY is set')
  check(!!secret, 'CREEM_WEBHOOK_SECRET is set — the webhook refuses with 503 without it')
  check(checkoutConfigured(), 'checkoutConfigured() is true, so the buy button is live')

  if (!key) {
    console.log('\nNothing else can be checked without an API key.\n')
    process.exit(1)
  }

  // The key's own prefix picks the host, so it is also the only honest answer to
  // "which environment is this?". Two variables that can disagree is a way to
  // point a live key at the sandbox.
  const live = key.startsWith('creem_live_')
  const test = key.startsWith('creem_test_')
  check(live || test, 'the key carries a recognisable creem_test_ / creem_live_ prefix')
  console.log(`        environment: ${live ? 'LIVE' : test ? 'TEST' : 'UNKNOWN'} (${apiBase(key)})`)

  /**
   * A test key in a production deployment is the worst outcome available.
   * `test-api.creem.io` accepts any card and takes no money, so the checkout
   * "succeeds", the webhook fires, and `applyBillingEvent` grants a real paid
   * plan against a payment that never happened. Free Pro for anyone who finds
   * the button, and no revenue to reconcile it against.
   */
  const rehearsal = rehearsing()
  if (rehearsal) {
    // Deliberate, named, and never quiet. The flag is how a full-dress rehearsal
    // runs on the production domain; it is also, by construction, a deployment
    // that cannot take money, so it can never be reported as ready.
    warn(false, 'CREEM_TEST_MODE_IN_PRODUCTION is SET — this deployment is a rehearsal and cannot take real payments')
    console.log('        /profile/subscription is showing the test-mode banner to every visitor.')
    console.log('        Unset it in the same edit that installs the live key (§6.5).')
  } else if (process.env['VERCEL_ENV'] === 'production' || process.env['NODE_ENV'] === 'production') {
    check(live, 'a production deployment is using a LIVE key, not a test one')
  } else {
    warn(live, `this is a ${test ? 'TEST' : 'non-live'} key — it takes no real money, so it must never reach production`)
  }

  console.log('\nproducts')

  const paid = PUBLIC_PLANS.filter((plan) => plan.id !== 'free')
  for (const plan of paid) {
    const variable = `CREEM_PRODUCT_${plan.id.toUpperCase()}`
    const id = process.env[variable]?.trim()
    console.log(`\n  ${plan.name} — ${variable}`)
    if (!id) {
      check(false, `${variable} is set`)
      continue
    }

    const response = await fetch(`${apiBase(key)}/v1/products?product_id=${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': key },
    })
    if (!response.ok) {
      check(false, `${id} resolves at the provider (${response.status})`)
      continue
    }

    const product = (await response.json()) as CreemProduct
    check(true, `${id} resolves — "${product.name}"`)
    check(product.status === 'active', `it is active (${product.status})`)
    check(product.mode === (live ? 'prod' : 'test') || product.mode === (live ? 'live' : 'test'),
      `it belongs to this environment (product mode: ${product.mode})`)

    // The price on the receipt and the price on the pricing page are the same
    // number or we are advertising one thing and charging another — which §14
    // has a human reading the public page specifically to catch.
    const expected = cents(plan.price)
    check(product.price === expected,
      `it charges what lib/site/plans.ts advertises (${product.price} vs ${expected} cents)`)
    check(product.currency === 'USD', `it is priced in USD (${product.currency})`)
    check(product.billing_type === 'recurring' && product.billing_period === 'every-month',
      `it bills monthly and recurring (${product.billing_type} / ${product.billing_period})`)

    // Inclusive tax silently cuts each tier by the local VAT rate, and §14's
    // margin arithmetic treats the price as gross revenue.
    check(product.tax_mode === 'exclusive',
      `tax is exclusive, so we keep the full ${plan.price} (${product.tax_mode})`)

    // The description is on the receipt and in the vendor dashboard a reviewer
    // reads. It should describe the plan we actually sell.
    warn(!/minute/i.test(product.description ?? ''),
      'its description does not still describe the retired minutes-based plan')

    /**
     * The product-level return URL, which is a backstop rather than the main
     * path. `startCheckout` sends a `success_url` per session and that wins —
     * but it can only send one if an origin resolves from the environment, and
     * a blank `NEXT_PUBLIC_SITE_URL` silently produced no origin at all until
     * 31 Aug. This is also the ONLY return path for a purchase made through the
     * product's own hosted payment link, which never touches our code.
     */
    warn(!!product.default_success_url,
      `it has a return URL to fall back on (${product.default_success_url ?? 'none'})`)
  }

  /**
   * The buy path, end to end, through our own code.
   *
   * `productForPlan` -> the provider -> a `checkout_url`. It is the half of §6.4
   * that does not need a public URL: everything up to the redirect can be proven
   * from a laptop, and what is left after this is the webhook coming back.
   */
  if (process.argv.includes('--checkout')) {
    console.log('\nthe buy path (--checkout)')
    if (live) {
      check(false, 'refused: --checkout opens a real session and this is a LIVE key')
    } else {
      for (const plan of paid) {
        // Same trap the Server Action fell into: `NEXT_PUBLIC_SITE_URL` is set
        // to an empty string here, and `??` does not fall back on `''`.
        const site = [process.env['NEXT_PUBLIC_SITE_URL'], process.env['NEXT_PUBLIC_APP_URL']]
          .map((value) => value?.trim())
          .find((value) => value && /^https?:\/\//i.test(value))
          ?? 'http://localhost:3000'
        const result = await createCheckout({
          userId: `preflight-${Date.now()}`,
          plan: plan.id as Exclude<typeof plan.id, 'free'>,
          successUrl: `${site.replace(/\/+$/, '')}/profile/subscription?bought=1`,
        })
        check(result.ok && !!result.url, `${plan.name}: createCheckout returns a URL${result.ok ? '' : ` — ${result.message}`}`)
        if (result.url) console.log(`        ${result.url}`)
      }
    }
  }

  console.log('\nthe free trial')
  console.log(
    '  ----  NOT VERIFIABLE FROM HERE. Creem sets the trial on the product, in\n'
    + '        the dashboard, at creation time; neither the CLI nor the products\n'
    + '        API exposes the field. Every paid surface in this app promises\n'
    + `        ${'a free trial'}, so this has to be confirmed by a human:\n`
    + '\n'
    + '          1. Dashboard -> Products -> each paid product -> Trial Period on,\n'
    + '             Days of Trial = TRIAL_DAYS from lib/site/plans.ts.\n'
    + '          2. Run one real checkout end to end and confirm the first webhook\n'
    + '             delivered is `subscription.trialing` and NOT `subscription.paid`.\n'
    + '             That distinction is the whole proof: a product with no trial\n'
    + '             charges the card immediately and skips `trialing` entirely.\n',
  )

  console.log(`\n${failures} failed, ${warnings} warning(s).`)
  if (failures > 0) {
    console.log('This deployment is NOT ready to take money.\n')
    process.exit(1)
  }
  if (!takingRealPayments()) {
    console.log(
      'Configuration is sound FOR A REHEARSAL. This deployment takes no real\n'
      + 'money — going live is the four-value block in PAYMENTS-NEW-INTEGRATION §6.5,\n'
      + 'and the trial still needs the two steps above.\n',
    )
    return
  }
  console.log('Static configuration is sound. The trial still needs the two steps above.\n')
}

void main()
