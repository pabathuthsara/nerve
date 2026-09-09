import 'server-only'

/**
 * The interview credit balance, and the hold a running interview puts on it.
 *
 * ── WHY THIS IS NOT `consumeRep` ─────────────────────────────────────────
 *
 * `consumeRep` spends a DAILY RATE the instant the transport connects. At three
 * minutes that is the right trade: the rep is nearly free, the quota resets
 * tonight, and the refund path only has to catch the rep that heard nothing.
 *
 * A twenty-minute interview costs $0.45–0.60 and is sold as two credits — $6
 * at the entry pack, $4.50 at the top (§6.1, §5.4) — and
 * a rep that dies at minute fourteen has heard the user, keeps the money and
 * returns nothing. So the credit is **reserved at connect and settled at the
 * scorecard** — rule 18's doctrine applied to a credit, and the same shape
 * `reserveVoiceOperation`/`settleVoiceOperation` already use for money.
 *
 * **`consumeRep` and `mayOpenSession` are not touched and are never reached by
 * this path** (rule 19, `INTERVIEW-PLAN.md` A1). A dating rep runs exactly the
 * code it ran yesterday; an interview rep runs this instead.
 *
 * ── THE INVARIANT THAT MAKES THE BALANCE A SUM ───────────────────────────
 *
 * Every row carries the expiry of the LOT it belongs to, spends included, so
 * `sum(amount) where not expired` is right at every instant — a grant and
 * everything charged against it fall out together. `settleInterviewCredit`
 * resolves that expiry off the ledger at settle time rather than storing it on
 * the hold, which also means a spend is always attributed to the soonest-
 * expiring lot of its source: the same "expiring first" rule §5.5 states, applied
 * one level down.
 *
 * Nothing here throws. A failed credit write must never end a live rep.
 */

import { supabaseAdmin } from './admin'
import {
  creditBalance,
  creditCost,
  planSpend,
  roundType,
  type CreditBalance,
  type CreditDraw,
  type CreditLot,
  type CreditSource,
  type RoundTypeId,
} from '@/lib/data/interview-credits'

/**
 * How long a hold stands before the balance stops counting it.
 *
 * Longer than the longest round plus its grading, and short enough that a
 * browser that vanished mid-rep gives the credit back the same evening rather
 * than on a support ticket. Twenty-five minutes of interview, a grading pass,
 * and room for a reconnect.
 */
export const HOLD_TTL_MS = 45 * 60 * 1000

export interface CreditState extends CreditBalance {
  lots: CreditLot[]
}

interface BalanceRow {
  source: string
  remaining: number
  held: number
}

/**
 * What this account may spend, and on what.
 *
 * One RPC, for the same reason `spend_allowance` is one: this sits in front of
 * a microphone and three sequential reads would be three hops the user waits
 * through.
 */
export async function interviewCreditState(userId: string): Promise<CreditState> {
  const empty: CreditState = {
    lots: [],
    bySource: { grant: 0, purchase: 0, screener: 0 },
    total: 0,
    held: 0,
    available: 0,
  }
  try {
    const { data, error } = await supabaseAdmin().rpc('interview_credit_balance', { p_user_id: userId })
    if (error || !data) return empty
    const rows = (Array.isArray(data) ? data : [data]) as BalanceRow[]

    // The RPC has already applied the expiry filter, so what comes back is one
    // live lot per source. `creditBalance` still runs over it, because the
    // arithmetic that decides "available" belongs to the pure module and this
    // one is not allowed a second opinion about it.
    const lots: CreditLot[] = rows
      .filter((row): row is BalanceRow & { source: CreditSource } => isSource(row.source))
      .map((row) => ({ source: row.source, remaining: row.remaining, expiresAt: null }))
    const holds = rows.reduce((sum, row) => sum + (row.held ?? 0), 0)
    return { ...creditBalance({ lots, holds }), lots }
  } catch {
    return empty
  }
}

function isSource(value: string): value is CreditSource {
  return value === 'grant' || value === 'purchase' || value === 'screener'
}

