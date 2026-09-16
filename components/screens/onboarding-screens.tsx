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
import { Button, Card, DateOfBirth, FileDrop, Sheet, Skeleton } from '@/components/ui'
/**
 * The three questions, shared with `/start` (`onboarding-questions.tsx`).
 *
 * They are asked twice now — once after sign-up over a `profiles` row, and
 * once before it by the acquisition funnel — so they live in one file and
 * both runs render the same components. `FOCUS_OPTIONS` is re-exported
 * below because `/profile/settings` has always imported it from here.
 */
import { FOCUS_OPTIONS, FocusStep, NameStep, RoleStep, TrackStep } from './onboarding-questions'
/**
 * The interview arm's two extra steps reach the interview track's own writes.
 *
 * Imported rather than re-implemented: `uploadCv` is the only path that stores
 * a CV and extracts it once on the bytes that were actually stored (C2/C3), and
 * a second uploader on this run would be a row naming one file and carrying
 * another file's text.
 */
import { removeCv, saveInterviewSetup, uploadCv } from '@/app/interview/actions'
import { useInterviewers, useUserState } from '@/lib/data'
import { useProduct } from '@/components/product-provider'
import { openingRound, roundType } from '@/lib/data/interview-credits'
import { MIN_AGE } from '@/lib/safety/age'
import { tap } from '@/lib/haptics'
import { FluidPersona } from '@/components/fluid-persona'
import { Mark } from '@/components/marks'
import { RuleBlock, repGoal } from './rep-format'
import { chooseTodayPersona } from '@/lib/data/progression'
import type { FirstRepCandidate } from '@/lib/data/first-rep'
import type { FocusArea } from '@/lib/data/focus'
import type { Level, Track } from '@/lib/data/types'

type OnboardingRoute =
  | '/onboarding/age'
  | '/onboarding/track'
  | '/onboarding/focus'
  | '/onboarding/role'
  | '/onboarding/cv'
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
  /**
   * The interview arm's question two, read from `interview_setups` on the
   * server for the same reason every other answer here is read: a step that
   * cannot show its own stored answer is a step the back arrow draws blank.
   *
   * Null on the dating arm, where the row is not read at all.
   */
  roleTitle: string | null
  company: string | null
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
const DATING_STEPS: readonly OnboardingRoute[] = [
  '/onboarding/track',
  '/onboarding/focus',
  '/onboarding/name',
  '/onboarding/mic',
  '/onboarding/ready',
]

/**
 * ── THE INTERVIEW ARM'S RUN ──────────────────────────────────────────────
 *
 * Until 16 September there was one list and it was this one with the dating
 * focus question in it, so an account that answered "job interviews" was asked
 * what it found hard about flirting, told how a three-minute rep works, and
 * then handed to `/interview` — where it met "Tell us about the job" and a
 * three-step wizard before anything could be spoken. Cold account to
 * microphone was eleven screens, six of them about the other product.
 *
 * Two steps replace the focus question. The **role** is what
 * `interview_setups.complete` actually is (a role title and nothing else), so
 * it is the difference between landing on a free screener and landing on a
 * wizard. The **CV** is the one document that makes the questions about this
 * person rather than about the field — and it is here, ahead of the name and
 * the microphone, because it is the only genuinely optional step on the run
 * and an optional step placed last is a step nobody does.
 *
 * Both are skippable and both stamp a flag when asked rather than when
 * answered, which is what stops the resume returning somebody to a question
 * they have already declined. See `onboardingResumePath`.
 */
const INTERVIEW_STEPS: readonly OnboardingRoute[] = [
  '/onboarding/track',
  '/onboarding/role',
  '/onboarding/cv',
  '/onboarding/name',
  '/onboarding/mic',
  '/onboarding/ready',
]

function stepsFor(track: Track | null): readonly OnboardingRoute[] {
  return track === 'interview' ? INTERVIEW_STEPS : DATING_STEPS
}

