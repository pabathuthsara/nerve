'use client'

/**
 * `/start` — the run a stranger walks before there is an account.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────
 *
 * Forty-two people arrived from TikTok and Meta between 4 and 10 September
 * 2026 and not one of them created an account. The landing page's primary
 * action was **Start training free**, which opened a form asking for an email
 * address — the first thing said to somebody four seconds off a video, with
 * nothing yet at stake and nothing yet given.
 *
 * This is the same three questions the signed-in run asks, in front of the
 * form instead of behind it, with three screens between them that say what the
 * product is. Nothing is spent by walking it: no session, no database read, no
 * voice, no cost. The account is created on the last screen and the answers
 * ride into it on a hidden field (`lib/data/start-funnel.ts` owns the shape and
 * `signUpWithPassword` owns the write).
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *
 * **No rep before the account.** It was asked for and it is the one thing here
 * that cannot be built: every route that spends money goes through `maySpend`,
 * which is keyed to a user id (rule 11), and §16.4 requires a date of birth
 * before anybody talks to a character. An anonymous rep endpoint would be an
 * uncapped voice spend with no owner *and* a dating conversation with an
 * unverified age — the second of which is what §14's merchant-of-record
 * problem is actually about.
 *
 * **No paywall.** Every comparable funnel puts one at the end of onboarding.
 * Ours would be selling at the moment of lowest earned belief: the free rep is
 * the demonstration, it costs about eight cents, and the first purchase
 * decision belongs after the first scorecard.
 *
 * **No claim with a number in it.** Every screen that argues is copy only. A
 * statistic about how many people avoid conversations is one clause away from
 * a prevalence claim, and rule 12 and terms clause 08 both draw that line.
 * (The screens this rule was written for — `reframe`, cut on 18 September,
 * and `mechanism`, cut on 27 September — are both gone; the rule outlives
 * them and binds anything added later.)
 *
 * ── ONE MORE THING, ABOUT THE BUILD SCREEN ───────────────────────────────
 *
 * It reveals; it does not pretend to compute. The genre convention is an
 * animated "building your plan" — and there is nothing being built here, so a
 * progress bar over a local lookup would be theatre on the screen that has to
 * be believed. The rows are already known and they arrive staggered, which is
 * presentation. §02's objection is to a spinner standing in for work; there is
 * no work, so there is no spinner.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Crosshair, Eye, EyeOff, MapPin, Timer } from 'lucide-react'
import { signUpWithPassword, type AuthResult } from '@/app/auth/actions'
import { capture, countStartStep } from '@/components/analytics'
import { metaTrack } from '@/components/meta-pixel'
import { tiktokTrack } from '@/components/tiktok-pixel'
import { FluidPersona } from '@/components/fluid-persona'
import { Mark } from '@/components/marks'
import { Button, Input } from '@/components/ui'
import { FocusStep, NameStep, RoleStep, TrackStep } from './onboarding-questions'
import { GoogleButton } from './google-button'
import { RuleBlock, repGoal } from './rep-format'
import { tap } from '@/lib/haptics'
import { MIN_AGE, checkAge } from '@/lib/safety/age'
import { SIGNUP_REVIEW } from '@/lib/site/reviews'
import { CAPTURED_REP } from '@/lib/site/captured-rep'
import { PERSONA_VISUAL } from '@/lib/personas/visual'
import {
  EMPTY_START_ANSWERS,
  START_FIELD,
  birthDateFromYear,
  START_STORAGE_KEY,
  decodeStartAnswers,
  encodeStartAnswers,
  firstRepPreview,
  hasStartAnswers,
  startAdvance,
  startOpening,
  startRail,
  startSteps,
  type StartAnswers,
  type StartStep,
} from '@/lib/data/start-funnel'
import type { Track } from '@/lib/data/types'
import type { UsageProof } from '@/lib/db/founding'

const EMPTY_RESULT: AuthResult = { ok: false, message: null }

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

/**
 * `initialTrack` is the `?track=` the link carried — every social post says
 * `?track=dating`, `/interviews` says `interview`. It does two things since
 * 27 September (START-AUDIT §1.3): the hook speaks for that track alone, and
 * the track question is skipped on the way forward (`startAdvance`), because
 * a question the link already answered is a screen somebody can leave from.
 *
 * `begun` is the hook's button arriving as a plain navigation — see
 * `HookStep` for why that path exists at all.
 */
