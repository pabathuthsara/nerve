/**
 * /pricing (§11).
 *
 * Two rules govern this page. It quotes `lib/site/plans.ts`, which is the same
 * record `/profile/subscription` reads, so the public price and the in-app price
 * cannot drift apart. And it says exactly what free is: everything outside the
 * microphone, and no voice. A page that leaves that ambiguous is worse than one
 * that states it, and it is read by a merchant-of-record reviewer before it is
 * read by a customer (§14).
 *
 * **Every button on this page goes to sign-up, including the paid ones.** That
 * is not a limitation, it is the funnel: the trial is started from inside the
 * account, after the sign-up rep, because that is the rep the decision is
 * actually made on. A buy button on a public page would ask somebody to put a
 * card in before they had heard a single thing the product does.
 *
 * The cap is presented as a feature because it is one. Three reps a day is how
 * training works; unlimited practice is not how anybody gets better at anything.
 */

import Link from 'next/link'
import { Check } from 'lucide-react'
import { Mark, planMark } from '@/components/marks'
import { SiteSection, SITE_LINKS, SUPPORT_EMAIL } from './site-chrome'
import { BILLING_NOTE, CHECKOUT_NOTE, PUBLIC_PLANS, TRIAL_DAYS, TRIAL_NOTE, repsLine } from '@/lib/site/plans'

const BILLING_FAQ = [
  {
    q: 'Who actually charges my card?',
    a: 'A merchant of record. They are the seller of record for the transaction, which means they handle payment, the receipt, and any VAT or sales tax due where you live — including registering and remitting it. The name on your statement is theirs, not ours.',
  },
  {
    q: 'Is tax included in the price?',
    a: 'The price shown is what the checkout charges before any tax your country requires. Where VAT or sales tax applies, the merchant of record adds and remits it, and the receipt itemises it.',
  },
  {
    q: `How does the ${TRIAL_DAYS}-day trial work?`,
    a: `You put a card in, you get ${TRIAL_DAYS} days of Pro, and the card is not charged until day ${TRIAL_DAYS + 1}. We email you before that happens, the date is on your subscription screen the whole time, and cancelling is a button on that screen rather than an email to us. Cancel before it ends and you are charged nothing at all.`,
  },
  {
    q: 'What happens when I cancel?',
    a: 'Access stays open until the end of the period you already paid for, and then the account drops to Free. Nothing is deleted by cancelling — your reps, transcripts, scores, streak and field log stay exactly where they are. You keep the field challenges, the log, the chart, text mode and your streak; what you lose is the microphone.',
  },
  {
    q: 'Do unused reps roll over?',
    a: 'No. A daily cap that banks turns into a weekend of twelve reps, which is not training, it is a binge. The cap resets on your own local day.',
  },
  {
    q: 'Why is it metered at all?',
    a: 'A live voice character costs real money per second it is speaking to you. That is the only part of this product with a variable cost, so it is the only part that is metered, and it is the only part behind a plan. Everything else — the field challenges, the log, the chart, the scorecards, the library, text mode — is unlimited on every plan including the free one.',
  },
  {
    q: 'Is there anything free?',
    a: 'Yes, and it is not a trial in disguise. The free plan keeps every field challenge, the log, the predicted-versus-actual chart, your streak, your history and text mode against the same characters, for as long as you want it. What it does not include is voice — apart from one rep when you sign up, so that you know what you are deciding about.',
  },
  {
    q: 'Can I get a refund?',
    a: `Write to ${SUPPORT_EMAIL} within fourteen days of a charge and we will refund it, no argument. Between the sign-up rep and the ${TRIAL_DAYS}-day trial, nobody should ever reach a charge they did not mean to make.`,
  },
]

/**
 * What a plan does and does not change, as rows (V13).
 *
 * `varies` marks the single row that differs between plans, and the page's
 * whole argument is that there is exactly one of them. Values come from
 * `repsLine` so the numbers here cannot disagree with the cards above — §14
 * has a merchant-of-record reviewer reading this page, and two prices on one
 * screen is the failure `lib/site/plans.ts` exists to prevent.
 */
const PLAN_MATRIX: { label: string; varies?: boolean; values: (boolean | string)[] }[] = [
  { label: 'Voice reps with a live character', varies: true, values: PUBLIC_PLANS.map((plan) => repsLine(plan)) },
  { label: 'The full scorecard — six dimensions, evidence, transcript', values: [true, true, true] },
  { label: 'Every character: tiers open on scores, never on price', values: [true, true, true] },
  { label: 'Every field challenge, at every tier', values: [true, true, true] },
  { label: 'The predicted-versus-actual anxiety chart', values: [true, true, true] },
  { label: 'Streaks, ranks and the Sunday review letter', values: [true, true, true] },
  { label: 'Text mode against the same characters, unmetered', values: [true, true, true] },
  { label: 'One voice rep at sign-up, before you decide anything', values: [true, true, true] },
]