export type HoldResult =
  | { ok: true; source: CreditSource; alreadyHeld: boolean }
  | { ok: false; message: string; reason: 'balance' | 'error' }

/**
 * Promise this round's credits to a rep that is connecting.
 *
 * **Idempotent on the session id**, which is the whole reason the hold is a
 * table keyed on it: a reload, a reconnect and a double-fired effect all reach
 * this, and two connects for one rep must never spend twice.
 *
 * **It is the round's cost, not one** (LAUNCH-GAP B3). A deep technical is three
 * credits and can be covered by an expiring grant plus two purchased ones, so
 * the hold carries an amount and `planSpend` decides whether the lots can cover
 * it at all. All or nothing: a partial hold would take somebody's credits and
 * give them no interview.
 *
 * The hold's `source` is the FIRST source the plan draws from, which is what the
 * balance groups its held column by. The definitive per-source split is computed
 * again at settle time from the ledger as it then stands — see
 * `settleInterviewCredit`, and the module note on why every row carries its own
 * lot's expiry.
 */
export async function holdInterviewCredit(input: {
  userId: string
  sessionId: string
  round: RoundTypeId
}): Promise<HoldResult> {
  const admin = supabaseAdmin()
  const cost = creditCost(input.round)
  try {
    const { data: existing } = await admin
      .from('interview_credit_holds')
      .select('source, state')
      .eq('session_id', input.sessionId)
      .eq('user_id', input.userId)
      .maybeSingle()

    if (existing && isSource(existing.source)) {
      // Settled or released is still "this rep has already been paid for". A
      // reconnect after the scorecard must not take a second credit.
      return { ok: true, source: existing.source, alreadyHeld: true }
    }

    const state = await interviewCreditState(input.userId)
    if (state.available < cost) {
      return { ok: false, reason: 'balance', message: shortfall(input.round) }
    }
    const draws = planSpend(state.lots, { round: input.round, cost })
    if (!draws) {
      return { ok: false, reason: 'balance', message: shortfall(input.round) }
    }
    // The free round draws no lot at all, so there is nothing to attribute the
    // hold to and nothing to spend. It is still recorded, because the hold is
    // also what stops one screener credit opening two five-minute rounds.
    const source: CreditSource = draws[0]?.source ?? 'screener'

    const { error } = await admin.from('interview_credit_holds').insert({
      session_id: input.sessionId,
      user_id: input.userId,
      source,
      round: input.round,
      amount: Math.max(1, cost),
      expires_at: new Date(Date.now() + HOLD_TTL_MS).toISOString(),
    })
    // A unique violation is another connect winning the race, which is the
    // idempotent case rather than a failure.
    if (error) {
      if (error.code === '23505') return { ok: true, source, alreadyHeld: true }
      return { ok: false, reason: 'error', message: 'We could not start this interview.' }
    }
    return { ok: true, source, alreadyHeld: false }
  } catch {
    return { ok: false, reason: 'error', message: 'We could not start this interview.' }
  }
}

/**
 * Why the balance cannot open this round, in a sentence somebody can act on.
 *
 * Since B3 "you have no credits" is often false and always unhelpful: an
 * account with two credits looking at a deep technical has plenty and still
 * cannot start it. The number is what the user needs.
 */
function shortfall(round: RoundTypeId): string {
  const spec = roundType(round)
  if (spec.credits === 0) return 'Your free screener has already been used.'
  return spec.credits === 1
    ? 'You have no interview credits left.'
    : `A ${spec.label.toLowerCase()} costs ${spec.credits} credits, and there are not that many in the account.`
}

export interface CreditWriteResult {
  ok: boolean
  /** True when this call is what actually changed the balance. */
  changed: boolean
}

/**
 * The scorecard exists. The credit is spent.
 *
 * Idempotent twice over: the hold moves `held → settled` only from `held`, and
 * the ledger row carries `spend:<sessionId>` as its reference, which the unique
 * index refuses a second time.
 */