export function StartScreen({ initialTrack = null, begun = false, continueHref = '/start?s=1', proof = null }: {
  initialTrack?: Track | null
  begun?: boolean
  continueHref?: string
  proof?: UsageProof | null
}) {
  const trackGiven = initialTrack !== null
  const opening = startOpening(EMPTY_START_ANSWERS, initialTrack, begun)
  const [step, setStep] = useState(opening.index)
  const [answers, setAnswers] = useState<StartAnswers>(opening.answers)
  const shell = useRef<HTMLDivElement | null>(null)
  const entered = useRef(false)
  /**
   * Which way the run is moving, so a screen slides in from the side it came
   * from — forward from the right, back from the left. It is the difference
   * between a stack of pages and a place you are moving through.
   */
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  /** One pending advance at a time, so a double tap cannot skip a screen. */
  const leaving = useRef(false)

  /** Write on every change, best-effort. Nothing here may break the run. */
  const remember = useCallback((next: StartAnswers) => {
    setAnswers(next)
    try {
      window.sessionStorage.setItem(START_STORAGE_KEY, encodeStartAnswers(next))
    } catch {
      // A private window, or storage the browser refuses. The run works
      // without it; only the reload does not.
    }
  }, [])

  /**
   * The resume, and why it happens in an effect rather than in `useState`.
   *
   * `sessionStorage` does not exist on the server, so reading it while
   * initialising state would render one tree on the server and a different one
   * in the browser. The cost is that a returning visitor sees the first screen
   * for a frame; the alternative is a hydration mismatch on the coldest page
   * in the product.
   *
   * Session-scoped rather than local: these answers are worth keeping across a
   * reload and worth nothing next week.
   */
  useEffect(() => {
    let stored = EMPTY_START_ANSWERS
    try {
      stored = decodeStartAnswers(window.sessionStorage.getItem(START_STORAGE_KEY))
    } catch {
      // See above.
    }
    if (!hasStartAnswers(stored)) return
    const resumed = startOpening(stored, initialTrack)
    // A `?track=` that overruled the stored one has to be written back, or the
    // next reload reads the old answer and undoes it.
    if (resumed.answers !== stored) remember(resumed.answers)
    else setAnswers(stored)
    setStep(resumed.index)
  }, [initialTrack, remember])

  /**
   * The steps for the track as it stands — two lists of the same length that
   * differ at one index (`startSteps`). The index is the state, so changing
   * the track answer with the back arrow swaps question two under somebody
   * rather than moving them.
   */
  const steps = startSteps(answers.track)

  const goTo = useCallback((next: number) => {
    setDir(next < step ? 'back' : 'fwd')
    setStep(Math.min(Math.max(next, 0), steps.length - 1))
  }, [steps.length, step])

  /** Forward, through the one skip the run allows. */
  const forward = useCallback((from: number, track: Track | null) => {
    leaving.current = false
    setDir('fwd')
    setStep(startAdvance(startSteps(track), from, trackGiven))
  }, [trackGiven])

  const advance = useCallback((next: StartAnswers, from: number) => {
    tap()
    remember(next)
    forward(from, next.track)
  }, [forward, remember])

  /**
   * A tapped answer, held for a beat before the run moves on.
   *
   * Advancing on the same frame as the tap meant the selected state was
   * never seen — the card lit up on a screen that was already leaving. A
   * quarter of a second is long enough to register "that one" and short
   * enough not to read as waiting. Reduced motion moves at once.
   */
  const choose = useCallback((next: StartAnswers, from: number) => {
    if (leaving.current) return
    leaving.current = true
    tap()
    remember(next)
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => forward(from, next.track), still ? 0 : 260)
  }, [forward, remember])

  const stepName = steps[step] as StartStep

  /**
   * Every screen, as it is reached, counted twice on purpose: `capture` is
   * PostHog (the vendor dashboard, unkeyed until somebody sets the key) and
   * `countStartStep` is the first-party beacon `/admin` reads today.
   */
  useEffect(() => {
    capture('start_step_viewed', { step: stepName, index: step })
    countStartStep(stepName)
  }, [step, stepName])

  /**
   * The same focus rule the signed-in run follows (§02's keyboard rule),
   * including the same exception: not on first render.
   */
  useEffect(() => {
    if (!entered.current) { entered.current = true; return }
    shell.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true })
    // A phone keeps the scroll position of the screen before, which on a
    // long account screen can open the next one halfway down.
    window.scrollTo({ top: 0 })
  }, [step])

  const answered = (step: StartStep, answer: string) => capture('start_answered', { step, answer })
  const firstRep = firstRepPreview(answers.focusArea)

  // The rail skips the track question only while the run is not ON it — the
  // back arrow can still reach it, and a rail with no "you are here" would be
  // the one screen in the run that did not know where it was.
  const rail = startRail(steps, trackGiven && stepName !== 'track')

  return (
    <main className="onboarding-page start-page" data-step={stepName}>
      {stepName === 'hook' ? null : <StartProgress current={stepName} rail={rail} />}
      {step > 0
        ? <button type="button" className="onboarding-back" aria-label="Back to the previous screen" onClick={() => goTo(step - 1)}><ChevronLeft size={24} strokeWidth={1.5} /></button>
        : null}
      <div className="onboarding-shell" ref={shell}>
        <div className="onboarding-step" key={step} data-dir={dir}>
          {stepName === 'hook'
            ? <HookStep track={initialTrack} href={continueHref} proof={proof} onStart={() => { tap(); forward(step, answers.track) }} />
            : null}

          {stepName === 'track'
            ? <TrackStep
                eyebrow="To start"
                value={answers.track}
                onChoose={(value) => { answered('track', value); choose({ ...answers, track: value }, step) }}
              />
            : null}

          {stepName === 'focus'
            ? <FocusStep
                eyebrow="Your focus"
                value={answers.focusArea}
                firstRep={firstRep}
                onChoose={(value) => { answered('focus', value); choose({ ...answers, focusArea: value }, step) }}
              />
            : null}

          {/* The interview arm's question two. One field decides whether the
              account lands on its free screener or on a setup wizard — see
              `startInterviewSetup`. */}
          {stepName === 'role'
            ? <RoleStep
                eyebrow="Your role"
                roleTitle={answers.roleTitle}
                company={answers.company}
                onSubmit={(value) => {
                  answered('role', value.roleTitle ? 'given' : 'skipped')
                  advance({ ...answers, ...value, roleAsked: true }, step)
                }}
              />
            : null}

          {stepName === 'name'
            ? <NameStep
                eyebrow="Nearly there"
                value={answers.displayName}
                track={answers.track}
                onSubmit={(value) => {
                  answered('name', value ? 'given' : 'skipped')
                  advance({ ...answers, displayName: value, named: true }, step)
                }}
              />
            : null}

          {stepName === 'build'
            ? <BuildStep answers={answers} firstRep={firstRep} onNext={() => { tap(); forward(step, answers.track) }} />
            : null}

          {stepName === 'account'
            ? <AccountStep answers={answers} onYear={(birthYear) => remember({ ...answers, birthYear })} />
            : null}
        </div>
      </div>
    </main>
  )
}