export function OnboardingScreen({ route, context }: { route: OnboardingRoute; context: OnboardingContext }) {
  // See the step lists. The gate stands on its own: no rail, no back arrow,
  // nothing that suggests it can be skipped past.
  if (route === '/onboarding/age') {
    return <main className="onboarding-page"><OnboardingSignOut /><div className="onboarding-shell"><AgeStep /></div></main>
  }
  /**
   * The resume is a ROUTE and the run holds an INDEX, so the route has to be
   * looked up in the list this account is actually walking. Resolved here, off
   * `context.track` — which the server only reports once the track flag says it
   * was chosen, so an unanswered run opens at zero on either list.
   */
  const start = stepsFor(context.track).indexOf(context.resumeRoute)
  return <OnboardingRun start={start < 0 ? 0 : start} context={context} />
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

function OnboardingRun({ start, context }: { start: number; context: OnboardingContext }) {
  const [track, setTrack] = useState<Track | null>(context.track)
  const [step, setStep] = useState(() => Math.min(Math.max(start, 0), stepsFor(context.track).length - 1))
  const [focusArea, setFocusArea] = useState<FocusArea | null>(context.focusArea)
  const [displayName, setDisplayName] = useState<string | null>(context.displayName)
  /**
   * The interview arm's question two, opened on what is already stored — the
   * same rule every other step follows, and the reason the back arrow shows an
   * answered question answered rather than blank.
   */
  const [roleTitle, setRoleTitle] = useState<string | null>(context.roleTitle)
  const [company, setCompany] = useState<string | null>(context.company)
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
   * The list this run is walking, which changes under the user the moment the
   * track answer does. Both lists start with the track question and neither
   * can be re-entered above it, so the index stays meaningful across a switch.
   */
  const steps = stepsFor(track)

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
    setStep(Math.min(Math.max(next, 0), steps.length - 1))
    busy.current = false
  }, [steps.length])

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
   * The role step's write, which is two writes to two tables.
   *
   * The title is the user's own document about their own job hunt and belongs
   * in `interview_setups`; the flag that says the step HAPPENED belongs on the
   * profile, where the route guard reads it without a join (see
   * `ONBOARDING_ROLE_FLAG`). The flag is stamped only once the title has
   * stored, so a failed write returns them to the question rather than
   * skipping silently past it.
   *
   * A skip with nothing stored writes no setup row at all — an empty row is a
   * row the user never created, and `complete` reads false off its absence
   * just as well. A skip that CLEARS a title they gave earlier does write,
   * because that is a real edit.
   */
  const saveRole = useCallback((value: { roleTitle: string | null; company: string | null }) => {
    const stamp = () => saveOnboardingChoice({ roleAsked: true })
    if (!value.roleTitle && !roleTitle) return stamp()
    return saveInterviewSetup({ roleTitle: value.roleTitle ?? '', company: value.company ?? '' })
      .then((result) => (result.ok ? stamp() : result))
  }, [roleTitle])

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

  const route = steps[step] as OnboardingRoute

  return (
    <main className="onboarding-page">
      <OnboardingProgress step={step} steps={steps} />
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
                onChoose={(value) => { setFocusArea(value); commit(() => saveOnboardingChoice({ focusArea: value }), step, step + 1) }}
              />
            : null}
          {/* The interview arm's question two. */}
          {route === '/onboarding/role'
            ? <RoleStep
                roleTitle={roleTitle}
                company={company}
                onSubmit={(value) => {
                  setRoleTitle(value.roleTitle)
                  setCompany(value.company)
                  commit(() => saveRole(value), step, step + 1)
                }}
              />
            : null}
          {route === '/onboarding/cv'
            ? <CvStep
                roleTitle={roleTitle}
                onDone={() => { commit(() => saveOnboardingChoice({ cvAsked: true }), step, step + 1) }}
              />
            : null}
          {route === '/onboarding/name'
            ? <NameStep
                value={displayName}
                track={track}
                // The CV sits in front of this on the interview arm, so the
                // rail and the eyebrow have to agree about which number it is.
                eyebrow={track === 'interview' ? 'Step four' : 'Step three'}
                onSubmit={(value) => { setDisplayName(value); commit(() => saveOnboardingChoice({ displayName: value }), step, step + 1) }}
              />
            : null}
          {route === '/onboarding/mic'
            ? <MicStep firstRep={firstRep} track={track} onDone={() => goTo(step + 1)} />
            : null}
          {route === '/onboarding/ready'
            ? track === 'interview'
              ? <InterviewReadyStep name={displayName} roleTitle={roleTitle} />
              : <ReadyStep firstRep={firstRep} name={displayName} />
            : null}
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
function OnboardingProgress({ step, steps }: { step: number; steps: readonly OnboardingRoute[] }) {
  return (
    <div className="onboarding-progress" role="group" aria-label={`Step ${step + 1} of ${steps.length}`}>
      {steps.map((route, index) => (
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
 * The CV
 * ------------------------------------------------------------------ */

/**
 * The interview arm's third step, and the only optional one on either run.
 *
 * ── WHY IT IS INSIDE THE RUN RATHER THAN BEHIND `/interview` ─────────────
 *
 * It was on `/interview/setup/cv`, step two of a three-step wizard reached
 * from a dashboard that the end of onboarding dropped people on. Nobody
 * arriving to practise an interview wants a dashboard: they want the round
 * they were promised, and the CV is the one thing that makes its questions
 * about them. So it is asked here, once, between the role and the microphone.
 *
 * `/interview/setup/cv` is untouched and is still where a CV is replaced or
 * removed later. This screen uploads and moves on — the full editor, with the
 * replace sheet and the removal confirmation, stays on the profile where a
 * destructive control belongs.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────
 *
 * It does not block. §C4 is explicit that a missing CV degrades to the field,
 * the role and the job description rather than to a generic interview, and an
 * unreadable file is a warning rather than an error for the same reason. A
 * document upload standing between somebody and the thing they came to
 * practise is the wrong trade at the wrong moment.
 */
function CvStep({ roleTitle, onDone }: { roleTitle: string | null; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [stored, setStored] = useState<{ name: string; chars: number | null } | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)

  /**
   * `CvSetup`'s lesson, which cost an upload that had in fact succeeded: this
   * has to be ARMED on mount, not only disarmed on unmount. `reactStrictMode`
   * double-invokes effects, so a cleanup-only version is stuck false forever
   * after the first remount and every guarded `setState` below bails.
   */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const upload = (next: File | null) => {
    setError(undefined)
    setWarning(null)
    if (!next) { setFile(null); return }
    const name = next.name.toLowerCase()
    // The same two bounds `CvSetup` states, stated here too rather than
    // discovered by a rejected upload.
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) { setError('Use a PDF or DOCX file.'); return }
    if (next.size > 5 * 1024 * 1024) { setError('File must be 5 MB or smaller.'); return }
    setFile(next)
    setUploading(true)
    const form = new FormData()
    form.set('file', next)
    void uploadCv(form)
      .then((result) => {
        if (!mounted.current) return
        setUploading(false)
        setFile(null)
        if (!result.ok) { setError(result.message ?? 'Not uploaded.'); return }
        setStored({ name: result.fileName ?? next.name, chars: result.chars })
        setWarning(result.warning)
      })
      .catch(() => {
        if (!mounted.current) return
        setUploading(false)
        setFile(null)
        setError('That upload did not finish. Try it again.')
      })
  }

  const drop = () => {
    setStored(null)
    setWarning(null)
    void removeCv().catch(() => undefined)
  }

  return (
    <section className="onboarding-question">
      <span className="label">Step three</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>Add your CV</h1>
      <p className="onboarding-sub">
        {roleTitle
          ? `It is what turns "tell me about a project" into a question about yours. Read once, kept private, and used only to brief your interviewer for ${roleTitle}.`
          : 'It is what turns "tell me about a project" into a question about yours. Read once, kept private, and used only to brief your interviewer.'}
      </p>
      <div className="setup-form">
        {stored && !file
          ? (
            <Card className="uploaded-file">
              <Check size={28} strokeWidth={1.5} />
              <div>
                <strong>{stored.name}</strong>
                <span>{stored.chars === null ? 'Uploaded' : `${stored.chars.toLocaleString()} characters read`}</span>
              </div>
              <Button size="sm" variant="secondary" onClick={drop}>Remove</Button>
            </Card>
          )
          : <FileDrop file={file} onFile={upload} error={error} />}
        {uploading ? <p className="label mute" role="status">Reading it now. This takes a second and happens once.</p> : null}
        {/* Not an error (§C4). The file is stored; the words did not come out
            of it, and the interview still runs off the role and the field. */}
        {warning ? <Card className="cv-warning"><span className="label">The file is saved, the words are not</span><p>{warning}</p></Card> : null}
        <Button size="lg" fullWidth disabled={uploading} onClick={onDone}>Continue</Button>
        {stored
          ? null
          : <Button variant="ghost" fullWidth disabled={uploading} onClick={onDone}>I&apos;ll add it later</Button>}
      </div>
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
  const interview = track === 'interview'
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
    if (!interview && firstRep) router.prefetch(`/rep/${firstRep.id}/live`)
  }, [firstRep, interview, router])

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
      {/* Both arms are voice, and only one of them calls it a rep. */}
      <p>{interview ? 'An interview is a spoken conversation, so this is the one permission the app needs.' : 'A rep is a spoken conversation, so this is the one permission the app needs.'} Your browser will ask next. This check is not recorded at all; {interview ? 'interviews' : 'reps'} are, and they are deleted thirty days later.</p>
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
      <p>Headphones recommended — {interview ? 'your interviewer' : 'she'}&apos;ll hear {interview ? 'themselves' : 'herself'} otherwise.</p>
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
 * The interview arm's last screen, and it ends in the free round rather than
 * on a dashboard (LAUNCH-GAP D22).
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────
 *
 * D1 got the run to stop ending at `/train` with a dating persona in front of
 * somebody who had said they came for interviews. It ended at `/interview`
 * instead — which for a brand-new account is `SetupPrompt`: "Tell us about the
 * job", then a three-step wizard, then an interviewer picker, then a run setup,
 * and only then a brief. Five screens between an account and the thing the
 * sign-up screen promised was free.
 *
 * Four of those five have already happened by the time anybody reaches this
 * one: the role is question two and the CV is question three. What is left is
 * the only choice worth making per run, and it is the one that is genuinely
 * interesting — **who is in the room**. So it is the last step rather than a
 * fourth screen behind a dashboard, and choosing somebody starts the round.
 *
 * ── WHY THE ROUND IS WRITTEN HERE ────────────────────────────────────────
 *
 * B1, one screen earlier than B1 found it. `setupFromRow` never answers a null
 * round — it clamps to `DEFAULT_ROUND`, which is the ten-minute recruiter screen
 * and costs a credit the account does not have. An account holding nothing but
 * the free screener would reach the brief and be refused by its own credit
 * check. `openingRound` is the function that already knows this, and it is
 * asked with the balance rather than assumed.
 */
function InterviewReadyStep({ name, roleTitle }: { name: string | null; roleTitle: string | null }) {
  const router = useRouter()
  const { setSelectedInterviewerId } = useProduct()
  const { data: interviewers, loading } = useInterviewers()
  const { data: user } = useUserState()
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const round = roundType(openingRound((user?.interviewScreenerCredits ?? 0) > 0))

  /**
   * Awaited, not fired and forgotten — the same rule the dating brief follows.
   * The guard sends an unfinished run straight back here, so leaving before
   * `finishOnboarding` lands is a loop rather than an interview. The round and
   * the interviewer go first: they are what the brief on the other side reads.
   */
  const start = async (interviewerId: string) => {
    setStarting(interviewerId)
    setError(null)
    setSelectedInterviewerId(interviewerId)
    const saved = await saveInterviewSetup({ interviewerSlug: interviewerId, round: round.id })
      .catch(() => ({ ok: false, message: 'Could not save — check your connection.' }))
    if (!saved.ok) {
      setStarting(null)
      setError(saved.message ?? 'Could not save. Try again.')
      return
    }
    await finishOnboarding()
    router.push(`/interview/rep/${interviewerId}/brief`)
  }

  return (
    <section className="onboarding-question interview-ready">
      <span className="label">Last thing</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>Who is in the room?</h1>
      <p className="onboarding-sub">
        {roleTitle
          ? `${round.label} for ${roleTitle}. ${round.durationMs / 60_000} minutes, free on your account. They decide how warm the room is — how hard the questions are is yours to set afterwards.`
          : `${round.label}. ${round.durationMs / 60_000} minutes, free on your account. They decide how warm the room is — how hard the questions are is yours to set afterwards.`}
      </p>
      {error ? <div className="onboarding-error form-error" role="alert">{error}</div> : null}
      <div className="option-stack">
        {loading
          ? <><Skeleton height={76} /><Skeleton height={76} /><Skeleton height={76} /></>
          : interviewers.map((interviewer) => (
            <button
              key={interviewer.id}
              type="button"
              className="option-card interviewer-option"
              disabled={starting !== null}
              aria-busy={starting === interviewer.id}
              onClick={() => { tap(); void start(interviewer.id) }}
            >
              <FluidPersona name={interviewer.name} personaId={interviewer.id} warmth={16} size={40} />
              <span><strong>{interviewer.name}</strong><small>{interviewer.styleLabel}</small></span>
            </button>
          ))}
      </div>
      {/* The honest end to a roster nothing has seeded — a Start button with
          nobody behind it would spend a credit on an empty room. */}
      {!loading && interviewers.length === 0
        ? (
          <Button
            size="lg"
            fullWidth
            loading={starting !== null}
            onClick={() => { setStarting('none'); void finishOnboarding().then(() => router.push('/interview')) }}
          >
            {name ? `Go to interviews, ${name}` : 'Go to interviews'}
          </Button>
        )
        : null}
    </section>
  )
}


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
function ReadyStep({ firstRep, name }: { firstRep: FirstRepCandidate | null; name: string | null }) {
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
      {/* D23 · THE SCREEN A FIRST REP ACTUALLY MEETS.
          `RepBriefScreen` is the brief for somebody who picked a character off
          the roster. A brand-new account never reaches it: this step goes
          straight to `/rep/<id>/live`, so this is the last thing read before
          the microphone opens, for the one user who has never seen any of it.
          The goal was promoted to a headline over there and this screen kept
          only the table — which, once the goal row left the table, meant a
          first-time user was shown LESS than before. Both screens read
          `repGoal` now, for the same reason both read `RuleBlock`. */}
      <p className="brief-goal">{repGoal(false)}</p>
      <button type="button" className="brief-how" onClick={() => setOpen(true)}>How does this work?</button>
      <p className="brief-hook">{firstRep.hook}</p>
      <RuleBlock interview={false} />
      <Button size="lg" fullWidth loading={starting} onClick={() => void start(`/rep/${firstRep.id}/live`)}>
        {name ? `Start, ${name}` : 'Start'}
      </Button>
      <HowItWorks open={open} onClose={() => setOpen(false)} />
    </section>
  )
}

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="How a rep works"><div className="how-list">{['Talk out loud.', 'You have three minutes.', 'Her form shows how she feels.', 'She decides at the end. Nothing she decides is scored.'].map((item, index) => <div key={item}><span className="data">0{index + 1}</span><p>{item}</p></div>)}</div><div className="ring-illustration" aria-hidden="true"><i /><i /><i /></div></Sheet>
}

export { FOCUS_OPTIONS }
export type { OnboardingRoute }
