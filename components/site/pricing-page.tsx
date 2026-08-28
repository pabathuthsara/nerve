/**
 * /pricing (§11).
 *
 * Two rules govern this page. It quotes `lib/site/plans.ts`, which is the same
 * record `/profile/subscription` reads, so the public price and the in-app price
 * cannot drift apart. And it is honest that checkout does not exist yet: a
 * pricing page with a live-looking buy button that goes nowhere is worse than
 * one that says what is true, and it is read by a merchant-of-record reviewer
 * before it is read by a customer (§14).
 *
 * The cap is presented as a feature because it is one. Three reps a day is how
 * training works; unlimited practice is not how anybody gets better at anything.
 */

import Link from 'next/link'
import { Check } from 'lucide-react'
import { SiteSection, SITE_LINKS, SUPPORT_EMAIL } from './site-chrome'
import { BILLING_NOTE, CHECKOUT_NOTE, PUBLIC_PLANS, repsLine } from '@/lib/site/plans'

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
    q: 'What happens when I cancel?',
    a: 'Access stays open until the end of the period you already paid for, and then the account drops to Free. Nothing is deleted by cancelling — your reps, transcripts, scores, streak and field log stay exactly where they are.',
  },
  {
    q: 'Do unused reps roll over?',
    a: 'No. A daily cap that banks turns into a weekend of twelve reps, which is not training, it is a binge. The cap resets on your own local day.',
  },
  {
    q: 'Why is it metered at all?',
    a: 'A live voice character costs real money per second it is speaking to you. That is the only part of this product with a variable cost, so it is the only part that is metered. Everything else — the field challenges, the log, the scorecards, the library — is unlimited on every plan.',
  },
  {
    q: 'Can I get a refund?',
    a: `Write to ${SUPPORT_EMAIL} within fourteen days of a charge and we will refund it, no argument. The free plan exists so that nobody has to buy this to find out whether it suits them.`,
  },
]

export function PricingPage() {
  return (
    <>
      <section className="page-hero">
        <span className="label">Pricing</span>
        <h1 className="display-xl">You pay for minutes<br />with a live character.<br />Nothing else.</h1>
        <p>
          The outside half of this product — the challenges, the log, the anxiety chart,
          the streak — is free on every plan and always will be. Charging for the part
          that happens in the real world would be charging for the part that works.
        </p>
      </section>

      <section className="plan-board">
        {PUBLIC_PLANS.map((plan) => (
          <article key={plan.id} className={`plan-board__card${plan.id === 'pro' ? ' plan-board__card--lead' : ''}`}>
            <header>
              <div className="plan-board__name">
                <span className="label">{plan.name}</span>
                {plan.open ? null : <span className="arena-chip">Opens soon</span>}
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
            {plan.open ? (
              <Link href="/signup" className="arena-button arena-button--primary arena-button--full">Start free</Link>
            ) : (
              <Link href="/signup" className="arena-button arena-button--secondary arena-button--full">Start free first</Link>
            )}
          </article>
        ))}
      </section>

      <p className="plan-board__note">{CHECKOUT_NOTE}</p>

      <SiteSection
        kicker="Every plan"
        title={<>The only thing<br />a plan changes.</>}
        lede="A free tier that withholds the mechanism is a demo with a price attached. This one withholds volume. Everything that makes the product work is in it, and the top of the roster is opened by scoring rather than by paying."
      >
        <div className="split-grid">
          <div>
            <span className="label">What a plan changes</span>
            <ul className="tick-list">
              <li>How many voice reps you may run in a day</li>
              <li>Nothing else</li>
            </ul>
          </div>
          <div>
            <span className="label">What it never changes</span>
            <ul className="tick-list">
              <li>The full scorecard — six dimensions, evidence, transcript</li>
              <li>Which characters you can reach: tiers open on scores, never on price</li>
              <li>Every field challenge at every tier, and the anxiety chart</li>
              <li>Streaks, ranks and the Sunday review letter</li>
              <li>Text mode against the same characters, unmetered</li>
              <li>Three reps on your first day</li>
            </ul>
          </div>
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
        <span className="label">No card</span>
        <h2 className="display-xl">Find out on the<br />free plan first.</h2>
        <p>Three reps on your first day is enough to fail one, adjust, and do it again — which is the whole arc this is built around.</p>
        <div className="hero__actions">
          <Link href="/signup" className="arena-button arena-button--primary arena-button--lg">Start training free</Link>
          <Link href={SITE_LINKS.howItWorks} className="arena-button arena-button--secondary arena-button--lg">How it works</Link>
        </div>
      </section>
    </>
  )
}
