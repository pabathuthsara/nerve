'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, LockKeyhole, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFieldLog, useFieldStats, useFieldToday, usePendingMilestone, usePersona, usePersonaMemory, usePersonaProgress, usePersonas, useSessionHistory, useUserState } from '@/lib/data'
import { forgetPersona } from '@/app/profile/actions'
import type { FieldLogEntry, Level, Persona, PersonaMemory, PersonaProgress } from '@/lib/data/types'
import { FieldActions, FieldLogged, FieldSheets, useFieldFlow } from '@/components/field/flow'
import { AnxietyChart } from '@/components/field/anxiety-chart'
import { MilestoneSheet } from '@/components/field/milestone-sheet'
import { anxietySeries } from '@/lib/field/anxiety'
import { LEVEL_NAMES, TOP_TIER, unlockProgressLabel, unlockRequirement } from '@/lib/data/progression'
import { LEVEL_COPY } from '@/lib/data/level-copy'
import { REJECTION_MILESTONES, type Milestone } from '@/lib/field/milestones'
import { TIER_NAMES } from '@/lib/field/assignment'
import { AppShell } from '@/components/app-shell'
import { Card, Chip, EmptyState, LockOverlay, Sheet, Skeleton, Stat, useToast } from '@/components/ui'
import { FluidPersona } from '@/components/fluid-persona'
import { SessionRow } from './train-screen'
import { useProduct } from '@/components/product-provider'
import { InterviewerPicker } from './interview-screens'
import { useBreakpoint } from '@/lib/hooks/use-breakpoint'
import { Mark, fieldTierMark, tierMark } from '@/components/marks'
import { TRIAL_DAYS } from '@/lib/site/plans'

/**
 * One line per tier, in the frontend's own words.
 *
 * Descriptions only. **The names come from `LEVEL_NAMES` and the list is built
 * from `TOP_TIER`**, because writing them out here is what broke this screen:
 * the array held three entries labelled Receptive, Neutral and Ambiguous —
 * `progression.ts`'s names shifted up a rung when Tess took the bottom, and
 * this copy never moved. Two consequences, and the second is the serious one.
 * Every tier was drawn under the name of the tier below it. And the roster had
 * no section for level 4 at all, so **Robin — the top of the ladder, the whole
 * point of the progression — did not appear on the progression map**, while
 * Train was offering her as today's rep.
 *
 * Deriving the list means a fifth rung shows up here the moment it is on the
 * roster, and a renamed tier cannot be renamed in one file and not the other.
 */
const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  1: 'She is glad somebody spoke to her.',
  2: "She'll meet you halfway.",
  3: "She won't carry it for you.",
  4: "You can't tell how it's going.",
}

const levels: { level: Level; name: string; description: string; requirement: string }[] =
  Array.from({ length: TOP_TIER }, (_, index) => {
    const level = (index + 1) as Level
    return {
      level,
      name: LEVEL_NAMES[level],
      description: LEVEL_DESCRIPTIONS[level],
      // Requirement copy comes from `unlockRequirement` so the collapsed rail
      // and the lock overlay on a card cannot disagree about what a tier costs.
      requirement: unlockRequirement(level) ?? '',
    }
  })

export function RosterScreen() {
  const { track } = useProduct()
  const { data: personas, loading } = usePersonas()
  const { data: progressRaw } = usePersonaProgress()
  const progress = Array.isArray(progressRaw) ? progressRaw : []
  if (track === 'interview') return <InterviewerPicker />
  return <AppShell title="Roster"><div className="screen-heading"><span className="label">Progression map</span><h1 className="display-lg">Roster</h1><p>Read the room. Then earn a harder one.</p></div>{!loading && personas.length === 0 ? <EmptyState mark="state-roster" title="The roster is empty" description="New training partners will appear here." /> : <div className="level-list">{loading ? levels.map((level) => <RosterSkeleton key={level.level} />) : levels.map((level) => <LevelSection key={level.level} config={level} personas={personas.filter((persona) => persona.level === level.level)} progress={progress} />)}</div>}</AppShell>
}

function RosterSkeleton() { return <section className="level-section"><div className="level-head"><div style={{ flex: 1 }}><Skeleton width={220} height={24} /><Skeleton width={180} height={14} style={{ marginTop: 8 }} /></div><Skeleton width={68} height={16} /></div><div className="persona-grid"><Skeleton height={220} /><Skeleton height={220} /></div></section> }