/**
 * The rail, over the screens after the hook.
 *
 * The hook is excluded: it is not a step in a run, it is the screen that says
 * what the run is. The count is derived from the list rather than written
 * down, so adding or cutting a screen can never leave a number lying.
 */
function StartProgress({ current, rail }: { current: StartStep; rail: readonly StartStep[] }) {
  const index = rail.indexOf(current)
  return (
    <div className="onboarding-progress" role="group" aria-label={`Step ${index + 1} of ${rail.length}`}>
      {rail.map((name, position) => (
        <i
          key={name}
          className={position === index ? 'current' : position < index ? 'done' : ''}
          aria-current={position === index ? 'step' : undefined}
        />
      ))}
      <span className="onboarding-progress__count" aria-hidden="true">{index + 1} of {rail.length}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The two screens that are not questions
 * ------------------------------------------------------------------ */

/**
 * What the hook says, per room (START-AUDIT §1.3).
 *
 * Nearly all of this page's traffic arrives under a short video about ONE of
 * the two products, and the hook used to pitch both — "a stranger you want
 * to talk to, or an interviewer you want to impress" — so the first two
 * seconds were spent reconciling the ad with the page. A link that names the
 * track now gets a hook about that track. A bare `/start` keeps the sentence
 * that is true of both.
 */
const HOOK_COPY: Record<'dating' | 'interview' | 'both', { head: string; sub: string; free: string }> = {
  dating: {
    head: 'The conversation you keep not having.',
    sub: 'Three minutes, out loud, with an AI character who can walk away. Scored on how you handled it — never on whether it worked.',
    free: 'Free · no card · your first rep is included',
  },
  interview: {
    head: 'The interview you keep rehearsing in your head.',
    sub: 'Five minutes, out loud, with an interviewer who follows up on what you skip. Scored on how you answered — never on whether you got the job.',
    free: 'Free · no card · a five-minute screener is included',
  },
  both: {
    head: 'The conversation you keep not having.',
    sub: 'Out loud, under time, to someone who is deciding — a stranger or an interviewer. Scored on how you talked, never on whether it worked.',
    free: 'Free · no card · your first rep is included',
  },
}

/**
 * Screen one, and the only one a stranger judges the product on.
 *
 * ── THE BUTTON IS A LINK, AND THAT IS THE FIX (START-AUDIT §1.1) ─────────
 *
 * It was an `onClick` on a `<button>`, and this page is server-rendered: the
 * button was on screen at ~0.4s and did nothing until the JavaScript had
 * arrived and hydrated, ~1.9s on a fast phone and ~2.9s on a throttled one.
 * A tap in that window was not queued, it was LOST — three of three on a
 * throttled Pixel profile — and the visitor this page is for is exactly the
 * one who taps first: a mid-range Android, in an in-app browser, thumb
 * already moving because the video said "link in bio".
 *
 * So it is an `<a href="?s=1">`. Hydrated, the click is intercepted and the
 * run advances in place exactly as before. Not hydrated, it is an ordinary
 * navigation to a page that opens on the next screen (`startOpening`'s
 * `begun`), and the tap that would have been swallowed is the tap that
 * moves them. The query string is carried, so `?track=` and the UTMs survive
 * the reload.
 */
function HookStep({ track, href, proof, onStart }: {
  track: Track | null
  href: string
  proof: UsageProof | null
  onStart: () => void
}) {
  const copy = HOOK_COPY[track === 'dating' || track === 'interview' ? track : 'both']
  const quote = track === 'interview' ? null : SIGNUP_REVIEW
  const interview = track === 'interview'
  return (
    <section className="onboarding-question start-hook">
      {/*
        THE FIRST SCREEN, REBUILT (owner review, 27 Sep).

        It was a paragraph of claims between two bands of empty black: no
        picture of the product, nothing that moved but the words, and the one
        exit most people do not need sitting beside the one they do. Now it
        opens on the product itself — the first four lines of a real rep,
        captured, arriving the way they arrived — and the claim follows the
        evidence instead of standing in for it. Sign-in moved to the corner
        where people look for it.
      */}
      <div className="start-top">
        <span className="start-wordmark" aria-label="Nerve">Nerve</span>
        <Link href="/login" className="start-top__login">Log in</Link>
      </div>
      {interview ? <span className="label start-hook__kicker">Interview practice</span> : <RepPreview />}
      <h1 className="display-lg start-hook__head" tabIndex={-1} data-step-heading>
        {copy.head.split(' ').flatMap((word, index) => [
          index > 0 ? ' ' : null,
          <span key={`${word}-${index}`} className="start-word" style={{ ['--w' as string]: index }}>{word}</span>,
        ])}
      </h1>
      <p className="onboarding-sub">{copy.sub}</p>
      <div className="start-actions">
        <a
          href={href}
          className="arena-button arena-button--primary arena-button--lg arena-button--full start-hook__go"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
            event.preventDefault()
            onStart()
          }}
        >
          <span className="arena-button__content">Set mine up — 30 seconds</span>
        </a>
        <p className="start-foot">{copy.free}</p>
      </div>
      {quote ? (
        <figure className="start-voice">
          <blockquote>{quote.quote}</blockquote>
          <figcaption>
            {quote.name}
            {proof && proof.people > 0 ? <> · <span>one of {proof.people.toLocaleString('en-GB')} people training</span></> : null}
          </figcaption>
        </figure>
      ) : proof && proof.reps > 0 ? (
        <p className="start-count"><strong>{proof.reps.toLocaleString('en-GB')}</strong> reps run · <strong>{proof.people.toLocaleString('en-GB')}</strong> people training</p>
      ) : null}
      <nav className="start-exits" aria-label="More about Nerve">
        <Link href="/how-it-works">What is this?</Link>
      </nav>
    </section>
  )
}

