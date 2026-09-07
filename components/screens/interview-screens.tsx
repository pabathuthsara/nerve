'use client'

/**
 * The interview track's screens, on real data (INTERVIEW-PLAN C1–C6).
 *
 * Everything here was built against fixtures in August and shipped behind a
 * shut door. What changed: `useInterviewSetup` and `useInterviewers` read the
 * database, the three setup steps persist through Server Actions, the CV
 * genuinely uploads and is genuinely read, and two things the flow never had —
 * the field and the round — are on it, because both decide what the interviewer
 * is told and how long the rep runs.
 *
 * **The progress bar that was a `setInterval` is gone.** A progress bar that is
 * a timer is worse than no progress bar: it claims to know something it does
 * not, and the thing it was pretending to measure never happened at all.
 */

import Link from 'next/link'
import { Check, GripVertical, Plus, Trash2, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  useInterviewProgress,
  useInterviewers,
  useInterviewSetup,
  useSessionHistory,
  useUserState,
} from '@/lib/data'
import { AppShell } from '@/components/app-shell'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  FileDrop,
  Input,
  Select,
  Skeleton,
  Stat,
  ProgressBar,
  Textarea,
} from '@/components/ui'
import { CVReplaceSheet } from '@/components/modals'
import { useProduct } from '@/components/product-provider'
import { FluidPersona } from '@/components/fluid-persona'
import { removeCv, saveInterviewSetup, setInterviewCaptions, startPackCheckout, uploadCv } from '@/app/interview/actions'
import {
  CREDIT_EXPIRY_NOTE,
  INTERVIEW_PACKS,
  perInterview,
  type InterviewPack,
} from '@/lib/site/plans'
import {
  DEFAULT_FIELD,
  interviewField,
  selectableInterviewFields,
  type InterviewFieldId,
} from '@/lib/data/interview-fields'
import { fieldHasProbes } from '@/lib/data/interview-probes'
import { ROUND_SHAPE_LABEL, ROUND_TYPES, roundType, type RoundTypeId } from '@/lib/data/interview-credits'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LEVELS,
  difficultyFromRoleTitle,
  difficultySpec,
  toDifficultyLevel,
  type DifficultyLevel,
} from '@/lib/data/interview-difficulty'
import { DIMENSION_LABEL, progressReading } from '@/lib/data/interview-progress'
import { JOB_DESCRIPTION_LIMIT } from '@/lib/data/interview-limits'

export type InterviewRoute =
  | '/interview'
  | '/interview/setup/role'
  | '/interview/setup/cv'
  | '/interview/setup/questions'
  | '/interview/interviewers'

export function InterviewScreen({ route, packsOpen = false }: { route: InterviewRoute; packsOpen?: boolean }) {
  if (route === '/interview/setup/role') return <RoleSetup />
  if (route === '/interview/setup/cv') return <CvSetup />
  if (route === '/interview/setup/questions') return <QuestionsSetup />
  if (route === '/interview/interviewers') return <InterviewerPicker />
  return <InterviewHome packsOpen={packsOpen} />
}

