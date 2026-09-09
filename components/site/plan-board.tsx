'use client'

/**
 * The plan board on `/pricing`, and the control that decides which price it is
 * quoting.
 *
 * ── WHAT WAS WRONG WITH THE OLD ONE ──────────────────────────────────────
 *
 * Every price at once. Each card printed a monthly figure and then a smaller
 * line offering the weekly one, so three cards quoted five numbers and the
 * reader's first job was working out which applied to them. The note on that
 * decision said a toggle would "hide half the offer to no purchase" — true, and
 * it weighed the wrong cost. A page that shows every price at once does not
 * read as generous, it reads as undecided, and §14 has a merchant-of-record
 * reviewer forming a judgement about this business from this page before any
 * customer does.
 *
 * So: one period at a time, and everything on the board agrees with the tab.
 *
 * ── WHAT THE OLD ONE GOT RIGHT, AND IS KEPT ──────────────────────────────
 *
 * It bought its clutter with a real virtue. **Weekly costs more per month than
 * monthly**, and a ladder that hides that is a trick rather than a ladder.
 * Three things carry that now, and all three are louder than the grey line they
 * replace: the saving is on the tab itself, `PERIOD_NOTE` sits under the tabs
 * in plain words, and any non-monthly price prints its effective monthly rate
 * directly beneath it. Nothing about the weekly offer is discoverable only from
 * a bank statement.
 *
 * ── ARENA ────────────────────────────────────────────────────────────────
 *
 * **Volt appears once**, on the lead plan's action. It was appearing three
 * times before this — Pro's button, Elite's button, and the active tab of the
 * in-app toggle — which is the rule broken twice on one screen. The tab's
 * current state is a bright hairline and a surface lift instead; that is what
 * every other "current position" in the product that is not the primary action
 * looks like.
 *
 * Every card is the same seven rows so the prices, the meters and the buttons
 * sit on the same lines across all three. A board whose cards each lay
 * themselves out reads as three unrelated cards rather than one comparison,
 * which was the other half of "the prices are all over the place".
 */

