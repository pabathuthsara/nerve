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
 * (The screen this rule was written for — `reframe` — was cut on 18 September;
 * the rule outlives it and binds `mechanism` and anything added later.)
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
import { capture, countStartStep } from '@/components/analytics'
import { metaTrack } from '@/components/meta-pixel'
import { FluidPersona } from '@/components/fluid-persona'
import { Mark } from '@/components/marks'
import { Button, Input } from '@/components/ui'
import { FocusStep, NameStep, RoleStep, TrackStep } from './onboarding-questions'
import { GoogleButton } from './google-button'
import { RuleBlock, repGoal } from './rep-format'
import { tap } from '@/lib/haptics'
import { MIN_AGE, checkAge } from '@/lib/safety/age'
import { SIGNUP_REVIEW } from '@/lib/site/reviews'
import {
  EMPTY_START_ANSWERS,
  START_FIELD,
  birthDateFromYear,
  START_STORAGE_KEY,
  decodeStartAnswers,
  encodeStartAnswers,
  firstRepPreview,
  hasStartAnswers,
  startOpening,
  startSteps,
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
 * version. **The track question is no longer skipped with it** — §16.4 sits
 * at screen two now and the gate is the one screen a run may never jump, so
 * these sessions open on `age` and then meet the track question with their
 * answer already selected. No `start_answered` is raised for a step nobody
 * was shown; the funnel shows them entering at `age`, which is true.
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

  /**
   * The steps for the track as it stands — two lists of the same length that
   * differ at one index (`startSteps`). The index is the state, so changing
   * the track answer with the back arrow swaps question two under somebody
   * rather than moving them.
   */
  const steps = startSteps(answers.track)

  const goTo = useCallback((next: number) => {
    setStep(Math.min(Math.max(next, 0), steps.length - 1))
  }, [steps.length])

  const advance = useCallback((next: StartAnswers, from: number) => {
    tap()
    remember(next)
    goTo(from + 1)
  }, [goTo, remember])

  const stepName = steps[step] as StartStep

  /**
   * Every screen, as it is reached, counted twice on purpose.
   *
   * `capture` is PostHog, which answers the vendor dashboard and is unkeyed
   * until somebody sets the key. `countStartStep` is the first-party beacon,
   * which answers `/admin` and works today. They are not redundant: the whole
   * reason D21 could not be argued about is that the only instrument for it
   * was the one nobody had turned on.
   */
  useEffect(() => {
    capture('start_step_viewed', { step: stepName, index: step })
    countStartStep(stepName)
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
      {stepName === 'hook' ? null : <StartProgress step={step} steps={steps} />}
      {step > 0
        ? <button type="button" className="onboarding-back" aria-label="Back to the previous screen" onClick={() => goTo(step - 1)}><ChevronLeft size={24} strokeWidth={1.5} /></button>
        : null}
      <div className="onboarding-shell" ref={shell}>
        <div className="onboarding-step" key={step}>
          {stepName === 'hook' ? <HookStep onStart={() => { tap(); goTo(1) }} /> : null}

          {/* Screen two, and the §16.4 gate. Asked here rather than in the
              form because a birthday at the point of purchase reads as a data
              grab and the same birthday on screen two reads as care — and
              because the Google door cannot ask for one at all. */}
          {stepName === 'age'
            ? <AgeStep
                value={answers.birthYear}
                onSubmit={(value) => { answered('age', 'given'); advance({ ...answers, birthYear: value }, step) }}
              />
            : null}

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

          {stepName === 'focus'
            ? <FocusStep
                value={answers.focusArea}
                firstRep={firstRep}
                onChoose={(value) => { answered('focus', value); advance({ ...answers, focusArea: value }, step) }}
              />
            : null}

          {/* The interview arm's question two. One field decides whether the
              account lands on its free screener or on a setup wizard — see
              `startInterviewSetup`. */}
          {stepName === 'role'
            ? <RoleStep
                roleTitle={answers.roleTitle}
                company={answers.company}
                onSubmit={(value) => {
                  answered('role', value.roleTitle ? 'given' : 'skipped')
                  advance({ ...answers, ...value, roleAsked: true }, step)
                }}
              />
            : null}

          {stepName === 'mechanism' ? <MechanismStep track={answers.track} onNext={() => { tap(); goTo(step + 1) }} /> : null}

          {stepName === 'name'
            ? <NameStep
                value={answers.displayName}
                track={answers.track}
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
function StartProgress({ step, steps: all }: { step: number; steps: readonly string[] }) {
  const steps = all.slice(1)
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
      {/*
        §3.4. Dots say "there are more"; they do not say "there are two more",
        and a stranger cannot tell one third from one tenth. The count is
        derived from the list rather than written down, so adding or cutting a
        screen can never leave a number lying — which is exactly what the
        hand-written "seven screens" in three docstrings did.

        `aria-hidden` because the group above already carries the same fact as
        its label, and a screen reader announcing it twice is worse than not
        at all.
      */}
      <span className="onboarding-progress__count" aria-hidden="true">{index + 1} of {steps.length}</span>
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
      {/* ── THE FIRST SCREEN BELONGS TO BOTH TRACKS ──────────────────────
          It described one product: three minutes, someone who can lose
          interest, and a thing to do in the real world. The next screen then
          offered job interviews as an equal option, and somebody who picked it
          had been sold a dating app one tap earlier. What is true of both is
          the part worth leading with anyway — you say it out loud, under time,
          to somebody who is deciding — so the claim got shorter and truer
          rather than longer. The two rooms are named in the second sentence,
          in the order the question below asks them. */}
      <p className="onboarding-sub">
        Out loud, under time, to someone who is deciding — a stranger you want to talk to, or an
        interviewer you want to impress. You are scored on how you talked, never on whether it worked.
      </p>
      <div className="start-actions">
        {/* §2.4. `Start` promised nothing and named no cost. The duration is
            measured against the seven screens that follow, not asserted — if
            a screen is added, re-time it or change the number. */}
        <Button size="lg" fullWidth onClick={onStart}>Set mine up — 40 seconds</Button>
        {/* The word `free` used to appear for the first time on screen eight,
            under the form. It is the single most persuasive word available and
            it belongs on the screen people decide to leave from. */}
        <p className="start-foot">Free · no card · your first rep is included</p>
        <p className="start-foot start-foot--quiet">
          <Link href="/how-it-works" className="volt-link">What is this?</Link>
        </p>
        {/* Demoted to its own line at Ink-3: an exit for a fraction of a
            percent of this page's traffic does not get the same weight as the
            explanation link, and it used to sit beside it. */}
        <p className="start-foot start-foot--exit">
          <Link href="/login">I have an account</Link>
        </p>
      </div>
    </section>
  )
}

/**
 * Screen two, and the §16.4 gate (SIGNUP-FIXES §2.2).
 *
 * ── WHY A YEAR AND NOT A DATE ────────────────────────────────────────────
 *
 * `/signup` asks for a full date on a three-wheel control, and that is right
 * there: it is the last screen before an account and the person has already
 * decided. Here it is the second thing that happens to a stranger who arrived
 * four seconds ago, and three interactions for an answer that needs one is
 * exactly the friction this run exists to remove.
 *
 * The gate itself does not change. `birthDateFromYear` turns the year into
 * the `YYYY-MM-DD` `checkAge` has always taken — **31 December**, so a year
 * is read as the youngest that year could be and the gate errs toward
 * refusing somebody a few months early rather than admitting a seventeen-year
 * old for eleven of them. `checkAge` runs here, again in the account form,
 * and again on the server before `auth.signUp`.
 *
 * ── AND WHY IT IS WORTH A WHOLE SCREEN ───────────────────────────────────
 *
 * The sub-line is the only sentence in the entire run that shows the safety
 * position §16 spent months building. Buried in a form field it reads as a
 * data grab; given its own screen with a reason attached it reads as the
 * product being careful, which is the thing this audience is least expecting.
 *
 * The refusal is `checkAge`'s own sentence, including the final one. A
 * verdict is not retried here any more than it is at `/onboarding/age` — but
 * nothing is recorded either, because there is no account and no row, and
 * refusing to let somebody correct a mistyped year would turn a slip into a
 * closed door.
 */
function AgeStep({ value, onSubmit }: { value: number | null; onSubmit: (year: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '')
  const [message, setMessage] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()

    /**
     * Four digits before `checkAge` sees it, and this guard is load-bearing
     * rather than defensive.
     *
     * `birthDateFromYear` pads, so a half-typed `19` becomes `0019-12-31` and
     * an empty field becomes `0000-12-31`. Both are well-formed ISO strings,
     * so `checkAge` gets past its regex and into `Date.UTC`, which maps years
     * 0–99 onto 1900–1999 — the roll-over check then fires and the screen
     * told somebody who had typed two digits so far that their birthday "is
     * not a real date".
     *
     * `checkAge` is right to answer that; the string it was handed really is
     * not a date anybody was born on. The screen is what was wrong: it must
     * not manufacture a date out of an unfinished field and then report the
     * result as a verdict about a person.
     */
    if (!/^\d{4}$/.test(text)) {
      setMessage('Enter the year you were born, all four digits.')
      capture('start_account_failed', { reason: 'age' })
      return
    }

    const verdict = checkAge(birthDateFromYear(Number(text)), new Date())
    if (!verdict.ok) {
      setMessage(verdict.message)
      capture('start_account_failed', { reason: 'age' })
      return
    }
    setMessage(null)
    onSubmit(Number(text))
  }

  return (
    <section className="onboarding-question start-age">
      <span className="label">First</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>How old are you?</h1>
      <p className="onboarding-sub">
        Nerve is {MIN_AGE}+. The year is the only part we keep, and it is why we can promise the
        characters stay PG-13.
      </p>
      <form className="auth-form start-age__form" onSubmit={submit}>
        {message ? <div className="form-error" role="alert">{message}</div> : null}
        <Input
          label="Year of birth"
          inputMode="numeric"
          autoComplete="bday-year"
          maxLength={4}
          placeholder="2001"
          value={text}
          onChange={(event) => setText(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
        />
        <Button type="submit" size="lg" fullWidth>Continue</Button>
      </form>
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
function MechanismStep({ track, onNext }: { track: string | null; onNext: () => void }) {
  const interview = track === 'interview'
  /**
   * Three beats per arm, and the middle one is the same claim in both rooms
   * because it is the differentiator (§07): a rep that ends in rejection can
   * score 92, and an interview that ends with no offer is graded on how it was
   * answered. Everything else in this category sells the result.
   *
   * The third beat is where the two products genuinely differ. Dating has the
   * field challenge — the thing you go and do outside. An interview has no
   * outside step and inventing one would be a promise with nothing behind it,
   * so the interview arm's third beat is the ladder of rounds, which is what
   * that track actually has and what the credits are for.
   */
  const beats = interview
    ? ([
        { mark: 'kind-technique', label: 'Round', copy: 'A real round with a real interviewer — five minutes to twenty-five. She follows up on what you skipped.' },
        { mark: 'state-chart', label: 'Score', copy: 'Seven dimensions, on how you answered. Never on whether you got the job.' },
        { mark: 'state-session', label: 'Again', copy: 'Screener, technical, final. Same role, harder room, and a trend you can read.' },
      ] as const)
    : ([
        { mark: 'state-session', label: 'Rep', copy: 'Three minutes of voice against a character with her own mood. She can get bored, get distracted, and say no.' },
        { mark: 'state-chart', label: 'Score', copy: 'Six dimensions, on how you talked. Never on whether it worked.' },
        { mark: 'state-field', label: 'Field', copy: 'One small thing to do in the real world. You log what happened.' },
      ] as const)
  return (
    <section className="onboarding-question start-claim">
      <span className="label">How it works</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>
        {interview ? 'A room, not a quiz.' : 'Inside, then outside.'}
      </h1>
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
  /**
   * The upper-funnel signal (§1.2, and §5.3 is why it matters more than the
   * registration one right now). At ~15% of clicks this is dense enough for
   * a conversion campaign to actually learn from, where
   * `CompleteRegistration` at 3% of 126 clicks is four events and the
   * optimiser never exits its learning phase.
   *
   * On mount rather than on the button, because reaching this screen is the
   * interest signal; pressing its button is most of the way to the other
   * event.
   */
  useEffect(() => { metaTrack('Lead') }, [])

  /**
   * The focus answer has not been given yet on this screen since §3.1 moved
   * it ahead of the question — so the row is dropped rather than defaulted.
   * Printing "How you open" for somebody who has chosen nothing would be the
   * demo screen inventing an answer on the one screen whose whole job is to
   * be believed.
   */
  const focusLabel = answers.focusArea ? FOCUS_LINE[answers.focusArea] : null

  if (answers.track === 'interview') {
    return (
      <section className="brief-shell start-build">
        {/* Ink-2, not `current`. The signed-in ready step draws this mark in
            volt, and on that screen it is the only thing competing with the
            button; here the progress rail already holds the screen's one
            "you are here" and a third volt would make none of them mean it. */}
        <Mark name="kind-technique" size={44} />
        <h1 className="display-lg" tabIndex={-1} data-step-heading>Your first round.</h1>
        {/* THEIR ANSWER, SPENT — the same standard the dating build screen is
            held to. The role they typed one screen ago is what the interviewer
            is briefed on, so it is named here rather than being collected and
            not mentioned again until a wizard two screens into the account. */}
        <p className="brief-hook">
          {answers.roleTitle
            ? `Five minutes with a recruiter, on ${answers.roleTitle}${answers.company ? ` at ${answers.company}` : ''}. Free on every account — no card.`
            : 'Five minutes with a recruiter, free on every account. No card. You can name the role any time; the questions get sharper when you do.'}
        </p>
        <p className="brief-goal">{repGoal(true, 5)}</p>
        <RuleBlock interview minutes={5} />
        {/* What actually happens next, said before the form rather than
            discovered after it. Two of these three are the steps between the
            account and the microphone. */}
        <div className="rule-block start-plan">
          <div><span>Next</span><strong>Your CV, then a mic check</strong></div>
          <div><span>Then</span><strong>Who is in the room</strong></div>
        </div>
        {/* Not the last screen any more (§3.1), so it no longer promises an
            account. The account CTA lives on the screen that creates one. */}
        <Button size="lg" fullWidth onClick={onNext}>Go on</Button>
      </section>
    )
  }

  if (!firstRep) {
    return (
      <section className="brief-shell start-build">
        <h1 className="display-lg" tabIndex={-1} data-step-heading>You&apos;re set.</h1>
        <p className="brief-hook">Your first rep is waiting a few screens from here.</p>
        <Button size="lg" fullWidth onClick={onNext}>Go on</Button>
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
        {focusLabel ? <div><span>Watching for</span><strong>{focusLabel}</strong></div> : null}
      </div>
      <p className="start-note">She doesn&apos;t know you&apos;re practising. She can lose interest.</p>
      <Button size="lg" fullWidth onClick={onNext}>Go on</Button>
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
  // The same pure lookup the build screen renders from, so the character
  // named here can never drift from the one they were just introduced to.
  const firstRep = firstRepPreview(answers.focusArea)
  const router = useRouter()
  const [state, action, busy] = useActionState(signUpWithPassword, EMPTY_RESULT)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  /**
   * Given on screen two, not here (§2.2). It is still posted and still
   * checked — by this handler and again by `signUpWithPassword` before
   * `auth.signUp` — because §16.4 is about the answer being on the record
   * before the account exists, not about which screen collected it.
   */
  const dateOfBirth = birthDateFromYear(answers.birthYear)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { if (state.ok) router.push(`/verify-email?email=${encodeURIComponent(email)}`) }, [email, router, state.ok])
  useEffect(() => { if (state.message) capture('start_account_failed', { reason: 'server' }) }, [state.message])

  const zone = typeof Intl === 'undefined' ? '' : Intl.DateTimeFormat().resolvedOptions().timeZone
  /**
   * One static hint (§2.3). It used to be three strings that changed as you
   * typed — *keep going*, *good enough*, *strong* — which is unsolicited
   * judgement at the most fragile moment in the funnel. The rule is the same
   * rule; it is just stated once instead of graded live.
   */
  const strength = 'At least 8 characters.'

  const refuse = (reason: 'email' | 'password' | 'age', text: string) => {
    capture('start_account_failed', { reason })
    setMessage(text)
  }

  const error = message ?? state.message

  return (
    <section className="onboarding-question start-account">
      <span className="label">Last thing</span>
      {/* §2.3. *Where do your scores go?* made the account a filing cabinet.
          The screen before this one just drew her, named her and named her
          room — so this screen names her back, and the account becomes the
          door to a person. `firstRep` is the same lookup the build screen
          renders, so the two can never name different characters. */}
      <h1 className="display-lg" tabIndex={-1} data-step-heading>
        {interview ? 'Your interviewer is ready.' : firstRep ? `${firstRep.name} is ready.` : 'You\u2019re set.'}
      </h1>
      {/*
        ONE LINE, because the eye needs somewhere to land.

        This was three sentences, and the tester quote below it was another
        three lines at 14px against this one's 15px — a one-pixel, zero-colour
        difference, which is not a hierarchy, it is a wall. Two of the three
        moved rather than being deleted: the card promise is the last thing
        read before the tap (§2.3) and now lives only there, and "takes about
        twenty seconds" was a claim the form demonstrates by being short.
      */}
      <p className="onboarding-sub">
        One free voice rep and one free five-minute interview, on every account.
      </p>

      {/* §2.1 step 4, and it is only correct now that §2.2 has shipped.
          The answers this form posts in `START_FIELD` are carried in a cookie
          instead, because the OAuth leg leaves the site — and they now
          include the birth year, so a Google sign-up from this screen
          satisfies §16.4 before the account exists and lands on the product
          rather than on `/onboarding/age`. That is what makes Google the
          fastest path here, and what makes putting it first honest. */}
      <GoogleButton answers={encodeStartAnswers(answers)} first />
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
          /**
           * The ad platform's copy of this moment (§1.2). A STANDARD event,
           * not a custom one: Meta's optimiser has priors on the standard
           * names, and a custom event with three conversions a week never
           * leaves the learning phase while a standard one borrows.
           *
           * It is deliberately not routed through `capture()` — see the
           * header of `components/meta-pixel.tsx`. The funnel has to keep
           * counting on the day the pixel is switched off.
           */
          metaTrack('CompleteRegistration', { content_name: answers.track ?? 'dating' })
          capture('start_account_submitted', {
            track: answers.track ?? 'dating',
            focus: answers.focusArea ?? 'none',
            // The interview arm's question two, so the two arms can be read
            // against each other rather than one of them being a blank column.
            role: answers.roleTitle ? 'given' : answers.roleAsked ? 'skipped' : 'none',
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
        <input type="hidden" name="date_of_birth" value={dateOfBirth} readOnly />
        <Button type="submit" size="lg" fullWidth loading={busy}>{interview ? 'Start the interview' : 'Start the rep'}</Button>
        {/* §2.3. The reassurance used to sit 400px above the button, which is
            not where the decision is made. The 30-day line is a privacy
            promise and this form is where privacy is being decided; it was
            only ever in the landing page footer. */}
        <p className="start-foot">No card, ever · Recordings auto-delete after 30 days</p>
      </form>
      {/*
        One tester, static, BELOW the action rather than above it.

        Not a carousel and not a screen of its own: `startSteps` may never put
        a claim after a claim, §3.2 cut `reframe` for that reason, and every
        extra screen in an eight-screen run is another place to leave.

        It sat between the subhead and the form for a few hours and was the
        reason this screen had no focal point — two grey paragraphs of almost
        the same size, one after the other, with the action pushed below both.
        Down here it is the last reassurance before the tap instead of a
        second thing to read before reaching one, and it can be a clear tier
        quieter because nothing else is competing at that size.
      */}
      {SIGNUP_REVIEW ? (
        <figure className="start-proof">
          <blockquote>{SIGNUP_REVIEW.quote}</blockquote>
          <figcaption>{SIGNUP_REVIEW.name}</figcaption>
        </figure>
      ) : null}
      <p className="auth-fine">
        By continuing, you agree to the <Link href="/legal/terms">terms</Link> and <Link href="/legal/privacy">privacy policy</Link>.
      </p>
    </section>
  )
}
