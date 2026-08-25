'use client'

import Link from 'next/link'
import { Check, ChevronDown, ChevronUp, Crosshair, Flame, MicOff, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useInterviewers, usePendingUnlock, usePersonas, useScorecard, useSession, useTranscript, useUserState } from '@/lib/data'
import type { Band, JudgementBand, MetricBand, Moment, SessionSummary, TranscriptTurn } from '@/lib/data/types'
import { techniqueForSubScore, type Technique } from '@/lib/techniques/library'
import { SUB_SCORE_LABELS } from '@/lib/data/scorecard'
import { LEVEL_NAMES } from '@/lib/data/progression'
import { resultReading } from '@/lib/data/rep-rules'
import { AppShell } from '@/components/app-shell'
import { Button, Card, Chip, EmptyState, LockOverlay, Skeleton, Tabs } from '@/components/ui'
import { FirstWinSheet, LevelUnlockedSheet, PaywallSheet, ScorecardExplainerSheet } from '@/components/modals'
import { acknowledgeUnlock } from '@/app/profile/actions'
import { ShareButton } from '@/components/share/share-button'
import { FluidPersona } from '@/components/fluid-persona'

export type SessionView = 'result' | 'scorecard' | 'transcript'

export function SessionScreen({ sessionId, view }: { sessionId: string; view: SessionView }) {
  const { data: session, loading } = useSession(sessionId)
  if (loading) return <SessionLoading view={view} />
  if (!session) return <AppShell title="Session"><EmptyState title="Session not found" description="That session does not exist or is no longer available." action={<Link className="arena-button arena-button--primary" href="/profile/history">View history</Link>} /></AppShell>
  if (view === 'result') return <ResultScreen session={session} />
  if (view === 'transcript') return <TranscriptScreen session={session} />
  return <ScorecardScreen session={session} />
}

function SessionLoading({ view }: { view: SessionView }) {
  if (view === 'result') return <main className="result-page"><Skeleton width={80} height={80} style={{ borderRadius: '50%' }} /><Skeleton width={300} height={52} /><Skeleton width={140} height={44} /></main>
  return <AppShell title={view === 'scorecard' ? 'Scorecard' : 'Transcript'}><div className="scorecard-grid"><Skeleton height={490} /><Skeleton height={490} /></div></AppShell>
}

function ResultScreen({ session }: { session: SessionSummary }) {
  const [firstWin, setFirstWin] = useState(false)
  const { data: personas } = usePersonas()
  const { data: interviewers } = useInterviewers()
  const { data: turns, loading: turnsLoading } = useTranscript(session.id)
  const subject = [...personas, ...interviewers].find((item) => item.id === session.personaId)
  // The number the outcome actually turned on, which is not where the meter
  // finished — see `resultReading`. This screen used to show `finalWarmth`
  // against the threshold and produced `71 / 65` under the words "She left".
  const reading = resultReading({
    decisionWarmth: session.decisionWarmth,
    finalWarmth: session.finalWarmth,
    interview: session.track === 'interview',
    won: session.won,
  })
  const { warmth: decided, threshold, fallback: usingFallback, lateSurge } = reading
  const close = threshold - decided

  const context = session.track === 'interview'
    ? (close >= 10 ? 'Your examples had signal, but the evidence did not land consistently.' : 'You were close to a callback.')
    : lateSurge
      ? (usingFallback
        ? `She decides thirty seconds from the end, and the meter kept climbing after that. It finished at ${session.finalWarmth}; where it stood when she decided was not recorded for this rep.`
        : `She decides thirty seconds from the end. You were at ${decided} then, and finished at ${session.finalWarmth} — you got there, just after she had answered.`)
      : close > 30 ? "She wasn't interested from the start. Some aren't."
        : close >= 10 ? (decided >= 40 ? 'You had her attention and lost it.' : 'She never really opened up.')
          : 'You were close.'
  const headline = session.track === 'interview' ? (session.won ? 'They want you back' : 'No callback') : (session.won ? 'She gave you her number' : 'She left')
  const repHref = session.track === 'interview' ? `/interview/rep/${session.personaId}/brief` : `/rep/${session.personaId}/brief`
  useEffect(() => {
    if (!session.won || session.track !== 'dating' || window.localStorage.getItem('nerve:first-win-seen')) return
    const timer = window.setTimeout(() => setFirstWin(true), 900)
    return () => window.clearTimeout(timer)
  }, [session.track, session.won])
  const closeFirstWin = () => { window.localStorage.setItem('nerve:first-win-seen', '1'); setFirstWin(false) }

  /**
   * A rep nobody spoke in is not a rep she was unmoved by.
   *
   * Without this the screen said "She wasn't interested from the start" to a
   * user whose microphone was muted, whose input device was wrong, or whose
   * browser had quietly withheld the permission — the three most likely things
   * to go wrong on somebody's very first attempt. It scored the equipment and
   * told the user it was them.
   *
   * `finishSession` has already put the rep back on the counter by the time
   * this renders; this is the half that says so.
   */
  const heardUser = turns.some((turn) => turn.speaker === 'user' && turn.text.trim().length > 0)
  if (!turnsLoading && !heardUser) {
    return <main className="result-page result-page--loss"><MicOff size={52} strokeWidth={1.25} className="amber" /><h1 className="display-xl">We didn&apos;t hear you</h1><p>Nothing came through on your microphone, so this one does not count against you — the rep is back on your counter.</p><div className="result-actions"><Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={repHref}><RotateCcw size={17} strokeWidth={1.5} /> Try that again</Link><Link className="arena-button arena-button--ghost arena-button--full" href="/profile/settings">Check your microphone</Link></div></main>
  }

  return <main className={`result-page result-page--${session.won ? 'win' : 'loss'}`}><FluidPersona name={subject?.name ?? session.personaName} personaId={session.personaId} warmth={session.finalWarmth} announceWarmth size={148} dimmed={!session.won} /><h1 className={`display-xl${session.won ? ' volt' : ''}`}>{headline}</h1>{session.won ? <><span className="result-time data">{formatDuration(session.durationMs)}</span><Chip tone="band" band={session.finalBand}>{session.track === 'interview' ? interviewBand(session.finalBand) : session.finalBand}</Chip></> : <><div className="result-warmth"><span className="label">Warmth</span><strong className="data">{decided}<i>/ {threshold}</i></strong></div><span className="label mute">{usingFallback ? 'Where the meter finished' : 'Where the meter was when she decided'}</span><p>{context}</p></>}<div className="result-actions"><Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={`/session/${session.id}/scorecard`}>See breakdown</Link><Link className="arena-button arena-button--ghost arena-button--full" href={repHref}><RotateCcw size={17} strokeWidth={1.5} /> Run it back</Link></div><FirstWinSheet open={firstWin} onClose={closeFirstWin} /></main>
}

