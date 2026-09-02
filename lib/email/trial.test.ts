import { describe, expect, it } from 'vitest'
import { TRIAL_DAYS } from '@/lib/site/plans'
import { chargeDay, trialEndingEmail } from './trial'

const BASE = {
  plan: 'pro' as const,
  planName: 'Pro',
  price: '$19',
  periodEnd: '2026-09-09T04:12:01.591Z',
  manageUrl: null,
  subscriptionUrl: 'https://hellonerve.com/profile/subscription',
}

describe('chargeDay', () => {
  it('writes the month out rather than as a number', () => {
    // `09/09` is two different days depending on which side of the Atlantic
    // somebody opens the mail, and an unambiguous date is the entire job of
    // this message.
    expect(chargeDay('2026-09-09T04:12:01.591Z')).toBe('9 September 2026')
  })

  it('reads the date in UTC rather than in the machine`s timezone', () => {
    // The server that renders this can be anywhere. Without a fixed zone the
    // same event produces different dates on different deployments, and one of
    // them is wrong by a day in the direction that matters.
    expect(chargeDay('2026-09-09T23:30:00.000Z')).toBe('9 September 2026')
    expect(chargeDay('2026-09-09T00:30:00.000Z')).toBe('9 September 2026')
  })

  it('returns null rather than a guess when there is no usable date', () => {
    expect(chargeDay(null)).toBeNull()
    expect(chargeDay('tuesday')).toBeNull()
    expect(chargeDay('')).toBeNull()
  })
})

describe('the email before the first charge', () => {
  it('names the amount and the date in the subject line', () => {
    // A good share of people decide from the inbox line and never open it, so
    // both facts have to survive being the only thing that is read.
    const { subject } = trialEndingEmail(BASE)
    expect(subject).toContain('$19')
    expect(subject).toContain('9 September 2026')
    expect(subject).toContain('cancel')
  })

  it('says the amount, the date and the way out', () => {
    const { body } = trialEndingEmail(BASE)
    expect(body).toContain('$19')
    expect(body).toContain('9 September 2026')
    expect(body).toContain('https://hellonerve.com/profile/subscription')
    expect(body).toContain('Pro')
  })

  it('states plainly that nothing has been charged yet', () => {
    // The sentence that stops somebody reading this as a receipt and opening a
    // dispute over a charge that has not happened.
    expect(trialEndingEmail(BASE).body).toContain('Nothing has been charged so far')
  })

  it('promises the cancel takes no conversation with us', () => {
    // This is the claim TRIAL_NOTE and terms clause 07 both make. The email is
    // the third place it is made and the first place it is acted on, so it has
    // to say the same thing.
    const { body } = trialEndingEmail(BASE)
    expect(body).toContain('one tap')
    expect(body).toMatch(/No email to us, no form/)
  })

  it('says cancelling destroys nothing', () => {
    const { body } = trialEndingEmail(BASE)
    expect(body).toMatch(/reps, transcripts, scores, streak/)
  })

  it('never guesses a date it was not given', () => {
    // A wrong date here is the sentence somebody quotes back during a dispute,
    // which is worse than no date at all.
    const { subject, body } = trialEndingEmail({ ...BASE, periodEnd: null })
    expect(subject).not.toMatch(/\d{4}/)
    expect(body).toContain(`when your ${TRIAL_DAYS} days are up`)
    expect(body).toContain('$19')
  })

  it('adds the card link only when the payload carried one', () => {
    expect(trialEndingEmail(BASE).body).not.toContain('change the card')
    const withUrl = trialEndingEmail({ ...BASE, manageUrl: 'https://whop.com/orders/mem_1' })
    expect(withUrl.body).toContain('https://whop.com/orders/mem_1')
  })

  it('does not ask them to stay', () => {
    // A trial reminder that reads as marketing is one people stop opening, and
    // this is the one message in the product that has to be read. It is also
    // the §8 mitigation: its job is to prevent a chargeback, not a churn.
    const { subject, body } = trialEndingEmail(BASE)
    const text = `${subject} ${body}`.toLowerCase()
    for (const pitch of ["don't miss", 'do not miss', 'act now', 'limited time', 'upgrade now', 'hurry']) {
      expect(text, pitch).not.toContain(pitch)
    }
  })

  it('makes no clinical claim, anywhere (rule 10)', () => {
    const text = `${trialEndingEmail(BASE).subject} ${trialEndingEmail(BASE).body}`.toLowerCase()
    for (const word of ['therapy', 'treatment', 'clinical', 'diagnos', 'anxiety disorder', 'cure']) {
      expect(text, word).not.toContain(word)
    }
  })

  it('carries the price of whichever plan is ending', () => {
    const elite = trialEndingEmail({ ...BASE, plan: 'elite', planName: 'Elite', price: '$49' })
    expect(elite.subject).toContain('$49')
    expect(elite.body).toContain('Elite')
    expect(elite.body).not.toContain('$19')
  })
})
