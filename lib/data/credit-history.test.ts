import { describe, expect, it } from 'vitest'
import {
  creditAmountLabel,
  creditEntryDay,
  creditEntryLine,
  creditsAreLow,
  isCreditEntryKind,
  type CreditEntryKind,
} from './credit-history'

const KINDS: readonly CreditEntryKind[] = [
  'grant', 'purchase', 'screener', 'spend', 'refund', 'expiry', 'revoke',
]

describe('credit history', () => {
  it('writes a sentence for every kind the ledger can hold', () => {
    for (const kind of KINDS) {
      const line = creditEntryLine({ kind, source: 'purchase' })
      expect(line.length).toBeGreaterThan(0)
      // Never the column name. A history nobody can read is a support ticket.
      expect(line.toLowerCase()).not.toBe(kind)
    }
  })

  it('never says "spent" about somebody else money', () => {
    expect(creditEntryLine({ kind: 'spend', source: 'purchase' })).toBe('Interview')
  })

  it('signs the amount, and uses a real minus in a tabular column', () => {
    expect(creditAmountLabel(2)).toBe('+2')
    expect(creditAmountLabel(-3)).toBe('−3')
    expect(creditAmountLabel(-1)).not.toContain('-')
  })

  it('accepts only kinds this build knows', () => {
    for (const kind of KINDS) expect(isCreditEntryKind(kind)).toBe(true)
    expect(isCreditEntryKind('settle')).toBe(false)
    expect(isCreditEntryKind(null)).toBe(false)
    expect(isCreditEntryKind(3)).toBe(false)
  })

  it('files a row under a day, and survives a row it cannot read', () => {
    expect(creditEntryDay('2026-09-08T10:00:00.000Z', 'en-GB')).toMatch(/^8 Sept?$/)
    expect(creditEntryDay('not a date')).toBe('')
  })

  /**
   * Zero is not low, it is empty — and the brief's own refusal copy owns that
   * moment. Two different sentences about the same emptiness, in two voices, is
   * worse than one.
   */
  it('calls one credit low and no credits nothing at all', () => {
    expect(creditsAreLow(0)).toBe(false)
    expect(creditsAreLow(1)).toBe(true)
    expect(creditsAreLow(2)).toBe(false)
    expect(creditsAreLow(-1)).toBe(false)
  })
})
