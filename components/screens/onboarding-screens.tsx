'use client'

/**
 * The run between the sign-up form and the first spoken word.
 *
 * ── ONE ROUTE, FIVE STEPS ────────────────────────────────────────────────
 *
 * This used to be five separate navigations through the `[...slug]` catch-all,
 * and every one of them cost a `profiles` select in the route guard, a full
 * layout revalidation in the write, and a torn-down chrome on the way out. A
 * tap on an option card ran both of those sequentially before anything moved.
 * That is what "the onboarding feels slow" was.
 *
 * It is one client component now, holding the step index. The argument is the
 * one already written above `SignupForm` in `auth-screens.tsx`, which is two
 * steps in one route for the same reasons and with more force here: a route
 * per step is a URL somebody can land on cold, a back button that walks out of
 * the run, and a half-filled answer to restore.
 *
 * What the URLs still are: the per-step paths are kept, because the resume is
 * built on them — `onboardingResumePath` returns one and the guard redirects
 * to it. What the run does NOT do is rewrite the address as it advances. That
 * was tried first, with `history.replaceState`, and it is worth writing down
 * why it does not work: the App Router treats a pathname written through the
 * History API as router state, and re-entering a path it has already seen
 * remounts the segment — so going back one step threw away every answer in
 * memory, which is the precise bug the single route exists to fix. Verified in
 * a browser, not reasoned about.
 *
 * So the address bar is not the record of where somebody is. The database is,
 * and it always was: every answer is written the moment it is given, and the
 * run opens at `resumeRoute` — the first unanswered step — however it was
 * reached. A reload at any point lands on the step they had actually got to,
 * whatever the URL happens to say, which is a stronger guarantee than the
 * five-route version gave.
 *
 * What the single route buys, beyond speed: the answers are in memory, so the
 * back arrow shows the question answered instead of blank; the chrome never
 * unmounts, so the progress rail can move rather than repaint; and the step
 * transition becomes possible at all.
 *
 * ── OPTIMISTIC, AND WHAT HAPPENS WHEN IT IS WRONG ────────────────────────
 *
 * Every answer is still written the moment it is given. The *advance* no
 * longer waits for it (§02). A write that fails takes the user back to the
 * question it belongs to with the reason on the screen — which is the only
 * honest version of an optimistic step, because the alternative is a run that
 * finishes over answers nobody stored.
 */

import { Check, ChevronLeft, LogOut, Mic, MicOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  confirmAge,
  deferOnboarding,
  finishOnboarding,
  recordTrackWaitlist,
  saveOnboardingChoice,
  saveVadOffset,
  type SaveResult,
} from '@/app/profile/actions'
import { signOut } from '@/app/auth/actions'
import { resetPerson } from '@/components/analytics'
import { forgetCurrentUser } from '@/lib/data/session'
import { PauseMeter, offsetFromPause } from '@/lib/voice/calibration'
import { DEFAULT_CALIBRATION, resolveSilenceMs } from '@/lib/voice/types'
import { Button, DateOfBirth, Sheet } from '@/components/ui'
/**
 * The three questions, shared with `/start` (`onboarding-questions.tsx`).
 *
 * They are asked twice now — once after sign-up over a `profiles` row, and
 * once before it by the acquisition funnel — so they live in one file and
 * both runs render the same components. `FOCUS_OPTIONS` is re-exported
 * below because `/profile/settings` has always imported it from here.
 */
import { FOCUS_OPTIONS, FocusStep, NameStep, TrackStep } from './onboarding-questions'
import { MIN_AGE } from '@/lib/safety/age'
import { tap } from '@/lib/haptics'
import { FluidPersona } from '@/components/fluid-persona'
import { Mark } from '@/components/marks'
import { RuleBlock } from './rep-format'
import { chooseTodayPersona } from '@/lib/data/progression'
import type { FirstRepCandidate } from '@/lib/data/first-rep'
import type { FocusArea } from '@/lib/data/focus'
import type { Level, Track } from '@/lib/data/types'