function ScorecardScreen({ session }: { session: SessionSummary }) {
  const { data: scorecard, loading } = useScorecard(session.id)
  const { data: personas } = usePersonas()
  const { data: user } = useUserState()
  const [paywall, setPaywall] = useState(false)
  // The unlock moment (§12). Read from `unlocks` rather than inferred here:
  // grading is what earns it and grading lands after this screen opens, so a
  // row is the only thing that survives the gap — and it is what makes the
  // sheet fire once ever rather than on every visit to this scorecard.
  const unlock = usePendingUnlock()
  const [dismissed, setDismissed] = useState(false)
  // §12: once ever, and after the number has landed rather than over the top of
  // it. Per browser, like the first-win sheet beside it — this explains a screen
  // rather than recording an achievement, so it is not worth a database column.
  const [explainer, setExplainer] = useState(false)
  useEffect(() => {
    if (loading || !scorecard) return
    try {
      if (window.localStorage.getItem(SCORECARD_SEEN) === '1') return
      window.localStorage.setItem(SCORECARD_SEEN, '1')
    } catch { return }
    const timer = window.setTimeout(() => setExplainer(true), 1100)
    return () => window.clearTimeout(timer)
  }, [loading, scorecard])
  const pending = dismissed ? null : unlock.data
  const closeUnlock = () => {
    setDismissed(true)
    if (unlock.data) void acknowledgeUnlock(unlock.data.kind, unlock.data.ref)
  }
  if (loading) return <AppShell title="Scorecard"><div className="scorecard-grid"><Skeleton height={490} /><Skeleton height={490} /></div></AppShell>
  // Grading runs once, after the rep, on a model call that can fail. A rep
  // with no grade says so; it does not draw an empty card that reads as zero.
  if (!scorecard) return <AppShell title="Scorecard"><EmptyState title="This rep was not graded" description="Grading runs once after a rep and did not complete for this one. Your rep has been given back — run another and this page will have something to say." action={<div className="empty-actions"><Link className="arena-button arena-button--primary" href={session.track === 'interview' ? `/interview/rep/${session.personaId}/brief` : `/rep/${session.personaId}/brief`}>Run it back</Link><Link className="arena-button arena-button--ghost" href={`/session/${session.id}/transcript`}>Read the transcript</Link></div>} /></AppShell>
  const verdict = scorecard.composite < 50 ? 'Sloppy' : scorecard.composite < 70 ? 'Solid' : scorecard.composite < 85 ? 'Sharp' : 'Clean'
  const audit = scorecard.metrics.reduce((sum, metric) => sum + metric.points, 0) + (scorecard.judgement?.points ?? 0)
  const parts = [...scorecard.metrics.map((metric) => String(metric.points)), ...(scorecard.judgement ? [String(scorecard.judgement.points)] : [])]
  const pro = user?.plan !== 'free'
  const outcomeLabel = session.track === 'interview' ? (session.won ? 'callback earned' : 'no callback') : (session.won ? 'number given' : 'left')
  const signalLabel = session.track === 'interview' ? 'Impression' : 'Warmth'
  const personaLevel = personas.find((item) => item.id === session.personaId)?.level ?? null
  const levelLabel = session.track === 'interview' ? 'Interview' : personaLevel ? `${String(personaLevel).padStart(2, '0')} — ${LEVEL_NAMES[personaLevel]}` : '—'
  return <AppShell title="Scorecard"><header className="scorecard-title"><span className="label">Process score · {session.personaName}</span><h1 className="display-lg">Session breakdown</h1></header><div className="scorecard-grid"><div className="scorecard-left"><Card className="composite-card"><div><span className="composite data">{scorecard.composite}<small>/100</small></span><strong className="display-md">{verdict}</strong></div><p>{session.personaName} · Level {levelLabel} · {formatDuration(session.durationMs)} · {outcomeLabel}</p></Card>{scorecard.judgement?.wentWell ? <WhatWorked line={scorecard.judgement.wentWell} /> : null}<section className="metrics-section"><div className="section-title"><h2 className="display-md">Metrics</h2><span className={`audit-total data${audit !== scorecard.composite ? ' danger' : ''}`}>{parts.join(' + ')} = {audit}</span></div><div className="metric-list">{scorecard.metrics.map((metric, index) => <div key={metric.key}>{!pro && index >= 2 ? <LockOverlay requirement="Full scorecards are Pro"><MetricBandRow metric={metric} /></LockOverlay> : <MetricBandRow metric={metric} />}</div>)}{scorecard.judgement ? (pro ? <JudgementRow judgement={scorecard.judgement} /> : <LockOverlay requirement="Full scorecards are Pro"><JudgementRow judgement={scorecard.judgement} /></LockOverlay>) : null}</div></section></div><aside className="scorecard-right">{pro ? <><MomentSection title="The moment it worked" moment={scorecard.bestMoment} signalLabel={signalLabel} /><MomentSection title="The moment it didn't" moment={scorecard.worstMoment} signalLabel={signalLabel} /><section><h2 className="display-md">Try this next time</h2><Card className="try-next"><Crosshair size={20} strokeWidth={1.5} className="volt" /><p>{scorecard.tryNext}</p></Card><FocusLinks focus={scorecard.focus} /></section></> : <LockOverlay requirement="Moments are available on Pro"><Card style={{ minHeight: 330 }} /></LockOverlay>}</aside></div><div className="scorecard-actions"><Link className="arena-button arena-button--primary" href={session.track === 'interview' ? `/interview/rep/${session.personaId}/brief` : `/rep/${session.personaId}/brief`}>Run it back</Link>{pro ? <Link className="arena-button arena-button--secondary" href={`/session/${session.id}/transcript`}>Read the transcript</Link> : <Button variant="secondary" onClick={() => setPaywall(true)}>Unlock transcript</Button>}<Link className="arena-button arena-button--ghost" href="/roster">Next persona</Link>{session.won && session.track === 'dating' ? <ShareButton kind="rep_win" sessionId={session.id} label="Make a card" /> : null}</div><PaywallSheet open={paywall} onClose={() => setPaywall(false)} reason="Full transcripts are available on Pro and Elite." /><LevelUnlockedSheet open={pending !== null} onClose={closeUnlock} unlock={pending} /><ScorecardExplainerSheet open={explainer} onClose={() => setExplainer(false)} /></AppShell>
}

