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
 * This is the same questions the signed-in run asks, in front of the form
 * instead of behind it — and since 3 October 2026 nothing else: the first
 * screen is the first question, answered in one tap, and every answer on it
 * is a real link. Nothing is spent by walking it: no session, no database read, no
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
 * ── WHAT WAS CUT ON 3 OCTOBER, AND WHY ───────────────────────────────────
 *
 * The hook (a chat preview, a headline and *Set mine up*) and the Cass reveal.
 * Paid traffic from the first Meta ads tapped through at ~7–20% and then 0 of
 * 6 real visitors tapped the hook: somebody who has just tapped an ad has
 * been sold, and the hook was a second pitch. Cass was introduced on the
 * reveal and again, word for word, on the brief after the microphone check;
 * the brief is the rep's own and stays. `LAUNCH-GAP.md` D32.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Eye, EyeOff } from 'lucide-react'
import { signUpWithPassword, type AuthResult } from '@/app/auth/actions'
import { campaignTag, capture, countStartStep } from '@/components/analytics'
import { metaTrack } from '@/components/meta-pixel'
import { tiktokTrack } from '@/components/tiktok-pixel'
import { Button, Input } from '@/components/ui'
import { FocusStep, NameStep, RoleStep, TrackStep } from './onboarding-questions'
import { GoogleButton } from './google-button'
import { tap } from '@/lib/haptics'
import { MIN_AGE, checkAge } from '@/lib/safety/age'
import {
  AI_ACCOUNT_LINE,
  EMPTY_START_ANSWERS,
  FOCUS_ACCOUNT_LINE,
  FOCUS_ACCOUNT_LINE_PERSONA,
  START_ANSWER_PARAMS,
  START_FIELD,
  birthDateFromYear,
  START_STORAGE_KEY,
  decodeStartAnswers,
  encodeStartAnswers,
  firstRepPreview,
  startAdvance,
  startFirstIndex,
  startOpening,
  startQueryWith,
  startRail,
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
 * `initialTrack` is the `?track=` the link carried — every ad and post says
 * `?track=dating`, `/interviews` says `interview`. A named track skips the
 * track question, so the run OPENS on question two and that screen has no
 * back arrow (there is nothing behind it).
 *
 * `fromUrl` is answers a link carried — a tap on this run that landed before
 * hydration and arrived as a navigation (`startQueryWith`). `query` is the
 * address bar as the server saw it, which every answer link is built from so
 * the UTMs ride every server render of the run.
 */
export function StartScreen({ initialTrack = null, fromUrl = {}, query = {} }: {
  initialTrack?: Track | null
  fromUrl?: Partial<StartAnswers>
  query?: Record<string, string>
}) {
  const trackGiven = initialTrack !== null
  const firstIndex = startFirstIndex(trackGiven)
  const opening = startOpening(EMPTY_START_ANSWERS, initialTrack, fromUrl)
  const [step, setStep] = useState(opening.index)
  const [answers, setAnswers] = useState<StartAnswers>(opening.answers)
  const shell = useRef<HTMLDivElement | null>(null)
  const entered = useRef(false)
  /**
   * Which way the run is moving, so a screen slides in from the side it came
   * from — forward from the right, back from the left.
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
   * It also takes the answers OUT of the address bar once they are in
   * storage. A link-carried answer is the newest thing somebody did, so it is
   * laid over the stored run — and left in the URL it would go on being "the
   * newest thing" on every reload, undoing a change made with the back arrow
   * since. `?track=` and the UTMs stay; they describe the link, not an answer.
   */
  useEffect(() => {
    let stored = EMPTY_START_ANSWERS
    try {
      stored = decodeStartAnswers(window.sessionStorage.getItem(START_STORAGE_KEY))
    } catch {
      // See above.
    }
    const resumed = startOpening(stored, initialTrack, fromUrl)
    if (encodeStartAnswers(resumed.answers) !== encodeStartAnswers(stored)) remember(resumed.answers)
    else setAnswers(stored)
    setStep(resumed.index)
    try {
      const url = new URL(window.location.href)
      const keys = [...START_ANSWER_PARAMS, 's'].filter((key) => url.searchParams.has(key))
      if (keys.length > 0) {
        for (const key of keys) url.searchParams.delete(key)
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
      }
    } catch {
      // The address bar is cosmetic here; the answers are already stored.
    }
    // `fromUrl` is the server's first-render value and never changes after it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setStep(Math.min(Math.max(next, firstIndex), steps.length - 1))
  }, [firstIndex, steps.length, step])

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
  const first = step === firstIndex

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

  /**
   * The links the answers are. Built from the address bar the server saw plus
   * whatever this run has answered since, so a modifier-click (a new tab)
   * still carries the run — and unhydrated, they are the run.
   */
  const trackAnswer: Record<string, string> = answers.track && !trackGiven ? { t: answers.track } : {}
  const linkWith = (add: Record<string, string>) => startQueryWith(query, { ...trackAnswer, ...add })
  const carried: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (!(START_ANSWER_PARAMS as readonly string[]).includes(key)) carried[key] = value
  }
  if (answers.track && !trackGiven) carried['t'] = answers.track

  const rail = startRail(steps)
  const arm = (answers.track ?? initialTrack) === 'interview' ? 'interview' : answers.track ? 'dating' : 'both'

  return (
    <main className="onboarding-page start-page" data-step={stepName} data-first={first || undefined}>
      {stepName === 'track' ? null : <StartProgress current={stepName} rail={rail} />}
      {!first
        ? <button type="button" className="onboarding-back" aria-label="Back to the previous screen" onClick={() => goTo(step - 1)}><ChevronLeft size={24} strokeWidth={1.5} /></button>
        : null}
      <div className="onboarding-shell" ref={shell}>
        <div className="onboarding-step" key={step} data-dir={dir}>
          {first ? <StartTop /> : null}

          {stepName === 'track'
            ? <TrackStep
                eyebrow={FIRST_KICKER}
                value={answers.track}
                hrefFor={(value) => linkWith({ t: value })}
                onChoose={(value) => { answered('track', value); choose({ ...answers, track: value }, step) }}
              />
            : null}

          {stepName === 'focus'
            ? <FocusStep
                eyebrow={FIRST_KICKER}
                value={answers.focusArea}
                firstRep={null}
                hrefFor={(value) => linkWith({ focus: value })}
                onChoose={(value) => { answered('focus', value); choose({ ...answers, focusArea: value }, step) }}
              />
            : null}

          {/* The interview arm's question two. One field decides whether the
              account lands on its free screener or on a setup wizard — see
              `startInterviewSetup`. A form, so its no-JavaScript path is a GET
              to this page rather than a link. */}
          {stepName === 'role'
            ? <RoleStep
                eyebrow={FIRST_KICKER}
                roleTitle={answers.roleTitle}
                company={answers.company}
                fallback={{ hidden: carried, skipHref: linkWith({ role_asked: '1' }) }}
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

          {stepName === 'account'
            ? <AccountStep answers={answers} onYear={(birthYear) => remember({ ...answers, birthYear })} />
            : null}

          {first ? <p className="start-foot start-trust">{TRUST_LINE[arm]}</p> : null}
        </div>
      </div>
    </main>
  )
}

/**
 * The kicker over every question before the account (3 Oct, owner's wording,
 * US spelling because the ads run in the US). It is the one place on the
 * first screen that says what the reps are with — an AI — so nobody answers
 * the first question wondering whether a person is about to pick up.
 */
const FIRST_KICKER = 'Practice out loud with an AI'

/**
 * The first screen's one line of reassurance, under the answers. Where it
 * says "free", it is: the free rep and the free screener are granted at
 * sign-up, and no card is asked for anywhere on this run.
 */
const TRUST_LINE: Record<'dating' | 'interview' | 'both', string> = {
  dating: 'Free \u00b7 no card \u00b7 your first rep is included',
  interview: 'Free \u00b7 no card \u00b7 a five-minute screener is included',
  both: 'Free \u00b7 no card \u00b7 your first rep is included',
}

/**
 * The first screen's top bar: the wordmark, and the way in for somebody who
 * already has an account, in the corner where people look for it.
 */
function StartTop() {
  return (
    <div className="start-top">
      <span className="start-wordmark" aria-label="Nerve">Nerve</span>
      <Link href="/login" className="start-top__login">Log in</Link>
    </div>
  )
}

/**
 * The rail, over question two, the name and the account — `1 of 3` to
 * `3 of 3` on both arms (`startRail`). The count is derived from the list
 * rather than written down, so adding or cutting a screen can never leave a
 * number lying.
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

  /**
   * The upper-funnel signal, moved here from the reveal screen it used to
   * fire on (3 Oct): reaching the account screen is the same moment — every
   * question answered — and it is still the event a conversion campaign can
   * learn from at this volume. Both pixels are unkeyed until privacy clause
   * 07 is rewritten, so today this sends nothing.
   */
  useEffect(() => { metaTrack('Lead'); tiktokTrack('ViewContent', { content_name: answers.track ?? 'dating' }) }, [answers.track])

  /**
   * What the browser knows that the account should: its zone, and the link's
   * campaign tag. Read after mount, because neither exists on the server and
   * a hidden field that disagreed with the server render would be a hydration
   * mismatch on the one screen that creates something.
   */
  const [context, setContext] = useState<{ timezone: string | null; source: string | null; content: string | null }>({ timezone: null, source: null, content: null })
  useEffect(() => {
    let timezone: string | null = null
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { timezone = null }
    setContext({ timezone, ...campaignTag() })
  }, [])
  const zone = context.timezone ?? ''
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

  /**
   * The line under the heading. Dating: the authored sentence for their focus
   * answer, and only when the character it was written about is the one they
   * are meeting. Interview: the round, named the way the reveal screen used to.
   */
  const meeting = interview
    ? answers.roleTitle
      ? `A recruiter screen for ${answers.roleTitle}${answers.company ? ` at ${answers.company}` : ''}. Free on every account.`
      : 'A recruiter screen, free on every account. You can name the role afterwards.'
    : answers.focusArea && firstRep?.id === FOCUS_ACCOUNT_LINE_PERSONA
      ? FOCUS_ACCOUNT_LINE[answers.focusArea]
      : null
  const carriedAnswers = encodeStartAnswers({ ...answers, birthYear: validYear, ...context })

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
      {/* Who they are about to meet (3 Oct): that she is an AI, then one
          authored line about their answer. The reveal screen that introduced
          her is gone; the brief after the microphone check is her full
          introduction, room and all. */}
      <p className="start-account__meet">{interview ? AI_ACCOUNT_LINE.interview : AI_ACCOUNT_LINE.dating}</p>
      {meeting ? <p className="start-account__meet start-account__meet--answer">{meeting}</p> : null}
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
        answers={carriedAnswers}
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
          <input type="hidden" name={START_FIELD} value={carriedAnswers} readOnly />
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