type OnboardingRoute =
  | '/onboarding/age'
  | '/onboarding/track'
  | '/onboarding/focus'
  | '/onboarding/name'
  | '/onboarding/mic'
  | '/onboarding/ready'

/**
 * What the server knew when it rendered the route, handed down so the run can
 * open on an answered question already answered.
 *
 * It comes from the select the route guard was making anyway. A step that
 * reads its own value back was the fix for a back arrow that showed a blank
 * question the database had the answer to.
 */
export interface OnboardingContext {
  track: Track | null
  focusArea: FocusArea | null
  displayName: string | null
  /**
   * The characters the first rep could be against, read on the server.
   *
   * A list rather than a name, because who it is depends on the focus answer
   * and on this run that answer is newer than the request — it is given two
   * screens after the page rendered. `chooseTodayPersona` is pure, so the run
   * applies it here to the answer it actually has. See `lib/data/first-rep.ts`.
   */
  roster: FirstRepCandidate[]
  currentLevel: Level
  /**
   * The first step this person has not answered, from `onboardingResumePath`.
   *
   * This, and not the requested URL, is where the run opens. The five routes
   * were never ordered by anything but the redirect that produced them, so
   * `/onboarding/ready` typed into the address bar reached a Start button over
   * a run nobody had been through — and after the rewrite the address bar
   * stopped tracking the step anyway. One source of truth, and it is the one
   * that is written down.
   */
  resumeRoute: OnboardingRoute
}

/**
 * The order, once. The progress rail, the back arrow and the URL all read it.
 *
 * The age step is not in it. It is a gate rather than a step: it is reached by
 * people who finished this run months ago, there is no step before it to go
 * back to, and a progress rail reading "1 of 5" on a screen that refuses
 * everybody under eighteen would frame a rule as a formality.
 *
 * `/onboarding/experience` was in it and is not any more. It asked how often
 * somebody does this for real, wrote `profiles.experience`, and nothing in the
 * product ever read the column — see `saveOnboardingChoice` for why it was
 * removed rather than wired.
 */
const STEPS: readonly OnboardingRoute[] = [
  '/onboarding/track',
  '/onboarding/focus',
  '/onboarding/name',
  '/onboarding/mic',
  '/onboarding/ready',
]

const stepMap: Record<string, number> = Object.fromEntries(STEPS.map((route, index) => [route, index]))