function LevelSection({ config, personas, progress }: { config: typeof levels[number]; personas: Persona[]; progress: PersonaProgress[] }) {
  const allLocked = personas.length > 0 && personas.every((persona) => persona.locked)
  const beaten = personas.filter((persona) => (progress.find((item) => item.personaId === persona.id)?.wins ?? 0) > 0).length
  if (allLocked) return <LockedLevelSection config={config} personas={personas} />
  // V24. The tier mark is an aperture that closes as the tier rises, so the
  // difficulty is in the shape rather than only in the adjective beside it —
  // and the beaten count is drawn as the characters themselves, filled and
  // unfilled, rather than as `1/2 beaten` in mono.
  return <section className="level-section"><header className="level-head"><div className="level-head__name"><Mark name={tierMark(config.level)} size={28} /><div><h2 className="display-md">Level {String(config.level).padStart(2, '0')} — {config.name}</h2><p>{config.description}</p></div></div><span className="level-head__beaten" title={`${beaten} of ${personas.length} beaten`}>{personas.map((persona, index) => <i key={persona.id} className={index < beaten ? 'is-beaten' : undefined} />)}<span className="label">{beaten}/{personas.length} beaten</span></span></header><div className="persona-grid">{personas.map((persona) => <PersonaCard key={persona.id} persona={persona} progress={progress.find((item) => item.personaId === persona.id)} />)}</div></section>
}

/**
 * A tier nobody has opened yet (RETENTION-AUDIT R9).
 *
 * It used to be a `locked-level` button: a padlock, a name, a requirement
 * string and a chevron. Curiosity is the pull up this ladder, and collapsing
 * the tier was collapsing the pull — while **the best persuasive writing in the
 * codebase sat in `LEVEL_COPY`, shown only by the unlock sheet, which fires at
 * the exact moment it has stopped being persuasive.**
 *
 * So the argument is in front of the gate now: the tier's own body copy, then
 * each character as she actually is — her orb, her setting, her hook — and the
 * meter that says how far along you are. Nothing here is a spoiler: the hook
 * and the setting are what the brief screen opens with anyway, and knowing who
 * is up there is the entire reason to want her.
 *
 * The orb is drawn at a low warmth rather than hidden. It is the one visual
 * identity a character has (§01's no-photographs rule, `VISUAL-AUDIT.md` §1),
 * and a tier of four grey rectangles is a tier nobody is curious about.
 */
function LockedLevelSection({ config, personas }: { config: typeof levels[number]; personas: Persona[] }) {
  const copy = LEVEL_COPY[config.level]
  const progress = personas.map((persona) => persona.unlockProgress).find((entry) => entry !== null) ?? null
  return (
    <section className="level-section level-section--locked">
      <header className="level-head">
        <div className="level-head__name">
          <Mark name={tierMark(config.level)} size={28} muted />
          <div>
            <h2 className="display-md">Level {String(config.level).padStart(2, '0')} — {config.name}</h2>
            <p>{config.description}</p>
          </div>
        </div>
        <span className="level-head__locked"><LockKeyhole size={16} strokeWidth={1.5} /><span className="label">Locked</span></span>
      </header>
      <p className="level-pitch">{copy.body}</p>
      <div className="persona-grid">{personas.map((persona) => <PersonaTeaser key={persona.id} persona={persona} />)}</div>
      {progress ? <RosterUnlockMeter progress={progress} /> : <p className="label mute">{config.requirement}</p>}
    </section>
  )
}

/**
 * Her, before the gate. No link, because there is nothing behind it yet.
 *
 * The hook is the line the brief opens with, and it is the sentence that makes
 * somebody want to try — which is why it is here rather than three screens
 * further in, behind two graded reps.
 */
function PersonaTeaser({ persona }: { persona: Persona }) {
  return (
    <article className="persona-card persona-card--locked">
      <div className="persona-card__portrait">
        <FluidPersona name={persona.name} personaId={persona.id} warmth={12} fill />
        <span className="persona-card__index data">0{persona.level}</span>
      </div>
      <div className="persona-card__copy">
        <div>
          <h3 className="display-md">{persona.name}</h3>
          <span className="label">{persona.settingShort}</span>
        </div>
        <p className="persona-card__hook">{persona.hook}</p>
      </div>
    </article>
  )
}

