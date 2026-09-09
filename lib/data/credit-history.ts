/**
 * Where interview credits came from and where they went.
 *
 * ── WHY A LEDGER NEEDS A HISTORY SCREEN ──────────────────────────────────
 *
 * `interview_credit_entries` is append-only and already holds every movement —
 * every grant, every pack, every spend, every expiry — and nothing in the
 * product ever showed one of them. A balance with no history is the single most
 * common support ticket in a credit product: "I bought five and I have three",
 * asked by somebody who ran two interviews and cannot see that they did. The
 * rows exist; this file is what turns one into a sentence.
 *
 * Pure, and tested, for the reason every other reading in `lib/data/` is: the
 * wording of a money line is a product decision and belongs somewhere a test
 * can hold it still, not inside a component's JSX.
 *
 * **It reads the ledger and never sums it.** `interviewCredits` on `UserState`
 * comes from the `interview_credit_balance` RPC, which applies both expiry
 * rules and subtracts live holds; adding the rows on this list would produce a
 * second, subtly different number on the same card. This is a list of events,
 * and the balance above it stays the only balance.
 */

import type { CreditSource } from './interview-credits'

/**
 * What a row records.
 *
 * The three issuing kinds are also the three `CreditSource` values, because a
 * lot's source IS how it was issued (`issueInterviewCredits` writes `source:
 * input.kind`). The other four are movements against a lot and carry the
 * source of whichever lot they moved.
 */
export type CreditEntryKind =
  | 'grant'
  | 'purchase'
  | 'screener'
  | 'spend'
  | 'refund'
  | 'expiry'
  | 'revoke'

export interface CreditEntry {
  id: string
  kind: CreditEntryKind
  source: CreditSource
  /** Signed, in credits. Negative on a spend, an expiry and a revoke. */
  amount: number
  /** When the row was written. ISO. */
  at: string
}

const KINDS: readonly CreditEntryKind[] = [
  'grant', 'purchase', 'screener', 'spend', 'refund', 'expiry', 'revoke',
]

export function isCreditEntryKind(value: unknown): value is CreditEntryKind {
  return typeof value === 'string' && KINDS.includes(value as CreditEntryKind)
}

/**
 * The line a row is written as.
 *
 * Hand-authored per kind rather than assembled from the column names, which is
 * the same rule the rest of the product's copy follows (§02). "Spent" is not
 * what a customer wants to read about their own money; "Interview" is what
 * happened.
 *
 * `revoke` is the delicate one. It fires on a refund or a chargeback, and the
 * honest sentence names the reason without arguing about it — somebody reading
 * this row has already had their money back.
 */
export function creditEntryLine(entry: Pick<CreditEntry, 'kind' | 'source'>): string {
  switch (entry.kind) {
    case 'grant': return 'Included with your plan'
    case 'purchase': return 'Credit pack'
    case 'screener': return 'Free screener'
    case 'spend': return 'Interview'
    case 'refund': return 'Given back'
    case 'expiry': return 'Expired with the plan'
    case 'revoke': return 'Returned with the refund'
  }
}

/**
 * The number, signed, for the data column.
 *
 * A true minus sign (U+2212) rather than a hyphen: these sit in a
 * `tabular-nums` column beside plus signs, and a hyphen is half the width and
 * sits at the wrong height. Zero cannot occur — every writer in
 * `lib/db/credits.ts` refuses a zero amount — and is drawn without a sign if a
 * future one ever does.
 */
export function creditAmountLabel(amount: number): string {
  if (amount > 0) return `+${amount}`
  if (amount < 0) return `−${Math.abs(amount)}`
  return '0'
}

/**
 * The day a row is filed under, in the viewer's own locale.
 *
 * Day and month only. A credit ledger is read to answer "what happened to my
 * five", and a timestamp to the minute is precision nobody asked for on a card
 * this small.
 */
export function creditEntryDay(at: string, locale?: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

/**
 * Whether the balance is low enough to say something about it (S5).
 *
 * Only ever consulted straight after a graded interview, which is the highest
 * intent second in the product — and the answer is deliberately narrow. Zero is
 * not "low", it is empty, and the refusal copy on the brief already owns that
 * moment (`creditRefusal`); saying it twice in two voices is worse than saying
 * it once. So this is true only while there is exactly enough left for a
 * recruiter screen and nothing beyond it.
 */
export const LOW_CREDIT_THRESHOLD = 1

export function creditsAreLow(credits: number): boolean {
  return credits > 0 && credits <= LOW_CREDIT_THRESHOLD
}
