/**
 * /how-it-works — the method (§11).
 *
 * The landing page argues. This one explains, in the order somebody actually
 * asks: what happens in the three minutes, what the number is made of, why the
 * number ignores the ending, who the characters are, what the outside half is,
 * and what carries across weeks.
 *
 * Two numbers are deliberately absent. The warmth value that arms a rep and the
 * one she has to still be at to offer are not published anywhere on the public
 * site: a user who knows the threshold is playing the meter rather than the
 * person, and the whole design of the wind-down (§05) is that the decision is
 * already made before you know it was being taken.
 */

import Link from 'next/link'
import { SiteSection, SITE_LINKS } from './site-chrome'
import { RANK_NAMES, RANK_BLURBS, RANKS } from '@/lib/data/rank'
import { REJECTION_MILESTONES } from '@/lib/field/milestones'
import { UNLOCK_REPS, UNLOCK_SCORE } from '@/lib/data/progression'

const TIMELINE = [
  { at: 'Before', title: 'Sixty words of brief', copy: 'Where you are, who she is, what she is in the middle of, and what would make this go badly. Then the brief goes away.' },
  { at: '0:00', title: 'You speak first', copy: 'Nothing prompts you and nothing rescues you. She is not waiting to be helpful — she has her own reason for being in the room and it is not you.' },
  { at: 'Anywhere', title: 'The room happens to both of you', copy: 'Her friend comes back. The train is announced. She gets a message. Recovering from an interruption you did not cause is most of what actually happens.' },
  { at: '2:30', title: 'She starts to wind down', copy: 'One direction, once, thirty seconds out — and what she does with the last half minute was decided by everything before it. You are not told which way it went.' },
  { at: '3:00', title: 'The clock stops, she finishes her sentence', copy: 'Cutting a character off mid-line to save twelve seconds would truncate the best moment in the product. The clock reads zero; she is simply finishing, the way people do.' },
  { at: 'After', title: 'The scorecard', copy: 'Composite, six dimensions, evidence quoted from your own lines, and the two dimensions to take into the next rep.' },
]

