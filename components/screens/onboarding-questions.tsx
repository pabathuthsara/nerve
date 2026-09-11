'use client'

/**
 * The three questions, and the two primitives they are built from.
 *
 * ── WHY THESE MOVED OUT OF `onboarding-screens.tsx` ──────────────────────
 *
 * They are asked twice now. The signed-in run asks them after sign-up, over a
 * `profiles` row, writing each answer as it is given; `/start` asks the same
 * three before an account exists and carries the answers into the sign-up form
 * (`lib/data/start-funnel.ts` is the argument for why that reordering is the
 * whole feature). Two runs, one set of questions.
 *
 * A second authored copy was the obvious alternative and it is the mistake
 * this file exists to prevent. `PRESENTATION.name` is the precedent: renaming
 * rung 1 from Tess to Cass updated the persona, the contract, the database and
 * the roster card, and left the landing page introducing her by the old name —
 * because one fact had two homes. "What's the hard part?" is a fact about the
 * product in exactly the same way.
 *
 * Nothing here changed in the move except `TrackStep`'s English option, which
 * had to learn that it is sometimes asked by somebody with no row to stamp.
 * See `english` below. Everything else is the code that was in the run,
 * verbatim, and `dating-arm.test.ts` is untouched by design: none of this is
 * inside the rep.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, Chip, Input } from '@/components/ui'
import { FluidPersona } from '@/components/fluid-persona'
import { Mark, focusMark, type MarkName } from '@/components/marks'
import type { FirstRepCandidate } from '@/lib/data/first-rep'
import type { FocusArea } from '@/lib/data/focus'
import type { Track } from '@/lib/data/types'

/**
 * What happens when somebody asks for the track that does not exist.
 *
 * `record` is how the ask is counted, and it differs by run because a
 * `ui_flags` stamp needs a profile row: the signed-in run passes
 * `recordTrackWaitlist('english')`, and `/start` passes a function that keeps
 * the ask in the funnel's own answers so `flushStartAnswers` can write the
 * same flag once the account exists.
 *
 * `counted` is the sentence that follows, and it is a separate prop rather
 * than derived from the same boolean because the honest copy differs. "You
 * have been counted" is true on one arm the moment it is read and only
 * eventually true on the other — and a stranger who then closes the tab was
 * never counted at all. So the pre-auth arm does not claim it.
 */
export interface EnglishWaitlist {
  record: () => Promise<unknown>
  counted: boolean
}

export function TrackStep({ value, english, onChoose }: {
  value: Track | null
  english: EnglishWaitlist
  onChoose: (value: Track) => void
}) {
  const [waitlisted, setWaitlisted] = useState(false)
  const [recording, setRecording] = useState(false)
  const heading = useRef<HTMLHeadingElement | null>(null)

  // The waitlist replaces the question in place rather than navigating, so
  // nothing would otherwise tell a screen reader the screen had changed.
  useEffect(() => { if (waitlisted) heading.current?.focus() }, [waitlisted])

  /**
   * English is still M-something. Recording the demand is the honest version of
   * a track that does not exist yet; switching them to it would not be.
   *
   * **Interview is no longer one of these** (LAUNCH-GAP D1). It was a waitlist
   * because the track was screens over fixtures; it shipped on 7 September, and
   * every account is granted a free five-minute screener at sign-up, so the
   * honest answer to "job interviews" is now the interview track rather than a
   * note that we counted the ask.
   *
   * The write is awaited here, unlike every other answer on the run. The screen
   * it opens makes a claim about it, and a claim should not go up before the
   * thing it describes has happened.
   */
  const askForEnglish = () => {
    setRecording(true)
    void english.record()
      .then(() => { setRecording(false); setWaitlisted(true) })
      .catch(() => { setRecording(false); setWaitlisted(true) })
  }

  if (waitlisted) {
    return (
      <div className="onboarding-state">
        <span className="label volt">Noted</span>
        <h1 className="display-lg" ref={heading} tabIndex={-1} data-step-heading>English practice opens soon.</h1>
        <p>
          {english.counted
            ? 'We count who asks, and you have been counted. Both other tracks are live if you want to start building the same conversational control.'
            : 'We count who asks. Both other tracks are live, and either one builds the same conversational control — pick one and you can be talking in about a minute.'}
        </p>
        <Button fullWidth size="lg" onClick={() => onChoose('dating')}>Try a dating rep meanwhile</Button>
        <Button fullWidth variant="ghost" onClick={() => setWaitlisted(false)}>Choose something else</Button>
      </div>
    )
  }

  return (
    <Question
      eyebrow="Step one"
      title="What are you training for?"
      sub="It decides who you meet and what the reps are about. You can change it later."
    >
      <Option
        label="Talking to people I'm attracted to"
        sub="Approach, conversation, getting the number"
        mark="state-roster"
        selected={value === 'dating'}
        onClick={() => onChoose('dating')}
      />
      {/* D1. This answer is now honoured: the run ends on `/interview` when it
          is chosen, rather than at `/train` with a dating persona and a warmth
          meter in front of somebody who said they came for interviews. */}
      <Option
        label="Job interviews"
        sub="Behavioural, technical, panel — with one free five-minute round"
        mark="kind-technique"
        selected={value === 'interview'}
        onClick={() => onChoose('interview')}
      />
      <Option label="Speaking English more naturally" sub="Coming soon" mark="dim-listening" busy={recording} aside={<Chip>Soon</Chip>} onClick={askForEnglish} />
    </Question>
  )
}

