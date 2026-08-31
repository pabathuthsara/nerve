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
  if (!env['CREEM_API_KEY']?.trim()) return false
  return Object.values(PRODUCT_ENV).every((variable) => !!env[variable]?.trim())
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