/**
 * R8, on the roster. The same meter the result screen draws.
 *
 * `unlockRequirement` is a sentence that reads identically before and after the
 * rep that advanced it. This is the version with the user's own position in it,
 * and it is Ink rather than volt for the reason every meter in Arena is: volt
 * appears once per screen and the roster spends it on a record that was won.
 */
function RosterUnlockMeter({ progress }: { progress: NonNullable<Persona['unlockProgress']> }) {
  const pct = Math.round((progress.have / progress.need) * 100)
  return (
    <div className="unlock-meter unlock-meter--roster">
      <span className="unlock-meter__track" role="presentation"><i style={{ width: `${Math.max(3, pct)}%` }} /></span>
      <span className="label mute">{unlockProgressLabel(progress)}</span>
    </div>
  )
}

/**
 * V23. The record was `0/3 — BEST WARMTH 41` in shouted mono.
 *
 * The number already means something on a scale, so the scale is drawn: a
 * hairline track with the best warmth on it. Volt only once she has actually
 * been won — a bar that glows for a rep that ended in her leaving would be
 * scoring the outcome, which §07 does not allow anywhere in this product.
 */
function WarmthTrack({ value, won }: { value: number; won: boolean }) {
  return <span className={`persona-card__track${won ? ' persona-card__track--won' : ''}`} role="presentation"><i style={{ width: `${Math.max(3, Math.min(100, value))}%` }} /></span>
}

function PersonaCard({ persona, progress }: { persona: Persona; progress?: PersonaProgress }) {
  const record = !progress || progress.attempts === 0 ? 'NOT ATTEMPTED' : progress.wins > 0 && progress.bestTimeMs ? `WON — ${formatTime(progress.bestTimeMs)} BEST` : `0/${progress.attempts} — BEST WARMTH ${progress.bestWarmth}`
  const content = <article className="persona-card"><div className="persona-card__portrait"><FluidPersona name={persona.name} personaId={persona.id} warmth={progress && progress.attempts > 0 ? progress.bestWarmth : 18} fill /><span className="persona-card__index data">0{persona.level}</span></div><div className="persona-card__copy"><div><h3 className="display-md">{persona.name}</h3><span className="label">{persona.settingShort}</span></div><span className={`persona-card__record${progress?.wins ? ' volt' : ''}`}>{record}</span>{progress && progress.attempts > 0 ? <WarmthTrack value={progress.bestWarmth} won={progress.wins > 0} /> : null}</div></article>
  return <Link href={`/roster/${persona.id}`} className="persona-card-link">{persona.locked && persona.unlockRequirement ? <LockOverlay requirement={persona.unlockRequirement}>{content}</LockOverlay> : content}</Link>
}

function formatTime(ms: number) { const m = Math.floor(ms / 60000); const s = Math.floor((ms % 60000) / 1000); return `${m}:${String(s).padStart(2, '0')}` }

