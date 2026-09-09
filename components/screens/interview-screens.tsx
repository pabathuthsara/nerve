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
import { removeCv, saveInterviewSetup, uploadCv } from '@/app/interview/actions'
import { CreditsPanel, CreditsSummary } from '@/components/interview/credits'
import {
  DEFAULT_FIELD,
  interviewField,
  selectableInterviewFields,
  type InterviewFieldId,
} from '@/lib/data/interview-fields'
import { fieldHasProbes } from '@/lib/data/interview-probes'
import {
  ROUND_SHAPE_LABEL,
  ROUND_TYPES,
  creditRefusal,
  openingRound,
  roundType,
  type RoundTypeId,
} from '@/lib/data/interview-credits'
import {
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
  | '/interview/credits'
  | '/interview/setup/role'
  | '/interview/setup/cv'
  | '/interview/setup/questions'
  | '/interview/interviewers'
  | '/interview/start'

export function InterviewScreen({ route, packsOpen = false }: { route: InterviewRoute; packsOpen?: boolean }) {
  if (route === '/interview/credits') return <CreditsStore packsOpen={packsOpen} />
  if (route === '/interview/setup/role') return <RoleSetup />
  if (route === '/interview/setup/cv') return <CvSetup />
  if (route === '/interview/setup/questions') return <QuestionsSetup />
  if (route === '/interview/interviewers') return <InterviewerPicker />
  if (route === '/interview/start') return <RunSetup packsOpen={packsOpen} />
  return <InterviewHome />
}

/**
 * The interview track's store, on its own route.
 *
 * ── WHY IT IS NOT ON `/interview` ANY MORE ───────────────────────────────
 *
 * The balance pill in the chrome is the most-tapped thing in a credit product
 * and it pointed at `/interview`, where the full `CreditsPanel` — balance,
 * round costs, three buy buttons and the ledger — sat at the top of a rail that
 * also carried the role, the company, the field, the CV and the last score.
 * Somebody tapping **No credits** to find out how to fix it arrived at the
 * profile screen with the answer wedged into a sidebar.
 *
 * The dating arm has never worked that way: its store is
 * `/profile/subscription`, its pill goes there, and nothing about a plan is
 * drawn on `/train`. This is the same separation on the second track, and it is
 * additive — `/profile/subscription` keeps its own `CreditsPanel`, because
 * somebody who has come to the money screen to buy something should not be sent
 * to a third page to finish.
 *
 * `.setup-page`'s narrow column rather than `.train-grid`: there is one thing
 * to read here and no second column of it.
 */
function CreditsStore({ packsOpen }: { packsOpen: boolean }) {
  const { data: user, loading } = useUserState()
  return (
    <AppShell title="Interview credits">
      <div className="setup-page credits-store">
        <Link className="text-action" href="/interview">Back to interviews</Link>
        <h1 className="display-lg">Interview credits</h1>
        <p className="credits-store__intro">
          One balance, spent on whatever round you run next. What is in the account, what a round
          costs, and where the rest of it went.
        </p>
        {loading
          ? <Skeleton height={320} />
          : <CreditsPanel
              credits={user?.interviewCredits ?? 0}
              screener={user?.interviewScreenerCredits ?? 0}
              packsOpen={packsOpen}
              returnTo="/interview/credits"
            />}
      </div>
    </AppShell>
  )
}

/**
 * The interview home (LAUNCH-GAP A1, B1, B6).
 *
 * ── WHAT MOVED, AND WHY ──────────────────────────────────────────────────
 *
 * The hero used to be the only thing that could start a rep, and the two dials
 * anybody actually wants to change per interview — the round and the question
 * difficulty — were buried inside step one of a wizard you run once. Cold start
 * to microphone was eight screens.
 *
 * So the *profile* (role, company, job description, field, CV, custom questions)
 * is set once and edited from here, and the *run* (interviewer → round and
 * difficulty → brief) is three screens every time. This screen's primary action
 * is now the interviewer picker, which is where a run begins.
 *
 * ── AND WHY THE SIDEBAR IS ORDERED THE WAY IT IS ─────────────────────────
 *
 * B6. `.train-grid` is single column until the desktop breakpoint and the hero
 * is a full `100dvh`, so on a phone — which is where the traffic comes from —
 * the entire sidebar sat a screen-height below the fold as six undifferentiated
 * cards, with the captions toggle drawn at the same weight as the balance. It
 * is ordered by what somebody actually does now: credits, setup, readiness, last
 * interview. **The captions toggle is gone from here entirely** — it is a
 * per-interview decision and it lives on the run setup, beside the round.
 */
function InterviewHome() {
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
  const { data: user } = useUserState()
  const screenerCredits = user?.interviewScreenerCredits ?? 0
  /**
   * The round this account would run next.
   *
   * B1: a null setup used to mean `recruiter`, which costs a credit — so a
   * brand-new account holding nothing but the free screener read "there are
   * none in the account" while the pill in the chrome said **1 credit**. The
   * opening round is the one the free credit can actually buy.
   */
  const round = roundType(setup?.round ?? openingRound(screenerCredits > 0))
  /**
   * WHAT CAN PAY FOR *THIS* ROUND, computed the same way the brief computes it.
   *
   * A screener credit only ever buys the five-minute screener, so the account's
   * total is the wrong number to gate on. And since B3 the gate is "does this
   * cover the whole cost", not "is there anything at all" — a technical is two
   * credits and a balance of one cannot start one.
   */
  const spendable = round.credits === 0
    ? user?.interviewCredits ?? 0
    : Math.max(0, (user?.interviewCredits ?? 0) - screenerCredits)
  const refusal = creditRefusal({ spendable, round: round.id, hasScreener: screenerCredits > 0 })
  /**
   * The hero quotes the ACCOUNT total, not the spendable one, and the refusal
   * underneath says why it is not enough.
   *
   * B1's bug was two numbers on one screen disagreeing — the pill said "1
   * credit" and the hero said there were none. Printing the round-aware figure
   * here would have kept that disagreement and merely moved it: the pill, the
   * credits card and this line would all be right and all say different things.
   * One number, and one sentence explaining what it cannot buy.
   */

  return <AppShell title="Interview"><div className="train-grid interview-home"><section>{loading ? <Skeleton height={520} /> : setup?.complete && interviewer ? <article className="interview-hero"><div className="interview-hero__top"><span className="label">Next interview</span><span className="interview-hero__meta"><Chip tone="volt">{round.label}</Chip><span className="label">{round.credits === 0 ? 'Free' : `${round.credits} credit${round.credits === 1 ? '' : 's'}`} · {user?.interviewCredits ?? 0} in the account</span></span></div><div className="interview-role"><span className="label">Role</span><h1 className="display-xl">{setup.roleTitle}</h1><p>{setup.company}</p></div><div className="interviewer-strip"><FluidPersona name={interviewer.name} personaId={interviewer.id} warmth={16} size={72} /><div><strong>{interviewer.name}</strong><span className="label">{interviewer.styleLabel}</span></div></div>{/* A RUN STARTS AT THE INTERVIEWER (A1). It used to start at a Start
      button over whatever was last saved, with the picker bolted on after a
      three-step wizard — so the two dials worth changing per interview were
      the two hardest to reach. Interviewer → setup → go, every time. */}
<Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href="/interview/interviewers">Start an interview</Link>{refusal ? <p className="interview-hero__note label mute">{refusal}</p> : null}</article> : <SetupPrompt />}</section><aside className="side-stack">{/* B6: ordered by what somebody does, because on a phone this whole rail
      is a screen-height below a full-height hero. */}
<CreditsSummary credits={user?.interviewCredits ?? 0} screener={screenerCredits} /><Card className="interview-stats"><Stat label="Role" value={setup?.roleTitle || 'Not set'} /><Stat label="Company" value={setup?.company || 'Not set'} /><Stat label="Field" value={interviewField(setup?.field ?? DEFAULT_FIELD).label} /><Stat label="CV" value={setup?.cvFileName || 'Not added'} /><Stat label="Questions added" value={setup?.customQuestions.length ?? 0} /></Card><Link className="arena-button arena-button--secondary arena-button--full" href="/interview/setup/role">Edit your profile</Link><ReadinessPanel />{last ? <Card><span className="label">Last interview</span><div className="interview-last"><span><strong>{last.personaName}</strong><small>{last.compositeScore === null ? 'Not graded' : 'Graded'}</small></span><span className="data">{last.compositeScore ?? '—'}</span></div></Card> : null}</aside></div></AppShell>
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
 * The first run's profile prompt.
 *
 * It says three inputs and names them, and since A1 that is true: the
 * interviewer moved to the front of a RUN and is no longer a fourth screen
 * hiding behind a full progress bar (B4). What is collected here is the
 * standing profile — the things about the job that do not change between
 * interviews — and it is asked once.
 */
function SetupPrompt() { return <article className="setup-prompt"><span className="label">Three quick inputs, once</span><h1 className="display-xl">Tell us about the job</h1><p>Give the interviewer enough context to make the questions specific. You are asked this once — the round and the difficulty are picked per interview.</p><div className="setup-progress">{SETUP_STEPS.map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</div><Link className="arena-button arena-button--primary arena-button--lg" href="/interview/setup/role">Set up your profile</Link></article> }

/**
 * The steps of the profile wizard, in one place.
 *
 * ── THE BUG THIS FIXES (LAUNCH-GAP B4) ───────────────────────────────────
 *
 * `SetupLayout` rendered `0X / 03` over `value={step / 3 * 100}` and there were
 * four screens: role, CV, questions, then the interviewer picker. The bar
 * filled, the counter read 03/03, and a fourth screen appeared — while
 * `SetupPrompt` reinforced it with "Three quick inputs · Role · CV ·
 * Questions".
 *
 * It falls out of A1 for free: the interviewer is the first screen of a RUN
 * now, not the last screen of the profile, so the wizard genuinely is three.
 * Counted from this list rather than from a literal, so a fourth step cannot
 * appear without the counter moving with it.
 */
const SETUP_STEPS = ['Role', 'CV', 'Questions'] as const

function SetupLayout({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  const total = SETUP_STEPS.length
  return <AppShell title="Interview setup"><div className="setup-page"><div className="setup-kicker"><span className="label">Your profile</span><span className="data">{String(step).padStart(2, '0')} / {String(total).padStart(2, '0')}</span></div><ProgressBar value={step / total * 100} /><h1 className="display-lg">{title}</h1>{children}</div></AppShell>
}

/**
 * Step one of the PROFILE: the job (LAUNCH-GAP A1).
 *
 * ── WHAT LEFT THIS SCREEN ────────────────────────────────────────────────
 *
 * The round and the question difficulty. They were here, inside step one of a
 * wizard you run once, which made the two dials anybody actually wants to
 * change per interview the two hardest to reach — the only route back to them
 * was a secondary *Edit setup* button that re-entered the whole three-step
 * flow. They live on `/interview/start` now, between the interviewer and the
 * brief, where they are answered once per run.
 *
 * What stays is what does not change between interviews: the role, the company,
 * the field and the job description.
 */
function RoleSetup() {
  const router = useRouter()
  const { data: setup, loading } = useInterviewSetup()
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const [field, setField] = useState<InterviewFieldId>(DEFAULT_FIELD)
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
      void saveInterviewSetup({ roleTitle: role, company, jobDescription: description, field: chosen })
        .then((result) => {
          if (result.ok) router.push('/interview/setup/cv')
          else setError(result.message)
        })
    })
  }

  if (loading) return <SetupLayout step={1} title="What are you walking into?"><Skeleton height={420} /></SetupLayout>

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

        <div className="textarea-tools">
          <Textarea label="Job description" rows={8} value={description} onChange={(event) => setDescription(event.target.value.slice(0, JOB_DESCRIPTION_LIMIT))} hint="The more you paste, the sharper the questions." />
          <button type="button" onClick={() => navigator.clipboard.readText().then(setDescription)} className="paste-action">Paste</button>
          <span className="char-count data">{description.length} / {JOB_DESCRIPTION_LIMIT}</span>
        </div>

        {/* The round and the difficulty are per-interview, and this says where
            they went rather than leaving somebody hunting for a dial that used
            to be on this screen. */}
        <p className="field__hint setup-note">Which round you run and how hard the questions are is picked per interview, on the screen after you choose your interviewer.</p>

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

export function InterviewerPicker({ inRun = true }: { inRun?: boolean }) {
  const router = useRouter()
  const { selectedInterviewerId, setSelectedInterviewerId } = useProduct()
  const { data: interviewers, loading } = useInterviewers()
  /**
   * Picking somebody moves the run FORWARD (LAUNCH-GAP B5).
   *
   * It used to `router.push('/interview')` — somebody who had just decided who
   * they wanted to face was put back on a dashboard and asked to find the Start
   * button, and mid-flow they were dropped out of the flow entirely. The picker
   * is the first screen of a run now, so the next screen is the run's own setup.
   *
   * `inRun` is false only when this is reached as the track's `/roster`, where
   * somebody is browsing rather than starting: there the choice is remembered
   * and nothing navigates.
   */
  const choose = (id: string) => {
    setSelectedInterviewerId(id)
    // Stored as well as held in the provider, so the choice survives a device.
    void saveInterviewSetup({ interviewerSlug: id })
    if (inRun) router.push('/interview/start')
  }
  return <AppShell title={inRun ? 'Interviewers' : 'Roster'}>{/* TWO DIALS, AND THIS SCREEN IS ONLY ONE OF THEM (§5.1).
      It used to say "Style changes the questions", which was true when the
      interviewer was the only dial and is now the exact confusion the two-axis
      design exists to avoid: she decides how warm, how patient and how hard to
      please, and the difficulty slider on the run setup decides how hard the
      questions are. Saying so here is what makes the other control legible. */}
<div className="screen-heading"><span className="label">{inRun ? 'Step one of two' : 'Choose the pressure'}</span><h1 className="display-lg">Your interviewer</h1><p>Who is in the room: how warm they are, how patient, how hard to please. How hard the <em>questions</em> are is the next screen. All four are open — pick the one you are actually walking into.</p></div>{!loading && interviewers.length === 0 ? <EmptyState mark="state-roster" title="No interviewers yet" description="The next interviewer is being prepared." /> : <div className="interviewer-grid">{loading ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={300} />) : interviewers.map((interviewer) => <button key={interviewer.id} className={`interviewer-card${selectedInterviewerId === interviewer.id ? ' selected' : ''}`} aria-pressed={selectedInterviewerId === interviewer.id} onClick={() => choose(interviewer.id)}><div className="interviewer-portrait"><FluidPersona name={interviewer.name} personaId={interviewer.id} warmth={16} fill /></div><div><Chip tone="volt">{interviewer.styleLabel}</Chip><h2 className="display-md">{interviewer.name}</h2><p>{interviewer.blurb}</p></div><span className="select-line"><Check size={15} strokeWidth={1.5} /> {selectedInterviewerId === interviewer.id ? (inRun ? 'Selected' : 'Your interviewer') : 'Select'}</span></button>)}</div>}</AppShell>
}

/**
 * The per-run setup (LAUNCH-GAP A1, B4, B6).
 *
 * ── WHY THIS SCREEN EXISTS ───────────────────────────────────────────────
 *
 * Setup used to be one three-step wizard you run once, with the round and the
 * question difficulty buried inside step one of it — so the two dials worth
 * changing per interview were the two hardest to reach, and the only route back
 * was a secondary *Edit setup* button that re-entered the whole flow.
 *
 * The split is: a **profile** (role, company, job description, field, CV,
 * custom questions) set once and edited from the home screen, and a **run**
 * (this screen) that carries round, question difficulty, captions and the CV,
 * and then starts. Interviewer → this → go, every time.
 *
 * The captions toggle came here from the home sidebar for the same reason (B6):
 * it is a per-interview decision, and on a phone it was sitting in a rail of six
 * equal-weight cards below the fold, drawn at the same importance as the credit
 * balance.
 */
function RunSetup({ packsOpen }: { packsOpen: boolean }) {
  const router = useRouter()
  const { selectedInterviewerId } = useProduct()
  const { data: setup, loading: setupLoading } = useInterviewSetup()
  const { data: interviewers, loading: interviewersLoading } = useInterviewers()
  const { data: user } = useUserState()
  const [round, setRound] = useState<RoundTypeId | null>(null)
  /**
   * The hardness slider (§5.2). `null` is "match my title", which is the state
   * every account starts in and a state the control can go back to — it is not
   * a synonym for level 3, and treating it as one would freeze somebody's
   * questions at mid after they had told us they were interviewing for staff.
   */
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null)
  const [captions, setCaptions] = useState(false)
  const [saving, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const screenerCredits = user?.interviewScreenerCredits ?? 0
  const hasScreener = screenerCredits > 0

  useEffect(() => {
    if (!setup) return
    // B1. A stored round wins; a null one opens on what the free credit buys.
    setRound(setup.round ?? openingRound(hasScreener))
    setDifficulty(setup.difficultyChoice)
    setCaptions(setup.captions)
  }, [setup, hasScreener])

  const loading = setupLoading || interviewersLoading
  const interviewer = interviewers.find((item) => item.id === (selectedInterviewerId ?? setup?.interviewerId))
    ?? interviewers[0]
  const chosenRound = round ?? openingRound(hasScreener)
  const spec = roundType(chosenRound)
  const derived = difficultyFromRoleTitle(setup?.roleTitle ?? '')
  const effective = difficulty ?? derived

  // The same round-aware arithmetic the brief and the home screen do. A screener
  // credit only buys the screener round, and since B3 a round can cost more
  // than one, so this is "does the balance cover the whole cost".
  const spendable = spec.credits === 0
    ? user?.interviewCredits ?? 0
    : Math.max(0, (user?.interviewCredits ?? 0) - screenerCredits)
  const refusal = creditRefusal({ spendable, round: chosenRound, hasScreener })

  const go = () => {
    if (!interviewer) return
    setError(null)
    start(() => {
      void saveInterviewSetup({ round: chosenRound, difficulty, captions })
        .then((result) => {
          if (result.ok) router.push(`/interview/rep/${interviewer.id}/brief`)
          else setError(result.message)
        })
    })
  }

  if (loading) return <AppShell title="Interview setup"><div className="setup-page"><Skeleton height={480} /></div></AppShell>
  if (!interviewer) {
    return <AppShell title="Interview setup"><div className="setup-page"><EmptyState mark="state-roster" title="No interviewers yet" description="The next interviewer is being prepared." /></div></AppShell>
  }
  if (!setup?.complete) {
    return <AppShell title="Interview setup"><div className="setup-page"><EmptyState mark="state-roster" title="Tell us about the job first" description="The interviewer needs the role before there is a round to set up." action={<Link className="arena-button arena-button--primary" href="/interview/setup/role">Set up your profile</Link>} /></div></AppShell>
  }

  return (
    <AppShell title="Interview setup">
      <div className="setup-page">
        <div className="setup-kicker"><span className="label">Step two of two</span><span className="data">{spec.credits === 0 ? 'Free' : `${spec.credits} credit${spec.credits === 1 ? '' : 's'}`}</span></div>
        <h1 className="display-lg">Set up this interview</h1>

        <div className="run-setup__who">
          <FluidPersona name={interviewer.name} personaId={interviewer.id} warmth={16} size={56} />
          <div><strong>{interviewer.name}</strong><span className="label">{interviewer.styleLabel} · {setup.roleTitle}</span></div>
          <Link className="text-action" href="/interview/interviewers">Change</Link>
        </div>

        <div className="setup-form">
          {/* THE SHAPE IS ON THE OPTION, NOT ONLY IN THE HINT (§4.4).
              Two of the first four interview reps ever run went out on
              `recruiter` because it was the default and nothing said "this one
              does not test fundamentals". A round that changes what the
              interview IS cannot be a quiet dropdown default.
              THE SCREENER IS OFFERED ONLY WHEN THERE IS ONE TO SPEND (§5.6). */}
          <Select
            label="Round"
            value={chosenRound}
            onChange={setRound}
            options={ROUND_TYPES.filter((option) => option.credits > 0 || hasScreener).map((option) => ({
              value: option.id,
              label: option.label,
              meta: ROUND_SHAPE_LABEL[option.shape],
              // B3: the price is on the option, because it is no longer the
              // same on all of them and picking blind is how somebody spends
              // two credits meaning to spend one.
              // Length first on every option, price second — the free one
              // included, so the five read as one column rather than four and
              // an exception.
              trailing: `${option.durationMs / 60_000} min · ${option.credits === 0 ? 'Free' : `${option.credits} credit${option.credits === 1 ? '' : 's'}`}`,
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

          {/* Per-interview, which is why it is here rather than in a sidebar
              card on the home screen (B6). Off by default and the copy says
              why: a real interview has no captions. */}
          <div className="setting-row">
            <div><strong>Show the question on screen</strong><span>Off by default. A real interview has no captions, and getting used to holding the question in your head is most of what this is for.</span></div>
            <button
              className="toggle"
              role="switch"
              aria-label="Show the question on screen"
              aria-checked={captions}
              onClick={() => setCaptions((value) => !value)}
            ><i /></button>
          </div>

          <div className="run-setup__cv">
            <span className="label">CV</span>
            <span>{setup.cvFileName || 'Not added'}</span>
            <Link className="text-action" href="/interview/setup/cv">{setup.cvFileName ? 'Replace' : 'Add one'}</Link>
          </div>

          {error ? <p className="field__error">{error}</p> : null}

          {refusal
            ? (
              <div className="run-setup__blocked">
                <p>{refusal}</p>
                <CreditsPanel credits={user?.interviewCredits ?? 0} screener={screenerCredits} packsOpen={packsOpen} returnTo="/interview/start" heading="Add credits" />
              </div>
            )
            : <Button size="lg" fullWidth disabled={saving} onClick={go}>{saving ? 'Saving' : 'Start interview'}</Button>}
        </div>
      </div>
    </AppShell>
  )
}