export function HowItWorks() {
  return (
    <>
      <section className="page-hero">
        <span className="label">The method</span>
        <h1 className="display-xl">A rep is three minutes<br />and it does not care<br />how it ends.</h1>
        <p>
          Everything below is a rule the product actually enforces, not a description of
          an intention. The format is fixed on purpose: a training set you can change the
          length of is a training set you will quietly make easier.
        </p>
      </section>

      <SiteSection kicker="Anatomy" title={<>What happens in<br />the three minutes.</>} wide>
        <ol className="timeline">
          {TIMELINE.map((step) => (
            <li key={step.at}>
              <span className="data timeline__at">{step.at}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="site-aside">
          She can also end it early. A character who has decided this is not worth having
          says one curt goodbye and goes, which is the outcome the simulator exists to make
          survivable.
        </p>
      </SiteSection>

      <SiteSection
        kicker="The number"
        title={<>Sixty per cent measured.<br />Forty per cent judged.</>}
        lede="The measured half is arithmetic on the transcript and cannot be argued with. The judged half runs at temperature zero against a fixed rubric and has to quote you to justify itself — if it cannot find the evidence, it returns nothing rather than inventing it."
      >
        <div className="split-grid">
          <div>
            <span className="label">Measured from the transcript</span>
            <ul className="tick-list">
              <li>How much of the three minutes was you talking</li>
              <li>How many of your questions were real ones rather than tags</li>
              <li>Whether you followed what she said or changed the subject</li>
              <li>How long you were willing to let a silence sit</li>
              <li>Whether the ending was warm or trailed off</li>
            </ul>
          </div>
          <div>
            <span className="label">Judged against the rubric</span>
            <ul className="tick-list">
              <li>Opening, curiosity, listening, signal reading, composure, close</li>
              <li>Each one quoting at most twelve words of yours</li>
              <li>One thing you did well, named before anything critical</li>
              <li>Nothing about whether it worked, at any point</li>
            </ul>
          </div>
        </div>
        <p className="site-aside">
          Transcription errors are never held against you. Speech recognition mangles
          words, and if her reply shows she understood you, you were understood.
        </p>
      </SiteSection>

      <SiteSection kicker="The law" title={<>Why the ending<br />is worth nothing.</>}>
        <p className="site-prose">
          Score the outcome and you teach the outcome. A user who is rewarded for a yes
          learns to push for one, and pushing is both the wrong skill and the thing that
          makes somebody else&rsquo;s evening worse. So the grader is told, in the rubric
          itself, that whether she gave a number or walked away contributes zero — and
          that if it finds itself rewarding a rep because it went well, to stop and score
          how it was played instead.
        </p>
        <p className="site-prose">
          The practical consequence is the one that matters: a clean rep that ends in
          rejection can score 92, and a sloppy one that got lucky scores 54. Tiers open on
          scores, not on wins, so there is nothing to be gained by chasing an ending.
        </p>
        <div className="rule-block">
          {[['Opens a tier', `Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps below it`], ['Opens nothing', 'Winning'], ['Costs you', 'Missing a clear no']].map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
      </SiteSection>

      <SiteSection
        kicker="The characters"
        title={<>They remember one line,<br />and it is not about you.</>}
        lede="A character carries at most one line from a previous encounter, and it has to be about the encounter or about her own situation — the book she could not find, where she was going. Never how you did, never whether she would like to see you again."
      >
        <div className="quote-pair">
          <div>
            <span className="label">Allowed</span>
            <p>&ldquo;Still looking for the blue one. Sister&rsquo;s birthday is Thursday.&rdquo;</p>
          </div>
          <div className="quote-pair--bad">
            <span className="label">Refused by the code</span>
            <p>&ldquo;I&rsquo;ve been hoping you&rsquo;d come back.&rdquo;</p>
          </div>
        </div>
        <p className="site-aside">
          The second one is not filtered out by a style note. It is rejected by a function
          that refuses rather than sanitises, because the failure it prevents is this
          becoming a companion app — and that is a boundary worth enforcing in code.
          You can clear every line every character is holding, in one tap, whenever you like.
        </p>
      </SiteSection>

      <SiteSection
        kicker="The field"
        title={<>The half that<br />happens outside.</>}
        lede="Four tiers of graded exposure, in order, because going too hard too early sensitises rather than habituates. Nothing at any tier depends on somebody saying yes."
        wide
      >
        <ol className="tier-grid">
          <li>
            <span className="label">Tier 1 · In the app</span>
            <strong>End a rep yourself.</strong>
            <p>No social risk at all. Day one work — hearing yourself do the thing once.</p>
          </li>
          <li>
            <span className="label">Tier 2 · Transactional</span>
            <strong>Ask a stranger for the time.</strong>
            <p>A person, a sentence, an answer. The point is the asking, not the information.</p>
          </li>
          <li>
            <span className="label">Tier 3 · Social</span>
            <strong>Compliment a choice, then leave.</strong>
            <p>Say your piece and go. If they are working, in headphones or alone at night, this is not the moment — walk on and find another one.</p>
          </li>
          <li>
            <span className="label">Tier 4 · The real thing</span>
            <strong>Take a no well.</strong>
            <p>Make an ask, and when it comes back no, say something warm and leave inside ten seconds. No bargaining, no joke to soften it, no second attempt.</p>
          </li>
        </ol>
        <p className="site-aside">
          Before each one you say how nervous you expect to be. Afterwards you say how
          nervous you were. The gap between those two lines, drawn over weeks, is the
          most useful chart in the product — and for almost everybody it closes.
        </p>
      </SiteSection>

      <SiteSection kicker="The count" title={<>You collect the refusals<br />on purpose.</>}>
        <ul className="milestone-list">
          {REJECTION_MILESTONES.map((milestone) => (
            <li key={milestone.at}>
              <span className="data">{milestone.at}</span>
              <div>
                <strong>{milestone.title}</strong>
                <p>{milestone.body}</p>
                <span className="mute">{milestone.note}</span>
              </div>
            </li>
          ))}
        </ul>
      </SiteSection>

      <SiteSection kicker="Standing" title={<>Four ranks, and none of them<br />are a badge shelf.</>}>
        <ol className="rank-list">
          {RANKS.map((rank) => (
            <li key={rank}>
              <strong className="display-md">{RANK_NAMES[rank]}</strong>
              <p>{RANK_BLURBS[rank]}</p>
            </li>
          ))}
        </ol>
        <p className="site-aside">
          On Sunday you get one letter: what moved, what did not, and the single thing to
          take into next week. It is written from your reps, not from a template.
        </p>
      </SiteSection>

      <section className="final-call">
        <span className="label">Ready</span>
        <h2 className="display-xl">Three minutes,<br />and then you know.</h2>
        <p>The first tier is nearly impossible to fail. That is deliberate, and it is stated in the brief, in those words.</p>
        <div className="hero__actions">
          <Link href="/signup" className="arena-button arena-button--primary arena-button--lg">Start training free</Link>
          <Link href={SITE_LINKS.pricing} className="arena-button arena-button--secondary arena-button--lg">See pricing</Link>
        </div>
      </section>
    </>
  )
}
