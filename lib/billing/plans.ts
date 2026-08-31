/**
 * Which purchased product grants which plan (§14).
 *
 * The mapping lives in the environment rather than in this file because the
 * provider mints a different product id in test than in live, and a hardcoded
 * id means the staging deploy silently grants nothing. It is configuration in
 * the sense that a Supabase URL is configuration — the *plans* are authored in
 * `lib/site/plans.ts` and reviewed in a pull request, per the content rule in
 * CLAUDE.md; only the vendor's opaque identifier for them is injected.
 *
 * **An unrecognised product grants nothing.** A typo in an environment variable
 * has to fail closed: the alternative is defaulting to a paid plan, which turns
 * one bad character into free Elite for anyone who finds the checkout link.
 * The webhook records the subscription either way, so the money is never lost —
 * it just does not move a plan until somebody fixes the variable.
 */

import type { Plan } from '@/lib/data/types'

/** Env var per paid plan. Free is never purchased, so it has none. */
const PRODUCT_ENV: Readonly<Record<Exclude<Plan, 'free'>, string>> = {
  pro: 'CREEM_PRODUCT_PRO',
  elite: 'CREEM_PRODUCT_ELITE',
}

export type ProductMap = Readonly<Record<string, Plan>>

/**
 * Builds the product-id → plan map from an environment.
 *
 * Takes the environment as an argument so the mapping is testable without
 * mutating `process.env` under a parallel test runner.
 */
export function productMap(env: Record<string, string | undefined>): ProductMap {
  const map: Record<string, Plan> = {}
  for (const [plan, variable] of Object.entries(PRODUCT_ENV)) {
    const id = env[variable]?.trim()
    if (id) map[id] = plan as Plan
  }
  return map
}

/** The plan a product grants, or null when the id is not one of ours. */
export function planForProduct(productId: string | null, map: ProductMap): Plan | null {
  if (!productId) return null
  return map[productId] ?? null
}

/** Reads the map from `process.env`. */
export function configuredProductMap(): ProductMap {
  return productMap(process.env as Record<string, string | undefined>)
}

/**
 * Can a checkout actually be opened right now?
 *
 * Distinct from `PublicPlan.open`, and the distinction matters. `open` is a
 * product decision authored in `lib/site/plans.ts` and reviewed in a pull
 * request: this plan is for sale. This is an operational fact about the
 * deployment: the merchant-of-record account is wired up and a product id
 * exists for every paid plan.
 *
 * They come apart in exactly the situation this codebase is in — the plans are
 * priced, decided and shipped, and the account is still going through approval
 * (`docs/PAYMENTS-APPROVAL.md`). Without this the buy button would open a
 * checkout that fails with a message naming an environment variable, which is
 * the worst of the three possible outcomes: worse than a button that admits it
 * is not ready, and much worse than a working one.
 *
 * Every paid plan is required rather than any, on purpose. A deployment with
 * Pro configured and Elite missing would sell one plan and error on the other
 * from a screen showing both, and a half-configured checkout is a support
 * ticket disguised as a feature.
 */
export function checkoutConfigured(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const key = env['CREEM_API_KEY']?.trim()
  if (!key) return false

  /**
   * A TEST KEY IN PRODUCTION SELLS NOTHING AND GRANTS EVERYTHING.
   *
   * `test-api.creem.io` accepts any card number and moves no money, but it
   * emits the same webhooks the live host does — so a checkout on a test key
   * "succeeds", `subscription.paid` arrives correctly signed, and
   * `applyBillingEvent` grants a real Pro plan against a payment that never
   * happened. That is free Elite for anybody who finds the button, with no
   * transaction anywhere to reconcile it against.
   *
   * It is a plausible mistake rather than a paranoid one: the test key is the
   * one that exists first, the four variables are copied as a block, and
   * nothing else in the system would notice. So production refuses to sell on
   * a test key at all, and the subscription screen falls back to the
   * notify-me list exactly as it does when nothing is configured.
   *
   * The prefix is the only signal, and deliberately so — `apiBase()` picks the
   * host from the same prefix, so a second variable saying which environment
   * we are in could disagree with the key and point a live key at the sandbox.
   */
  if (isProductionRuntime(env) && !key.startsWith('creem_live_') && !rehearsing(env)) return false

  return Object.values(PRODUCT_ENV).every((variable) => !!env[variable]?.trim())
}