const FOCUS_OPTIONS: readonly { label: string; value: FocusArea }[] = [
  { label: 'Starting the conversation', value: 'opening' },
  { label: 'Keeping it going past two lines', value: 'sustaining' },
  { label: 'Making it flirty without being weird', value: 'flirting' },
  { label: "Handling it when she's not interested", value: 'rejection' },
]

/** Shared with `/profile/settings`, which is where this answer can be changed. */
export { FOCUS_OPTIONS }

/**
 * V19. The copy promised this answer "picks who you meet first" and then
 * showed nothing — while the run has already resolved her, two lines up, with
 * the same `chooseTodayPersona` the answer will actually be spent on.
 *
 * So the moment an option is chosen, she appears. It is the most compelling
 * image in the product, shown at the exact moment somebody is being asked to
 * care, and it costs one prop: the orb was already being rendered on the step
 * after this one.
 */
export function FocusStep({ value, firstRep, track, onChoose }: { value: FocusArea | null; firstRep: FirstRepCandidate | null; track: Track | null; onChoose: (value: FocusArea) => void }) {
  /**
   * D1's edge. Every account has both tracks now, and somebody who has just
   * answered "job interviews" being asked about flirting with no explanation
   * reads as the run having forgotten what they said one screen ago. The
   * answer is still worth collecting — it steers the dating reps they also
   * have — so the question stays and says which half it is about.
   */
  const interview = track === 'interview'
  return (
    <Question
      eyebrow="Step two"
      title={interview ? 'And on the dating reps?' : "What's the hard part?"}
      sub={interview
        ? 'Your account has both tracks. This one is only about the dating side — it picks who you meet there and your first challenge out in the world. Interviews are set up separately, on the next screen but one.'
        : 'This one earns its keep: it picks who you meet first, your first challenge out in the world, and the technique on your brief.'}
    >
      {FOCUS_OPTIONS.map((option) => (
        <Option key={option.value} label={option.label} mark={focusMark(option.value) ?? undefined} selected={value === option.value} onClick={() => onChoose(option.value)} />
      ))}
      {value && firstRep && !interview ? (
        <p className="focus-preview" aria-live="polite">
          <FluidPersona name={firstRep.name} personaId={firstRep.id} warmth={18} size={42} />
          <span><span className="label">First up</span> {firstRep.name} — {firstRep.setting.toLowerCase()}</span>
        </p>
      ) : null}
    </Question>
  )
}

/**
 * The cheapest personalisation in the product (§08's `usesYourName` gate).
 *
 * Every character already carries a dial for whether she may use your name,
 * and the steering item that opens it — "You may use his name." — has been
 * shipping into contracts that were never told what the name is. Nobody was
 * ever asked for one, so `/profile` rendered the local part of an email
 * address in display caps and called it a person.
 *
 * First name only, and the copy says why. Asking for a full name here would
 * be asking for identity; this is asking what a stranger in a bookshop would
 * end up calling you.
 *
 * Skippable, deliberately. A name is the one thing on this run somebody might
 * not want to give, and the alternative to a skip is a required field between
 * a new account and its first rep.
 */
export function NameStep({ value, onSubmit }: { value: string | null; onSubmit: (value: string | null) => void }) {
  const [name, setName] = useState(value ?? '')
  const trimmed = name.trim()
  return (
    <section className="onboarding-question">
      <span className="label">Step three</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>What should she call you?</h1>
      <p className="onboarding-sub">First name is plenty. She only uses it once a conversation has earned it — and never if you skip this.</p>
      <form className="option-stack" onSubmit={(event) => { event.preventDefault(); onSubmit(trimmed || null) }}>
        <Input label="First name" name="displayName" autoComplete="given-name" maxLength={40} placeholder="Sam" value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" size="lg" fullWidth>Continue</Button>
        <Button type="button" variant="ghost" fullWidth onClick={() => onSubmit(null)}>Skip this</Button>
      </form>
    </section>
  )
}

export function Question({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="onboarding-question">
      <span className="label">{eyebrow}</span>
      <h1 className="display-lg" tabIndex={-1} data-step-heading>{title}</h1>
      {sub ? <p className="onboarding-sub">{sub}</p> : null}
      <div className="option-stack">{children}</div>
    </section>
  )
}

/**
 * `selected` is a prop, not local state.
 *
 * It used to be local, which meant the back arrow returned to a question the
 * database had the answer to and drew it blank — so the only way forward from
 * a step somebody revisited was to answer it a second time.
 *
 * `busy` is the one place on the run that waits for a write, and it is the
 * card that says so rather than a spinner (§02).
 */
export function Option({ label, sub, mark, aside, disabled = false, selected = false, busy = false, onClick }: {
  label: string
  sub?: string
  /**
   * V18. The two answers that steer the whole product rendered as a stack of
   * `<strong>` and `<small>` — a settings form, on the screen that decides who
   * you meet and what every rep is about. The focus answers reuse the SIX
   * DIMENSION MARKS deliberately: the vocabulary is learned here, in the first
   * ninety seconds somebody spends in the product, and then means the same
   * thing on the brief, the scorecard, Progress and the library.
   */
  mark?: MarkName
  aside?: React.ReactNode
  disabled?: boolean
  selected?: boolean
  busy?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={`option-card${selected ? ' option-card--selected' : ''}${busy ? ' option-card--busy' : ''}`}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-pressed={onClick ? selected : undefined}
      onClick={onClick}
    >
      {mark ? <Mark name={mark} size={22} current={selected} /> : null}
      <span><strong>{label}</strong>{sub ? <small>{sub}</small> : null}</span>
      {aside}
    </button>
  )
}