/**
 * The 40% that is judgement rather than measurement (§07).
 *
 * It sits in the same list as the metrics and carries points the same way, so
 * the audit line adds up to the composite — but it prints its six sub-scores
 * instead of a target band, because there is no band to have missed.
 */
function JudgementRow({ judgement }: { judgement: JudgementBand }) {
  return <div className="metric-row"><div className="metric-row__head"><span>{judgement.label}</span><span className="data">{judgement.subScores.length ? `${Math.round(judgement.subScores.reduce((sum, entry) => sum + entry.value, 0) / judgement.subScores.length)}/100` : '—'}</span><strong className="data">{judgement.points}/{judgement.maxPoints}</strong></div><div className="chip-row" style={{ marginTop: 4 }}>{judgement.subScores.map((entry) => <Chip key={entry.key}>{entry.label} {entry.value}</Chip>)}</div></div>
}

/**
 * The one thing that worked, before anything that did not (§07).
 *
 * It used to sit at the foot of the judgement row: last item in the list, two
 * thirds down the page, and inside the Pro lock — so the users most likely to
 * quit after a bad rep were the only ones who never saw it. §07 is explicit
 * that this comes first, and the reason is retention rather than manners: "a
 * user who feels flayed after their third rep never comes back for a fourth."
 *
 * Never gated. Whatever else is behind the paywall, the encouraging half of
 * the scorecard is not.
 */