/**
 * Why this deployment must not act on billing events, or null if it may.
 *
 * `checkoutConfigured` stops production SELLING on a test key. This is the
 * other door into the same room, and it is the one that is easy to miss: the
 * webhook does not care which key is configured, only that the signature checks
 * out — so a TEST-mode webhook pointed at production, with the test signing
 * secret in production's environment, would hand out real paid plans for
 * payments made with a fake card. Test mode has its own hosted payment links
 * that anybody can open.
 *
 * Production therefore refuses to apply any event unless a live key is
 * configured. The key is not used to verify the event; it is used as the
 * statement of which environment this deployment belongs to, which is the same
 * role it plays in `apiBase()`.
 */
export function billingEnvironmentRefusal(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | null {
  if (!isProductionRuntime(env)) return null
  if (rehearsing(env)) return null
  const key = env['CREEM_API_KEY']?.trim()
  if (!key) return 'production has no CREEM_API_KEY, so nothing here can be trusted as a live purchase'
  if (!key.startsWith('creem_live_')) return 'production is configured with a non-live CREEM_API_KEY'
  return null
}

/**
 * The deliberate exception: a full-dress rehearsal on the production domain.
 *
 * Both guards above exist because a test key in production grants real plans
 * for payments that never happened. That is still true — this does not make it
 * safe, it makes it *chosen*. It exists because the alternative is worse: the
 * only honest way to prove a payment flow is to run it where it will actually
 * run, and a tunnel to a laptop does not exercise the real domain, the real
 * redirect, the real cookie, or the real webhook route.
 *
 * Three things make it a rehearsal rather than a hole:
 *
 *   - It is one variable, named for exactly what it does, and its absence is
 *     the safe default. Nobody reaches this state by copying a key.
 *   - `/profile/subscription` says so on the page, in the user's own words. A
 *     visitor who finds the site must never believe they have bought something.
 *   - `npm run creem:verify` refuses to call the deployment ready while it is
 *     set, whatever else passes.
 *
 * **Unset it in the same edit that installs a live key.** The go-live block in
 * `docs/PAYMENTS-NEW-INTEGRATION.md` §6.5 does both together for that reason.
 */
export function rehearsing(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const flag = env['CREEM_TEST_MODE_IN_PRODUCTION']?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'on'
}

/**
 * Is money on this deployment real?
 *
 * What the UI asks, so it can say so. False means either a non-production
 * runtime or a sanctioned rehearsal — in both cases a purchase is theatre and
 * the screen has to admit it.
 */
export function takingRealPayments(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return env['CREEM_API_KEY']?.trim().startsWith('creem_live_') === true
}

/**
 * Is this the deployment that takes real money?
 *
 * `VERCEL_ENV` is the honest answer where it exists — a preview deployment is
 * `NODE_ENV=production` too, and a preview is exactly where a test key belongs.
 */
function isProductionRuntime(env: Record<string, string | undefined>): boolean {
  const vercel = env['VERCEL_ENV']?.trim()
  if (vercel) return vercel === 'production'
  return env['NODE_ENV']?.trim() === 'production'
}

/**
 * The product id to send a buyer of `plan` to.
 *
 * Throws rather than returning null: this runs when somebody has clicked buy,
 * and a checkout that silently does nothing is worse than an error that says
 * which variable is missing.
 */
export function productForPlan(
  plan: Exclude<Plan, 'free'>,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const variable = PRODUCT_ENV[plan]
  const id = env[variable]?.trim()
  if (!id) {
    throw new Error(`${variable} is not set, so there is no product to sell for the ${plan} plan.`)
  }
  return id
}
