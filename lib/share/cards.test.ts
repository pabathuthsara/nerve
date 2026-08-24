import { describe, expect, it } from 'vitest'

import {
  assertPublishable,
  baselineCard,
  PRODUCT_LINE,
  rejectionsCard,
  repWinCard,
  streakCard,
  UnpublishableCard,
  weeklyCard,
  type ShareCard,
} from './cards'

const REP_WIN = {
  level: 2,
  personaFirstName: 'Priya',
  durationMs: 107_000,
  composite: 82,
  strongestLabel: 'Composure',
  strongestValue: 88,
}

describe('the guardrails (§14)', () => {
  it('refuses a phone number in any field', () => {
    // The single most damaging thing that could reach a public artefact.
    for (const bad of ['+94 77 123 4567', '0771234567', '077 123 4567']) {
      const card: ShareCard = { kind: 'rep_win', label: 'Level 02 cleared', headline: '82', line: bad }
      expect(() => assertPublishable(card), bad).toThrow(UnpublishableCard)
    }
  })

  it('refuses copy that frames the rep as getting a number', () => {
    const card: ShareCard = { kind: 'rep_win', label: 'Win', headline: '82', line: 'She gave me her number.' }
    expect(() => assertPublishable(card)).toThrow(/getting a number/)
  })

  it('refuses anything that reads as a dating product', () => {
    for (const bad of ['Hookup secured', 'A pickup that worked', 'Matched with three people']) {
      const card: ShareCard = { kind: 'weekly', label: 'This week', headline: '7', line: bad }
      expect(() => assertPublishable(card), bad).toThrow(UnpublishableCard)
    }
  })

  it('refuses anything identifying the person sharing it', () => {
    const card: ShareCard = { kind: 'streak', label: 'Days', headline: '30', line: 'pabath@example.com' }
    expect(() => assertPublishable(card)).toThrow(/email/)
  })

  it('checks the headline and the label, not just the line', () => {
    // A payload assembled from a template is exactly where an unexpected value
    // arrives, and a headline is as public as anything else on the card.
    expect(() => assertPublishable({ kind: 'streak', label: 'Days', headline: '+94 77 123 4567', line: 'ok' }))
      .toThrow(UnpublishableCard)
    expect(() => assertPublishable({ kind: 'streak', label: 'her number', headline: '30', line: 'ok' }))
      .toThrow(UnpublishableCard)
  })
})

describe('the rep-win card', () => {
  it('reads as a level cleared with the process score, never as a trophy', () => {
    const card = repWinCard(REP_WIN)
    expect(card.label).toBe('Level 02 cleared')
    // The hero figure is the COMPOSURE SCORE, not the outcome. §07: score the
    // process. A card whose big number was "she said yes" would be a card that
    // contradicts the entire product.
    expect(card.headline).toBe('82')
    expect(card.line).toContain('composure 88')
  })

  it('never renders a number and never says "her number"', () => {
    const card = repWinCard(REP_WIN)
    expect(card.line.toLowerCase()).not.toContain('number')
    expect(() => assertPublishable(card)).not.toThrow()
  })

  it('carries a first name only', () => {
    const card = repWinCard({ ...REP_WIN, personaFirstName: 'Priya Fernando' })
    expect(card.line).toContain('Priya')
    expect(card.line).not.toContain('Fernando')
  })

  it('shows the duration as time trained, not as a speed record', () => {
    expect(repWinCard(REP_WIN).line).toContain('1:47')
  })
})

describe('the other four kinds', () => {
  it('all pass their own guardrails', () => {
    const cards = [
      rejectionsCard({ count: 25, meanPredicted: 7.1, meanActual: 3.4 }),
      rejectionsCard({ count: 10, meanPredicted: null, meanActual: null }),
      weeklyCard({ asksMade: 9, rejections: 7, reps: 4 }),
      streakCard({ days: 30 }),
      baselineCard({ then: 54, now: 78, days: 28 }),
      baselineCard({ then: 71, now: 63, days: 30 }),
    ]
    for (const card of cards) expect(() => assertPublishable(card), card.kind).not.toThrow()
  })

  it('leads with refusals collected, never with acceptances (§09)', () => {
    expect(rejectionsCard({ count: 25, meanPredicted: 7, meanActual: 3 }).label)
      .toBe('Rejections collected')
    expect(weeklyCard({ asksMade: 9, rejections: 7, reps: 4 }).headline).toBe('7')
  })

  it('does not claim improvement on a baseline that went down', () => {
    const worse = baselineCard({ then: 71, now: 63, days: 30 })
    expect(worse.headline).toBe('71 → 63')
    expect(worse.line).not.toContain('practice, measured')
    expect(worse.line).toContain('measured the same way both times')
  })

  it('says what the product is, so a screenshot out of context still does', () => {
    expect(PRODUCT_LINE).toContain('training')
    expect(PRODUCT_LINE.toLowerCase()).not.toContain('dating')
  })
})