function WhatWorked({ line }: { line: string }) {
  return <Card className="went-well"><Check size={18} strokeWidth={1.6} className="volt" /><div><span className="label">What worked</span><p>{line}</p></div></Card>
}

function MetricBandRow({ metric }: { metric: MetricBand }) {
  const marker = Math.min(100, Math.max(0, metric.numericValue))
  return <div className="metric-row"><div className="metric-row__head"><span>{metric.label}</span><span className="data">{metric.displayValue}</span><strong className="data">{metric.points}/{metric.maxPoints}</strong></div><div className="metric-bar"><i style={{ left: `${metric.targetMin}%`, width: `${Math.max(4, metric.targetMax - metric.targetMin)}%` }} /><b style={{ left: `${marker}%` }} /></div><div className="metric-row__foot"><span className="label">Target {metric.targetLabel}</span><p>{metric.note}</p></div></div>
}

function MomentSection({ title, moment, signalLabel }: { title: string; moment: Moment | null; signalLabel: string }) { if (!moment) return null; return <section className="moment-section"><h2 className="display-md">{title}</h2><Card className="moment-card"><blockquote>“{moment.quote}”</blockquote><div><span className={`data ${moment.delta > 0 ? 'volt' : 'amber'}`}>{moment.delta > 0 ? '+' : ''}{moment.delta}</span><span className="label">{signalLabel} {moment.warmthAfter}</span></div><p>{moment.note}</p></Card></section> }

function TranscriptScreen({ session }: { session: SessionSummary }) {
  const { data: turns, loading } = useTranscript(session.id)
  const [filter, setFilter] = useState<'ALL' | 'BIG MOVES'>('ALL')
  const refs = useRef<Record<number, HTMLDivElement | null>>({})
  const filtered = useMemo(() => turns.filter((turn) => filter === 'ALL' || Math.abs(turn.delta ?? 0) >= 3), [filter, turns])
  const signalLabel = session.track === 'interview' ? 'Impression' : 'Warmth'
  const scrollToTurn = (index: number) => refs.current[index]?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  const repHref = session.track === 'interview' ? `/interview/rep/${session.personaId}/brief` : `/rep/${session.personaId}/brief`
  // Nothing was said at all — which is a different screen from "your filter
  // matched nothing", and used to be shown as the latter. The trajectory card
  // is suppressed with it: an empty sparkline reads "0 → 0" and sat directly
  // under a header printing this session's final warmth, so the one screen
  // stated two different numbers for the same rep.
  const silent = !loading && turns.length === 0
  return <AppShell title="Transcript"><div className="screen-heading compact"><span className="label">Turn by turn</span><h1 className="display-lg">Transcript</h1><p>{session.personaName} · {formatDuration(session.durationMs)}{silent ? ' · nothing was said' : ` · ${signalLabel} ${session.finalWarmth}`}</p></div>{silent ? <EmptyState title="This rep has no transcript" description="No speech was recorded on either side, so there is nothing to read back. Your rep was not counted — run it again." action={<Link className="arena-button arena-button--primary" href={repHref}>Run it back</Link>} /> : <><Card className="sparkline-card"><WarmthSparkline turns={turns} label={signalLabel} onPoint={scrollToTurn} /></Card><Tabs items={['ALL', 'BIG MOVES'] as const} value={filter} onChange={setFilter} label="Transcript filter" />{loading ? <div className="transcript-list">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} height={96} />)}</div> : filtered.length ? <div className="transcript-list">{filtered.map((turn) => <div key={turn.index} ref={(node) => { refs.current[turn.index] = node }}><TranscriptTurnRow turn={turn} persona={session.personaName} /></div>)}</div> : <EmptyState title="No turns match" description="Every turn is in the full transcript — switch back to ALL." action={<Button variant="secondary" onClick={() => setFilter('ALL')}>Show all turns</Button>} />}<div className="transcript-sticky"><Link className="arena-button arena-button--primary arena-button--full" href={repHref}><RotateCcw size={17} strokeWidth={1.5} /> Run it back</Link></div></>}</AppShell>
}

