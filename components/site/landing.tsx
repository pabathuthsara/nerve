/**
 * The landing page (§11).
 *
 * The order is an argument, not a layout. It opens with what a rep is, because
 * the thing being sold is a format rather than a feature; it shows one being
 * played before it claims anything; it states the scoring law immediately after,
 * because "you are not scored on whether it worked" is the sentence that
 * separates this from the category; and it puts "what Nerve is not" above the
 * price, because the four things it is not are the four reasons somebody is
 * hesitating.
 *
 * Nothing here quotes a user count, a success rate or a testimonial. There are
 * none, and §02 rule 12 means we do not write copy we cannot stand behind. The
 * only claims made are rules the code enforces.
 */

import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { Mark, dimensionMark } from '@/components/marks'
import { RepReplay } from './rep-replay'
import { LoopDiagram } from './figures'
import { SiteSection, SITE_LINKS } from './site-chrome'
import { PRESENTATION } from '@/lib/personas/presentation'
import { PERSONA_VISUAL } from '@/lib/personas/visual'
import { LEVEL_NAMES } from '@/lib/data/progression'
import { PUBLIC_PLANS, TRIAL_DAYS, repsLine } from '@/lib/site/plans'
import type { CSSProperties } from 'react'

/** The shipped roster, in rung order, with the tier name the app uses. */
const ROSTER = [
  { slug: 'tess', tier: 1 as const, name: 'Tess' },
  { slug: 'nadia', tier: 2 as const, name: 'Nadia' },
  { slug: 'maya', tier: 3 as const, name: 'Maya' },
  { slug: 'robin', tier: 4 as const, name: 'Robin' },
]

/**
 * How many of them there are, spelled out, for the headline above the cards.
 *
 * Counted rather than written, because it was written and it was wrong: the
 * section said "Three people" over four cards from the commit that introduced
 * the page, since Robin was in the array from the first version. It is the one
 * place on the public site where the copy and the product contradicted each
 * other on the same screen with no scrolling. A headline that counts the array
 * it sits above cannot drift from it again when the fifth rung ships.
 */
const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'] as const
const ROSTER_COUNT = COUNT_WORDS[ROSTER.length] ?? String(ROSTER.length)

/** The six §07 dimensions, in the rubric's own words, shortened for a card. */
/**
 * The six, in §07's order (V7).
 *
 * The copy was two full sentences each — 180 words in a grid nobody reads
 * standing up — and the long form belongs on `/how-it-works`, which is the
 * page for somebody who has decided to find out. Here each one gets its mark
 * and the shortest true sentence, so the grid is scannable in three seconds
 * and the section's argument survives.
 */
const DIMENSIONS = [
  { key: 'opening', name: 'Opening', copy: 'Did you start it at all.' },
  { key: 'curiosity', name: 'Curiosity', copy: 'Did you go past her first answer.' },
  { key: 'listening', name: 'Listening', copy: 'Did you use what she gave you.' },
  { key: 'signalReading', name: 'Signal reading', copy: 'Did you read her, and adjust.' },
  { key: 'composure', name: 'Composure', copy: 'Did you stay steady when it wobbled.' },
  { key: 'close', name: 'Close', copy: 'Did you leave well, including on a no.' },
]

/**
 * The four boundaries (V9).
 *
 * Four paragraphs behind four identical `Minus` glyphs, which said "here is a
 * list" and nothing about which item you were looking at. Each now carries its
 * own mark — three struck through because they are things this product refuses
 * to be, and a shield on the fourth because PG-13 is a bound we hold rather
 * than an absence. The copy is one sentence each; the full position is on
 * `/legal/safety`, which is linked directly beneath.
 */
const NOT = [
  { mark: 'bound-script' as const, title: 'Not a reply generator', copy: 'We never write your lines. Doing the frightening part on your behalf builds nothing.' },
  { mark: 'bound-companion' as const, title: 'Not a companion app', copy: 'Characters are equipment. They do not miss you, and every session has a hard time limit.' },
  { mark: 'bound-clinical' as const, title: 'Not therapy', copy: 'No clinical claims anywhere in the product. Practice alongside a clinician, never instead of one.' },
  { mark: 'bound-adult' as const, title: 'Not adult content', copy: 'Bounded at PG-13. Characters decline rather than play along, and the bound is not ours to waive.' },
]