/**
 * The product, before the claim about it: the opening of a real rep.
 *
 * Her lines come from `CAPTURED_REP`, which reads the recorded manifest and
 * cannot be edited here (rule 10). They arrive in the order and roughly the
 * rhythm they were said, with a typing beat before each of hers, and then the
 * card stays still. Pure CSS: it is on the page before the JavaScript is, so
 * the first thing a cold phone paints is the product rather than a gap
 * waiting to hydrate. No numbers are drawn — the recording has no meter
 * readings, and a warmth figure invented for decoration would be a claim.
 */
function RepPreview() {
  const rep = CAPTURED_REP
  const colours = PERSONA_VISUAL[rep.personaId]
  return (
    <figure
      className="rep-preview"
      aria-label={`The opening of a real rep with ${rep.name}`}
      style={colours ? { ['--orb-core' as string]: colours.core, ['--orb-deep' as string]: colours.deep, ['--orb-sheen' as string]: colours.sheen } : undefined}
    >
      <figcaption className="rep-preview__head">
        <span className="rep-preview__orb" aria-hidden="true"><i /><i /><b>{rep.name.charAt(0)}</b></span>
        <span className="rep-preview__who">
          <strong>{rep.name}</strong>
          <span className="label">{rep.setting} · a real rep</span>
        </span>
        <span className="rep-preview__rec label" aria-hidden="true"><i />Rec</span>
      </figcaption>
      <ol className="rep-preview__lines">
        {rep.lines.map((line, index) => (
          <li key={index} className={`rep-line rep-line--${line.who}`} style={{ ['--i' as string]: index }}>
            <span className="label rep-line__who">{line.who === 'you' ? 'You' : rep.name}</span>
            <span className="rep-line__bubble">
              {line.who === 'her' ? <span className="rep-line__typing" aria-hidden="true"><i /><i /><i /></span> : null}
              <span className="rep-line__text">{line.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}

/**
 * Screen three. Their answers, spent — and since 27 September the only
 * screen on the run that is not a question.
 *
 * Every question on this run is echoed here, which is the standard
 * `/onboarding/experience` failed: it asked something, wrote a column nothing
 * read, and was deleted.
 */
function BuildStep({ answers, firstRep, onNext }: {
  answers: StartAnswers
  firstRep: ReturnType<typeof firstRepPreview>
  onNext: () => void
}) {
  /**
   * The upper-funnel signal. At ~15% of clicks this is dense enough for a
   * conversion campaign to learn from, where `CompleteRegistration` at 3% is
   * a handful of events a week. Same moment, both ad platforms.
   */
  useEffect(() => { metaTrack('Lead'); tiktokTrack('ViewContent', { content_name: answers.track ?? 'dating' }) }, [answers.track])

  const focusLabel = answers.focusArea ? FOCUS_LINE[answers.focusArea] : null

  if (answers.track === 'interview') {
    return (
      <section className="brief-shell start-build">
        <Mark name="kind-technique" size={44} />
        <span className="label">Your first round</span>
        <h1 className="display-lg" tabIndex={-1} data-step-heading>The screener.</h1>
        <p className="brief-hook">
          {answers.roleTitle
            ? `Five minutes with a recruiter, on ${answers.roleTitle}${answers.company ? ` at ${answers.company}` : ''}. Free on every account — no card.`
            : 'Five minutes with a recruiter, free on every account. No card. Name the role next and the questions get sharper.'}
        </p>
        <p className="brief-goal">{repGoal(true, 5)}</p>
        <RuleBlock interview minutes={5} />
        <p className="start-note">Afterwards: a score on how you answered — seven dimensions, never on whether you got the job.</p>
        <Button size="lg" fullWidth onClick={onNext}>Continue</Button>
      </section>
    )
  }

  if (!firstRep) {
    return (
      <section className="brief-shell start-build">
        <h1 className="display-lg" tabIndex={-1} data-step-heading>You&apos;re set.</h1>
        <p className="brief-hook">Your first rep is waiting a few screens from here.</p>
        <Button size="lg" fullWidth onClick={onNext}>Continue</Button>
      </section>
    )
  }

  /*
   * THE REVEAL, WITH A HIERARCHY (owner review, 27 Sep).
   *
   * Every line on this screen was the same size and weight — a 112px orb, a
   * small label, a small name, a grey paragraph, a hairline table and another
   * grey paragraph — so the one screen where the product becomes a person read
   * like a form. Now it has four clear levels: her (a larger orb and her name
   * at full display size), her world (the hook, in Ink, at reading size), the
   * facts (two tiles you can take in at a glance), and the rules (one line,
   * set apart). The button is the only thing in volt.
   */
  return (
    <section className="start-build start-reveal">
      <div className="start-build__persona"><FluidPersona name={firstRep.name} personaId={firstRep.id} warmth={18} size={168} /></div>
      <span className="label start-reveal__kicker">Your first rep</span>
      <h1 className="display-xl start-reveal__name" tabIndex={-1} data-step-heading>{firstRep.name}</h1>
      <p className="start-reveal__hook">{firstRep.hook}</p>
      <div className="start-reveal__facts">
        <div className="start-reveal__fact start-reveal__fact--wide">
          <MapPin size={16} strokeWidth={1.6} aria-hidden="true" />
          <span className="label">Where</span>
          <strong>{firstRep.setting}</strong>
        </div>
        <div className="start-reveal__fact">
          <Timer size={16} strokeWidth={1.6} aria-hidden="true" />
          <span className="label">Time</span>
          <strong className="data">3:00</strong>
        </div>
        {focusLabel ? (
          <div className="start-reveal__fact start-reveal__fact--full">
            <Crosshair size={16} strokeWidth={1.6} aria-hidden="true" />
            <span className="label">Watching for</span>
            <strong>{focusLabel}</strong>
          </div>
        ) : null}
      </div>
      <p className="start-reveal__rule">She doesn&apos;t know you&apos;re practising, and she can lose interest.</p>
      <p className="start-reveal__after">Afterwards: a score on how you talked, and one small thing to try for real.</p>
      <Button size="lg" fullWidth onClick={onNext}>Continue</Button>
    </section>
  )
}

/**
 * The focus answer in the register the brief uses.
 */
const FOCUS_LINE: Record<string, string> = {
  opening: 'How you open',
  sustaining: 'How you keep it going',
  flirting: 'How you show interest',
  rejection: 'How you take a no',
}

/* ------------------------------------------------------------------ *
 * The account
 * ------------------------------------------------------------------ */

/**
 * Four digits and a real verdict, or a sentence saying what is wrong.
 *
 * The four-digit guard is load-bearing rather than defensive:
 * `birthDateFromYear` pads, so a half-typed `19` becomes `0019-12-31`, which
 * is a well-formed date `checkAge` would then report as "not a real date" —
 * the screen manufacturing a verdict out of an unfinished field.
 */
function yearProblem(text: string): string | null {
  if (!/^\d{4}$/.test(text)) return 'Enter the year you were born, all four digits.'
  const verdict = checkAge(birthDateFromYear(Number(text)), new Date())
  return verdict.ok ? null : verdict.message
}

/**
 * The last screen, and the only one that creates anything.
 *
 * ── THE YEAR IS HERE NOW (START-AUDIT §1.2) ──────────────────────────────
 *
 * It was screen two, and the first per-step read of this run put the drop
 * there. It is the first field of this screen, ABOVE both doors, so §16.4 is
 * held exactly as it was: neither door proceeds without a year that passes
 * `checkAge`, the password door checks it again in `signUpWithPassword`
 * before `auth.signUp`, and the Google door carries it in the answers it
 * posts, where `signInWithGoogle` checks it before the redirect — and now
 * refuses a `/start` post that has no year at all.
 *
 * ── GOOGLE IS THE PRIMARY DOOR ON THIS SCREEN ────────────────────────────
 *
 * With the year above both doors, Google is two taps where the email form
 * is two fields and a password rule. The screen's one volt goes to the
 * shorter path; the email form is the alternative and says so.
 */
function AccountStep({ answers, onYear }: { answers: StartAnswers; onYear: (year: number | null) => void }) {
  const interview = answers.track === 'interview'
  const firstRep = firstRepPreview(answers.focusArea)
  const router = useRouter()
  const [state, action, busy] = useActionState(signUpWithPassword, EMPTY_RESULT)
  const [year, setYear] = useState(answers.birthYear ? String(answers.birthYear) : '')
  const [yearError, setYearError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const yearField = useRef<HTMLInputElement | null>(null)
  const emailField = useRef<HTMLInputElement | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  // A server refusal (an address that already has an account, say) must be
  // readable, so the form is open whenever there is something to say in it.
  const withEmail = emailOpen || !!state.message
  const openEmail = () => {
    setEmailOpen(true)
    capture('start_answered', { step: 'account', answer: 'email_opened' })
    window.requestAnimationFrame(() => emailField.current?.focus())
  }

  useEffect(() => { if (state.ok) router.push(`/verify-email?email=${encodeURIComponent(email)}`) }, [email, router, state.ok])
  useEffect(() => { if (state.message) capture('start_account_failed', { reason: 'server' }) }, [state.message])

  const zone = typeof Intl === 'undefined' ? '' : Intl.DateTimeFormat().resolvedOptions().timeZone
  const validYear = /^\d{4}$/.test(year) ? Number(year) : null
  // A year that passes the gate: the field shows it, and the button below it
  // brightens once — the screen saying "that is all we needed".
  const yearReady = validYear !== null && yearProblem(year) === null
  const dateOfBirth = birthDateFromYear(validYear)

  /** Both doors ask this first. A refusal lands on the field, not in a banner. */
  const yearOk = (): boolean => {
    const problem = yearProblem(year)
    if (problem) {
      setYearError(problem)
      capture('start_account_failed', { reason: 'age' })
      yearField.current?.focus()
      return false
    }
    setYearError(null)
    return true
  }

  const onYearChange = (raw: string) => {
    const next = raw.replace(/[^0-9]/g, '').slice(0, 4)
    setYear(next)
    if (yearError) setYearError(null)
    const parsed = /^\d{4}$/.test(next) ? Number(next) : null
    if (parsed !== answers.birthYear) onYear(parsed)
  }

  const refuse = (reason: 'email' | 'password', text: string) => {
    capture('start_account_failed', { reason })
    setMessage(text)
  }

  const conversion = () => {
    metaTrack('CompleteRegistration', { content_name: answers.track ?? 'dating' })
    tiktokTrack('CompleteRegistration', { content_name: answers.track ?? 'dating' })
  }

  const error = message ?? state.message

  return (
    <section className="onboarding-question start-account" data-ready={yearReady}>
      {/*
        SIX THINGS, NOT TWELVE (27 Sep, owner's call).

        This screen carried an eyebrow, a heading, a sub-line, the year and
        its hint, Google, a divider, two fields and their hint, a second
        button, a reassurance line, a tester quote and the terms — about a
        thousand pixels at phone width, so the last decision a stranger makes
        began with a scroll. Now: who is waiting, one line of reassurance, one
        number, one button, a way to use email instead, and the terms.

        The quote moved to the hook, where people actually leave. The eyebrow
        went because the rail already says "5 of 5". The two reassurances
        merged into the one line under the heading.
      */}
      <h1 className="display-lg" tabIndex={-1} data-step-heading>
        {interview ? 'Your interviewer is ready.' : firstRep ? `${firstRep.name} is ready.` : 'You\u2019re set.'}
      </h1>
      <p className="onboarding-sub">Free, no card. Recordings delete after 30 days.</p>

      <div className="start-account__age">
        <Input
          ref={yearField}
          label={`Year of birth · ${MIN_AGE}+`}
          name="birth_year"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="bday-year"
          enterKeyHint="done"
          maxLength={4}
          placeholder="2001"
          value={year}
          error={yearError ?? undefined}
          adornment={yearReady ? <span className="start-age-ok" aria-hidden="true"><Check size={16} strokeWidth={2} /></span> : undefined}
          onChange={(event) => onYearChange(event.target.value)}
          onBlur={() => { if (year.length === 4) { const problem = yearProblem(year); if (problem) setYearError(problem) } }}
        />
      </div>

      <GoogleButton
        answers={encodeStartAnswers({ ...answers, birthYear: validYear })}
        first
        primary
        divider={false}
        beforeSubmit={() => {
          if (!yearOk()) return false
          conversion()
          capture('start_account_submitted', { track: answers.track ?? 'dating', door: 'google' })
          return true
        }}
      />

      {/*
        The email door, one tap away rather than three fields in the way.
        Everybody saw two fields, a password rule and a second button they
        were not going to use; most people who have Google take it. Opened, it
        is the same form as before — same checks, same hidden answers, same
        server action — and it opens itself if the server has something to
        say about an address, so an error is never hidden behind the link.
      */}
      {!withEmail ? (
        <button type="button" className="start-email-toggle" onClick={openEmail}>Use email instead</button>
      ) : (
        <form
          className="auth-form start-email"
          action={action}
          onSubmit={(event) => {
            if (!yearOk()) { event.preventDefault(); return }
            if (!email.trim().includes('@')) {
              event.preventDefault()
              refuse('email', 'That does not look like an email address.')
              return
            }
            if (password.length < 8) {
              event.preventDefault()
              refuse('password', 'A password needs at least 8 characters.')
              return
            }
            setMessage(null)
            conversion()
            capture('start_account_submitted', {
              track: answers.track ?? 'dating',
              door: 'email',
              focus: answers.focusArea ?? 'none',
              role: answers.roleTitle ? 'given' : answers.roleAsked ? 'skipped' : 'none',
              named: answers.named && !!answers.displayName,
            })
          }}
        >
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <input type="hidden" name="timezone" value={zone} readOnly />
          <input type="hidden" name={START_FIELD} value={encodeStartAnswers({ ...answers, birthYear: validYear })} readOnly />
          <input type="hidden" name="date_of_birth" value={dateOfBirth} readOnly />
          <Input ref={emailField} label="Email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input
            label="Password · 8+ characters"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            enterKeyHint="go"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            adornment={
              <button type="button" className="field__eye" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((value) => !value)}>
                {show ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
              </button>
            }
          />
          <Button type="submit" variant="secondary" size="lg" fullWidth loading={busy}>{interview ? 'Start the interview' : 'Start the rep'}</Button>
        </form>
      )}

      <p className="auth-fine">
        By continuing, you agree to the <Link href="/legal/terms">terms</Link> and <Link href="/legal/privacy">privacy policy</Link>.
      </p>
    </section>
  )
}
