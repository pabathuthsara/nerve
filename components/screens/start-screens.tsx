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
 * **No claim with a number in it.** The reframe screen is copy only. A
 * statistic about how many people avoid conversations is one clause away from
 * a prevalence claim, and rule 12 and terms clause 08 both draw that line.
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
import { ChevronLeft, Eye, EyeOff } from 'lucide-react'
import { signUpWithPassword, type AuthResult } from '@/app/auth/actions'
import { capture } from '@/components/analytics'
import { FluidPersona } from '@/components/fluid-persona'
import { Mark } from '@/components/marks'
import { Button, DateOfBirth, Input } from '@/components/ui'
import { FocusStep, NameStep, TrackStep } from './onboarding-questions'
import { RuleBlock } from './rep-format'
import { tap } from '@/lib/haptics'
import { MIN_AGE, checkAge } from '@/lib/safety/age'
import {
  EMPTY_START_ANSWERS,
  START_FIELD,
  START_STEPS,
  START_STORAGE_KEY,
  decodeStartAnswers,
  encodeStartAnswers,
  firstRepPreview,
  hasStartAnswers,
  startOpening,
  type StartAnswers,
  type StartStep,
} from '@/lib/data/start-funnel'
import type { Track } from '@/lib/data/types'

const EMPTY_RESULT: AuthResult = { ok: false, message: null }

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

/**
 * `track` arrives pre-answered from the pages that already asked.
 *
 * `/interviews` is a whole page about the interview track and its button used
 * to open a sign-up form; sending somebody from there to *"What are you
 * training for?"* would be asking a question they have just spent a page
 * answering. Those links carry `?track=interview` and the run opens on the
 * screen after it.
 *
 * The hook is skipped with it, deliberately: its job is to say what this is,
 * and a visitor arriving from one of those pages has just read a longer
 * version. No `start_answered` is raised for a step nobody was shown — the
 * funnel simply shows these sessions entering at `reframe`, which is true.
 */
export function StartScreen({ initialTrack = null }: { initialTrack?: Track | null }) {
  const opening = startOpening(EMPTY_START_ANSWERS, initialTrack)
  const [step, setStep] = useState(opening.index)
  const [answers, setAnswers] = useState<StartAnswers>(opening.answers)
  const shell = useRef<HTMLDivElement | null>(null)
  const entered = useRef(false)

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
   * in the product. The initial state above is `startOpening` over an empty
   * session, which is the same function with the half the server can answer.
   *
   * Session-scoped rather than local: these answers are worth keeping across a
   * reload and worth nothing next week, and `localStorage` would open the
   * funnel mid-way for somebody who came back a fortnight later having
   * forgotten they ever started.
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

  const goTo = useCallback((next: number) => {
    setStep(Math.min(Math.max(next, 0), START_STEPS.length - 1))
  }, [])

  const advance = useCallback((next: StartAnswers, from: number) => {
    tap()
    remember(next)
    goTo(from + 1)
  }, [goTo, remember])

  const stepName = START_STEPS[step] as StartStep

  /** Every screen, as it is reached. The property is the funnel (B7). */
  useEffect(() => {
    capture('start_step_viewed', { step: stepName, index: step })
  }, [step, stepName])

  /**
   * The same focus rule the signed-in run follows (§02's keyboard rule),
   * including the same exception: not on first render, because taking focus
   * from a page somebody has just landed on is not following them to the next
   * question.
   */
  useEffect(() => {
    if (!entered.current) { entered.current = true; return }
    shell.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }, [step])

  const answered = (step: StartStep, answer: string) => capture('start_answered', { step, answer })
  const firstRep = firstRepPreview(answers.focusArea)

  return (
    <main className="onboarding-page start-page">
      {stepName === 'hook' ? null : <StartProgress step={step} />}
      {step > 0
        ? <button type="button" className="onboarding-back" aria-label="Back to the previous screen" onClick={() => goTo(step - 1)}><ChevronLeft size={24} strokeWidth={1.5} /></button>
        : null}
      <div className="onboarding-shell" ref={shell}>
        <div className="onboarding-step" key={step}>
          {stepName === 'hook' ? <HookStep onStart={() => { tap(); goTo(1) }} /> : null}

          {stepName === 'track'
            ? <TrackStep
                value={answers.track}
                english={{
                  /**
                   * No row to stamp yet, so the ask is kept and written by
                   * `flushStartAnswers` once the account exists — the same
                   * `waitlist:track:english` flag `recordTrackWaitlist` sets,
                   * so the count stays one count.
                   */
                  record: async () => { answered('track', 'english'); remember({ ...answers, english: true }) },
                  counted: false,
                }}
                onChoose={(value) => { answered('track', value); advance({ ...answers, track: value }, step) }}
              />
            : null}

          {stepName === 'reframe' ? <ReframeStep track={answers.track} onNext={() => { tap(); goTo(step + 1) }} /> : null}

          {stepName === 'focus'
            ? <FocusStep
                value={answers.focusArea}
                firstRep={firstRep}
                track={answers.track}
                onChoose={(value) => { answered('focus', value); advance({ ...answers, focusArea: value }, step) }}
              />
            : null}

          {stepName === 'mechanism' ? <MechanismStep onNext={() => { tap(); goTo(step + 1) }} /> : null}

          {stepName === 'name'
            ? <NameStep
                value={answers.displayName}
                onSubmit={(value) => {
                  answered('name', value ? 'given' : 'skipped')
                  advance({ ...answers, displayName: value, named: true }, step)
                }}
              />
            : null}

          {stepName === 'build'
            ? <BuildStep answers={answers} firstRep={firstRep} onNext={() => { tap(); goTo(step + 1) }} />
            : null}

          {stepName === 'account' ? <AccountStep answers={answers} /> : null}
        </div>
      </div>
    </main>
  )
}