export async function settleInterviewCredit(input: {
  userId: string
  sessionId: string
}): Promise<CreditWriteResult> {
  const admin = supabaseAdmin()
  try {
    const { data: hold } = await admin
      .from('interview_credit_holds')
      .select('source, state, round, amount')
      .eq('session_id', input.sessionId)
      .eq('user_id', input.userId)
      .maybeSingle()

    if (!hold || !isSource(hold.source)) return { ok: true, changed: false }
    if (hold.state !== 'held') return { ok: true, changed: false }

    const owed = Math.max(0, hold.amount ?? 1)
    /**
     * A free round settles nothing but the hold (B3).
     *
     * The screener costs no credit, so there is no ledger row to write — and a
     * `-0` spend would put a transaction that did not happen in a user's own
     * ledger, which is the same objection `releaseInterviewCredit` makes.
     */
    if (owed === 0) {
      await closeHold(input.sessionId)
      return { ok: true, changed: false }
    }

    /**
     * The split, decided against the ledger as it stands NOW.
     *
     * Not against the hold: a multi-credit round can draw from two lots, and
     * between the connect and the scorecard a grant may have expired or a pack
     * may have landed. Recomputing keeps the module's invariant — every row
     * carries the expiry of the lot it belongs to — true at settle time rather
     * than at connect time.
     *
     * The fallback is the hold's own source for the whole amount. It is reached
     * when the lots no longer cover the round (an expiry mid-rep), and taking
     * the credit anyway is right: the interview ran.
     */
    const state = await interviewCreditState(input.userId)
    const draws: CreditDraw[] = planSpend(state.lots, { round: readRound(hold.round), cost: owed })
      ?? [{ source: hold.source, amount: owed }]

    let wrote = false
    let failed = false
    for (const draw of draws) {
      const { error } = await admin.from('interview_credit_entries').insert({
        user_id: input.userId,
        kind: 'spend',
        source: draw.source,
        amount: -draw.amount,
        expires_at: await lotExpiryFor(input.userId, draw.source),
        session_id: input.sessionId,
        // One reference per source, so a two-lot spend is two rows and a replay
        // still collides on the unique index for both of them.
        reference: `spend:${input.sessionId}:${draw.source}`,
      })
      if (error) {
        if (error.code !== '23505') failed = true
      } else {
        wrote = true
      }
    }
    if (failed) return { ok: false, changed: wrote }

    await closeHold(input.sessionId)
    return { ok: true, changed: wrote }
  } catch {
    return { ok: false, changed: false }
  }
}