function WarmthSparkline({ turns, label, onPoint }: { turns: TranscriptTurn[]; label: string; onPoint: (index: number) => void }) {
  const userTurns = turns.filter((turn) => turn.warmthAfter !== null)
  const points = userTurns.map((turn, index) => `${10 + index * (380 / Math.max(1, userTurns.length - 1))},${82 - (turn.warmthAfter ?? 0) * .65}`).join(' ')
  const first = userTurns[0]?.warmthAfter ?? 0
  const last = userTurns[userTurns.length - 1]?.warmthAfter ?? first
  return <div className="sparkline"><div className="sparkline-head"><span className="label">{label} trajectory</span><span className="data">{first} → {last}</span></div><svg viewBox="0 0 400 90" aria-label={`${label} trajectory`}><g className="chart-grid"><line x1="0" y1="28" x2="400" y2="28" /><line x1="0" y1="56" x2="400" y2="56" /></g><polyline points={points} />{userTurns.map((turn, index) => <circle key={turn.index} cx={10 + index * (380 / Math.max(1, userTurns.length - 1))} cy={82 - (turn.warmthAfter ?? 0) * .65} r="5" role="button" tabIndex={0} aria-label={`Jump to turn ${turn.index + 1}`} onClick={() => onPoint(turn.index)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPoint(turn.index) } }} />)}</svg></div>
}

function TranscriptTurnRow({ turn, persona }: { turn: TranscriptTurn; persona: string }) {
  const [expanded, setExpanded] = useState(false)
  const band = turn.warmthAfter === null ? 'GUARDED' : warmthBand(turn.warmthAfter)
  const content = <><div className="turn-head"><span className="label">{turn.speaker === 'user' ? 'You' : persona}</span><span className="turn-time data">{formatDuration(turn.tStart)}</span>{turn.delta !== null ? <span className={`turn-delta data${turn.delta > 0 ? ' positive' : ''}`}>{turn.delta > 0 ? '+' : ''}{turn.delta}</span> : null}</div><p>{turn.text}</p>{expanded && turn.reason ? <div className="turn-reason"><Flame size={14} strokeWidth={1.5} /><span>{turn.reason}</span></div> : null}</>
  return <article className={`transcript-turn transcript-turn--${turn.speaker}`} style={{ borderLeftColor: bandCss(band) }}>{turn.speaker === 'user' && turn.reason ? <button onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{content}{expanded ? <ChevronUp size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}</button> : content}</article>
}

function warmthBand(value: number): Band { return value >= 80 ? 'INVESTED' : value >= 65 ? 'ENGAGED' : value >= 45 ? 'OPEN' : value >= 25 ? 'GUARDED' : 'CLOSED' }
function bandCss(band: Band) { return `var(--band-${band.toLowerCase()})` }
function interviewBand(band: Band) { return ({ CLOSED: 'SKEPTICAL', GUARDED: 'NEUTRAL', OPEN: 'INTERESTED', ENGAGED: 'IMPRESSED', INVESTED: 'CONVINCED' } as const)[band] }
function formatDuration(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }

/**
 * The two weakest sub-scores, each linked to the technique that moves it (§07).
 *
 * "The weakest two are surfaced as the focus for the next rep, and each links
 * to the matching technique in the library." The surfacing existed; the links
 * did not, because there was no library to link to. Advice a user cannot act on
 * is decoration.
 *
 * Resolved from the authored registry rather than by fetching, so the links are
 * there on first paint. A card that has not been seeded lands on the library's
 * own "no such card" state, which is a better failure than a section that
 * flickers in after the scorecard the user is already reading.
 */
function FocusLinks({ focus }: { focus: string[] }) {
  const cards = focus
    .map((key) => ({ key, card: techniqueForSubScore(key) }))
    .filter((entry): entry is { key: string; card: Technique } => entry.card !== null)
  if (cards.length === 0) return null
  return (
    <div className="focus-links">
      <span className="label">Work on</span>
      {cards.map(({ key, card }) => (
        <Link key={key} href={`/library/${card.slug}`} className="focus-link">
          <span className="label">{SUB_SCORE_LABELS[key] ?? key}</span>
          <strong>{card.title}</strong>
        </Link>
      ))}
    </div>
  )
}

/** Per browser, like the first-win sheet. See the note at its only use. */
const SCORECARD_SEEN = 'nerve.scorecard.explained'