/**
 * The rail, over the seven screens after the hook.
 *
 * The hook is excluded for the reason the age gate is excluded from the
 * signed-in run's rail: it is not a step in a run, it is the screen that says
 * what the run is. A progress bar on it would be counting somebody's arrival.
 */
function StartProgress({ step }: { step: number }) {
  const steps = START_STEPS.slice(1)
  const index = step - 1
  return (
    <div className="onboarding-progress" role="group" aria-label={`Step ${index + 1} of ${steps.length}`}>
      {steps.map((name, position) => (
        <i
          key={name}
          className={position === index ? 'current' : position < index ? 'done' : ''}
          aria-current={position === index ? 'step' : undefined}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The three screens that are not questions
 * ------------------------------------------------------------------ */

/**
 * Screen one, and the only one a stranger judges the product on.
 *
 * It makes one claim and asks for nothing. The way out — *What is this?* — is
 * a real link to a real page, because a funnel with no exit is a funnel people
 * leave through the back button, and `/how-it-works` answers the question
 * better than a longer screen here would.
 */
function HookStep({ onStart }: { onStart: () => void }) {
  return (
    <section className="onboarding-question start-hook">
      <span className="label">Nerve</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>The conversation you keep not having.</h1>
      <p className="onboarding-sub">
        Three minutes, out loud, against someone who can lose interest and say no. You are scored on how you
        talked, never on whether it worked. Then one small thing to do in the real world.
      </p>
      <div className="start-actions">
        <Button size="lg" fullWidth onClick={onStart}>Start</Button>
        <p className="start-foot">
          <Link href="/how-it-works" className="volt-link">What is this?</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/login" className="volt-link">I have an account</Link>
        </p>
      </div>
    </section>
  )
}

/**
 * Screen three. The reframe, and it carries no statistic on purpose.
 *
 * The obvious version of this screen quotes a number about how many people
 * avoid conversations they want to have. Every such number is a prevalence
 * claim in one more clause, rule 12 forbids the clinical register outright,
 * and terms clause 08 is the page a compliance reviewer reads first. The
 * argument is better without one: nobody disputes that reading about a skill
 * is not the same as having done it.
 */
function ReframeStep({ track, onNext }: { track: string | null; onNext: () => void }) {
  const interview = track === 'interview'
  return (
    <section className="onboarding-question start-claim">
      <span className="label">Why this works</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>Reading about it doesn&apos;t transfer.</h1>
      <p className="onboarding-sub">
        {interview
          ? 'You can have every answer prepared and still lose the thread when somebody follows up on the one detail you skipped. The gap is not preparation. It is that you have never had to say it at speed, to a person who is deciding.'
          : 'You can know exactly what to say and still lose the thread four seconds in. The gap is not knowledge. It is that you have never done it under time, against someone who might not be interested.'}
      </p>
      <p className="onboarding-sub">The only thing that closes it is having done it. Out loud, with something at stake.</p>
      <div className="start-actions"><Button size="lg" fullWidth onClick={onNext}>Go on</Button></div>
    </section>
  )
}

/**
 * Screen five. What the product actually is, in three beats.
 *
 * The middle one is the whole differentiator and it is the one sentence worth
 * spending a screen on: §07 says outcome is worth zero, so a rep that ends in
 * rejection can score 92. Everything else in this category sells the result.
 *
 * The marks are the ones those three surfaces already use, at Ink-2 — never
 * `current`, because the primary button below is the screen's one volt.
 */
function MechanismStep({ onNext }: { onNext: () => void }) {
  const beats = [
    { mark: 'state-session', label: 'Rep', copy: 'Three minutes of voice against a character with her own mood. She can get bored, get distracted, and say no.' },
    { mark: 'state-chart', label: 'Score', copy: 'Six dimensions, on how you talked. Never on whether it worked.' },
    { mark: 'state-field', label: 'Field', copy: 'One small thing to do in the real world. You log what happened.' },
  ] as const
  return (
    <section className="onboarding-question start-claim">
      <span className="label">How it works</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>Inside, then outside.</h1>
      <ul className="start-beats">
        {beats.map((beat) => (
          <li key={beat.label}>
            <Mark name={beat.mark} size={22} />
            <div>
              <strong>{beat.label}</strong>
              <p>{beat.copy}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="start-actions"><Button size="lg" fullWidth onClick={onNext}>Set mine up</Button></div>
    </section>
  )
}

/**
 * Screen seven. Their answers, spent.
 *
 * Every question on this run is echoed here, which is the standard
 * `/onboarding/experience` failed: it asked how often somebody does this for
 * real, wrote a column nothing read, and was deleted. A question that only
 * raises commitment is still dead weight — so all three of these change what
 * is on this screen, and then change the product behind it.
 */
function BuildStep({ answers, firstRep, onNext }: {
  answers: StartAnswers
  firstRep: ReturnType<typeof firstRepPreview>
  onNext: () => void
}) {
  const focusLabel = FOCUS_LINE[answers.focusArea ?? 'opening']

  if (answers.track === 'interview') {
    return (
      <section className="brief-shell start-build">
        {/* Ink-2, not `current`. The signed-in ready step draws this mark in
            volt, and on that screen it is the only thing competing with the
            button; here the progress rail already holds the screen's one
            "you are here" and a third volt would make none of them mean it. */}
        <Mark name="kind-technique" size={44} />
        <h1 className="display-lg" tabIndex={-1} data-step-heading>Your first round.</h1>
        <p className="brief-hook">
          Five minutes with a recruiter, free on every account. You pick the role, the interviewer and the
          round after you are in — it takes about a minute.
        </p>
        <RuleBlock interview minutes={5} />
        <Button size="lg" fullWidth onClick={onNext}>{answers.displayName ? `Create your account, ${answers.displayName}` : 'Create your account'}</Button>
      </section>
    )
  }

  if (!firstRep) {
    return (
      <section className="brief-shell start-build">
        <h1 className="display-lg" tabIndex={-1} data-step-heading>You&apos;re set.</h1>
        <p className="brief-hook">Create your account and your first rep is waiting on the other side of it.</p>
        <Button size="lg" fullWidth onClick={onNext}>Create your account</Button>
      </section>
    )
  }

  return (
    <section className="brief-shell start-build">
      <FluidPersona name={firstRep.name} personaId={firstRep.id} warmth={18} size={112} />
      <span className="label">Your first rep</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>{firstRep.name}</h1>
      <p className="brief-hook">{firstRep.hook}</p>
      <div className="rule-block start-plan">
        <div><span>Where</span><strong>{firstRep.setting}</strong></div>
        <div><span>Time</span><strong>3:00</strong></div>
        <div><span>Watching for</span><strong>{focusLabel}</strong></div>
      </div>
      <p className="start-note">She doesn&apos;t know you&apos;re practising. She can lose interest.</p>
      <Button size="lg" fullWidth onClick={onNext}>{answers.displayName ? `Create your account, ${answers.displayName}` : 'Create your account'}</Button>
    </section>
  )
}

/**
 * The focus answer in the register the brief uses.
 *
 * Two words, present tense, and about the user rather than the character —
 * this row sits under `Where` and `Time`, and a sentence there would read as
 * an instruction at the moment §07 says instructions do the most damage.
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
 * Screen eight, and the only one that creates anything.
 *
 * One screen rather than `/signup`'s two. That form asks for email and
 * password, then the date on a second step, and the reasoning behind the split
 * (D2, in `auth-screens.tsx`) was that the date of birth is the most personal
 * thing this product asks and must not be the first thing a stranger meets.
 * Seven screens have happened by the time anybody reaches this one, so the
 * cost the split was paying for is already paid — and the run has spent its
 * attention budget: a second form after seven screens is the friction, not the
 * field count.
 *
 * §16.4 is unchanged and is the reason the date is here at all: `checkAge`
 * runs in this handler and again inside `signUpWithPassword` before
 * `auth.signUp`, so no account is ever created without a date on file.
 *
 * On success the Server Action redirects and this component is gone — see the
 * note on `start_account_submitted` in `lib/analytics/events.ts`. The
 * `state.ok` branch below is the other case, which only happens if email
 * confirmation is turned back on at the provider: no session, and an inbox to
 * go to. It is kept in step with `/signup` deliberately.
 */
function AccountStep({ answers }: { answers: StartAnswers }) {
  /**
   * E1's lesson, one screen earlier than E1 found it: the last control before
   * the microphone frames what is about to happen, so it names the thing they
   * actually chose. "Start the rep" in front of somebody who came for
   * interviews is the run forgetting them at the last possible moment.
   */
  const interview = answers.track === 'interview'
  const router = useRouter()
  const [state, action, busy] = useActionState(signUpWithPassword, EMPTY_RESULT)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [show, setShow] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { if (state.ok) router.push(`/verify-email?email=${encodeURIComponent(email)}`) }, [email, router, state.ok])
  useEffect(() => { if (state.message) capture('start_account_failed', { reason: 'server' }) }, [state.message])

  const zone = typeof Intl === 'undefined' ? '' : Intl.DateTimeFormat().resolvedOptions().timeZone
  const strength = password.length === 0
    ? 'Use at least 8 characters.'
    : password.length < 8 ? 'Keep going — 8 characters minimum.'
    : password.length < 12 ? 'Good enough. Longer is stronger.'
    : 'Strong.'

  const refuse = (reason: 'email' | 'password' | 'age', text: string) => {
    capture('start_account_failed', { reason })
    setMessage(text)
  }

  const error = message ?? state.message

  return (
    <section className="onboarding-question start-account">
      <span className="label">Last thing</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>Where do your scores go?</h1>
      <p className="onboarding-sub">
        One free voice rep and one free five-minute interview, on every account. No card.
      </p>
      <form
        className="auth-form"
        action={action}
        onSubmit={(event) => {
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
          const verdict = checkAge(dateOfBirth, new Date())
          if (!verdict.ok) {
            event.preventDefault()
            refuse('age', verdict.message)
            return
          }
          setMessage(null)
          capture('start_account_submitted', {
            track: answers.track ?? 'dating',
            focus: answers.focusArea ?? 'none',
            named: answers.named && !!answers.displayName,
          })
        }}
      >
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <input type="hidden" name="timezone" value={zone} readOnly />
        <input type="hidden" name={START_FIELD} value={encodeStartAnswers(answers)} readOnly />
        <Input label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input
          label="Password"
          name="password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={strength}
          adornment={
            <button type="button" className="field__eye" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((value) => !value)}>
              {show ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
            </button>
          }
        />
        <DateOfBirth label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} hint={`Nerve is ${MIN_AGE}+. The date is the only thing we keep.`} />
        <input type="hidden" name="date_of_birth" value={dateOfBirth} readOnly />
        <Button type="submit" size="lg" fullWidth loading={busy}>{interview ? 'Start the interview' : 'Start the rep'}</Button>
      </form>
      <p className="auth-fine">
        By continuing, you agree to the <Link href="/legal/terms">terms</Link> and <Link href="/legal/privacy">privacy policy</Link>.
      </p>
    </section>
  )
}