function InterviewHome({ packsOpen }: { packsOpen: boolean }) {
  const { selectedInterviewerId } = useProduct()
  const { data: setup, loading: setupLoading } = useInterviewSetup()
  const { data: interviewers, loading: interviewersLoading } = useInterviewers()
  const { data: sessions } = useSessionHistory()
  /**
   * **A NULL SETUP IS NOT A LOADING STATE**, and gating the skeleton on it was
   * a permanent spinner for exactly the person this screen exists for.
   *
   * `useInterviewSetup` returns null when there is no `interview_setups` row,
   * which is every account that has never been through the flow. The old mock
   * always returned an object, so `!setup` was unreachable and shipped looking
   * fine. Both hooks have to be waited on, though — one resolving first would
   * flash "Set up your interview" at somebody whose setup is complete.
   */
  const loading = setupLoading || interviewersLoading
  const interviewer = interviewers.find((item) => item.id === (selectedInterviewerId ?? setup?.interviewerId))
    ?? interviewers[0]
  const last = sessions.find((session) => session.track === 'interview')
  const round = roundType(setup?.round)
  const { data: user } = useUserState()
  /**
   * WHAT CAN PAY FOR *THIS* ROUND, computed the same way the brief computes it.
   *
   * A screener credit only ever buys the five-minute screener, so the account's
   * total is the wrong number to gate on: one free screener and a recruiter
   * round selected is a balance of 1 that cannot start anything. The brief
   * already refuses it in a sentence — this is what stops somebody being sent
   * there to read it.
   */
  const screenerCredits = user?.interviewScreenerCredits ?? 0
  const spendable = round.credits === 0
    ? user?.interviewCredits ?? 0
    : Math.max(0, (user?.interviewCredits ?? 0) - screenerCredits)
  return <AppShell title="Interview"><div className="train-grid interview-home"><section>{loading ? <Skeleton height={520} /> : setup?.complete && interviewer ? <article className="interview-hero"><div className="interview-hero__top"><span className="label">Next simulation</span><Chip tone="volt">{round.label}</Chip></div><div className="interview-role"><span className="label">Role</span><h1 className="display-xl">{setup.roleTitle}</h1><p>{setup.company}</p></div><div className="interviewer-strip"><FluidPersona name={interviewer.name} personaId={interviewer.id} warmth={16} size={72} /><div><strong>{interviewer.name}</strong><span className="label">{interviewer.styleLabel}</span></div></div>{spendable > 0
      ? <Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={`/interview/rep/${interviewer.id}/brief`}>Start interview</Link>
      : <OutOfCredits round={round} hasScreener={screenerCredits > 0} />}</article> : <SetupPrompt />}</section><aside className="side-stack"><Card className="interview-stats"><Stat label="Role" value={setup?.roleTitle || 'Not set'} /><Stat label="Round" value={`${round.label} · ${round.durationMs / 60_000} min`} detail={ROUND_SHAPE_LABEL[round.shape]} />{/* The second axis, shown where the round is (§5.1). It only exists on a
        round that probes, and on one that does not, printing "Mid" beside a
        recruiter screen would name a dial that changes nothing. */}
{round.probeShare > 0 ? <Stat label="Question difficulty" value={difficultySpec(setup?.difficulty ?? DEFAULT_DIFFICULTY).label} detail={difficultySpec(setup?.difficulty ?? DEFAULT_DIFFICULTY).tests} /> : null}<Stat label="Interviewer" value={interviewer?.name ?? 'Not set'} /><Stat label="Questions added" value={setup?.customQuestions.length ?? 0} /></Card><Link className="arena-button arena-button--secondary arena-button--full" href="/interview/setup/role">Edit setup</Link><CaptionSetting enabled={setup?.captions ?? false} /><CreditsPanel credits={user?.interviewCredits ?? 0} screener={screenerCredits} packsOpen={packsOpen} /><ReadinessPanel />{last ? <Card><span className="label">Last interview</span><div className="interview-last"><span><strong>{last.personaName}</strong><small>{last.compositeScore === null ? 'Not graded' : 'Graded'}</small></span><span className="data">{last.compositeScore ?? '—'}</span></div></Card> : null}</aside></div></AppShell>
}

/**
 * What is in the balance, and what it costs to fill it (INTERVIEW-PLAN D3, E1).
 *
 * ── WHY THE TWO EXPIRY RULES ARE ON THIS CARD ────────────────────────────
 *
 * §5.5 splits credits in two: bought ones never expire and survive a
 * cancellation, granted ones die with the month that handed them out. That is a
 * sentence a disputing customer quotes, so it is stated where the money is
 * spent as well as in the terms — `CREDIT_EXPIRY_NOTE` is the one string, read
 * by this card, `/pricing` and `RefundDocument`, so the three cannot drift.
 *
 * ── AND WHY THE BUTTONS ARE SECONDARY ────────────────────────────────────
 *
 * Volt appears once per screen. On this screen it is **Start interview**, which
 * is the thing somebody came here to do. A buy button drawn in volt beside it
 * would make the account's own money the loudest object on a training screen,
 * which is the shape §14 says a merchant-of-record reviewer reads badly and the
 * shape `RETENTION-AUDIT.md` §4 refuses anyway.
 */
