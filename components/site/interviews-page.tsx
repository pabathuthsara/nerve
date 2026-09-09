/**
 * /interviews — the paid-traffic destination for interview intent (D3).
 *
 * ── WHY IT IS A PAGE AND NOT A LINE ON THE LANDING PAGE ──────────────────
 *
 * The home page's hero is "Three minutes. One stranger. No script." and the
 * interview track appeared as section six of nine, headed "The second track",
 * with nothing about it in the nav. Somebody arriving on an interview-prep
 * intent had to scroll past the entire dating argument to find out we do it —
 * and interview prep is the easier US ad buy, the higher intent, and the one
 * that ends in a credit-pack purchase rather than a subscription
 * (`MARKETING-PLAN.md`). An ad and the page it lands on should describe the
 * same product.
 *
 * ── AND WHY IT SHARES COMPONENTS RATHER THAN RESTATING THEM ──────────────
 *
 * `InterviewTrack` and `ScoringLaw` are the landing page's own sections,
 * exported and rendered here. Two pages arguing the same product in two sets of
 * prose is how they come to disagree — the same failure `lib/site/plans.ts`
 * exists to prevent, reached through copy instead of through a price. What is
 * written fresh here is only what is genuinely different: the hero, the rounds,
 * and a close that names the free screener.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 *
 * It does not overstate the track. §9 of the interview plan is explicit that
 * the compliance dividend does not license that, and rule 12 binds this page
 * like every other: confidence training and interview rehearsal, never a
 * clinical or an employment claim. There is no "get hired", no success rate and
 * no testimonial — there are none, and §02 rule 12 means we do not write copy
 * we cannot stand behind.
 */

import Link from 'next/link'
import { Check } from 'lucide-react'
import { Mark } from '@/components/marks'
import { InterviewTrack, ScoringLaw } from './landing'
import { SiteSection, SITE_LINKS } from './site-chrome'
import {
  CREDIT_EXPIRY_NOTE, INTERVIEW_PACKS, PLAN_INTERVIEW_CREDITS,
  ROUND_COST_NOTE, SCREENER_NOTE, perCredit,
} from '@/lib/site/plans'
import { ROUND_SHAPE_LABEL, ROUND_TYPES } from '@/lib/data/interview-credits'

export function InterviewsPage() {
  return (
    <>
      <section className="page-hero page-hero--wide">
        <span className="label">Practice interviews</span>
        <h1 className="display-xl">A real interviewer.<br />Your CV.<br />A graded round.</h1>
        <p>
          Ten to twenty-five minutes, out loud, against someone who has read your CV and
          the job description and asks what you actually know rather than only what you
          did. It comes back graded on seven dimensions, with your own words quoted back
          at you — and, like everything here, you are scored on how you handled it and
          never on whether you got the job.
        </p>
        <div className="hero__actions">
          <Link href="/signup" className="arena-button arena-button--primary arena-button--lg">Start with a free round</Link>
          <Link href={SITE_LINKS.pricing} className="arena-button arena-button--secondary arena-button--lg">What it costs</Link>
        </div>
        <p className="hero__fine">Every account gets one free five-minute screen. No card.</p>
      </section>

      {/* The rounds, as data. Read from the authored table rather than listed
          again, so a round retimed or repriced moves this page with it. */}
      <SiteSection
        wide
        kicker="The rounds"
        title={<>Five formats,<br />and they are different interviews.</>}
        lede="A recruiter screen does not test fundamentals and a system design round does not touch your CV. Picking the wrong one is the fastest way to practise the wrong thing, so the shape is stated on every option rather than hidden behind a name."
      >
        <ul className="round-list">
            {ROUND_TYPES.map((round) => (
              <li key={round.id}>
                <div className="round-list__head">
                  <strong>{round.label}</strong>
                  <span className="data">{round.credits === 0 ? 'Free' : `${round.credits} credit${round.credits === 1 ? '' : 's'}`}</span>
                </div>
                <span className="label">{round.durationMs / 60_000} min · {ROUND_SHAPE_LABEL[round.shape]}</span>
                <p>{round.description}</p>
              </li>
            ))}
        </ul>
        <p className="site-aside">{ROUND_COST_NOTE}</p>
      </SiteSection>

      {/* The landing page's own sections. Shared, not restated. */}
      <InterviewTrack />
      <ScoringLaw />

      <SiteSection
        wide
        kicker="What it costs"
        title={<>Bought by the interview,<br />not by the month.</>}
        lede="Demand for this is episodic — you need four of them the week before an onsite and none for three months — so it is sold as credits rather than as a subscription. Pro and Elite include some each month if you want the habit instead."
      >
        <div className="pack-board">
          {INTERVIEW_PACKS.map((pack) => (
            <article key={pack.id} className="pack-board__card">
              <div className="pack-board__name"><span className="label">{pack.name}</span></div>
              <div className="pack-board__price">
                <strong className="data">{pack.price}</strong>
                <span className="mute">one-off</span>
              </div>
              <p className="pack-board__rate data">
                ${perCredit(pack).toFixed(2)} <span className="mute">per credit</span>
              </p>
              <p>{pack.tagline}</p>
              <p className="pack-board__keeps">{pack.credits} credit{pack.credits === 1 ? '' : 's'} · never expires</p>
            </article>
          ))}
        </div>
        <p className="site-aside">{CREDIT_EXPIRY_NOTE}</p>
        <p className="site-aside">
          {SCREENER_NOTE} Pro includes {PLAN_INTERVIEW_CREDITS.pro} interview credit a month
          and Elite {PLAN_INTERVIEW_CREDITS.elite}, on top of the daily voice reps —
          see <Link href={SITE_LINKS.pricing} className="volt-link">pricing</Link>.
        </p>
      </SiteSection>

      <SiteSection
        kicker="What it is not"
        title={<>It does not<br />feed you answers.</>}
        lede="Several tools in this category listen to the interview and write your reply on a second screen. This is the opposite of that, on purpose: the point is to be the person who can answer, in a room where nobody is helping."
      >
        <ul className="not-grid">
          <li>
            <Mark name="bound-clinical" size={22} />
            <div>
              <strong>Training, not coaching about you</strong>
              <p>Confidence and communication practice. Not therapy, not treatment, and not advice about your career.</p>
            </div>
          </li>
          <li>
            <Mark name="dim-signal" size={22} />
            <div>
              <strong>No promise about the job</strong>
              <p>Nobody can promise an outcome they do not control, so we do not. What is measured is how you handled the room.</p>
            </div>
          </li>
        </ul>
      </SiteSection>

      <section className="final-call">
        <span className="label">One free round</span>
        <h2 className="display-xl">Five minutes,<br />and it is the real thing.</h2>
        <p>
          The free screener is not a demo — same interviewer, same grading, five minutes
          instead of twenty. It is the shortest honest answer to &ldquo;is this any good&rdquo;.
        </p>
        <Link href="/signup" className="arena-button arena-button--primary arena-button--lg">Start training free</Link>
        <ul className="final-call__points">
          <li><Check size={14} strokeWidth={2} aria-hidden="true" /> A free five-minute interview with every account</li>
          <li><Check size={14} strokeWidth={2} aria-hidden="true" /> No card to start</li>
          <li><Check size={14} strokeWidth={2} aria-hidden="true" /> Recordings auto-delete after 30 days</li>
        </ul>
      </section>
    </>
  )
}
