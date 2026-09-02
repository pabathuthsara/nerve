/**
 * Which purchased plan at the merchant of record grants which plan here (§14).
 *
 * The mapping lives in the environment rather than in this file because the
 * provider mints a different id in the sandbox than in live, and a hardcoded id
 * means the staging deploy silently grants nothing. It is configuration in the
 * sense that a Supabase URL is configuration — the *plans* are authored in
 * `lib/site/plans.ts` and reviewed in a pull request, per the content rule in
 * CLAUDE.md; only the vendor's opaque identifier for them is injected.
 *
 * Whop nests its objects one level deeper than Creem did: an account owns a
 * PRODUCT, a product owns PLANS, and a membership names the `plan_` it was
 * bought on. So the discriminator moved down a level — one product, "Nerve",
 * with a Pro plan and an Elite plan under it (`docs/PAYMENTS-WHOP.md` D1) — but
 * the doctrine did not move at all.
 *
 * **An unrecognised plan grants nothing.** A typo in an environment variable has
 * to fail closed: the alternative is defaulting to a paid plan, which turns one
 * bad character into free Elite for anyone who finds the checkout link. The
 * webhook records the subscription either way, so the money is never lost — it
 * just does not move a plan until somebody fixes the variable.
 */

import type { Plan } from '@/lib/data/types'

/** Env var per paid plan. Free is never purchased, so it has none. */
const PLAN_ENV: Readonly<Record<Exclude<Plan, 'free'>, string>> = {
  pro: 'WHOP_PLAN_PRO',
  elite: 'WHOP_PLAN_ELITE',
}

/** Whop's live API. The default, and the only host that counts as real money. */
export const LIVE_API_BASE = 'https://api.whop.com/api/v1'
/** The sandbox is a separate account on a separate host with its own keys. */
export const SANDBOX_API_BASE = 'https://sandbox-api.whop.com/api/v1'

export type PlanMap = Readonly<Record<string, Plan>>

/**
 * Builds the vendor-plan-id → plan map from an environment.
 *
 * Takes the environment as an argument so the mapping is testable without
 * mutating `process.env` under a parallel test runner.
 */
export function planMap(env: Record<string, string | undefined>): PlanMap {
  const map: Record<string, Plan> = {}
  for (const [plan, variable] of Object.entries(PLAN_ENV)) {
    const id = env[variable]?.trim()
    if (id) map[id] = plan as Plan
  }
  return map
}

/** The plan a `plan_…` grants, or null when the id is not one of ours. */
export function planForWhopPlan(whopPlanId: string | null, map: PlanMap): Plan | null {
  if (!whopPlanId) return null
  return map[whopPlanId] ?? null
}

/** Reads the map from `process.env`. */
export function configuredPlanMap(): PlanMap {
  return planMap(process.env as Record<string, string | undefined>)
}

/**
 * Which Whop the deployment is talking to.
 *
 * Creem's key prefix picked the host, deliberately, so that two variables could
 * not disagree and point a live key at the sandbox. Whop's keys carry no such
 * prefix — its sandbox is a different host entirely — so the host itself takes
 * over that job. It is still ONE variable, and "is this real money?" is derived
 * from it rather than asserted alongside it. There is nothing left for a second
 * variable to disagree with.
 */
export function apiBase(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const configured = env['WHOP_API_BASE']?.trim().replace(/\/+$/, '')
  return configured || LIVE_API_BASE
}

/**
 * Is the configured host the live one?
 *
 * Matched on the host rather than on the whole string so a trailing slash, a
 * missing `/api/v1`, or a future path change cannot quietly turn a live
 * deployment into one this file believes is a sandbox.
 */
export function isLiveBase(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  try {
    return new URL(apiBase(env)).host === 'api.whop.com'
  } catch {
    // An unparseable base is not the live host, and guessing otherwise is the
    // one direction of this check that can hand out real plans.
    return false
  }
}