function CreditsPanel({ credits, screener, packsOpen }: { credits: number; screener: number; packsOpen: boolean }) {
  const paid = Math.max(0, credits - screener)
  return (
    <Card className="interview-credits">
      <span className="label">Interview credits</span>
      <JustBought />
      <div className="interview-last">
        <span><strong>Available</strong>{screener > 0 ? <small>including one free screener</small> : null}</span>
        <span className="data">{credits}</span>
      </div>
      {paid === 0 && screener > 0
        ? <p className="label mute">The free screener pays for the five-minute round and nothing else. The longer rounds need a credit.</p>
        : null}
      {/* Hidden rather than broken when the deployment cannot open a checkout.
          `packsOpen` is `packsConfigured()`, read on the server — a buy button
          that errors on somebody trying to give us money is worse than no
          button, and rule 15 guarantees a window where this is false: a Vercel
          variable added after a build started is not in that build. */}
      {packsOpen
        ? <PackButtons />
        : <p className="label mute">Interview credits are not on sale from this deployment yet.</p>}
      <p className="label mute">{CREDIT_EXPIRY_NOTE}</p>
    </Card>
  )
}

/**
 * The seconds between paying and the credits appearing.
 *
 * The buyer comes back from Whop's checkout to `/interview?bought=1` while the
 * `payment.succeeded` webhook is still in flight — usually under a second, and
 * occasionally longer if Whop is retrying. Without this, somebody who has just
 * paid $29 lands on a screen showing the balance they had before, which reads
 * as a failed purchase and is the exact moment a support ticket or a chargeback
 * gets written.
 *
 * It says what is true rather than pretending to know: the payment went
 * through, the credits are moments away, and here is the button that looks
 * again. One deliberate action beats a poll that might never resolve, and
 * §02's no-spinners rule is about exactly this kind of indefinite wait.
 *
 * **A full navigation, not `router.refresh()`.** The balance comes from
 * `useUserState`, which is `useAsync(fetchUserState, null, [])` — a browser
 * fetch on an empty dependency array. Refreshing the server tree re-renders
 * around it and leaves the number exactly where it was, so the button would
 * have looked like it did nothing on the one screen where that reads as a lost
 * payment. Going to `/interview` without the query drops the banner too, so a
 * balance that has arrived stops being announced.
 *
 * Read off `window.location` rather than `useSearchParams`, which would need a
 * Suspense boundary around a card that is not the reason this page renders.
 */
function JustBought() {
  const [bought, setBought] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setBought(new URLSearchParams(window.location.search).get('bought') === '1')
  }, [])
  if (!bought) return null
  return (
    <div className="credits-bought" role="status">
      <strong>Payment received.</strong>
      <p>Credits usually land within a few seconds of the receipt.</p>
      <button type="button" className="arena-button arena-button--secondary" onClick={() => { window.location.href = '/interview' }}>
        Check again
      </button>
    </div>
  )
}

/**
 * The three packs, from the one authored record.
 *
 * Never a hardcoded price. `lib/site/plans.ts` is what `/pricing` prints, what
 * `npm run whop:setup` creates the plans at and what `npm run whop:verify`
 * asserts against the provider — so a price changed there moves the page, the
 * vendor and the preflight together. Two numbers for one product is the failure
 * that file exists to prevent (§14).
 */
function PackButtons() {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <ul className="pack-list">
        {INTERVIEW_PACKS.map((pack) => (
          <li key={pack.id}>
            <button
              type="button"
              className="arena-button arena-button--secondary arena-button--full"
              disabled={pending !== null}
              onClick={() => {
                setError(null)
                setPending(pack.id)
                void startPackCheckout(pack.id).then((result) => {
                  if (result.ok && result.url) {
                    // A full navigation rather than a router push: the checkout
                    // is the provider's own page on their own origin.
                    window.location.href = result.url
                    return
                  }
                  setPending(null)
                  setError(result.message ?? 'Could not open checkout.')
                })
              }}
            >
              <span>{pack.name}</span>
              <span className="data">{pending === pack.id ? 'Opening…' : pack.price}</span>
            </button>
            <span className="label mute">{packRate(pack)}</span>
          </li>
        ))}
      </ul>
      {error ? <p className="label" role="status">{error}</p> : null}
    </>
  )
}