/** The hold is paid for, whatever the ledger did. */
async function closeHold(sessionId: string): Promise<void> {
  await supabaseAdmin()
    .from('interview_credit_holds')
    .update({ state: 'settled', settled_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('state', 'held')
}

/** The round a hold was taken for. Anything unrecognised resolves to the default. */
function readRound(value: unknown): RoundTypeId {
  return roundType(typeof value === 'string' ? value : null).id
}

/**
 * The rep produced no scorecard. The credit was never spent.
 *
 * Releasing a hold rather than writing a refund, because nothing was taken: a
 * refund row for a credit that never left the balance would show up in a user's
 * own ledger as a transaction that did not happen.
 */
export async function releaseInterviewCredit(input: {
  userId: string
  sessionId: string
}): Promise<CreditWriteResult> {
  try {
    const { data } = await supabaseAdmin()
      .from('interview_credit_holds')
      .update({ state: 'released', settled_at: new Date().toISOString() })
      .eq('session_id', input.sessionId)
      .eq('user_id', input.userId)
      .eq('state', 'held')
      .select('session_id')
    return { ok: true, changed: (data?.length ?? 0) > 0 }
  } catch {
    return { ok: false, changed: false }
  }
}

/**
 * The credits already spent on a rep, given back.
 *
 * The A2 case: an interview that ended for a reason other than the clock or the
 * user. The reference makes a double refund impossible, and the expiry is the
 * one the spend carried — a refunded grant does not come back to life past its
 * period boundary, which is the only reading of §5.5 that is not a loophole.
 *
 * **Every spend row, not one** (LAUNCH-GAP B3). A three-credit round can settle
 * as two rows against two sources, and this read was `.maybeSingle()` — which
 * errors outright on two rows and would otherwise have refunded one credit of
 * three. Each spend is mirrored by a refund of the same size against the same
 * source, so the balance ends exactly where it started.
 */
export async function refundInterviewCredit(input: {
  userId: string
  sessionId: string
  reason: string
}): Promise<CreditWriteResult> {
  const admin = supabaseAdmin()
  try {
    const { data: spends } = await admin
      .from('interview_credit_entries')
      .select('source, amount, expires_at')
      .eq('user_id', input.userId)
      .eq('session_id', input.sessionId)
      .eq('kind', 'spend')

    const rows = (spends ?? []).filter((row) => isSource(row.source) && row.amount < 0)

    // Never spent: the hold is what has to go, and releasing it is the whole
    // refund. Callers reach here on both shapes and should not have to know.
    if (rows.length === 0) {
      return releaseInterviewCredit({ userId: input.userId, sessionId: input.sessionId })
    }

    let wrote = false
    let failed = false
    for (const row of rows) {
      const { error } = await admin.from('interview_credit_entries').insert({
        user_id: input.userId,
        kind: 'refund',
        source: row.source,
        amount: Math.abs(row.amount),
        expires_at: row.expires_at,
        session_id: input.sessionId,
        // One per source, mirroring the spend, so a replay collides on both.
        reference: `refund:${input.sessionId}:${row.source}`,
        metadata: { reason: input.reason },
      })
      if (error) {
        if (error.code !== '23505') failed = true
      } else {
        wrote = true
      }
    }
    if (failed) return { ok: false, changed: wrote }
    return { ok: true, changed: wrote }
  } catch {
    return { ok: false, changed: false }
  }
}

/**
 * The soonest expiry among this source's live issuances.
 *
 * Null for a purchase, which never expires, and for a source with nothing left
 * — in which case the spend is going negative anyway and an expiry on it would
 * only hide that from the balance.
 */
async function lotExpiryFor(userId: string, source: CreditSource): Promise<string | null> {
  if (source === 'purchase') return null
  const { data } = await supabaseAdmin()
    .from('interview_credit_entries')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('source', source)
    .gt('amount', 0)
    .not('expires_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.expires_at ?? null
}

/**
 * Issue credits. Service role, no user write path (rule 11).
 *
 * `reference` is the idempotency key and is not optional in practice: a Whop
 * webhook replays, and a grant processed twice is a month of free interviews.
 */
export async function issueInterviewCredits(input: {
  userId: string
  kind: 'grant' | 'purchase' | 'screener'
  amount: number
  reference: string
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}): Promise<CreditWriteResult> {
  if (input.amount <= 0) return { ok: true, changed: false }
  try {
    const { error } = await supabaseAdmin().from('interview_credit_entries').insert({
      user_id: input.userId,
      kind: input.kind,
      source: input.kind,
      amount: Math.round(input.amount),
      // A purchase never expires (§5.5), and the column has a CHECK saying so.
      expires_at: input.kind === 'purchase' ? null : input.expiresAt ?? null,
      reference: input.reference,
      metadata: (input.metadata ?? {}) as never,
    })
    if (error) return { ok: error.code === '23505', changed: false }
    return { ok: true, changed: true }
  } catch {
    return { ok: false, changed: false }
  }
}

/**
 * Take credits back off a balance, without ever taking it below nothing.
 *
 * Two callers, one shape (`lib/billing/credit-rules.ts`):
 *
 *   `revoke`  a pack was refunded or charged back. Money came back, so the
 *             interviews do.
 *   `expiry`  a subscription lapsed, so the credits that month was handing out
 *             stop being handed out.
 *
 * **Clamped to what is left, and that is the whole point.** Somebody who bought
 * five, used three and then disputed the charge has two left; writing -5 would
 * put the source at minus two, and the next pack they buy would silently pay
 * off a debt instead of buying interviews. The three they used are gone — we ate
 * that, which is what a chargeback is.
 *
 * ── ONE ROW PER LOT, AND WHY IT CANNOT BE ONE ROW ────────────────────────
 *
 * Every row in this ledger carries the expiry of the LOT it belongs to, which
 * is what makes the balance a single filtered sum: a grant and everything
 * charged against it fall out together. A void has to obey the same rule, and a
 * single row cannot when there are two live lots.
 *
 * Say a Pro grant expires on 1 October and an upgrade to Elite adds one
 * expiring 1 November, and then the subscription lapses. One void row of -2
 * carrying the October expiry balances to zero today — and on 2 October the
 * October grant AND the void both fall out, leaving the November grant alone
 * and the balance back at 1. **The voided credits come back to life.** Carrying
 * the November expiry instead is worse: the balance goes to -1 on 2 October and
 * eats the first credit of whatever they buy next.
 *
 * So this reads the live lots by expiry, and writes one negative row against
 * each. Every pair then falls out together, which is the invariant the whole
 * table is built on rather than a special case for this function.
 */
export async function voidInterviewCredits(input: {
  userId: string
  source: CreditSource
  kind: 'expiry' | 'revoke'
  /** The most that may be taken back, across all lots. Clamped to what is live. */
  upTo: number
  reference: string
  reason: string
}): Promise<CreditWriteResult & { credits: number }> {
  try {
    const lots = await liveLots(input.userId, input.source)
    let budget = Math.max(0, Math.round(input.upTo))
    let taken = 0
    let failed = false

    for (const [index, lot] of lots.entries()) {
      if (budget <= 0) break
      const amount = Math.min(budget, lot.remaining)
      if (amount <= 0) continue

      const { error } = await supabaseAdmin().from('interview_credit_entries').insert({
        user_id: input.userId,
        kind: input.kind,
        source: input.source,
        amount: -amount,
        // The lot's own expiry, so this row and the issuance it reverses leave
        // the filtered sum at the same instant.
        expires_at: lot.expiresAt,
        // Unique per lot, so a replay collides on every one of them rather than
        // on the first and then doubling the rest.
        reference: lots.length > 1 ? `${input.reference}:${index}` : input.reference,
        metadata: { reason: input.reason },
      })
      // A duplicate is a webhook replay reaching the same conclusion twice.
      if (error) {
        if (error.code !== '23505') failed = true
        continue
      }
      taken += amount
      budget -= amount
    }

    if (failed && taken === 0) return { ok: false, changed: false, credits: 0 }
    return { ok: !failed, changed: taken > 0, credits: taken }
  } catch {
    return { ok: false, changed: false, credits: 0 }
  }
}

/**
 * The live lots for one source, netted, soonest expiry first.
 *
 * Computed here rather than by `interview_credit_balance`, which groups by
 * source alone — the right shape for "may this rep start" and the wrong one for
 * a void, which has to name a lot. Spends and earlier voids are in the sum
 * because they carry their lot's expiry too, so a lot that has been fully spent
 * nets to zero and is skipped.
 */
async function liveLots(
  userId: string,
  source: CreditSource,
): Promise<{ expiresAt: string | null; remaining: number }[]> {
  const { data } = await supabaseAdmin()
    .from('interview_credit_entries')
    .select('amount, expires_at')
    .eq('user_id', userId)
    .eq('source', source)

  const now = Date.now()
  const byExpiry = new Map<string, number>()
  for (const row of data ?? []) {
    const key = row.expires_at ?? ''
    if (key) {
      const at = Date.parse(key)
      if (Number.isFinite(at) && at <= now) continue
    }
    byExpiry.set(key, (byExpiry.get(key) ?? 0) + row.amount)
  }

  return [...byExpiry.entries()]
    .map(([key, remaining]) => ({ expiresAt: key || null, remaining }))
    .filter((lot) => lot.remaining > 0)
    // Soonest first, for the same reason a spend takes the expiring credit
    // first: what is about to evaporate anyway is what should go.
    .sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Number.POSITIVE_INFINITY)
      - (b.expiresAt ? Date.parse(b.expiresAt) : Number.POSITIVE_INFINITY))
}