/** The dated version pin sent on every request, or Whop's own default. */
export function apiVersionDate(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | null {
  return env['WHOP_API_VERSION_DATE']?.trim() || null
}

/**
 * Can a checkout actually be opened right now?
 *
 * Distinct from `PublicPlan.open`, and the distinction matters. `open` is a
 * product decision authored in `lib/site/plans.ts` and reviewed in a pull
 * request: this plan is for sale. This is an operational fact about the
 * deployment: the merchant-of-record account is wired up and a vendor plan id
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
  const key = env['WHOP_API_KEY']?.trim()
  if (!key) return false

  // Every event is checked against this before it is applied, so a deployment
  // that cannot recognise its own account has no business selling either.
  if (!env['WHOP_ACCOUNT_ID']?.trim()) return false

  /**
   * A SANDBOX BASE IN PRODUCTION SELLS NOTHING AND GRANTS EVERYTHING.
   *
   * `sandbox-api.whop.com` accepts any card number and moves no money, but it
   * emits the same webhooks the live host does — so a checkout against the
   * sandbox "succeeds", `membership.activated` arrives correctly signed, and
   * `applyBillingEvent` grants a real Pro plan against a payment that never
   * happened. That is free Elite for anybody who finds the button, with no
   * transaction anywhere to reconcile it against.
   *
   * It is a plausible mistake rather than a paranoid one: the sandbox is the
   * environment that exists first, the variables are copied as a block, and
   * nothing else in the system would notice. So production refuses to sell
   * against the sandbox at all, and the subscription screen falls back to the
   * notify-me list exactly as it does when nothing is configured.
   *
   * The base URL is the only signal, and deliberately so — it is also what
   * `apiBase()` dials, so there is no second variable that could claim a
   * different environment from the one being called.
   */
  if (isProductionRuntime(env) && !isLiveBase(env) && !rehearsing(env)) return false

  return Object.values(PLAN_ENV).every((variable) => !!env[variable]?.trim())
}

/**
 * Why this deployment must not act on billing events, or null if it may.
 *
 * `checkoutConfigured` stops production SELLING against the sandbox. This is
 * the other door into the same room, and it is the one that is easy to miss:
 * the webhook does not care which host is configured, only that the signature
 * checks out — so a sandbox webhook pointed at production, with the sandbox
 * signing secret in production's environment, would hand out real paid plans
 * for payments made with a fake card. The sandbox has its own hosted checkout
 * that anybody can open.
 *
 * Production therefore refuses to apply any event unless the live base is
 * configured. The base is not used to verify the event; it is used as the
 * statement of which environment this deployment belongs to, which is the same
 * role it plays in `apiBase()`.
 */
export function billingEnvironmentRefusal(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | null {
  if (!isProductionRuntime(env)) return null
  if (rehearsing(env)) return null
  if (!env['WHOP_API_KEY']?.trim()) {
    return 'production has no WHOP_API_KEY, so nothing here can be trusted as a live purchase'
  }
  if (!isLiveBase(env)) {
    return `production is pointed at ${apiBase(env)}, which is not the live Whop API`
  }
  return null
}

/**
 * The deliberate exception: a full-dress rehearsal on the production domain.
 *
 * Both guards above exist because a sandbox base in production grants real
 * plans for payments that never happened. That is still true — this does not
 * make it safe, it makes it *chosen*. It exists because the alternative is
 * worse: the only honest way to prove a payment flow is to run it where it will
 * actually run, and a tunnel to a laptop does not exercise the real domain, the
 * real redirect, the real cookie, or the real webhook route.
 *
 * Three things make it a rehearsal rather than a hole:
 *
 *   - It is one variable, named for exactly what it does, and its absence is
 *     the safe default. Nobody reaches this state by copying a key.
 *   - `/profile/subscription` says so on the page, in the user's own words. A
 *     visitor who finds the site must never believe they have bought something.
 *   - `npm run whop:verify` refuses to call the deployment ready while it is
 *     set, whatever else passes.
 *
 * **Unset it in the same edit that points the base at the live host.** The
 * go-live block in `docs/PAYMENTS-WHOP.md` §7.C does both together for that
 * reason.
 */
export function rehearsing(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const flag = env['WHOP_TEST_MODE_IN_PRODUCTION']?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'on'
}

/**
 * Is money on this deployment real?
 *
 * What the UI asks, so it can say so. False means either a sandbox base or a
 * sanctioned rehearsal — in both cases a purchase is theatre and the screen has
 * to admit it.
 */
export function takingRealPayments(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  if (!env['WHOP_API_KEY']?.trim()) return false
  return isLiveBase(env)
}

/**
 * Is this the deployment that takes real money?
 *
 * `VERCEL_ENV` is the honest answer where it exists — a preview deployment is
 * `NODE_ENV=production` too, and a preview is exactly where the sandbox belongs.
 */
function isProductionRuntime(env: Record<string, string | undefined>): boolean {
  const vercel = env['VERCEL_ENV']?.trim()
  if (vercel) return vercel === 'production'
  return env['NODE_ENV']?.trim() === 'production'
}

/**
 * The vendor plan id to send a buyer of `plan` to.
 *
 * Throws rather than returning null: this runs when somebody has clicked buy,
 * and a checkout that silently does nothing is worse than an error that says
 * which variable is missing.
 */
export function whopPlanIdFor(
  plan: Exclude<Plan, 'free'>,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const variable = PLAN_ENV[plan]
  const id = env[variable]?.trim()
  if (!id) {
    throw new Error(`${variable} is not set, so there is no plan to sell for the ${plan} plan.`)
  }
  return id
}