/**
 * What one interview costs on this pack.
 *
 * Printed because it is the honest comparison and because the ladder only makes
 * sense with it: $59 is a bigger number than $9 and a much smaller one per
 * interview, and a page that shows only the totals is asking somebody to do
 * arithmetic to find the offer.
 */
function packRate(pack: InterviewPack): string {
  if (pack.credits === 1) return 'One round, graded'
  return `$${perInterview(pack).toFixed(2)} an interview`
}

/**
 * The balance is empty and the round costs a credit.
 *
 * **This is E1's "not a dead end".** The Start button used to be here
 * unconditionally, and clicking it reached the brief, which refused in a
 * sentence — a screen whose only job was to say no. The refusal on the brief
 * stays, because a client must never be the thing that decides whether a rep
 * may open (rule 11), but nobody should have to walk into it to find out.
 */
function OutOfCredits({ round, hasScreener }: { round: ReturnType<typeof roundType>; hasScreener: boolean }) {
  return (
    <div className="interview-empty">
      <p>
        {hasScreener
          ? `Your free screener pays for the five-minute round. A ${round.label.toLowerCase()} needs a credit.`
          : `A ${round.label.toLowerCase()} costs one credit, and there are none in the account.`}
      </p>
      <p className="label mute">
        {hasScreener
          ? 'Switch the round to Screener on your setup to use it, or add credits below.'
          : 'Add credits below, or switch to a shorter round on your setup.'}
      </p>
    </div>
  )
}

/**
 * The trend across this preparation run (§5.12).
 *
 * Not a rank and not a tier. §07 is why it never mentions a callback: the
 * outcome is worth zero, and "two callbacks out of four" would be scoring the
 * result — which is the thing every competitor in this category does.
 */