const FAQ = [
  {
    q: 'Do I have to actually speak out loud?',
    a: 'For a voice rep, yes — that is the entire exercise, and it is the part no amount of reading fixes. There is also a text mode running the same characters with no microphone and no quota, for the evenings when speaking is not on. It cannot produce the ending a voice rep can, on purpose.',
  },
  {
    q: 'Is my voice recorded?',
    a: 'Session audio is stored in a private bucket that only your account can read, and it is deleted automatically thirty days after the rep. Transcripts and scores stay, because that is what progress is made of. Ask us and the audio goes sooner.',
  },
  {
    q: 'Do the characters remember me?',
    a: 'One line each, and only about the encounter — the book she could not find, where she was going. Never about how you did and never about wanting to see you again. You can clear every line in one tap.',
  },
  {
    q: 'What happens when I run out of reps?',
    a: 'The field challenge is still there and still free, on every plan, forever, and so are text mode, your log and your history. Running out of voice minutes never breaks a streak, because a paywall that is also a churn event is a badly designed paywall.',
  },
  {
    q: 'Will this work if dating is not the point for me?',
    a: 'Dating is the sharpest wedge and it is where the roster starts, but the skill underneath — starting a conversation, reading whether it is welcome, leaving well — is the same one interviews and hard conversations at work need. Those tracks run on the same engine and are not open yet.',
  },
  {
    q: 'Can I use this to get better at pressuring someone?',
    a: 'No. Nothing in the challenge library asks you to persist past a refusal, and the scorecard rewards reading a no correctly and leaving warmly. A rep where you push scores worse, not better.',
  },
]

export function Landing() {
  return (
    <>
      <Hero />
      <ScoringLaw />
      <Loop />
      <Roster />
      <TextMode />
      <NotThis />
      <PricingTeaser />
      <Questions />
      <FinalCall />
    </>
  )
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero__copy">
        <span className="label">Conversation gym</span>
        <h1 className="display-xl hero__head">Three minutes.<br />One stranger.<br />No script.</h1>
        <p className="hero__body">
          A rep is a timed conversation, out loud, with someone who can lose interest,
          get distracted and say no. You are scored on how you talked — never on
          whether it worked. A clean rep that ends in rejection can score 92.
        </p>
        <div className="rule-block hero__rules">
          {[['Length', '3:00, every time'], ['Ends', 'When the clock does'], ['Scored on', 'How you played']].map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
        <div className="hero__actions">
          <Link href="/signup" className="arena-button arena-button--primary arena-button--lg">Start training free</Link>
          <Link href={SITE_LINKS.howItWorks} className="arena-button arena-button--secondary arena-button--lg">How it works</Link>
        </div>
        <p className="hero__fine">Sign-up includes a voice rep. No card.</p>
      </div>
      <div className="hero__demo">
        <RepReplay />
      </div>
    </section>
  )
}

/**
 * The rep the hero used to show, moved to where it argues best.
 *
 * The hero's job is "this sounds like a person". This one's job is "and here
 * is what we actually measure" — and the sharpest way to make §07 concrete is
 * a rep that ends in her leaving and scores 87 anyway. Static: it is a
 * document, not a demonstration, so it costs no JavaScript.
 */
function ScorecardArtifact() {
  const subs = [
    { label: 'Opening', value: 84 },
    { label: 'Curiosity', value: 79 },
    { label: 'Listening', value: 91 },
    { label: 'Signal reading', value: 93 },
    { label: 'Composure', value: 82 },
    { label: 'Close', value: 95 },
  ]
  return (
    <figure className="scorecard">
      <div className="scorecard__head">
        <div>
          <span className="label">Maya · Tier 3 · She left</span>
          <p>Warmth finished at 58 and she was never armed. None of that is in the number.</p>
        </div>
        <div className="scorecard__composite">
          <span className="label">Composite</span>
          <strong className="data">87</strong>
        </div>
      </div>
      <ul className="scorecard__subs">
        {subs.map((sub) => (
          <li key={sub.label}>
            <span className="label">{sub.label}</span>
            <span className="scorecard__bar" role="presentation"><i style={{ width: `${sub.value}%` }} /></span>
            <span className="data">{sub.value}</span>
          </li>
        ))}
      </ul>
      <figcaption>
        <span className="label">Went well</span>
        You gave her something she could use and then left before she had to end it.
        <em>&ldquo;Then I&rsquo;ll leave you to it&rdquo;</em>
      </figcaption>
    </figure>
  )
}