export function PersonaDetailScreen({ personaId }: { personaId: string }) {
  const router = useRouter()
  const { isDesktop } = useBreakpoint()
  const { data: persona, loading } = usePersona(personaId)
  const { data: progressRaw } = usePersonaProgress(personaId)
  const { data: sessions } = useSessionHistory()
  const { data: user } = useUserState()
  const memory = usePersonaMemory(personaId)
  const progress = !Array.isArray(progressRaw) ? progressRaw : null
  if (loading) return <AppShell title="Roster"><div className="persona-detail"><Skeleton height={560} /></div></AppShell>
  if (!persona) return <AppShell title="Roster"><EmptyState mark="state-roster" title="Nothing here" description="That person is not on the roster." action={<Link className="arena-button arena-button--primary" href="/roster">Back to roster</Link>} /></AppShell>
  const recent = sessions.filter((session) => session.personaId === persona.id).slice(0, 3)
  const canStart = !persona.locked && (user?.repsRemainingToday ?? 0) > 0
  const content = <article className={`persona-detail${isDesktop ? '' : ' persona-detail--sheet'}`}><Link className="detail-back" href="/roster"><ChevronLeft size={18} strokeWidth={1.5} /> Roster</Link><div className="persona-detail__grid"><aside className="persona-detail__hero"><FluidPersona name={persona.name} personaId={persona.id} warmth={progress && progress.attempts > 0 ? progress.bestWarmth : 18} size={180} interactive /><div><Chip tone="band" band={persona.level >= 3 ? 'CLOSED' : 'GUARDED'}>Level {String(persona.level).padStart(2, '0')}</Chip><h1 className="display-xl">{persona.name}</h1><span className="label">{persona.setting}</span></div></aside><div className="persona-detail__body"><p className="persona-blurb">{persona.blurb}</p><DetailChips label="She responds to" items={persona.respondsTo} tone="volt" /><DetailChips label="She shuts down on" items={persona.shutsDownOn} /><section><span className="label">Your record</span><div className="record-grid"><Stat label="Attempts" value={progress?.attempts ?? 0} /><Stat label="Wins" value={progress?.wins ?? 0} /><Stat label="Best time" value={progress?.bestTimeMs ? formatTime(progress.bestTimeMs) : '—'} /><Stat label="Best warmth" value={progress?.bestWarmth || '—'} /></div></section><PersonaMemorySection personaId={personaId} name={persona.name} memory={memory.data} onForgotten={memory.reload} /><section><span className="label">Recent sessions</span><div>{recent.length ? recent.map((session) => <SessionRow key={session.id} session={session} />) : <p className="muted">Not faced yet.</p>}</div></section></div></div><DetailAction persona={persona} canStart={canStart} voiceLocked={user?.voiceLocked ?? false} /></article>
  if (isDesktop) return <AppShell title={persona.name}>{content}</AppShell>
  return <AppShell title="Roster"><Sheet open onClose={() => router.push('/roster')} title={persona.name}>{content}</Sheet></AppShell>
}

/**
 * The one action on a character's page, in four states.
 *
 * The third of them is the one that was wrong. A free account — no voice on the
 * plan at all — was handed `Talk to her in text` as its primary button with a
 * muted line under it reading "Voice is on Pro", which is the offer stated as a
 * footnote under the thing you get instead of it. Text mode genuinely is free
 * and always will be, and that sentence stays; it is the second option now
 * rather than the whole screen.
 *
 * A link rather than a sheet, deliberately. On a phone this whole page is
 * already rendered inside a `Sheet`, and a sheet opened from inside a sheet
 * gives two focus traps and two Escape handlers fighting over one keypress —
 * the second of which would close the page underneath. Train has the sheet,
 * because Train is not inside one.
 *
 * The fourth state — a paying account that is out for today — is unchanged and
 * must stay unchanged. There is nothing to sell somebody who already bought it
 * and already trained today; the reps come back at midnight, and §14 is explicit
 * that running out must never read as losing the account.
 */
function DetailAction({ persona, canStart, voiceLocked }: { persona: Persona; canStart: boolean; voiceLocked: boolean }) {
  const textHref = `/text/${persona.id}`

  if (persona.locked) {
    return <div className="detail-action"><div className="locked-action"><LockKeyhole size={18} strokeWidth={1.5} /><span>{persona.unlockRequirement}</span></div></div>
  }

  if (canStart) {
    return (
      <div className="detail-action">
        <Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={`/rep/${persona.id}/brief`}>Start rep</Link>
        <Link className="arena-button arena-button--ghost arena-button--sm arena-button--full" href={textHref}>Or talk to her in text</Link>
      </div>
    )
  }

  if (voiceLocked) {
    // Two elements, and no third line. `.detail-action` is sticky inside the
    // sheet this page becomes on a phone, sized for the button pair every other
    // state renders; a wrapping sentence under them escaped the sheet and drew
    // itself over the page behind it. The price and the cancel terms are one tap
    // away on the button's own destination, and `PaywallSheet` on Train carries
    // them in full — this screen does not need a third copy.
    return (
      <div className="detail-action">
        <Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href="/profile/subscription">Unlock voice reps — {TRIAL_DAYS} days free</Link>
        <Link className="arena-button arena-button--ghost arena-button--sm arena-button--full" href={textHref}>Talk to her in text — always free</Link>
      </div>
    )
  }

  return (
    <div className="detail-action">
      <Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={textHref}>Talk to her in text</Link>
      <span className="label mute">Voice reps reset tonight. Text does not use one.</span>
    </div>
  )
}

