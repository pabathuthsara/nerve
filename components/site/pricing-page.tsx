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
 *
 * ── THE BOARD IS A PERIOD CONTROL NOW, AND THAT REVERSES A DECISION ──────
 *
 * This page used to print every price at once: a monthly figure on each card
 * and a smaller line under it offering the weekly one. The note on that
 * decision argued a toggle "would hide half the offer to no purchase". It
 * measured the wrong cost. Three cards quoting five numbers do not read as
 * generous, they read as undecided, and the reader's first task was working out
 * which price applied to them.
 *
 * `components/site/plan-board.tsx` holds the replacement and the whole
 * argument, including what had to be preserved in the move: weekly costs more
 * per month than monthly, and that fact is now louder rather than quieter — on
 * the tab, under the tabs, and beneath any non-monthly price.
 */

import Link from 'next/link'
import { Check } from 'lucide-react'
import { PlanBoard } from './plan-board'
import { PackBuy } from './pack-buy'
import { SiteSection, SITE_LINKS, SUPPORT_EMAIL } from './site-chrome'
import {
  BILLING_NOTE, CREDIT_EXPIRY_NOTE, INTERVIEW_PACKS, checkoutNoteFor,
  PLAN_INTERVIEW_CREDITS, PUBLIC_PLANS, ROUND_COST_NOTE, SCREENER_NOTE, TRIAL_DAYS,
  creditsLine, perCredit, repsLine,
} from '@/lib/site/plans'

/**
 * The pack with the lowest price per credit.
 *
 * Derived rather than hardcoded, so it follows the prices instead of being a
 * marketing claim somebody has to remember to move. `plans.test.ts` asserts
 * the packs get cheaper per credit as they grow, which is what makes this
 * the last one.
 */
const BEST_VALUE_PACK = [...INTERVIEW_PACKS].sort((a, b) => perCredit(a) - perCredit(b))[0]?.id

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
    q: 'How do practice interviews work, and why are they not in the daily allowance?',
    a: 'An interview runs ten to twenty-five minutes against an interviewer who has read your CV and the job description, and it is graded on seven dimensions. A daily rep allowance cannot hold an item that long — three twenty-minute interviews a day would cost us more in voice than the subscription does — so interviews are sold as credits instead. A ten-minute recruiter screen is one credit and every longer round is two; Pro includes two credits a month and Elite six. You can also buy credits outright, and every account gets one free five-minute screen to see what it is.',
  },
  {
    q: 'Do interview credits expire?',
    a: 'The ones you buy do not, ever. They stay in the account, they survive cancelling, and nothing removes them but using them. The ones included with a plan are part of that month and do not roll over — and if the subscription ends, unspent included credits go and everything you bought stays. When you use one, we spend the expiring ones first.',
  },
  {
    q: 'Can I get a refund?',
    a: `Write to ${SUPPORT_EMAIL} within fourteen days of a charge and we will refund it, no argument — a subscription charge or a pack of interviews alike. Between the sign-up rep, the free five-minute interview and the ${TRIAL_DAYS}-day trial, nobody should ever reach a charge they did not mean to make.`,
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
  // C2. Monthly billing, said out loud: a weekly Pro grants none, because a
  // grant is a property of the offer and weekly pays every seven days.
  { label: 'Interview credits included each month, on monthly billing', varies: true, values: PUBLIC_PLANS.map((plan) => creditsLine(plan.id)) },
  { label: 'The full scorecard — six dimensions, evidence, transcript', values: [true, true, true] },
  { label: 'Every character: tiers open on scores, never on price', values: [true, true, true] },
  { label: 'Every field challenge, at every tier', values: [true, true, true] },
  { label: 'The predicted-versus-actual anxiety chart', values: [true, true, true] },
  { label: 'Streaks, ranks and the Sunday review letter', values: [true, true, true] },
  { label: 'Text mode against the same characters, unmetered', values: [true, true, true] },
  { label: 'One voice rep at sign-up, before you decide anything', values: [true, true, true] },
  { label: 'One free five-minute practice interview, once per account', values: [true, true, true] },
]