import Link from 'next/link'
import { useState, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { Mark, planMark } from '@/components/marks'
import {
  BILLING_PERIODS,
  BEST_VALUE_PERIOD,
  PERIOD_NOTE,
  TRIAL_DAYS,
  chargeLine,
  interviewsLine,
  monthlyEquivalent,
  offerFor,
  periodAsideFor,
  periodLabel,
  periodSavings,
  periodTabLabel,
  plansOn,
  trialNoteFor,
  repsLine,
  type BillingPeriod,
  type PublicPlan,
} from '@/lib/site/plans'

/** The plan the board leads with. One card carries volt; this is it. */
const LEAD: PublicPlan['id'] = 'pro'

export function PlanBoard({ note }: { note: string }) {
  const [period, setPeriod] = useState<BillingPeriod>(BEST_VALUE_PERIOD)
  /**
   * A3's second half. Dropping Elite from the weekly tab left a three-column
   * grid holding two cards and an empty third of the board — which reads as
   * something that failed to load, on the page a merchant-of-record reviewer
   * opens. The column count follows the cards.
   */
  const shown = plansOn(period)
  return (
    <div className="plan-board-wrap">
      <PeriodTabs value={period} onChange={setPeriod} />
      <p className="plan-board__period-note">{PERIOD_NOTE[period]}</p>
      {/* A3. The board shows what is sold on this tab and nothing else. Elite
          used to fall back to its monthly offer on the weekly tab, so
          "7 days free, then $49 every month" sat directly under a period note
          reading "no trial and no commitment — the week is the trial". A chip
          was not enough: the page was contradicting itself about when money
          moves, on the one surface §14 has a merchant-of-record reviewer
          reading. One line under the board says where the missing plan went. */}
      <section className="plan-board" style={{ '--plan-columns': shown.length } as CSSProperties}>
        {shown.map((plan) => <PlanColumn key={plan.id} plan={plan} period={period} />)}
      </section>
      {periodAsideFor(period) ? <p className="plan-board__aside">{periodAsideFor(period)}</p> : null}
      {/* Inside the board rather than after it, so it sits on the board's own
          left edge and moves with it at every breakpoint — and the trial half
          of it is scoped to the period on screen, because a static footnote
          promising seven free days under a card reading "charged today" is the
          page contradicting itself about when money moves. */}
      <p className="plan-board__note">{[trialNoteFor(period), note].filter(Boolean).join(' ')}</p>
    </div>
  )
}

/**
 * The period control.
 *
 * Driven from `BILLING_PERIODS` rather than a literal pair, so the day an
 * annual offer is authored in `lib/site/plans.ts` it appears here, on the
 * in-app screen and in `whop:verify` without anyone editing a component. That
 * is the whole reason `BillingPeriod` was made a type rather than a boolean.
 *
 * `aria-pressed` on plain buttons rather than a radiogroup: it is the pattern
 * `TrackSwitcher` already uses, and one accessibility idiom repeated is worth
 * more than three that are each individually defensible.
 *
 * **Exported, and `/profile/subscription` renders this exact component.** It
 * had a near-identical `PeriodToggle` of its own whose current segment was
 * VOLT — a second accent on a screen that already spends it on the buy button,
 * and a control that looked like an action rather than a position. Two controls
 * doing one job is also how the public page and the in-app page come to
 * disagree about what is on sale, which is the failure `lib/site/plans.ts`
 * exists to prevent, reached through the UI instead of through a price.
 */
export function PeriodTabs({ value, onChange }: { value: BillingPeriod; onChange: (next: BillingPeriod) => void }) {
  return (
    <div className="period-tabs" role="group" aria-label="Billing period">
      {BILLING_PERIODS.map((option) => {
        const saving = periodSavings(option)
        return (
          <button
            key={option}
            type="button"
            className={`period-tabs__option${value === option ? ' is-current' : ''}`}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {periodTabLabel(option)}
            {/* The number, on the control, rather than left for the reader to
                derive from two prices on two different cards. */}
            {saving ? <span className="period-tabs__save">save {saving}%</span> : null}
          </button>
        )
      })}
    </div>
  )
}

function PlanColumn({ plan, period }: { plan: PublicPlan; period: BillingPeriod }) {
  /**
   * The offer this column is selling. Never a fallback — see A3 above: a plan
   * this tab does not sell is not on this tab at all.
   */
  const offer = plan.id === 'free' ? null : offerFor(plan.id, period) ?? null
  const lead = plan.id === LEAD

  return (
    <article className={`plan-board__card${lead ? ' plan-board__card--lead' : ''}`}>
      <div className="plan-board__name">
        <span className="mark-row">
          <Mark name={planMark(plan.id)} size={18} current={lead} />
          <span className="label">{plan.name}</span>
        </span>
        {lead ? <span className="arena-chip">Most popular</span> : null}
      </div>

      <div className="plan-board__price">
        <strong className="data">{offer ? offer.price : '$0'}</strong>
        <span className="mute">{offer ? periodLabel(offer.period) : 'free, no card'}</span>
      </div>

      {/* One row, on every card, so the meters below start on the same line
          across the board. What it says differs; that it is there does not. */}
      <p className="plan-board__charge">
        {offer
          ? <>
            {chargeLine(offer)}
            {offer.period !== 'monthly'
              ? <> <span className="plan-board__equiv">About ${monthlyEquivalent(offer).toFixed(0)} a month.</span></>
              : null}
          </>
          : 'No card, ever — and it never turns into a trial.'}
      </p>

      <p className="plan-board__tagline">{plan.tagline}</p>

      {/* The two things a plan actually changes, as data rather than prose.
          Everything else on the card is the same on every plan, which is the
          argument the page is making. */}
      <dl className="plan-board__meters">
        <div>
          <dt className="label">Voice reps</dt>
          <dd className="data">{repsLine(plan)}</dd>
        </div>
        <div>
          <dt className="label">Interviews</dt>
          {/* C2. What THIS offer grants, not what the plan grants on its best
              period: weekly Pro pays every seven days and grants none. */}
          <dd className="data">{interviewsLine(plan.id, offer?.period ?? period)}</dd>
        </div>
      </dl>

      <ul>
        {plan.features.map((feature) => (
          <li key={feature}><Check size={15} strokeWidth={1.75} aria-hidden="true" /> {feature}</li>
        ))}
      </ul>

      {/* Every card sends people to sign-up: the purchase happens inside the
          account, after the sign-up rep, because that is the rep the decision
          is actually made on. Only the lead card is volt (Arena). */}
      <Link
        href="/signup"
        className={`arena-button arena-button--${lead ? 'primary' : 'secondary'} arena-button--full`}
      >
        {plan.id === 'free'
          ? 'Start free'
          : (offer?.trialDays ?? 0) > 0 ? `Start ${TRIAL_DAYS} days free` : `Get ${plan.name}`}
      </Link>
    </article>
  )
}
