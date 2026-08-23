'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronLeft, LockKeyhole, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useFieldLog, useFieldStats, useFieldToday, usePersona, usePersonaProgress, usePersonas, useSessionHistory, useUserState } from '@/lib/data'
import type { FieldLogEntry, Level, Persona, PersonaProgress } from '@/lib/data/types'
import { FieldActions, FieldLogged, FieldSheets, useFieldFlow } from '@/components/field/flow'
import { TIER_NAMES } from '@/lib/field/assignment'
import { AppShell } from '@/components/app-shell'
import { Avatar, Card, Chip, EmptyState, LockOverlay, Sheet, Skeleton, Stat } from '@/components/ui'
import { SessionRow } from './train-screen'
import { useProduct } from '@/components/product-provider'
import { InterviewerPicker } from './interview-screens'
import { useBreakpoint } from '@/lib/hooks/use-breakpoint'

const levels: { level: Level; name: string; description: string; requirement: string }[] = [
  { level: 1, name: 'Receptive', description: "She'll meet you halfway.", requirement: '' },
  { level: 2, name: 'Neutral', description: "She'll give you nothing for free.", requirement: '' },
  { level: 3, name: 'Resistant', description: 'You are an interruption.', requirement: 'Win 2 reps at Level 2' },
  { level: 4, name: 'Hostile', description: 'She wants you to leave.', requirement: 'Win 3 reps at Level 3' },
]

export function RosterScreen() {
  const { track } = useProduct()
  const { data: personas, loading } = usePersonas()
  const { data: progressRaw } = usePersonaProgress()
  const progress = Array.isArray(progressRaw) ? progressRaw : []
  if (track === 'interview') return <InterviewerPicker />
  return <AppShell title="Roster"><div className="screen-heading"><span className="label">Progression map</span><h1 className="display-lg">Roster</h1><p>Read the room. Then earn a harder one.</p></div>{!loading && personas.length === 0 ? <EmptyState title="The roster is empty" description="New training partners will appear here." /> : <div className="level-list">{loading ? [1, 2, 3, 4].map((item) => <RosterSkeleton key={item} />) : levels.map((level) => <LevelSection key={level.level} config={level} personas={personas.filter((persona) => persona.level === level.level)} progress={progress} />)}</div>}</AppShell>
}

function RosterSkeleton() { return <section className="level-section"><div className="level-head"><div style={{ flex: 1 }}><Skeleton width={220} height={24} /><Skeleton width={180} height={14} style={{ marginTop: 8 }} /></div><Skeleton width={68} height={16} /></div><div className="persona-grid"><Skeleton height={220} /><Skeleton height={220} /></div></section> }

function LevelSection({ config, personas, progress }: { config: typeof levels[number]; personas: Persona[]; progress: PersonaProgress[] }) {
  const allLocked = personas.every((persona) => persona.locked)
  const [expanded, setExpanded] = useState(!allLocked)
  const beaten = personas.filter((persona) => (progress.find((item) => item.personaId === persona.id)?.wins ?? 0) > 0).length
  if (allLocked && !expanded) return <button className="locked-level" onClick={() => setExpanded(true)}><span><LockKeyhole size={18} strokeWidth={1.5} /><strong>Level {String(config.level).padStart(2, '0')} — {config.name}</strong></span><span className="label">{config.requirement}</span><ChevronDown size={18} strokeWidth={1.5} /></button>
  return <section className="level-section"><header className="level-head"><div><h2 className="display-md">Level {String(config.level).padStart(2, '0')} — {config.name}</h2><p>{config.description}</p></div><span className="label">{beaten}/{personas.length} beaten</span></header><div className="persona-grid">{personas.map((persona) => <PersonaCard key={persona.id} persona={persona} progress={progress.find((item) => item.personaId === persona.id)} />)}</div></section>
}

