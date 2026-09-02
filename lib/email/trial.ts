/**
 * The email before the first charge (§14, §8 of the payments plan).
 *
 * Terms clause 07 and `TRIAL_NOTE` both say, in as many words, "we will email
 * you before that first charge". Until 2 September nothing sent it — the
 * promise was made on three surfaces and kept on none.
 *
 * It is one of the three mitigations §8 names for a card-required trial, and
 * the reasoning is worth restating because it is easy to read this as courtesy:
 * a trial that converts partly on people forgetting they started it produces
 * chargebacks rather than cancellations, and §14 is blunt that a run of
 * chargebacks is what closes a merchant-of-record account. The other two
 * mitigations — the countdown on `/profile/subscription` and a cancel that
 * takes one tap — already shipped. This is the third.
 *
 * The content is a pure function with tests, for the same reason the rep rules
 * and the safety verdicts are: what this email says is a promise about
 * somebody's money, and it should be arguable in a test file rather than
 * buried in a network call. `lib/email/send.ts` does the sending.
 */

import { TRIAL_DAYS } from '@/lib/site/plans'
import type { Plan } from '@/lib/data/types'

export interface TrialEmail {
  subject: string
  /** Plain text. No HTML: this is four sentences and a link. */
  body: string
}

/**
 * The day a charge lands, written the way a person reads a date.
 *
 * Long month rather than numeric, because `03/09` is two different days
 * depending on which side of the Atlantic somebody opens the mail — and the
 * whole point of this message is that the date is not ambiguous.
 */
export function chargeDay(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Says the amount, the date and the way out, in that order.
 *
 * That order is deliberate. The thing somebody needs first is the number that
 * is about to leave their account; the thing they need immediately after is
 * that stopping it takes one tap and no conversation with us. An email that
 * buries either is the email that becomes a chargeback.
 *
 * It never says "don't miss out" or asks them to stay. A trial reminder that
 * reads as marketing is one people stop opening, and this is the one message
 * in the product that has to be read.
 */
export function trialEndingEmail(options: {
  plan: Exclude<Plan, 'free'>
  planName: string
  price: string
  periodEnd: string | null
  manageUrl: string | null
  subscriptionUrl: string
}): TrialEmail {
  const day = chargeDay(options.periodEnd)

  const when = day
    ? `on ${day}`
    // No date rather than a guessed one. A wrong date in this email is worse
    // than none: it is the sentence somebody quotes back during a dispute.
    : `when your ${TRIAL_DAYS} days are up`

  const lines = [
    `Your Nerve trial ends ${day ? `on ${day}` : `in a couple of days`}, and that is the day your card is charged ${options.price} for the first month of ${options.planName}.`,
    '',
    `Nothing has been charged so far.`,
    '',
    `If you want to keep training, do nothing — the charge goes through ${when} and Nerve carries on exactly as it is.`,
    '',
    `If you do not, cancel here and you are not charged at all:`,
    `  ${options.subscriptionUrl}`,
    '',
    `It is one tap. No email to us, no form, and no reason required. Cancelling keeps your access open until the trial ends and leaves your reps, transcripts, scores, streak and everything you have unlocked exactly where they are.`,
  ]

  if (options.manageUrl) {
    lines.push('', `To change the card instead: ${options.manageUrl}`)
  }

  lines.push(
    '',
    '—',
    'Nerve · confidence training for conversation',
    'Questions: support@hellonerve.com',
  )

  return {
    // Names the amount and the date in the subject, because a good share of
    // people will decide entirely from the inbox line and never open it.
    subject: day
      ? `Your Nerve trial ends ${day} — ${options.price} on that day unless you cancel`
      : `Your Nerve trial is ending — ${options.price} unless you cancel`,
    body: lines.join('\n'),
  }
}
