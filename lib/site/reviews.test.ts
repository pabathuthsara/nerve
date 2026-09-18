import { describe, expect, it } from 'vitest'
import { MIN_REVIEWS, REVIEWS, reviewCountNote, reviewsReady } from './reviews'

/**
 * These run over the one part of the landing page that quotes a named human
 * being, on the page `PAYMENTS-APPROVAL.md` §3 says a reviewer opens during
 * merchant-of-record onboarding.
 *
 * They cannot check that somebody said a thing — only a person can do that,
 * and the process that did it is recorded in `reviews.ts`. What they can
 * check is everything that would make a true quote dangerous anyway: a claim
 * the terms disown, a framing the payment account cannot survive, or a name
 * that was never really attached to it.
 */
describe('the testers, and what a quote is not allowed to say', () => {
  it('attributes every quote to a named person', () => {
    // An unattributed testimonial is indistinguishable from an invented one,
    // and a blank name is how a row gets filled without anybody agreeing.
    for (const review of REVIEWS) {
      expect(review.quote.trim().length).toBeGreaterThan(20)
      expect(review.name.trim().length).toBeGreaterThan(0)
    }
  })

  it('makes no clinical claim, in anybody’s words', () => {
    /**
     * Rule 12 and terms clause 08: no part of this product treats a
     * condition. A quote is the easiest place for that line to be crossed,
     * because it is not our sentence — and a reviewer reading "cured my
     * anxiety" on `/` does not care who typed it. Somebody who says this in
     * testing is thanked and not quoted.
     */
    const clinical = /\b(anxiet|therap|treat(ed|ment|s)?|cure[ds]?|diagnos|depress|disorder|heal(ed|ing)?|mental health|medication|symptom)/i
    for (const review of REVIEWS) {
      expect(clinical.test(review.quote), review.quote).toBe(false)
    }
  })

  it('never frames a character as company rather than practice', () => {
    /**
     * §14's live risk, and the one Creem already declined this account over.
     * A tester calling a character a girlfriend is a true sentence that ends
     * the payment account, so it is refused here rather than argued about
     * later.
     */
    const companion = /\b(girlfriend|boyfriend|companion|lonely|loneliness|in love|dating app|my girl|real relationship)\b/i
    for (const review of REVIEWS) {
      expect(companion.test(review.quote), review.quote).toBe(false)
    }
  })

  it('reads like a person rather than a press release', () => {
    // Not a style rule. A quote made of superlatives is the shape a bought
    // review has, and it discredits the four beside it that are real.
    const marketing = /\b(game[- ]?chang|revolutionar|life[- ]?chang|10\/10|highly recommend|must[- ]have|amazing app|best app)\b/i
    for (const review of REVIEWS) {
      expect(marketing.test(review.quote), review.quote).toBe(false)
    }
  })

  it('counts the quotes rather than asserting a number', () => {
    // `lib/db/founding.ts`'s rule, applied to the other number on this page:
    // a figure nobody counts is a compliance risk where a reviewer reads it.
    expect(reviewCountNote()).toContain(String(REVIEWS.length))
    expect(reviewCountNote([REVIEWS[0]!, REVIEWS[1]!])).toContain('first 2 people')
  })

  it('hides the whole section rather than showing a lonely quote', () => {
    expect(reviewsReady()).toBe(true)
    expect(reviewsReady(REVIEWS.slice(0, MIN_REVIEWS))).toBe(true)
    expect(reviewsReady(REVIEWS.slice(0, MIN_REVIEWS - 1))).toBe(false)
    // A row filled with an empty quote is padding, and does not count.
    expect(reviewsReady([REVIEWS[0]!, { quote: '   ', name: 'Nobody' }, REVIEWS[1]!])).toBe(false)
  })
})