function ReadinessPanel() {
  const { data: progress, loading } = useInterviewProgress()
  if (loading || progress.attempts === 0) return null
  const reading = progressReading(progress)
  return (
    <Card className="interview-readiness">
      <span className="label">This run · {progress.attempts} interview{progress.attempts === 1 ? '' : 's'}</span>
      <div className="interview-last"><span><strong>Best</strong></span><span className="data">{progress.best ?? '—'}</span></div>
      {reading ? <p className="label mute">{reading}</p> : <p className="label mute">One more and there is a trend to read.</p>}
      <ul className="interview-dimensions">
        {progress.dimensions.filter((trend) => trend.latest !== null).map((trend) => (
          <li key={trend.dimension}>
            <span className="label">{DIMENSION_LABEL[trend.dimension]}</span>
            <span className="data">{trend.latest}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * The captions setting (§5.11).
 *
 * **Off by default, and the copy says why.** A real interview has no captions
 * and practising without them is the point — but somebody who needs them needs
 * them, and that is the strongest of the three reasons this is a setting rather
 * than a decision. It is a caption and never a prompt: it shows what the
 * interviewer asked and can never carry a hint (C6).
 */
function CaptionSetting({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled)
  const [, start] = useTransition()
  useEffect(() => { setOn(enabled) }, [enabled])
  return (
    <Card className="interview-captions">
      {/* The same switch every other setting in the product uses (§02's
          optimistic write): the toggle moves now and the round trip catches
          up. A control that waits reads as broken. */}
      <div className="setting-row">
        <div><strong>Show the question on screen</strong></div>
        <button
          className="toggle"
          role="switch"
          aria-label="Show the question on screen"
          aria-checked={on}
          onClick={() => {
            const next = !on
            setOn(next)
            start(() => { void setInterviewCaptions(next) })
          }}
        ><i /></button>
      </div>
      <p className="label mute">Off by default. A real interview has no captions, and getting used to holding the question in your head is most of what this is for.</p>
    </Card>
  )
}

function SetupPrompt() { return <article className="setup-prompt"><span className="label">Three quick inputs</span><h1 className="display-xl">Set up your interview</h1><p>Give the interviewer enough context to make the questions specific.</p><div className="setup-progress">{['Role', 'CV', 'Questions'].map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</div><Link className="arena-button arena-button--primary arena-button--lg" href="/interview/setup/role">Start setup</Link></article> }

function SetupLayout({ step, title, children }: { step: number; title: string; children: React.ReactNode }) { return <AppShell title="Interview setup"><div className="setup-page"><div className="setup-kicker"><span className="label">Interview setup</span><span className="data">0{step} / 03</span></div><ProgressBar value={step / 3 * 100} /><h1 className="display-lg">{title}</h1>{children}</div></AppShell> }

function RoleSetup() {
  const router = useRouter()
  const { data: setup, loading } = useInterviewSetup()
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const [field, setField] = useState<InterviewFieldId>(DEFAULT_FIELD)
  const [round, setRound] = useState<RoundTypeId>('recruiter')
  /**
   * The hardness slider (§5.2). `null` is "match my title", which is the state
   * every account starts in and a state the control can go back to — it is not
   * a synonym for level 3, and treating it as one would freeze somebody's
   * questions at mid after they had told us they were interviewing for staff.
   */
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null)
  const { data: user } = useUserState()
  const hasScreener = (user?.interviewScreenerCredits ?? 0) > 0
  const [saving, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The form opens on what is already stored. A setup step that silently
  // discards what somebody typed last week is a step they will not do twice.
  useEffect(() => {
    if (!setup) return
    setRole(setup.roleTitle)
    setCompany(setup.company)
    setDescription(setup.jobDescription)
    setField(setup.field)
    setRound(setup.round)
    setDifficulty(setup.difficultyChoice)
  }, [setup])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    start(() => {
      // A stored field nobody can pick any more must not survive the save —
      // somebody who set "Marketing" in August would otherwise keep an
      // interviewer with no probe domains and no way to change it.
      const chosen = selectableFields.length > 1
        ? field
        : selectableFields[0]?.id ?? DEFAULT_FIELD
      void saveInterviewSetup({ roleTitle: role, company, jobDescription: description, field: chosen, round, difficulty })
        .then((result) => {
          if (result.ok) router.push('/interview/setup/cv')
          else setError(result.message)
        })
    })
  }

  if (loading) return <SetupLayout step={1} title="What are you walking into?"><Skeleton height={420} /></SetupLayout>

  const spec = roundType(round)
  const derived = difficultyFromRoleTitle(role)
  const effective = difficulty ?? derived

  return (
    <SetupLayout step={1} title="What are you walking into?">
      <form className="setup-form" onSubmit={submit}>
        <Input label="Role title" required value={role} onChange={(event) => setRole(event.target.value)} placeholder="Senior Backend Engineer" />
        <Input label="Company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Optional" />

        {/* ONE FIELD, AND IT SAYS SO RATHER THAN PRETENDING (§7.2).
            Probe domains, design briefs and the accuracy grader are authored
            for software and nothing else. A picker offering eleven more would
            be selling a round that cannot ask a healthcare fundamental, pose a
            finance design brief, or say whether either answer was right.
            `selectableInterviewFields` derives the list from which fields have
            domains, so authoring the next one is what opens it — and this
            becomes a real picker on its own when there are two. */}
        {selectableFields.length > 1
          ? (
            <Select
              label="Field"
              value={field}
              onChange={setField}
              options={selectableFields.map((option) => ({ value: option.id, label: option.label }))}
              hint="Decides the questions an interviewer in your world would actually ask. It is also what keeps this useful if you skip the CV."
            />
          )
          : (
            <div className="field">
              <span className="label">Field</span>
              <div className="static-field">
                <strong>{interviewField(selectableFields[0]?.id ?? field).label}</strong>
                <Chip>Only field open</Chip>
              </div>
              <span className="field__hint">The probe domains, the design problems and the accuracy grading are written for software engineering. Other fields open as they are written, rather than being offered before they work.</span>
            </div>
          )}

        {/* THE SHAPE IS ON THE OPTION, NOT ONLY IN THE HINT (§4.4).
            Two of the first four interview reps ever run went out on
            `recruiter` because it is `DEFAULT_ROUND` and nothing on this screen
            said "this one does not test fundamentals". A round that changes
            what the interview IS cannot be a quiet dropdown default. */}
        {/* THE SCREENER IS OFFERED ONLY WHEN THERE IS ONE TO SPEND (§5.6).
            It used to be filtered out on `credits > 0` — which is the round the
            screener credit exists to pay for — so a granted screener was
            unspendable and an account holding one and nothing else could pick
            only rounds it could not afford. That is what produced a 402 at the
            microphone dressed up as "Connection lost". */}
        <Select
          label="Round"
          value={round}
          onChange={setRound}
          options={ROUND_TYPES.filter((option) => option.credits > 0 || hasScreener).map((option) => ({
            value: option.id,
            label: option.label,
            meta: ROUND_SHAPE_LABEL[option.shape],
            trailing: option.credits === 0 ? 'Free' : `${option.durationMs / 60_000} min`,
          }))}
          hint={spec.credits === 0
            ? `${spec.description} Your free screener pays for this one.`
            : spec.description}
        />

        {/* THE SECOND AXIS (§5.1). The interviewer decides her temperament;
            this decides how hard the questions are, and the two are orthogonal
            on purpose — a nervous candidate practising hard questions with a
            friendly interviewer is a legitimate and probably common thing to
            want. Shown only on rounds that actually probe, because on a
            recruiter screen it would be a control that changes nothing. */}
        {spec.probeShare > 0 ? (
          <Select
            label="Question difficulty"
            value={difficulty === null ? 'auto' : (String(difficulty) as 'auto' | `${DifficultyLevel}`)}
            onChange={(next) => setDifficulty(next === 'auto' ? null : toDifficultyLevel(Number(next)))}
            options={[
              {
                value: 'auto' as const,
                label: 'Match my role title',
                meta: `${difficultySpec(derived).label} — ${difficultySpec(derived).tests.toLowerCase()}`,
              },
              ...DIFFICULTY_LEVELS.map((option) => ({
                value: String(option.level) as `${DifficultyLevel}`,
                label: option.label,
                meta: option.tests,
                trailing: String(option.level),
              })),
            ]}
            hint={<><span className="difficulty-example">&ldquo;{difficultySpec(effective).example}&rdquo;</span> It changes the questions, never how patient she is.</>}
          />
        ) : (
          <p className="field__hint setup-note">A {spec.label.toLowerCase()} does not test fundamentals, so there is nothing to set a difficulty for. Pick a technical round to get that dial.</p>
        )}

        <div className="textarea-tools">
          <Textarea label="Job description" rows={8} value={description} onChange={(event) => setDescription(event.target.value.slice(0, JOB_DESCRIPTION_LIMIT))} hint="The more you paste, the sharper the questions." />
          <button type="button" onClick={() => navigator.clipboard.readText().then(setDescription)} className="paste-action">Paste</button>
          <span className="char-count data">{description.length} / {JOB_DESCRIPTION_LIMIT}</span>
        </div>

        {error ? <p className="field__error">{error}</p> : null}
        <Button size="lg" fullWidth disabled={!role.trim() || saving}>{saving ? 'Saving' : 'Continue'}</Button>
      </form>
    </SetupLayout>
  )
}

/**
 * The fields a user may actually pick, resolved once.
 *
 * Derived from which fields have probe domains authored rather than listed
 * again — writing the next field's domains is what opens it, and a hand-kept
 * second list is a list that disagrees with the first one.
 */
const selectableFields = selectableInterviewFields(fieldHasProbes)

function CvSetup() {
  const router = useRouter()
  const { data: setup, loading, reload } = useInterviewSetup()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [replace, setReplace] = useState(false)
  const [existing, setExisting] = useState('')
  const [chars, setChars] = useState<number | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  /**
   * Still on screen? — and **the mount half is not optional**.
   *
   * This was `useRef(true)` plus a cleanup-only effect, which is stuck-forever
   * under `reactStrictMode` (which `next.config.ts` sets). Strict mode
   * double-invokes effects in development: mount → cleanup → mount. The body
   * did nothing on mount, so the first cleanup set this to `false` and nothing
   * ever set it back — every later `if (!mounted.current) return` bailed, and
   * the upload sat on "Reading it now" with both buttons disabled while the
   * file had in fact already been stored and read.
   *
   * The guard is worth keeping: a Server Action that resolves after somebody
   * has navigated away must not call `setState`. It just has to be armed on
   * mount as well as disarmed on unmount.
   */
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (!setup) return
    setExisting(setup.cvFileName ?? '')
    setChars(setup.cvTextChars)
    setWarning(setup.cvError)
  }, [setup])

  /**
   * A real upload, and the progress bar that was a `setInterval` is gone.
   *
   * The file goes to the server, the server puts it in the private bucket and
   * reads it ONCE, and what comes back is how much of it reached the
   * interviewer. That number is shown rather than assumed — C3's rule is that a
   * cap is stated on screen, because discovering later that half your career
   * did not reach the interviewer is worse than being told now.
   */
  const upload = (next: File | null) => {
    setError(undefined)
    setWarning(null)
    if (!next) { setFile(null); return }
    const lowerName = next.name.toLowerCase()
    if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.docx')) { setError('Use a PDF or DOCX file.'); return }
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
        setExisting(result.fileName ?? next.name)
        setChars(result.chars)
        setWarning(result.warning)
        reload()
      })
      // A Server Action reaches the client as an opaque digest when it throws,
      // so a rejection here carries nothing worth showing — but leaving the
      // screen disabled forever is the one outcome that is definitely wrong.
      .catch(() => {
        if (!mounted.current) return
        setUploading(false)
        setFile(null)
        setError('That upload did not finish. Try it again.')
      })
  }

  const drop = () => {
    void removeCv()
      .then(() => {
        if (!mounted.current) return
        setExisting('')
        setChars(null)
        setWarning(null)
        setReplace(false)
        reload()
      })
      .catch(() => {
        if (!mounted.current) return
        setReplace(false)
        setError('That did not finish. Try it again.')
      })
  }

  if (loading) return <SetupLayout step={2} title="Add your CV"><Skeleton height={320} /></SetupLayout>
  return <SetupLayout step={2} title="Add your CV"><div className="setup-form">
    {existing && !file ? <Card className="uploaded-file"><UploadCloud size={28} strokeWidth={1.5} /><div><strong>{existing}</strong><span>{chars === null ? 'Uploaded' : `${chars.toLocaleString()} characters read`}</span></div><Button size="sm" variant="secondary" onClick={() => setReplace(true)}>Replace</Button></Card> : <FileDrop file={file} onFile={upload} error={error} />}
    {uploading ? <p className="label mute" role="status">Reading it now. This takes a second and happens once.</p> : null}
    {/* Not an error. §C4: a CV nobody can read degrades to the field, the role
        and the job description rather than to a generic interview. */}
    {warning ? <Card className="cv-warning"><span className="label">The file is saved, the words are not</span><p>{warning}</p></Card> : null}
    <Button size="lg" fullWidth disabled={uploading} onClick={() => router.push('/interview/setup/questions')}>Continue</Button>
    <Button variant="ghost" fullWidth disabled={uploading} onClick={() => router.push('/interview/setup/questions')}>Skip for now</Button>
  </div><CVReplaceSheet open={replace} onClose={() => setReplace(false)} fileName={existing} onReplace={drop} onRemove={drop} /></SetupLayout>
}

function QuestionsSetup() {
  const router = useRouter()
  const { data: setup, loading } = useInterviewSetup()
  const [questions, setQuestions] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (setup) setQuestions(setup.customQuestions) }, [setup])
  const suggestions = ['Tell me about a time you failed', 'Why this company?', 'Describe a difficult stakeholder', 'How do you prioritise?', 'Tell me about a conflict', 'What would you change about your last role?']
  const commit = () => { if (draft.trim()) setQuestions((items) => [...items, draft.trim()]); setDraft(''); setAdding(false) }
  const finish = () => {
    setError(null)
    start(() => {
      void saveInterviewSetup({ customQuestions: questions }).then((result) => {
        if (result.ok) router.push('/interview/interviewers')
        else setError(result.message)
      })
    })
  }
  if (loading) return <SetupLayout step={3} title="What should they ask?"><Skeleton height={420} /></SetupLayout>
  return <SetupLayout step={3} title="What should they ask?"><div className="question-editor">{questions.length === 0 ? <p className="question-empty">No custom questions yet. Your interviewer will still use the role brief.</p> : null}{questions.map((question, index) => <div className="question-row" key={`${question}-${index}`}><GripVertical size={17} strokeWidth={1.5} /><input aria-label={`Custom question ${index + 1}`} value={question} onChange={(event) => setQuestions((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><button aria-label="Delete question" onClick={() => setQuestions((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={17} strokeWidth={1.5} /></button></div>)}{adding ? <input className="question-add-input" aria-label="New custom question" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { setDraft(''); setAdding(false) } }} placeholder="Type a question, then press Enter" /> : <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={17} strokeWidth={1.5} /> Add question</Button>}<div className="suggested-questions"><span className="label">Suggested</span>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => { if (!questions.includes(suggestion)) setQuestions((items) => [...items, suggestion]) }}><Plus size={14} strokeWidth={1.5} /> {suggestion}</button>)}</div>{error ? <p className="field__error">{error}</p> : null}<Button size="lg" fullWidth disabled={saving} onClick={finish}>{saving ? 'Saving' : 'Finish setup'}</Button></div></SetupLayout>
}