function ScoringLaw() {
  return (
    <SiteSection
      kicker="The scorecard"
      title={<>Outcome is never<br />part of the score.</>}
      lede="Six dimensions, every rep, each one quoting your own words back at you. Whether she gave you a number, agreed to anything, or walked away contributes exactly zero. A sloppy rep that got lucky scores 54."
      wide
    >
      <ScorecardArtifact />
      <ul className="dimension-grid">
        {DIMENSIONS.map((dimension) => (
          <li key={dimension.name}>
            <Mark name={dimensionMark(dimension.key) ?? 'kind-technique'} size={22} />
            <strong>{dimension.name}</strong>
            <p>{dimension.copy}</p>
          </li>
        ))}
      </ul>
    </SiteSection>
  )
}

function Loop() {
  const steps = [
    {
      kicker: 'One',
      title: 'Run the rep',
      copy: 'Three minutes, real time, real interruptions. She has her own reason for being there and it is not you.',
    },
    {
      kicker: 'Two',
      title: 'Read the scorecard',
      copy: 'Six dimensions, the two you were weakest on, and one thing you did well — named first, quoting you.',
    },
    {
      kicker: 'Three',
      title: 'Do one small thing outside',
      copy: 'A challenge graded to where you are. Nothing at any tier depends on somebody saying yes.',
    },
    {
      kicker: 'Four',
      title: 'Log what happened',
      copy: 'How nervous you expected to be, then how nervous you were. The gap is the chart everything builds toward.',
    },
  ]
  return (
    <SiteSection
      id="loop"
      kicker="The loop"
      title={<>Practise inside.<br />Spend it outside.</>}
      lede="The simulator is where you can afford to be bad at this. The point of being good at it is out there, so every rep hands you something small to do in the real world and asks you to log what actually happened."
      wide
    >
      {/* V8. The list said there were four steps; only the diagram says the
          fourth one leads back to the first, which is the entire argument the
          section is making. */}
      <div className="loop-layout">
        <LoopDiagram steps={steps} />
        <ol className="loop-grid">
          {steps.map((step, index) => (
            <li key={step.kicker}>
              <span className="data loop-grid__index">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="display-md">{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="site-aside">
        Every challenge is written by hand and reviewed before it ships, against one
        test: the worst realistic outcome is a polite no.
      </p>
    </SiteSection>
  )
}

function Roster() {
  return (
    <SiteSection
      kicker="The roster"
      title={<>{ROSTER_COUNT} people who<br />are not helping you.</>}
      lede="Each one holds a rung. They are not difficulty settings with the same script — they want different things, they run out of patience differently, and the top rung takes the warmth number off your screen so you have to read a person instead of a meter."
      wide
    >
      <ul className="roster-grid">
        {ROSTER.map((character) => {
          const presentation = PRESENTATION[character.slug]
          const visual = PERSONA_VISUAL[character.slug]
          if (!presentation || !visual) return null
          return (
            <li key={character.slug} className="roster-card">
              <div
                className="roster-card__orb"
                style={{ '--orb-deep': visual.deep, '--orb-core': visual.core, '--orb-sheen': visual.sheen } as CSSProperties}
                aria-hidden="true"
              />
              <div className="roster-card__head">
                <span className="label">Tier {character.tier} · {LEVEL_NAMES[character.tier]}</span>
                <h3 className="display-md">{character.name}</h3>
                <span className="mute">{presentation.setting}</span>
              </div>
              <p className="roster-card__blurb">{presentation.blurb}</p>
              {/* V10. `a · b · c` in a definition list read as one grey
                  string; the two lists say opposite things and now look it. */}
              <dl className="roster-card__dials">
                <div>
                  <dt className="label">Responds to</dt>
                  <dd>{presentation.respondsTo.map((item) => <span key={item} className="dial-chip dial-chip--yes">{item}</span>)}</dd>
                </div>
                <div>
                  <dt className="label">Shuts down on</dt>
                  <dd>{presentation.shutsDownOn.map((item) => <span key={item} className="dial-chip">{item}</span>)}</dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>
      <p className="site-aside">
        A tier opens when you score 70 or better in two reps at the tier below it.
        Not when you win two — winning is not a thing you can grind, and it is not
        the thing being measured.
      </p>
    </SiteSection>
  )
}

/**
 * Text mode, sold honestly.
 *
 * It is a real shipped feature and it earns a section — but it is the
 * secondary mode and the copy has to say so, or the product reads as a
 * messaging app with a microphone bolted on. The cap below `ARM_THRESHOLD` is
 * the load-bearing detail: text can never produce the ending a voice rep can,
 * by construction rather than by policy.
 */
function TextMode() {
  return (
    <SiteSection
      kicker="The other mode"
      title={<>For the evenings when<br />speaking is not on.</>}
      lede="Text mode runs the same characters with no microphone and no quota. It exists because a limit that breaks your streak is a limit that makes people quit, and some nights the answer to “can you talk out loud right now” is no."
    >
      <div className="thread-demo">
        <p className="thread-demo__bubble thread-demo__bubble--her">Still no luck with the present, if you were wondering.</p>
        <p className="thread-demo__bubble thread-demo__bubble--you">Did you try the embarrassing shelf?</p>
        <p className="thread-demo__bubble thread-demo__bubble--her">I did. I bought two. One is for me.</p>
      </div>
      <p className="site-aside">
        Deliberately the lesser thing: warmth in text is capped below the point a rep
        can be won, so it cannot produce the ending a voice rep can. That is enforced
        in code, not in a note.
      </p>
    </SiteSection>
  )
}

function NotThis() {
  return (
    <SiteSection
      kicker="Boundaries"
      title={<>What this is not.</>}
      lede="Four of these, and all four are load-bearing. They decide what gets built as much as they decide what gets said."
    >
      <ul className="not-grid">
        {NOT.map((item) => (
          <li key={item.title}>
            <Mark name={item.mark} size={22} />
            <div>
              <strong>{item.title}</strong>
              <p>{item.copy}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="site-aside">
        Read the whole position on <Link href={SITE_LINKS.safety} className="volt-link">safety and scope</Link> — including
        what happens if a session goes somewhere that is no longer training.
      </p>
    </SiteSection>
  )
}

function PricingTeaser() {
  return (
    <SiteSection
      kicker="Pricing"
      title={<>Start free.<br />Stay free if it suits you.</>}
      lede="Field work, text mode, your log and your streak are unlimited on every plan, including the free one, forever. What you pay for is voice minutes against a live character — the only part of this that costs anything to run."
      wide
    >
      <ul className="teaser-grid">
        {PUBLIC_PLANS.map((plan) => (
          <li key={plan.id}>
            <div className="teaser-grid__head">
              <span className="label">{plan.name}</span>
              <strong className="data">{plan.price ?? '$0'}</strong>
              <span className="mute">{plan.price ? 'per month' : 'no card, ever'}</span>
            </div>
            <span className="data teaser-grid__reps">{repsLine(plan)}</span>
            <p>{plan.tagline}</p>
            {plan.id === 'free' ? null : <span className="arena-chip">{TRIAL_DAYS} days free</span>}
          </li>
        ))}
      </ul>
      <Link href={SITE_LINKS.pricing} className="site-more">Everything in each plan <ArrowRight size={15} strokeWidth={1.75} /></Link>
    </SiteSection>
  )
}

function Questions() {
  return (
    <SiteSection kicker="Questions" title={<>The ones worth<br />asking first.</>}>
      <div className="faq">
        {FAQ.map((entry) => (
          <details key={entry.q}>
            <summary>
              <span>{entry.q}</span>
              <i aria-hidden="true" />
            </summary>
            <p>{entry.a}</p>
          </details>
        ))}
      </div>
    </SiteSection>
  )
}

function FinalCall() {
  return (
    <section className="final-call">
      <span className="label">One rep</span>
      <h2 className="display-xl">The first one is<br />three minutes away.</h2>
      <p>
        You will probably be bad at it. That is the entire reason the simulator exists,
        and it is the last time being bad at it costs you nothing.
      </p>
      <Link href="/signup" className="arena-button arena-button--primary arena-button--lg">Start training free</Link>
      <ul className="final-call__points">
        <li><Check size={14} strokeWidth={2} aria-hidden="true" /> A voice rep included with sign-up</li>
        <li><Check size={14} strokeWidth={2} aria-hidden="true" /> No card to start, and none to stay free</li>
        <li><Check size={14} strokeWidth={2} aria-hidden="true" /> Recordings auto-delete after 30 days</li>
      </ul>
    </section>
  )
}