function DetailChips({ label, items, tone = 'neutral' }: { label: string; items: string[]; tone?: 'neutral' | 'volt' }) { return <section><span className="label">{label}</span><div className="chip-row" style={{ marginTop: 10 }}>{items.map((item) => <Chip key={item} tone={tone}>{item}</Chip>)}</div></section> }

/**
 * What she remembers, on her own sheet (§08).
 *
 * The second of the three places the reset lives. Unlike the brief screen this
 * one says something when there is nothing to say — on the character's own
 * page, silence would read as a feature that is missing rather than a memory
 * that does not exist yet.
 */
function PersonaMemorySection({ personaId, name, memory, onForgotten }: { personaId: string; name: string; memory: PersonaMemory | null; onForgotten: () => void }) {
  const toast = useToast()
  const [cleared, setCleared] = useState(false)
  const gone = cleared || !memory
  const forget = () => {
    setCleared(true)
    void forgetPersona(personaId)
      .then((result) => {
        if (result.ok) { toast.push(`${name} has forgotten it.`, 'volt'); onForgotten(); return }
        setCleared(false)
        toast.push(result.message ?? 'That did not clear.', 'red')
      })
      .catch(() => { setCleared(false); toast.push('That did not clear — you may be offline.', 'red') })
  }
  return <section><span className="label">What she remembers</span>{gone ? <p className="muted" style={{ margin: '10px 0 0' }}>Nothing yet. She keeps one line about the encounter after a rep worth remembering — never about how you did.</p> : <div className="memory-line memory-line--detail"><p>{memory.line}</p><button type="button" className="memory-line__reset label" onClick={forget}><RotateCcw size={13} strokeWidth={1.5} /> Start fresh</button></div>}</section>
}