function PersonaCard({ persona, progress }: { persona: Persona; progress?: PersonaProgress }) {
  const record = !progress || progress.attempts === 0 ? 'NOT ATTEMPTED' : progress.wins > 0 && progress.bestTimeMs ? `WON — ${formatTime(progress.bestTimeMs)} BEST` : `0/${progress.attempts} — BEST WARMTH ${progress.bestWarmth}`
  const content = <article className="persona-card"><div className="persona-card__portrait"><Avatar name={persona.name} src={persona.portraitUrl} size={96} /><span className="persona-card__index data">0{persona.level}</span></div><div className="persona-card__copy"><div><h3 className="display-md">{persona.name}</h3><span className="label">{persona.settingShort}</span></div><span className={`persona-card__record${progress?.wins ? ' volt' : ''}`}>{record}</span></div></article>
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
  const progress = !Array.isArray(progressRaw) ? progressRaw : null
  if (loading) return <AppShell title="Roster"><div className="persona-detail"><Skeleton height={560} /></div></AppShell>
  if (!persona) return <AppShell title="Roster"><EmptyState title="Nothing here" description="That person is not on the roster." action={<Link className="arena-button arena-button--primary" href="/roster">Back to roster</Link>} /></AppShell>
  const recent = sessions.filter((session) => session.personaId === persona.id).slice(0, 3)
  const canStart = !persona.locked && (user?.repsRemainingToday ?? 0) > 0
  const content = <article className={`persona-detail${isDesktop ? '' : ' persona-detail--sheet'}`}><Link className="detail-back" href="/roster"><ChevronLeft size={18} strokeWidth={1.5} /> Roster</Link><div className="persona-detail__grid"><aside className="persona-detail__hero"><Avatar name={persona.name} src={persona.portraitUrl} size={128} /><div><Chip tone="band" band={persona.level >= 3 ? 'CLOSED' : 'GUARDED'}>Level {String(persona.level).padStart(2, '0')}</Chip><h1 className="display-xl">{persona.name}</h1><span className="label">{persona.setting}</span></div></aside><div className="persona-detail__body"><p className="persona-blurb">{persona.blurb}</p><DetailChips label="She responds to" items={persona.respondsTo} tone="volt" /><DetailChips label="She shuts down on" items={persona.shutsDownOn} /><section><span className="label">Your record</span><div className="record-grid"><Stat label="Attempts" value={progress?.attempts ?? 0} /><Stat label="Wins" value={progress?.wins ?? 0} /><Stat label="Best time" value={progress?.bestTimeMs ? formatTime(progress.bestTimeMs) : '—'} /><Stat label="Best warmth" value={progress?.bestWarmth || '—'} /></div></section><section><span className="label">Recent sessions</span><div>{recent.length ? recent.map((session) => <SessionRow key={session.id} session={session} />) : <p className="muted">Not faced yet.</p>}</div></section></div></div><div className="detail-action">{canStart ? <Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={`/rep/${persona.id}/brief`}>Start rep</Link> : <div className="locked-action"><LockKeyhole size={18} strokeWidth={1.5} /><span>{persona.locked ? persona.unlockRequirement : 'Your reps reset tonight'}</span></div>}</div></article>
  if (isDesktop) return <AppShell title={persona.name}>{content}</AppShell>
  return <AppShell title="Roster"><Sheet open onClose={() => router.push('/roster')} title={persona.name}>{content}</Sheet></AppShell>
}

function DetailChips({ label, items, tone = 'neutral' }: { label: string; items: string[]; tone?: 'neutral' | 'volt' }) { return <section><span className="label">{label}</span><div className="chip-row" style={{ marginTop: 10 }}>{items.map((item) => <Chip key={item} tone={tone}>{item}</Chip>)}</div></section> }

export function FieldScreen() {
  const today = useFieldToday()
  const log = useFieldLog()
  const stats = useFieldStats()
  // A write changes the counters and the log as well as the card, so all three
  // reads are asked again once it lands.
  const flow = useFieldFlow(today.data, () => {
    today.reload()
    log.reload()
    stats.reload()
  })

  const assignment = today.data
  const loading = today.loading
  const logLoading = log.loading

  const challenge = assignment?.challenge
  const resolved = flow.status === 'done' || flow.status === 'skipped'

  return <AppShell title="Field"><div className="screen-heading"><span className="label">Outside the app</span><h1 className="display-lg">Field</h1><p>Small real-world moves. No performance, no audience.</p></div><div className="field-layout"><section>{loading ? <Skeleton height={390} /> : challenge ? <Card className="today-field">{resolved ? <FieldLogged status={flow.status} /> : <><div className="today-field__top"><Chip>Tier {challenge.tier} · {TIER_NAMES[challenge.tier]}</Chip><span className="label">Today</span></div><div><h2 className="display-lg">{challenge.title}</h2><p>{challenge.brief}</p><p className="today-field__done"><span className="label">Done when</span> {challenge.doneWhen}</p>{challenge.safetyNote ? <p className="today-field__safety"><ShieldCheck size={15} strokeWidth={1.5} /> {challenge.safetyNote}</p> : null}</div><FieldActions flow={flow} size="lg" /></>}</Card> : <EmptyState title="No field rep today" description="Your next real-world prompt will appear here." />}</section><aside className="field-side"><Card><span className="label">Rejections collected</span><Stat label="Asks made" value={stats.data?.asksMade ?? 0} /><div className="field-counters"><span className="composite data">{stats.data?.rejectionsCollected ?? 0}</span><p className="muted">Every one of them is a rep. Nobody keeps score of the yeses.</p></div></Card><Card><span className="label">Tier progress</span><div className="tier-track">{[1, 2, 3, 4].map((tier) => <i key={tier} className={tier <= (stats.data?.tier ?? 1) ? 'active' : ''} />)}</div><div className="tier-copy"><strong>Tier {stats.data?.tier ?? 1} — {TIER_NAMES[stats.data?.tier ?? 1]}</strong><span>{stats.data?.tierDone ?? 0} of {stats.data?.tierTotal ?? 0} logged</span></div>{stats.data?.nextTierAt ? <p className="label mute" style={{ marginTop: 10 }}>{stats.data.nextTierAt}</p> : null}</Card><Card><span className="label">History</span>{logLoading ? <Skeleton height={180} style={{ marginTop: 14 }} /> : log.data.length ? <div className="field-history">{log.data.slice(0, 8).map((entry) => <FieldHistoryRow key={entry.id} entry={entry} />)}</div> : <EmptyState title="Nothing logged yet" description="Your first field rep will land here." />}</Card></aside></div><footer className="safety-note"><ShieldCheck size={16} strokeWidth={1.5} /> Never do anything illegal, unsafe, or that harasses someone. Walk away means walk away.</footer><FieldSheets flow={flow} title={challenge?.title ?? ''} /></AppShell>
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