export function PricingPage() {
  return (
    <>
      <section className="page-hero">
        <span className="label">Pricing</span>
        <h1 className="display-xl">You pay for minutes<br />with a live character.<br />Nothing else.</h1>
        <p>
          The outside half — the challenges, the log, the anxiety chart, the streak — is
          free on every plan and always will be. The voice is the part that costs us
          money per second, so the voice is the part you pay for.
        </p>
      </section>

      <section className="plan-board">
        {PUBLIC_PLANS.map((plan) => (
          <article key={plan.id} className={`plan-board__card${plan.id === 'pro' ? ' plan-board__card--lead' : ''}`}>
            <header>
              <div className="plan-board__name">
                <span className="mark-row"><Mark name={planMark(plan.id)} size={18} current={plan.id === 'pro'} /><span className="label">{plan.name}</span></span>
                {plan.id === 'free' ? null : <span className="arena-chip">{TRIAL_DAYS} days free</span>}
              </div>
              <div className="plan-board__price">
                <strong className="data">{plan.price ?? '$0'}</strong>
                <span className="mute">{plan.price ? '/ month' : 'no card, ever'}</span>
              </div>
              <p className="plan-board__tagline">{plan.tagline}</p>
            </header>
            <div className="plan-board__reps">
              <span className="label">Voice reps</span>
              <strong className="data">{repsLine(plan)}</strong>
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}><Check size={15} strokeWidth={1.75} aria-hidden="true" /> {feature}</li>
              ))}
            </ul>
            {/* Every card sends people to sign-up. The trial is started from
                inside the account, after the sign-up rep — see the note at the
                top of this file. */}
            {plan.id === 'free' ? (
              <Link href="/signup" className="arena-button arena-button--secondary arena-button--full">Start free</Link>
            ) : (
              <Link href="/signup" className="arena-button arena-button--primary arena-button--full">Start the {TRIAL_DAYS}-day trial</Link>
            )}
          </article>
        ))}
      </section>

      <p className="plan-board__note">{TRIAL_NOTE} {CHECKOUT_NOTE}</p>

      <SiteSection
        kicker="Every plan"
        title={<>The only thing<br />a plan changes.</>}
        lede="A plan buys voice minutes and nothing else. It does not buy characters, scorecards, field challenges or progression — the top of the roster is opened by scoring, never by paying, and a free account keeps every part of the loop that happens outside the microphone."
      >
        {/* V13. Two columns of prose asked the reader to hold six items in
            their head and diff them. The argument is *one row varies and the
            rest do not*, which a matrix says in a glance and a pair of lists
            cannot say at all. */}
        <div className="plan-matrix" role="table" aria-label="What each plan includes">
          <div className="plan-matrix__head" role="row">
            <span role="columnheader">Included</span>
            {PUBLIC_PLANS.map((plan) => <span key={plan.id} role="columnheader" className="label">{plan.name}</span>)}
          </div>
          {PLAN_MATRIX.map((row) => (
            <div key={row.label} className={`plan-matrix__row${row.varies ? ' plan-matrix__row--varies' : ''}`} role="row">
              <span role="cell">{row.label}</span>
              {row.values.map((value, index) => (
                <span key={PUBLIC_PLANS[index]?.id ?? index} role="cell" className="plan-matrix__cell">
                  {value === true
                    ? <Check size={15} strokeWidth={1.9} aria-label="Included" />
                    : value === false
                      ? <i aria-label="Not included" />
                      : <b className="data">{value}</b>}
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="site-aside">
          Running out of voice reps never breaks a streak. The day still counts if you did
          the outside half, which is deliberate — a limit that also costs you your streak
          is a limit that makes people quit rather than upgrade.
        </p>
      </SiteSection>

      <SiteSection kicker="Billing" title={<>The questions that<br />are actually about money.</>}>
        <div className="faq">
          {BILLING_FAQ.map((entry) => (
            <details key={entry.q}>
              <summary><span>{entry.q}</span><i aria-hidden="true" /></summary>
              <p>{entry.a}</p>
            </details>
          ))}
        </div>
        <p className="site-aside">{BILLING_NOTE}</p>
      </SiteSection>

      <section className="final-call">
        <span className="label">No card to start</span>
        <h2 className="display-xl">Talk to somebody<br />before you decide.</h2>
        <p>Sign-up includes one voice rep, no card. Three minutes with a real character is a better answer to &ldquo;is this for me&rdquo; than anything written on this page.</p>
        <div className="hero__actions">
          <Link href="/signup" className="arena-button arena-button--primary arena-button--lg">Start training free</Link>
          <Link href={SITE_LINKS.howItWorks} className="arena-button arena-button--secondary arena-button--lg">How it works</Link>
        </div>
      </section>
    </>
  )
}