export function FieldScreen() {
  const today = useFieldToday()
  const log = useFieldLog()
  const stats = useFieldStats()
  const pending = usePendingMilestone()
  // A milestone earned but never seen — the tab was closed before the sheet
  // rendered — is picked up on mount and shown now.
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const shown = milestone ?? pending.data
  // A write changes the counters, the chart and the log as well as the card,
  // so all three reads are asked again once it lands.
  const flow = useFieldFlow(today.data, {
    onChanged: () => { today.reload(); log.reload(); stats.reload() },
    onMilestone: (at) => setMilestone(REJECTION_MILESTONES.find((entry) => entry.at === at) ?? null),
  })

  const assignment = today.data
  const loading = today.loading
  const logLoading = log.loading

  const challenge = assignment?.challenge
  const resolved = flow.status === 'done' || flow.status === 'skipped'
  // Built from the log the screen already has, through the same function the
  // profile figure uses, so the two cannot disagree about the gap.
  const series = useMemo(() => anxietySeries(log.data), [log.data])

  return <AppShell title="Field"><div className="screen-heading"><span className="label">Outside the app</span><h1 className="display-lg">Field</h1><p>Small real-world moves. No performance, no audience.</p></div><div className="field-layout"><section className="field-main">{loading ? <Skeleton height={390} /> : challenge ? <Card className="today-field">{resolved ? <FieldLogged status={flow.status} /> : <><div className="today-field__top"><span className="mark-row"><Mark name={fieldTierMark(challenge.tier)} size={19} current /><Chip>Tier {challenge.tier} · {TIER_NAMES[challenge.tier]}</Chip></span><span className="label">Today</span></div><div><h2 className="display-lg">{challenge.title}</h2><p>{challenge.brief}</p><p className="today-field__done"><i className="today-field__box" aria-hidden="true" /><span><span className="label">Done when</span> {challenge.doneWhen}</span></p>{challenge.safetyNote ? <p className="today-field__safety"><ShieldCheck size={15} strokeWidth={1.5} /> {challenge.safetyNote}</p> : null}</div><FieldActions flow={flow} size="lg" /></>}</Card> : <EmptyState mark="state-field" title="No field rep today" description="Your next real-world prompt will appear here." />}{/* V31. `/how-it-works` calls this "the most useful chart in the product"
    and it was drawn at the size of a side card with its headline number
    hidden in a `Stat` detail string. It is the one artefact that proves the
    product works and the one that is unambiguously not a dating app, so the
    gap it measures leads, in the composite face, and the chart gets the
    width. */}
<Card className="anxiety-card"><div className="card-heading"><div><span className="label">What you expected · what it cost</span><h2 className="display-md">Predicted vs actual</h2></div>{series.meanGap === null ? null : <div className="anxiety-card__gap"><span className="composite data">{series.meanGap > 0 ? '−' : series.meanGap < 0 ? '+' : ''}{Math.abs(series.meanGap).toFixed(1)}</span><span className="label">{series.meanGap > 0 ? 'easier than you feared' : series.meanGap < 0 ? 'harder than you expected' : 'exactly as you called it'}</span></div>}</div>{logLoading ? <Skeleton height={150} /> : <AnxietyChart series={series} />}</Card></section><aside className="field-side"><Card><span className="label">Rejections collected</span><div className="field-counters"><span className="composite data">{stats.data?.rejectionsCollected ?? 0}</span><p className="muted">Every one of them is a rep. Nobody keeps score of the yeses.</p>{nextMilestone(stats.data?.rejectionsCollected ?? 0)}</div><div className="field-counters__secondary"><Stat label="Asks made" value={stats.data?.asksMade ?? 0} /></div></Card><Card><span className="label">Tier progress</span><div className="tier-track">{[1, 2, 3, 4].map((tier) => { const reached = tier <= (stats.data?.tier ?? 1); return <span key={tier} className={reached ? 'active' : undefined}><Mark name={fieldTierMark(tier)} size={17} current={tier === (stats.data?.tier ?? 1)} muted={!reached} /></span> })}</div><div className="tier-copy"><strong>Tier {stats.data?.tier ?? 1} — {TIER_NAMES[stats.data?.tier ?? 1]}</strong><span>{stats.data?.tierDone ?? 0} of {stats.data?.tierTotal ?? 0} logged</span></div>{stats.data?.nextTierAt ? <p className="label mute" style={{ marginTop: 10 }}>{stats.data.nextTierAt}</p> : null}</Card><Card><span className="label">History</span>{logLoading ? <Skeleton height={180} style={{ marginTop: 14 }} /> : log.data.length ? <div className="field-history">{log.data.slice(0, 8).map((entry) => <FieldHistoryRow key={entry.id} entry={entry} />)}</div> : <EmptyState mark="state-field" title="Nothing logged yet" description="Your first field rep will land here." />}</Card></aside></div><footer className="safety-note"><ShieldCheck size={16} strokeWidth={1.5} /> Never do anything illegal, unsafe, or that harasses someone. Walk away means walk away.</footer><FieldSheets flow={flow} title={challenge?.title ?? ''} /><MilestoneSheet milestone={shown} onClose={() => { setMilestone(null); pending.reload() }} /></AppShell>
}

/**
 * How far to the next one. Counts refusals, never asks accepted (§09).
 *
 * Silent once every milestone is behind them — a bar that says "0 to go"
 * forever is a bar that has stopped meaning anything.
 */
function nextMilestone(collected: number) {
  const next = REJECTION_MILESTONES.find((milestone) => milestone.at > collected)
  if (!next) return null
  return <p className="label mute" style={{ marginTop: 12 }}>{next.at - collected} more to {next.at}</p>
}

function FieldHistoryRow({ entry }: { entry: FieldLogEntry }) {
  // An ask that came back no is the headline, so it reads as a completed rep
  // rather than as a failure. Only "could not do it" is the other icon.
  const outcome = entry.asked
    ? entry.outcome === 'declined' ? 'Turned down' : entry.outcome === 'accepted' ? 'They said yes' : 'In between'
    : 'Logged honestly'
  const gap = entry.anxietyPre !== null && entry.anxietyPost !== null
    ? `${entry.anxietyPre} → ${entry.anxietyPost}`
    : null
  return <div className="field-history-row"><span className={`field-history-icon${entry.asked ? ' done' : ''}`}>{entry.asked ? <Check size={14} strokeWidth={1.5} /> : <X size={14} strokeWidth={1.5} />}</span><span><strong>{entry.challengeTitle}</strong><small>Tier {entry.tier} · {outcome}</small></span>{gap ? <span className="field-history-gap data">{gap}</span> : null}</div>
}