export function InterviewerPicker() {
  const router = useRouter()
  const { selectedInterviewerId, setSelectedInterviewerId } = useProduct()
  const { data: interviewers, loading } = useInterviewers()
  const choose = (id: string) => {
    setSelectedInterviewerId(id)
    // Stored as well as held in the provider, so the choice survives a device.
    void saveInterviewSetup({ interviewerSlug: id })
    router.push('/interview')
  }
  return <AppShell title="Interviewers">{/* TWO DIALS, AND THIS SCREEN IS ONLY ONE OF THEM (§5.1).
      It used to say "Style changes the questions", which was true when the
      interviewer was the only dial and is now the exact confusion the two-axis
      design exists to avoid: she decides how warm, how patient and how hard to
      please, and the difficulty slider on the setup decides how hard the
      questions are. Saying so here is what makes the other control legible. */}
<div className="screen-heading"><span className="label">Choose the pressure</span><h1 className="display-lg">Your interviewer</h1><p>Who is in the room: how warm they are, how patient, how hard to please. How hard the <em>questions</em> are is a separate dial on your setup. All four are open — pick the one you are actually walking into.</p></div>{!loading && interviewers.length === 0 ? <EmptyState mark="state-roster" title="No interviewers yet" description="The next interviewer is being prepared." /> : <div className="interviewer-grid">{loading ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={300} />) : interviewers.map((interviewer) => <button key={interviewer.id} className={`interviewer-card${selectedInterviewerId === interviewer.id ? ' selected' : ''}`} aria-pressed={selectedInterviewerId === interviewer.id} onClick={() => choose(interviewer.id)}><div className="interviewer-portrait"><FluidPersona name={interviewer.name} personaId={interviewer.id} warmth={16} fill /></div><div><Chip tone="volt">{interviewer.styleLabel}</Chip><h2 className="display-md">{interviewer.name}</h2><p>{interviewer.blurb}</p></div><span className="select-line"><Check size={15} strokeWidth={1.5} /> {selectedInterviewerId === interviewer.id ? 'Selected' : 'Select'}</span></button>)}</div>}</AppShell>
}