export function OnboardingScreen({ route, context }: { route: OnboardingRoute; context: OnboardingContext }) {
  // See STEPS. The gate stands on its own: no rail, no back arrow, nothing
  // that suggests it can be skipped past.
  if (route === '/onboarding/age') {
    return <main className="onboarding-page"><OnboardingSignOut /><div className="onboarding-shell"><AgeStep /></div></main>
  }
  return <OnboardingRun start={stepMap[context.resumeRoute] ?? 0} context={context} />
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

function OnboardingRun({ start, context }: { start: number; context: OnboardingContext }) {
  const [step, setStep] = useState(() => Math.min(Math.max(start, 0), STEPS.length - 1))
  const [track, setTrack] = useState<Track | null>(context.track)
  const [focusArea, setFocusArea] = useState<FocusArea | null>(context.focusArea)
  const [displayName, setDisplayName] = useState<string | null>(context.displayName)
  const [error, setError] = useState<string | null>(null)

  /**
   * The double-fire lock.
   *
   * State would not do it: two taps inside one frame both read the old value.
   * A ref is written synchronously, so the second tap sees the first. It is
   * released on the next step rather than on a timer — the run only ever moves
   * forward one answer at a time.
   */
  const busy = useRef(false)
  const shell = useRef<HTMLDivElement | null>(null)
  const entered = useRef(false)

  /**
   * Who they are about to meet — the same rule `/train` runs, over the roster
   * the server sent, against the focus answer as it stands right now rather
   * than as it stood when the page rendered. Empty progress is not an
   * approximation: this resolves the FIRST rep, and every later tie-break is
   * about a rotation that does not exist yet.
   */
  const firstRep = chooseTodayPersona(context.roster, [], context.currentLevel, focusArea)

  /** Move. See the note at the top of the file for why this touches no URL. */
  const goTo = useCallback((next: number) => {
    setError(null)
    setStep(Math.min(Math.max(next, 0), STEPS.length - 1))
    busy.current = false
  }, [])

  /**
   * Answer, advance, and only then find out whether it stored.
   *
   * A failure returns to the question with the reason on it. Silently carrying
   * on would produce a finished run over an answer nobody has, and the guard
   * would send them back to this step on the next load with no explanation.
   */
  const commit = useCallback((write: () => Promise<SaveResult>, from: number, next: number) => {
    if (busy.current) return
    busy.current = true
    tap()
    goTo(next)
    void write()
      .then((result) => {
        if (result.ok) return
        setStep(from)
        setError(result.message ?? 'That did not save. Try again.')
      })
      .catch(() => {
        setStep(from)
        setError('That did not save — check your connection.')
      })
  }, [goTo])

  /**
   * Focus the question on the way in (§02's keyboard rule, and the reason a
   * screen reader used to re-enter every step from the top of the chrome).
   * Skipped on the first render: stealing focus from a page somebody has just
   * landed on is not the same gesture as following them to the next question.
   */
  useEffect(() => {
    if (!entered.current) { entered.current = true; return }
    const heading = shell.current?.querySelector<HTMLElement>('[data-step-heading]')
    heading?.focus()
  }, [step])

  const route = STEPS[step] as OnboardingRoute

  return (
    <main className="onboarding-page">
      <OnboardingProgress step={step} />
      {step > 0
        ? <button type="button" className="onboarding-back" aria-label="Back to the previous question" onClick={() => goTo(step - 1)}><ChevronLeft size={24} strokeWidth={1.5} /></button>
        : null}
      <OnboardingSignOut />
      <div className="onboarding-shell" ref={shell}>
        <div className="onboarding-step" key={step}>
          {error ? <div className="onboarding-error form-error" role="alert">{error}</div> : null}
          {route === '/onboarding/track'
            ? <TrackStep
                value={track}
                english={{ record: () => recordTrackWaitlist('english'), counted: true }}
                onChoose={(value) => { setTrack(value); commit(() => saveOnboardingChoice({ track: value }), step, step + 1) }}
              />
            : null}
          {route === '/onboarding/focus'
            ? <FocusStep
                value={focusArea}
                firstRep={firstRep}
                track={track}
                onChoose={(value) => { setFocusArea(value); commit(() => saveOnboardingChoice({ focusArea: value }), step, step + 1) }}
              />
            : null}
          {route === '/onboarding/name'
            ? <NameStep
                value={displayName}
                onSubmit={(value) => { setDisplayName(value); commit(() => saveOnboardingChoice({ displayName: value }), step, step + 1) }}
              />
            : null}
          {route === '/onboarding/mic'
            ? <MicStep firstRep={firstRep} track={track} onDone={() => goTo(step + 1)} />
            : null}
          {route === '/onboarding/ready' ? <ReadyStep firstRep={firstRep} name={displayName} track={track} /> : null}
        </div>
      </div>
    </main>
  )
}

/**
 * The way out of onboarding.
 *
 * Every protected route bounces an unfinished account back here, so without
 * this the only exit from a step somebody could not complete — a microphone
 * their browser would not grant, the wrong account signed in — was clearing
 * cookies. A door that only opens inward is not a door.
 */
function OnboardingSignOut() {
  return <form className="onboarding-signout" action={signOut} onSubmit={() => { forgetCurrentUser(); resetPerson() }}><button type="submit"><LogOut size={15} strokeWidth={1.5} /> Sign out</button></form>
}

/**
 * Where you are, not just how far you have come.
 *
 * Every tick used to read `index <= step`, so the step you were standing on
 * looked exactly like the ones behind it — a rail that could say how much was
 * left and not what was happening. Volt marks the current position, which is
 * the thing the design system says volt is for; done is a hairline that is
 * merely brighter than pending.
 */
function OnboardingProgress({ step }: { step: number }) {
  return (
    <div className="onboarding-progress" role="group" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map((route, index) => (
        <i
          key={route}
          className={index === step ? 'current' : index < step ? 'done' : ''}
          aria-current={index === step ? 'step' : undefined}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The gate
 * ------------------------------------------------------------------ */

/**
 * The age gate for the doors that could not carry one (§16.4).
 *
 * Every account created before this shipped has no date on file, and the guard
 * sends them here and lets nothing else render until it is answered. Google
 * sign-in was the other way in without a date; that door is closed for now,
 * and this step is written so that reopening it changes nothing here.
 *
 * A refusal is final and says so once. There is no second attempt offered, no
 * hint about what date would have worked, and no lecture — a screen that
 * coaches somebody through an age gate is a screen that defeats it. Signing
 * out is the only thing left on it, which is honest: terms clause 02 closes
 * the account if we learn it belongs to somebody under eighteen, and this is
 * us having learnt.
 *
 * That paragraph described behaviour the screen did not have. Every refusal
 * arrived as one shape, so Continue stayed live on all of them and a verdict
 * could be edited away as easily as a typo. `checkAge` now says which refusal
 * it made, and only `under-age` is final — the other three are the field
 * saying it has no date yet, and refusing to accept a corrected typo would
 * turn a mis-scrolled wheel into a closed account.
 *
 * The sign-up form keeps offering a retry on the same verdict, and that
 * asymmetry is deliberate: nothing has been created there yet, so there is no
 * account for clause 02 to be about.
 */
function AgeStep() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = () => {
    setBusy(true)
    setMessage(null)
    void confirmAge(value).then((result) => {
      setBusy(false)
      if (result.ok) { router.push('/'); return }
      setMessage(result.message)
      if (result.final) setRefused(true)
    })
  }

  if (refused) {
    return (
      <section className="onboarding-question onboarding-age">
        <h1 className="display-lg">{message}</h1>
        <p>That is the whole rule and there is nothing to appeal to. Nothing has been kept but the date you gave.</p>
      </section>
    )
  }

  return (
    <section className="onboarding-question onboarding-age">
      {/* V20. One mark and nothing else — the shield is a bound we hold, and
          a screen that decorates an age gate is a screen that frames a rule
          as a formality. */}
      <Mark name="bound-adult" size={34} />
      <span className="label">Before you start</span>
      <h1 className="display-lg">One thing first.</h1>
      <p>Nerve is for adults. We ask once and we keep the date, nothing else.</p>
      <DateOfBirth value={value} onChange={setValue} hint={`${MIN_AGE}+ only.`} />
      {message ? <div className="form-error" role="alert">{message}</div> : null}
      <Button fullWidth size="lg" loading={busy} onClick={submit}>Continue</Button>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * The microphone
 * ------------------------------------------------------------------ */

/**
 * `requesting` and `waiting` are the two states this screen used to be missing,
 * and their absence was the whole bug: `getUserMedia` does not settle while the
 * browser's own permission bubble is open, and it never settles at all if the
 * bubble is dismissed or suppressed. So the button was pressed, the promise
 * hung, and the screen sat there saying the same thing it had said before —
 * with no way forward and, until now, no way out of onboarding either.
 */
type MicState = 'request' | 'requesting' | 'waiting' | 'denied' | 'testing' | 'confirmed'
interface AudioDevice { deviceId: string; label: string }

function MicStep({ firstRep, track, onDone }: { firstRep: FirstRepCandidate | null; track: Track | null; onDone: () => void }) {
  const router = useRouter()
  const [state, setState] = useState<MicState>('request')
  const [skipping, setSkipping] = useState(false)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  /** The measured inter-clause pause, kept for the copy that reports it. */
  const [pauseMs, setPauseMs] = useState<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const meterRef = useRef<HTMLDivElement | null>(null)
  /** §05 turn-taking calibration, measured off the level meter. */
  const pauseRef = useRef<PauseMeter | null>(null)

  /**
   * The rep route, warmed while they are still granting the microphone.
   *
   * The route only. Nothing that mints a token or reaches a provider runs
   * early — a prefetch that spent money would be a worse bug than a cold
   * navigation (§14, `lib/db/spend.ts`).
   */
  useEffect(() => {
    if (firstRep) router.prefetch(`/rep/${firstRep.id}/live`)
  }, [firstRep, router])

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  /**
   * Write the measured turn-taking offset, once, on the way out.
   *
   * Best-effort by rule: a calibration that fails to save costs the user a
   * slightly wrong silence window, and must never cost them the ability to
   * finish onboarding. No measurement means no write, and the default stands.
   */
  const persistCalibration = async () => {
    const measured = pauseRef.current?.measuredPauseMs() ?? null
    if (measured === null) return
    await saveVadOffset(offsetFromPause(measured, DEFAULT_CALIBRATION.silenceMs)).catch(() => undefined)
  }

  /**
   * Look around first — and come back.
   *
   * This used to call `finishOnboarding`, because with onboarding incomplete
   * the route guard bounced every protected route straight back here and
   * anything less would have been a skip button that did not skip. The cost
   * was that it also skipped the brief and the "How a rep works" sheet
   * permanently, with no route back to either.
   *
   * `deferOnboarding` stamps a flag the guard treats exactly as it treats a
   * finished run, and leaves `onboarding_complete` false — so `/train` can
   * carry one quiet row back to this step. See `lib/data/guards.ts`.
   */
  const skip = async () => {
    setSkipping(true)
    stop()
    await deferOnboarding()
    // D1. Looking around means looking around the track they came for, not the
    // other one — the same reason the run's last screen honours the answer.
    router.push(track === 'interview' ? '/interview' : '/train')
  }

  const request = async () => {
    stop()
    setState('requesting')
    // If the browser prompt is still unanswered after this, say so. The
    // promise itself gives us nothing to hang a message on.
    const nudge = window.setTimeout(() => setState((current) => (current === 'requesting' ? 'waiting' : current)), 12_000)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      window.clearTimeout(nudge)
      streamRef.current = stream
      const listed = await navigator.mediaDevices.enumerateDevices()
      setDevices(listed.filter((item) => item.kind === 'audioinput').map((item, index) => ({ deviceId: item.deviceId, label: item.label || `Microphone ${index + 1}` })))
      setState('testing')
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      context.createMediaStreamSource(stream).connect(analyser)
      const values = new Uint8Array(analyser.frequencyBinCount)
      let aboveSince = 0
      // §05's turn-taking calibration, measured off the same meter that is
      // already running. The phrase has three clauses in it precisely so that
      // saying it produces the gaps this needs — it was always the right test
      // sentence, it simply was never timed. See lib/voice/calibration.ts.
      const pauses = new PauseMeter()
      pauseRef.current = pauses
      const listeningSince = performance.now()
      let heardAnything = false

      const settle = () => {
        setPauseMs(pauses.measuredPauseMs())
        setState('confirmed')
        void context.close()
      }

      const tick = () => {
        analyser.getByteFrequencyData(values)
        let sum = 0
        for (const value of values) sum += value * value
        const next = Math.min(1, Math.sqrt(sum / values.length) / 90)
        /**
         * Straight to the DOM, not through React.
         *
         * This was a `setState` per animation frame, which re-rendered the
         * step and twelve meter bars sixty times a second for as long as
         * somebody was talking — and rewrote the meter's `aria-label` just as
         * often. One custom property does the same job for nothing: the bars
         * read it against their own index in CSS, so the leading bar even
         * fades in rather than snapping.
         */
        meterRef.current?.style.setProperty('--level', (next * METER_BARS).toFixed(2))
        const speaking = next > .12
        const now = performance.now()
        pauses.sample(now, speaking)
        if (speaking) {
          heardAnything = true
          if (aboveSince === 0) aboveSince = now
          // Wait for the whole phrase rather than the first syllable, so there
          // are gaps to take a median of. Confirms early only if they have
          // already given us enough.
          if (now - aboveSince > 800 && pauses.sampleCount >= 2) { settle(); return }
          // Never leave them stuck because they spoke in one unbroken breath.
          if (now - aboveSince > 3500) { settle(); return }
        } else aboveSince = 0
        // See LISTEN_CEILING_MS. Take what we have rather than listen forever
        // — but only once there is something to take.
        if (heardAnything && now - listeningSince > LISTEN_CEILING_MS) { settle(); return }
        frameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      window.clearTimeout(nudge)
      setState('denied')
    }
  }

  const escape = <button type="button" className="mic-skip" disabled={skipping} onClick={() => void skip()}>Look around first</button>

  return <section className="mic-check">
    {state === 'request' ? <>
      <Mic size={52} strokeWidth={1.25} className="mic-glyph" />
      <h1 className="display-lg" tabIndex={-1} data-step-heading>Let&apos;s check your microphone</h1>
      {/* What the privacy page says, said here rather than contradicted here.
          This used to read "Nothing is recorded to disk", one screen before the
          first rep — true of the check and false of the product, while
          /legal/privacy opens with "We record your voice" and promises thirty
          days. Two surfaces, one claim. */}
      <p>A rep is a spoken conversation, so this is the one permission the app needs. Your browser will ask next. This check is not recorded at all; reps are, and they are deleted thirty days later.</p>
      <Button size="lg" fullWidth onClick={() => void request()}>Allow microphone</Button>
      {escape}
    </> : null}
    {state === 'requesting' ? <>
      <Mic size={52} strokeWidth={1.25} className="mic-glyph" />
      <h1 className="display-lg" tabIndex={-1} data-step-heading>Waiting for your browser</h1>
      <p>Choose <strong>Allow</strong> in the prompt at the top of the window.</p>
      <Button size="lg" fullWidth loading disabled>Waiting</Button>
      {escape}
    </> : null}
    {state === 'waiting' ? <>
      <Mic size={52} strokeWidth={1.25} className="amber" />
      <h1 className="display-lg" tabIndex={-1} data-step-heading>No answer from the prompt</h1>
      <p>It may have been dismissed, or your browser may be hiding it. Click the icon at the left of the address bar, set Microphone to Allow, then try again.</p>
      <Button variant="secondary" size="lg" fullWidth onClick={() => void request()}>Try again</Button>
      {escape}
    </> : null}
    {state === 'denied' ? <>
      <MicOff size={52} strokeWidth={1.25} className="danger" />
      <h1 className="display-lg" tabIndex={-1} data-step-heading>We can&apos;t hear you</h1>
      <p>Click the icon at the left of your address bar, open Site settings, set Microphone to Allow, then try again.</p>
      <Button variant="secondary" size="lg" fullWidth onClick={() => void request()}>Try again</Button>
      {escape}
    </> : null}
    {state === 'testing' ? <>
      <span className="label">Mic level</span>
      <MicLevelMeter meterRef={meterRef} />
      <h1 className="display-md" tabIndex={-1} data-step-heading>Say: “testing, one two three”</h1>
      <p>Headphones recommended — she&apos;ll hear herself otherwise.</p>
      <DevicePicker devices={devices} value={deviceId} onChange={(value) => { setDeviceId(value); void request() }} />
      {escape}
    </> : null}
    {state === 'confirmed' ? <>
      <Check size={52} strokeWidth={1.25} className="mic-glyph" />
      <h1 className="display-lg" tabIndex={-1} data-step-heading>We can hear you</h1>
      <CalibrationReadout pauseMs={pauseMs} />
      <DevicePicker devices={devices} value={deviceId} onChange={setDeviceId} />
      <Button size="lg" fullWidth onClick={() => { void persistCalibration(); stop(); onDone() }}>Continue</Button>
    </> : null}
  </section>
}

/**
 * What the check actually established.
 *
 * The block this replaces printed “testing, one two three” in the mono data
 * face under "We can hear you", which read as a transcript of speech nobody
 * had transcribed — the check measures amplitude and the length of the gaps
 * between clauses, and no recogniser runs on this screen at all. The impression
 * mattered because the next thing the user assumes is that a rep will
 * understand them too.
 *
 * So it reports the two things that are true: we heard sound, and we timed how
 * you pause. The second is the §05 measurement that decides how long a
 * character sits through a mid-sentence gap before she answers, which is
 * genuinely the most useful number on the run.
 */
function CalibrationReadout({ pauseMs }: { pauseMs: number | null }) {
  const offset = offsetFromPause(pauseMs, DEFAULT_CALIBRATION.silenceMs)
  const windowMs = resolveSilenceMs({ ...DEFAULT_CALIBRATION, patienceOffsetMs: offset })
  return (
    <div className="mic-readout" role="status">
      <div><span>Level</span><strong className="data">Good</strong></div>
      <div><span>Your pause</span><strong className="data">{pauseMs === null ? 'Not measured' : `${pauseMs}ms`}</strong></div>
      <div><span>She waits</span><strong className="data">{windowMs}ms</strong></div>
      <p>
        {pauseMs === null
          ? 'We heard you, but not enough of a gap to time. She will use the default, and you can retest any time from Settings.'
          : 'That is how long she will sit through a pause before she answers, so a sentence you break in the middle stays one sentence.'}
      </p>
    </div>
  )
}

/** Kept in step with the bar count in globals.css. */
const METER_BARS = 12

/**
 * How long the check will listen before accepting what it has.
 *
 * The two exits below it are both about a phrase held long enough to take
 * gaps out of, and `aboveSince` resets on every silent frame — so somebody who
 * says "testing, one two three" in three short bursts satisfies neither, and
 * the screen listened forever. It was not a dead end, because *Look around
 * first* is on it, but a check that cannot finish for a hesitant speaker is
 * the wrong check to put in front of a product whose user is defined as one.
 *
 * Only reached once we have actually heard something. Settling on a silent
 * microphone would put "We can hear you" over the evidence that we cannot.
 */
const LISTEN_CEILING_MS = 12_000

/**
 * Twelve bars and one custom property.
 *
 * Each bar carries its own index and fills against `--level` in CSS, so the
 * only per-frame work is a single `style.setProperty` on the container — no
 * React render, and one stable label rather than one rewritten sixty times a
 * second.
 */
function MicLevelMeter({ meterRef }: { meterRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="mic-meter" ref={meterRef} role="img" aria-label="Microphone level">
      {Array.from({ length: METER_BARS }, (_, index) => <i key={index} style={{ '--i': index } as React.CSSProperties} />)}
    </div>
  )
}

function DevicePicker({ devices, value, onChange }: { devices: AudioDevice[]; value: string; onChange: (value: string) => void }) {
  return <label className="device-picker"><span className="label">Input device</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">System default</option>{devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
}

/* ------------------------------------------------------------------ *
 * The brief
 * ------------------------------------------------------------------ */

/**
 * This screen IS the brief — same character, same rules block, same Start.
 * Routing it at `/rep/<id>/brief` re-rendered the identical card at a new URL
 * and asked for Start again, which reads as a button that did not work.
 *
 * The character arrives as a prop, resolved on the server by the same
 * `chooseTodayPersona` that `/train` runs (`lib/data/first-rep.ts`). It was a
 * client fetch against a hardcoded `nadia`, which drew a skeleton on the one
 * screen where somebody is already waiting to start and disagreed with the
 * focus answer's own promise about who they would meet.
 */
function ReadyStep({ firstRep, name, track }: { firstRep: FirstRepCandidate | null; name: string | null; track: Track | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)

  // Awaited, not fired and forgotten: the route guard sends anyone whose
  // onboarding is unfinished straight back here, so leaving before the write
  // lands is a loop rather than a rep.
  const start = async (href: string) => {
    setStarting(true)
    await finishOnboarding()
    router.push(href)
  }

  /**
   * ── D1: THE RUN ENDS WHERE THEY SAID THEY WERE GOING ────────────────────
   *
   * `/onboarding/track` asks dating or interview and writes `active_track`, and
   * the run then ended at `/train` in every case — where `AppShell`'s pathname
   * effect immediately set the track back to `dating`, because that is where
   * they had landed. So somebody who signed up to practise interviews was shown
   * a dating persona, a warmth meter and a field challenge, and had to find the
   * track switcher themselves. The one question onboarding asks about intent
   * was overwritten within a second of being answered.
   *
   * An interview cannot open on a first rep the way a dating one can — it needs
   * a role, a CV and a round first — so the end of the run for that track is
   * the interview home, which is where that setup begins. The free screener is
   * named, because it is the thing that makes the next screen worth opening.
   */
  if (track === 'interview') {
    return (
      <section className="brief-shell">
        <Mark name="kind-technique" size={44} current />
        <h1 className="display-lg" tabIndex={-1} data-step-heading>You&apos;re set up.</h1>
        <p className="brief-hook">Next: the role you are interviewing for, your CV, and who you want in the room. Your first five-minute round is free.</p>
        <Button size="lg" fullWidth loading={starting} onClick={() => void start('/interview')}>
          {name ? `Set up your interview, ${name}` : 'Set up your interview'}
        </Button>
      </section>
    )
  }

  /**
   * No roster means nothing has been seeded. Finishing the run and landing on
   * `/train` is the only honest end to it — a Start button with nobody behind
   * it would spend a rep on a room with no one in it.
   */
  if (!firstRep) {
    return (
      <section className="brief-shell">
        <h1 className="display-lg" tabIndex={-1} data-step-heading>You&apos;re set up.</h1>
        <p className="brief-hook">Characters are being prepared. Your training home is ready either way.</p>
        <Button size="lg" fullWidth loading={starting} onClick={() => void start('/train')}>Go to training</Button>
      </section>
    )
  }

  return (
    <section className="brief-shell">
      <FluidPersona name={firstRep.name} personaId={firstRep.id} warmth={18} size={132} />
      <h1 className="display-lg" tabIndex={-1} data-step-heading>{firstRep.name}</h1>
      <span className="label">{firstRep.setting}</span>
      <p className="brief-hook">{firstRep.hook}</p>
      <RuleBlock interview={false} />
      <Button size="lg" fullWidth loading={starting} onClick={() => void start(`/rep/${firstRep.id}/live`)}>
        {name ? `Start, ${name}` : 'Start'}
      </Button>
      <Button variant="ghost" fullWidth onClick={() => setOpen(true)}>How does this work?</Button>
      <HowItWorks open={open} onClose={() => setOpen(false)} />
    </section>
  )
}

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="How a rep works"><div className="how-list">{['Talk out loud.', 'You have three minutes.', 'Her form shows how she feels.', 'She decides at the end. Nothing she decides is scored.'].map((item, index) => <div key={item}><span className="data">0{index + 1}</span><p>{item}</p></div>)}</div><div className="ring-illustration" aria-hidden="true"><i /><i /><i /></div></Sheet>
}

export { FOCUS_OPTIONS }
export type { OnboardingRoute }