export function PricingPage({ signedIn = false, packsOpen = false, foundingPlacesLeft = null }: {
  signedIn?: boolean
  packsOpen?: boolean
  /**
   * How many founding places are left, counted on the server (S3).
   *
   * `null` when the count could not be read, which prints the promise without
   * a number. A figure nobody verified is the thing §14 says not to put on this
   * page — see `checkoutNoteFor`.
   */
  foundingPlacesLeft?: number | null
}) {
  return (
    <>
      <section className="page-hero page-hero--wide">
        <span className="label">Pricing</span>
        <h1 className="display-xl">You pay for minutes<br />with a live character.<br />Nothing else.</h1>
        <p>
          The outside half — the challenges, the log, the anxiety chart, the streak — is
          free on every plan and always will be. The voice is the part that costs us
          money per second, so the voice is the part you pay for.
        </p>
      </section>

      {/* The board owns the trial half of the footnote, because only it knows
          which period is on screen (`trialNoteFor`). What is passed in is the
          part that is true on every tab. */}
      <PlanBoard note={checkoutNoteFor(foundingPlacesLeft)} />

      {/* ── INTERVIEW CREDITS (INTERVIEW-PLAN E2, §9) ──────────────────────
          The compliance dividend, and the reason this is not a footnote. Every
          merchant of record on the shortlist bans dating products by name and a
          human reviewer opens this page during onboarding
          (`PAYMENTS-APPROVAL.md` §3). Interview rehearsal sits inside
          `public_speaking_coaching` — the category this account is already
          registered under — without any strain at all.

          It does not license overstating it, and this section does not: the
          dating track is the majority of the product and the plan board above
          it is still about voice reps. */}
      <SiteSection
        wide
        kicker="Practice interviews"
        title={<>Bought one at<br />a time, not by the month.</>}
        lede="An interview runs ten to twenty-five minutes against an interviewer who has read your CV and the job description, and comes back graded on seven dimensions. Demand for that is episodic — you need four of them the week before an onsite and none for three months — so it is sold by the interview rather than by the month."
      >
        {/* The same seven-row discipline as the plan board above, so the two
            read as one system rather than as a pricing page with a bolt-on.
            No volt anywhere in here: the page's one accent is already spent on
            the lead plan's action, and a second one would make the packs argue
            with the subscriptions about which is the offer. The best rate is
            marked with a chip instead. */}
        <div className="pack-board">
          {INTERVIEW_PACKS.map((pack) => {
            const best = pack.id === BEST_VALUE_PACK
            return (
              <article key={pack.id} className={`pack-board__card${best ? ' pack-board__card--best' : ''}`}>
                <div className="pack-board__name">
                  <span className="label">{pack.name}</span>
                  {best ? <span className="arena-chip">Best rate</span> : null}
                </div>
                <div className="pack-board__price">
                  <strong className="data">{pack.price}</strong>
                  <span className="mute">one-off</span>
                </div>
                {/* The unit rate, on every card including the single, so the
                    three are comparable at a glance instead of by arithmetic. */}
                <p className="pack-board__rate data">
                  ${perCredit(pack).toFixed(2)} <span className="mute">per credit</span>
                </p>
                <p>{pack.tagline}</p>
                <p className="pack-board__keeps">
                  {pack.credits} credit{pack.credits === 1 ? '' : 's'} · never expires
                </p>
                {/* C1. Every other card on this page ends in a button; these
                    three ended in nothing, on the highest-intent block here. */}
                <PackBuy pack={pack} signedIn={signedIn} packsOpen={packsOpen} />
              </article>
            )
          })}
        </div>
        {/* What a credit buys, because B3 made "five credits" ambiguous on its
            own: a recruiter screen is one and a deep technical is three. */}
        <p className="site-aside">{ROUND_COST_NOTE}</p>
        <p className="site-aside">{CREDIT_EXPIRY_NOTE}</p>
        <p className="site-aside">
          {SCREENER_NOTE} Pro includes {PLAN_INTERVIEW_CREDITS.pro} interview a month
          and Elite {PLAN_INTERVIEW_CREDITS.elite}, on top of the daily voice reps.
        </p>
      </SiteSection>

      <SiteSection
        kicker="Every plan"
        title={<>The only thing<br />a plan changes.</>}
        lede="A plan buys voice minutes and a small interview allotment, and nothing else. It does not buy characters, scorecards, field challenges or progression — the top of the roster is opened by scoring, never by paying, and a free account keeps every part of the loop that happens outside the microphone."
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
