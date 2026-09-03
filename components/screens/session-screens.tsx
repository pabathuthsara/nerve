'use client'

import Link from 'next/link'
import { Check, ChevronDown, ChevronUp, Crosshair, Flame, MicOff, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useInterviewers, useLifetimeStats, usePendingUnlock, usePersonaMemory, usePersonas, useScorecard, useSession, useSessionHistory, useTranscript, useUserState } from '@/lib/data'
import type { Band, JudgementBand, LifetimeStats, MetricBand, Moment, SessionSummary, TranscriptTurn } from '@/lib/data/types'
import { techniqueForSubScore, type Technique } from '@/lib/techniques/library'
import { SUB_SCORE_LABELS } from '@/lib/data/scorecard'
import { LEVEL_NAMES, nextUnlockProgress, qualifyingByLevel, unlockProgressLabel, type UnlockProgress } from '@/lib/data/progression'
import { pointsShort, resultReading } from '@/lib/data/rep-rules'
import { lifetimeLine } from '@/lib/data/counters'
import { AppShell } from '@/components/app-shell'
import { Button, Card, Chip, EmptyState, Skeleton, Tabs } from '@/components/ui'
import { FirstLossSheet, FirstWinSheet, LevelUnlockedSheet, PaywallSheet, ScorecardExplainerSheet } from '@/components/modals'
import { acknowledgeUnlock } from '@/app/profile/actions'
import { ShareButton } from '@/components/share/share-button'
import { FluidPersona } from '@/components/fluid-persona'
import { ReportButton } from '@/components/safety/report-button'
import { capture } from '@/components/analytics'
import { MissionCard, MissionNote } from '@/components/mission'
import { missionFor } from '@/lib/data/mission'
import { useCountUp, useStagger } from '@/lib/hooks/use-staged-reveal'
import { SoundKit } from '@/lib/audio/kit'
import { soundEnabled } from '@/lib/hooks/use-rep-production'
import { Mark, dimensionMark, tierMark } from '@/components/marks'

export type SessionView = 'result' | 'scorecard' | 'transcript'

export function SessionScreen({ sessionId, view }: { sessionId: string; view: SessionView }) {
  const { data: session, loading } = useSession(sessionId)
  if (loading) return <SessionLoading view={view} />
  if (!session) return <AppShell title="Session"><EmptyState mark="state-session" title="Session not found" description="That session does not exist or is no longer available." action={<Link className="arena-button arena-button--primary" href="/profile/history">View history</Link>} /></AppShell>
  if (view === 'result') return <ResultScreen session={session} />
  if (view === 'transcript') return <TranscriptScreen session={session} />
  return <ScorecardScreen session={session} />
}

function SessionLoading({ view }: { view: SessionView }) {
  if (view === 'result') return <main className="result-page"><Skeleton width={80} height={80} style={{ borderRadius: '50%' }} /><Skeleton width={300} height={52} /><Skeleton width={140} height={44} /></main>
  return <AppShell title={view === 'scorecard' ? 'Scorecard' : 'Transcript'}><div className="scorecard-grid"><Skeleton height={490} /><Skeleton height={490} /></div></AppShell>
}

/**
 * The screen the highest-effort moment in the product resolves into.
 *
 * It used to emit `result-page--win` and `result-page--loss` and style neither
 * (RETENTION-AUDIT R3): the two outcomes differed by a dimmed orb, a volt
 * headline and which figures were printed, so the layout did not know what had
 * happened. Six findings land here and they are one screen between them.
 *
 * **R3 · the loud moment is keyed to a personal best, never to a win.** §07
 * says outcome is worth zero, and the loudest state in the product was keyed
 * off `session.won` — the design system celebrating the one thing the product
 * says does not count. `result-page--best` fires on a composite that beat every
 * previous one, which can happen after a rejection, happens far more often than
 * a win, and is the thesis finally landing as a feeling rather than a
 * paragraph. Under `prefers-reduced-motion` it is finished on first paint (§02).
 *
 * **R4 · a near-miss is its own screen.** Missing by four and never being in it
 * rendered identically. `nearMiss` comes from `rep-rules.ts` with the rest of
 * the format, the headline is the gap said out loud, and `Run it back` is
 * promoted to primary and first.
 *
 * **R5 · the first rejection gets a sheet**, which is also the better home for
 * the scorecard explainer (§12 calls it load-bearing for retention, and it was
 * waiting for a scorecard behind a win that may never come).
 *
 * **R7 · the counters that only go up** are printed here, on the screen where
 * you lost, because that is where they are an argument rather than a boast.
 *
 * **R8 · the unlock meter** moves because of the rep just run, rather than
 * restating a requirement that never changes.
 *
 * **R11 · what she'll remember** rides the win, because it implies a next time.
 *
 * **R12 · your record against her**, which turns `41 / 65` — a number that lost
 * — into `41, your best against her is 38`, a number that went up. Same data.
 *
 * **R17 · what to change** is stated here rather than costing a click taken at
 * the lowest motivation point in the loop, and `Run it back` on a spent account
 * opens the paywall instead of walking into a refusal.
 */
function ResultScreen({ session }: { session: SessionSummary }) {
  const [firstWin, setFirstWin] = useState(false)
  const [firstLoss, setFirstLoss] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const { data: personas } = usePersonas()
  const { data: interviewers } = useInterviewers()
  const { data: turns, loading: turnsLoading } = useTranscript(session.id)
  const { data: history } = useSessionHistory()
  const { data: scorecard } = useScorecard(session.id)
  const { data: lifetime } = useLifetimeStats()
  const { data: user } = useUserState()
  const memory = usePersonaMemory(session.personaId)
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
  const { warmth: decided, threshold, fallback: usingFallback, lateSurge, close, nearMiss } = reading

  /**
   * The grade, from whichever of the two reads has it.
   *
   * The session row is written when the rep ends and scored a few seconds
   * later, so `session.compositeScore` is usually null on the first paint of
   * this screen and `useScorecard` is the one that waits. Reading both means
   * the personal best and the unlock meter land when the number does rather
   * than on the next visit.
   */
  const composite = session.compositeScore ?? scorecard?.composite ?? null

  /**
   * Everything before this rep.
   *
   * Excluded by id rather than by index: history is newest-first, but a rep
   * opened from `/profile/history` is not the newest one, and comparing a rep
   * against itself would make every old rep a personal best.
   */
  const earlier = useMemo(
    () => history.filter((row) => row.id !== session.id),
    [history, session.id],
  )

  // R3's doctrine fix. Strictly better than every graded rep before it, and
  // only once there IS one — a first score is a baseline, and calling it a
  // personal best would spend the product's one loud moment on a tautology.
  const bestBefore = useMemo(() => {
    const scored = earlier.map((row) => row.compositeScore).filter((value): value is number => value !== null)
    return scored.length ? Math.max(...scored) : null
  }, [earlier])
  const personalBest = composite !== null && bestBefore !== null && composite > bestBefore

  // R12. Her record, taken from history rather than from `persona_progress`,
  // because that table has already been updated with the rep being shown — so
  // "your best against her" would silently include the rep you are looking at.
  const hers = useMemo(() => earlier.filter((row) => row.personaId === session.personaId), [earlier, session.personaId])
  const herBestWarmth = useMemo(() => {
    const readings = hers.map((row) => row.decisionWarmth ?? row.finalWarmth)
    return readings.length ? Math.max(...readings) : null
  }, [hers])
  const herBestTimeMs = useMemo(() => {
    const times = hers.filter((row) => row.won && row.durationMs > 0).map((row) => row.durationMs)
    return times.length ? Math.min(...times) : null
  }, [hers])

  // R8. Built from history plus the rep just run, so the bar has already moved
  // by the time it is first drawn.
  const nextUnlock = useMemo(() => {
    if (session.track !== 'dating') return null
    const levelById = new Map(personas.map((persona) => [persona.id, persona.level]))
    const reps = [...earlier, { ...session, compositeScore: composite }].flatMap((row) => {
      const level = levelById.get(row.personaId)
      return level ? [{ level, composite: row.compositeScore }] : []
    })
    return nextUnlockProgress(qualifyingByLevel(reps))
  }, [earlier, personas, session, composite])

  const context = session.track === 'interview'
    ? (close >= 10 ? 'Your examples had signal, but the evidence did not land consistently.' : 'You were close to a callback.')
    : lateSurge
      ? (usingFallback
        ? `She decides thirty seconds from the end, and the meter kept climbing after that. It finished at ${session.finalWarmth}; where it stood when she decided was not recorded for this rep.`
        : `She decides thirty seconds from the end. You were at ${decided} then, and finished at ${session.finalWarmth} — you got there, just after she had answered.`)
      : close > 30 ? "She wasn't interested from the start. Some aren't."
        : close >= 10 ? (decided >= 40 ? 'You had her attention and lost it.' : 'She never really opened up.')
          : 'You were close.'

  /**
   * R4. The gap, said rather than measured.
   *
   * A late surge has a negative gap — she was told to leave at 64 and the
   * meter finished at 71 — so it gets the sentence that actually happened
   * instead of arithmetic that would read as nonsense.
   */
  const headline = session.won
    ? (session.track === 'interview' ? 'They want you back' : 'She gave you her number')
    : nearMiss
      ? (lateSurge ? 'Thirty seconds late' : pointsShort(close))
      : (session.track === 'interview' ? 'No callback' : 'She left')

  const repHref = session.track === 'interview' ? `/interview/rep/${session.personaId}/brief` : `/rep/${session.personaId}/brief`
  const scorecardHref = `/session/${session.id}/scorecard`

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

  useEffect(() => {
    if (!session.won || session.track !== 'dating') return
    try { if (window.localStorage.getItem(FIRST_WIN_SEEN)) return } catch { return }
    const timer = window.setTimeout(() => setFirstWin(true), 900)
    return () => window.clearTimeout(timer)
  }, [session.track, session.won])
  const closeFirstWin = () => {
    try { window.localStorage.setItem(FIRST_WIN_SEEN, '1') } catch { /* private mode costs one repeat */ }
    setFirstWin(false)
  }

  /**
   * R5. The first rejection, once ever.
   *
   * It waits for the transcript, because "we didn't hear you" is not a
   * rejection and telling somebody whose microphone failed that this is
   * supposed to happen is the worst sentence on the worst screen.
   */
  useEffect(() => {
    if (session.won || session.track !== 'dating' || turnsLoading || !heardUser) return
    // Either key. Somebody who already met the scorecard explainer has had this
    // argument made to them once, and §12 only ever wanted it made once.
    try {
      if (window.localStorage.getItem(FIRST_LOSS_SEEN)) return
      if (window.localStorage.getItem(SCORECARD_SEEN) === '1') return
    } catch { return }
    const timer = window.setTimeout(() => setFirstLoss(true), 1100)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.track, session.won, turnsLoading])
  const closeFirstLoss = () => {
    markScoringExplained()
    setFirstLoss(false)
  }

  /**
   * R11. The line she keeps is written by the same action that writes the
   * grade, so it arrives with the scorecard rather than with this screen.
   */
  useEffect(() => {
    if (!scorecard) return
    memory.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scorecard?.sessionId])

  if (!turnsLoading && !heardUser) {
    return <main className="result-page result-page--loss"><MicOff size={52} strokeWidth={1.25} className="amber" /><h1 className="display-xl">We didn&apos;t hear you</h1><p>Nothing came through on your microphone, so this one does not count against you — the rep is back on your counter.</p><div className="result-actions"><Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={repHref}><RotateCcw size={17} strokeWidth={1.5} /> Try that again</Link><Link className="arena-button arena-button--ghost arena-button--full" href="/profile/settings">Check your microphone</Link></div></main>
  }

  // R11. Only a line this rep produced. `usePersonaMemory` would otherwise hand
  // back whatever she remembered from last time, and attaching an old memory to
  // a new rep is a continuity feature telling a lie.
  const freshMemory = memory.data && memory.data.lastSeenAt
    && Date.parse(memory.data.lastSeenAt) >= Date.parse(session.startedAt)
    ? memory.data.line
    : null

  // R12, the win half. Only when she has actually been won before — "faster
  // than your best" against a first win is a comparison with nothing.
  const fasterBy = session.won && herBestTimeMs !== null && session.durationMs < herBestTimeMs
    ? Math.round((herBestTimeMs - session.durationMs) / 1000)
    : null

  const tone = session.won ? 'win' : nearMiss ? 'near' : 'loss'
  // R3/R13. The one-shot beat, and the only place in Arena where volt is
  // allowed to take the frame. It leaves again in under two seconds.
  const className = `result-page result-page--${tone}${personalBest ? ' result-page--best' : ''}`
  const runItBack = user?.voiceLocked && session.track === 'dating'
    ? <Button variant={nearMiss ? 'primary' : 'ghost'} size={nearMiss ? 'lg' : 'md'} fullWidth onClick={() => setPaywall(true)}><RotateCcw size={17} strokeWidth={1.5} /> Run it back</Button>
    : <Link className={`arena-button arena-button--${nearMiss ? 'primary arena-button--lg' : 'ghost'} arena-button--full`} href={repHref}><RotateCcw size={17} strokeWidth={1.5} /> Run it back</Link>
  const seeBreakdown = <Link className={`arena-button arena-button--${nearMiss ? 'secondary' : 'primary arena-button--lg'} arena-button--full`} href={scorecardHref}>See breakdown</Link>

  return (
    <main className={className}>
      {personalBest ? <BestBeat /> : null}
      <FluidPersona name={subject?.name ?? session.personaName} personaId={session.personaId} warmth={session.finalWarmth} announceWarmth size={148} dimmed={tone === 'loss'} />
      {/* **The win headline is Ink, and used to be volt.**
          Two reasons, and they are the same reason twice. Arena allows volt
          once per screen and this screen already spends it on the primary
          action — so the headline and the button were both wrong at once. And
          §07 says outcome is worth zero: painting "She gave you her number" in
          the accent colour is the design system scoring the result, which is
          precisely the substitution RETENTION-AUDIT §2 moves the loud moment
          off. The win still reads as a win — undimmed orb, the volt ground
          wash, the duration as the hero — and the accent is reserved for the
          earned moment and the thing to do next. */}
      <h1 className={`display-xl${nearMiss ? ' amber' : ''}`}>{headline}</h1>
      {/* A beat with no explanation is decoration. The wash says something
          happened; this says what, and it says it in process terms — which is
          the entire reason the moment was moved off the win (§07). Ink-2, so
          the frame's one volt stays the frame's one volt. */}
      {personalBest ? <span className="result-best label">Personal best · <span className="data">{composite}</span></span> : null}

      {session.won ? (
        <>
          <span className="result-time data">{formatDuration(session.durationMs)}</span>
          <Chip tone="band" band={session.finalBand}>{session.track === 'interview' ? interviewBand(session.finalBand) : session.finalBand}</Chip>
          {fasterBy !== null ? <p className="result-record">{fasterBy} {fasterBy === 1 ? 'second' : 'seconds'} faster than your best against her.</p> : null}
          {freshMemory ? <p className="result-memory"><span className="label">She&apos;ll remember</span> {freshMemory}</p> : null}
        </>
      ) : (
        <>
          <div className="result-warmth">
            <span className="label">Warmth</span>
            <strong className="data">{decided}{herBestWarmth === null ? <i>/ {threshold}</i> : null}</strong>
          </div>
          {/* R12. Score against yourself, not against the bar. `41 — your best
              against her is 38` is a number that went up; `41 / 65` is a number
              that lost. Same data, opposite emotion. The threshold is kept and
              demoted rather than removed, because it is still what decided it. */}
          {herBestWarmth !== null
            ? decided > herBestWarmth
              // The motivating half of R12, and the reason the comparison is
              // worth drawing at all: a rep that lost is still allowed to be
              // the best you have managed against her.
              ? <p className="result-record">Your best against her yet — the last one stopped at <span className="data">{herBestWarmth}</span>. She decides at <span className="data">{threshold}</span>.</p>
              : <p className="result-record">Your best against her is <span className="data">{herBestWarmth}</span>. She decides at <span className="data">{threshold}</span>.</p>
            : <span className="label mute">{usingFallback ? 'Where the meter finished' : 'Where the meter was when she decided'}</span>}
          <p>{context}</p>
        </>
      )}

      {/* R17. One sentence of what to change, on the screen where it is needed,
          rather than one click away at the lowest motivation point in the loop. */}
      {!session.won && scorecard ? <MissionNote mission={missionFor(scorecard.focus)} /> : null}

      <div className="result-actions">
        {nearMiss ? <>{runItBack}{seeBreakdown}</> : <>{seeBreakdown}{runItBack}</>}
      </div>

      {/* R8, then R7. What the rep moved, and what it added to. Both below the
          fold of the decision, because neither is the point of this screen —
          they are the reason to open the next one. */}
      <UnlockMeter progress={nextUnlock} />
      <LifetimeCounters stats={lifetime} />

      <ReportButton sessionId={session.id} />
      <FirstWinSheet open={firstWin} onClose={closeFirstWin} />
      <FirstLossSheet open={firstLoss} onClose={closeFirstLoss} />
      <PaywallSheet open={paywall} onClose={() => setPaywall(false)} locked={user?.voiceLocked ?? false} personaId={session.track === 'dating' ? session.personaId : null} />
    </main>
  )
}

/**
 * The earned moment (R3, R13, and the `CLAUDE.md` rule it amends).
 *
 * Arena's rules are all rules about restraint — dark only, one accent, volt
 * once per screen, radius 2px, hairlines never shadows — so the system had
 * exactly one emotional register and a first win rendered in the same language
 * as a lost rep. The amendment is bounded rather than a second accent: an
 * earned moment may take the full frame in volt for under two seconds, and
 * then the screen is sober again.
 *
 * One element, three animations, no palette change and no illustration. It is
 * `aria-hidden` because it says nothing a screen reader needs — the headline
 * and the score say it in words — and under `prefers-reduced-motion` the CSS
 * finishes every one of them on the first frame (§02).
 *
 * The `land` cue is the chord already authored for a number arriving
 * (`lib/audio/kit.ts`), reused rather than added to. **No haptic**:
 * `lib/haptics.ts` caps at three patterns on the stated argument that a product
 * with six has one nobody can tell apart.
 */
function BestBeat() {
  const kitRef = useRef<SoundKit | null>(null)
  useEffect(() => {
    kitRef.current = new SoundKit(soundEnabled())
    kitRef.current.play('land')
    const kit = kitRef.current
    return () => { kit.dispose(); kitRef.current = null }
  }, [])
  return (
    <div className="best-beat" aria-hidden="true">
      <i className="best-beat__wash" />
      <i className="best-beat__sweep" />
    </div>
  )
}

/**
 * R8. The gate, as a bar that moved.
 *
 * `unlockRequirement` returns `Score 70+ in 2 reps at Level 02` before and
 * after the rep that advanced it, which makes the one screen able to show
 * progress show a constant instead. A bar that advanced is the reason somebody
 * runs one more.
 *
 * Ink-2, never volt: Arena allows volt once per screen and on a win the
 * headline already has it. The meter is information, not the accent.
 */
function UnlockMeter({ progress }: { progress: UnlockProgress | null }) {
  if (!progress) return null
  const pct = Math.round((progress.have / progress.need) * 100)
  return (
    <div className="unlock-meter">
      <div className="unlock-meter__head">
        <Mark name={tierMark(progress.level)} size={15} />
        <span className="label">Level {String(progress.level).padStart(2, '0')} — {LEVEL_NAMES[progress.level]}</span>
      </div>
      <span className="unlock-meter__track" role="presentation"><i style={{ width: `${Math.max(3, pct)}%` }} /></span>
      <span className="label mute">{unlockProgressLabel(progress)}</span>
    </div>
  )
}

/**
 * R7. The numbers that cannot go down, on the screen where you lost.
 *
 * The in-app half of the product had no monotonic counter at all — streak
 * resets, and `rejectionsCollected` lives entirely in the field. This is its
 * equivalent, and printing it here rather than only on Train is the whole
 * point: a number that went up because you showed up, on the screen that just
 * told you it did not work, is this product's argument in one line.
 */
function LifetimeCounters({ stats }: { stats: LifetimeStats | null }) {
  const line = stats ? lifetimeLine({ reps: stats.totalReps, totalMs: stats.totalMs }) : null
  if (!line) return null
  return <p className="result-lifetime data">{line}</p>
}

function ScorecardScreen({ session }: { session: SessionSummary }) {
  const { data: scorecard, loading } = useScorecard(session.id)
  // V26. For the two moment cards only, and nothing on this screen waits on
  // it — `MomentTrack` renders nothing until there are two scored turns, so a
  // slow or missing transcript costs the old card rather than a blank one.
  const { data: turns } = useTranscript(session.id)
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
    } catch { return }
    // Both keys, so the first-rejection sheet does not make the same argument
    // again on the next lost rep (R5).
    markScoringExplained()
    const timer = window.setTimeout(() => setExplainer(true), 1100)
    return () => window.clearTimeout(timer)
  }, [loading, scorecard])
  /**
   * Funnel step five (B7). Once the grade is actually on screen — a scorecard
   * that is still a skeleton has not been viewed, and this screen is reached
   * every time somebody revisits an old rep, so the ref keeps one visit to one
   * event.
   */
  /**
   * The staged reveal (§02, M3 Phase D). The composite climbs, then the rows
   * arrive behind it, then the kit's only chord lands. Under a reduced-motion
   * preference every one of those is already finished on the first render —
   * §02 names the score reveal as the example that rule exists for.
   */
  const composite = useCountUp(loading || !scorecard ? null : scorecard.composite)
  const rowCount = scorecard ? scorecard.metrics.length + (scorecard.judgement ? 1 : 0) : 0
  const rowsShown = useStagger(rowCount, composite.done)
  const kitRef = useRef<SoundKit | null>(null)
  const landed = useRef(false)
  useEffect(() => {
    if (!composite.done || landed.current || !scorecard) return
    landed.current = true
    if (!kitRef.current) kitRef.current = new SoundKit(soundEnabled())
    kitRef.current.play('land')
  }, [composite.done, scorecard])
  useEffect(() => () => { kitRef.current?.dispose(); kitRef.current = null }, [])

  const scorecardSeen = useRef(false)
  useEffect(() => {
    if (loading || !scorecard || scorecardSeen.current) return
    scorecardSeen.current = true
    capture('scorecard_viewed', { session_id: session.id, composite: scorecard.composite })
  }, [loading, scorecard, session.id])
  const pending = dismissed ? null : unlock.data
  const closeUnlock = () => {
    setDismissed(true)
    if (unlock.data) void acknowledgeUnlock(unlock.data.kind, unlock.data.ref)
  }
  if (loading) return <AppShell title="Scorecard"><div className="scorecard-grid"><Skeleton height={490} /><Skeleton height={490} /></div></AppShell>
  // Grading runs once, after the rep, on a model call that can fail. A rep
  // with no grade says so; it does not draw an empty card that reads as zero.
  if (!scorecard) return <AppShell title="Scorecard"><EmptyState mark="state-session" title="This rep was not graded" description="Grading runs once after a rep and did not complete for this one. Your rep has been given back — run another and this page will have something to say." action={<div className="empty-actions"><Link className="arena-button arena-button--primary" href={session.track === 'interview' ? `/interview/rep/${session.personaId}/brief` : `/rep/${session.personaId}/brief`}>Run it back</Link><Link className="arena-button arena-button--ghost" href={`/session/${session.id}/transcript`}>Read the transcript</Link></div>} /></AppShell>
  /**
   * R16. The word, and it climbs with the number rather than sitting finished
   * above it — `Sloppy → Solid → Sharp` resolving in nine hundred milliseconds
   * is the reveal doing its job on the thing people actually read. Derived from
   * the counting value, which ends exactly on `scorecard.composite`, so the
   * verdict on screen and the verdict in the data are the same word.
   */
  const verdict = verdictFor(composite.value)
  const audit = scorecard.metrics.reduce((sum, metric) => sum + metric.points, 0) + (scorecard.judgement?.points ?? 0)
  const parts = [...scorecard.metrics.map((metric) => String(metric.points)), ...(scorecard.judgement ? [String(scorecard.judgement.points)] : [])]
  /**
   * THE SCORECARD IS NOT BEHIND A PLAN, AND USED TO LOOK LIKE IT WAS.
   *
   * Four of the six metric rows, the judgement row, both moments and the
   * transcript link were drawn under a `LockOverlay` for a free account. Three
   * things were wrong with that.
   *
   * It contradicted the record both pricing surfaces read: `lib/site/plans.ts`
   * says a plan changes voice volume and nothing else, and `/pricing` lists
   * "the full scorecard — six dimensions, evidence, transcript" under what a
   * plan never changes. §14 has a merchant-of-record reviewer reading that page.
   *
   * It was never enforced. `/session/[id]/transcript` has no plan check on it —
   * only the link was hidden — so the lock was a claim rather than a gate, which
   * is the same defect `LAUNCH-GAP.md` D12 resolved for the persona gate. The
   * answer there was to make the copy true rather than to build the gate.
   *
   * And since 31 August it lands on exactly the wrong screen. A free account
   * gets one voice rep, ever, during sign-up — so this is the only scorecard
   * they will ever see, and it is the product's whole first impression. Showing
   * it half-obscured is an argument against buying, not for it.
   *
   * The paywall a free account meets is the microphone (`lib/site/plans.ts`),
   * and it is enough.
   */
  const outcomeLabel = session.track === 'interview' ? (session.won ? 'callback earned' : 'no callback') : (session.won ? 'number given' : 'left')
  const signalLabel = session.track === 'interview' ? 'Impression' : 'Warmth'
  const personaLevel = personas.find((item) => item.id === session.personaId)?.level ?? null
  const levelLabel = session.track === 'interview' ? 'Interview' : personaLevel ? `${String(personaLevel).padStart(2, '0')} — ${LEVEL_NAMES[personaLevel]}` : '—'
  return <AppShell title="Scorecard"><header className="scorecard-title"><span className="label">Process score · {session.personaName}</span><h1 className="display-lg">Session breakdown</h1></header><div className="scorecard-grid"><div className="scorecard-left"><Card className="composite-card"><div>{/* R16. The word is the hero and the number is the footnote, which is
      the way round they were built. `Sloppy / Solid / Sharp / Clean` is the
      most human thing on this screen and it rendered at `display-md` beneath a
      five-rem numeral: a number is a measurement, a word is a verdict, and
      people come back for verdicts. The composite still climbs — it is the
      same `useCountUp` and the same `land` chord — it just does it beside the
      verdict rather than over the top of it. */}
<strong className="verdict display-xl" data-revealing={!composite.done}>{verdict}</strong><span className="composite composite--footnote data">{composite.value}<small>/100</small></span></div><p className="composite-card__context">{personaLevel ? <Mark name={tierMark(personaLevel)} size={15} /> : null}<span>{session.personaName} · Level {levelLabel} · {formatDuration(session.durationMs)} · {outcomeLabel}</span></p></Card>{scorecard.judgement?.wentWell ? <WhatWorked line={scorecard.judgement.wentWell} /> : null}<section className="metrics-section"><div className="section-title"><h2 className="display-md">Metrics</h2><span className={`audit-total data${audit !== scorecard.composite ? ' danger' : ''}`}>{parts.join(' + ')} = {audit}</span></div><div className="metric-list">{scorecard.metrics.map((metric, index) => <div key={metric.key} data-reveal={index < rowsShown ? 'shown' : 'pending'}><MetricBandRow metric={metric} /></div>)}{scorecard.judgement ? <div data-reveal={scorecard.metrics.length < rowsShown ? 'shown' : 'pending'}><JudgementRow judgement={scorecard.judgement} /></div> : null}</div></section></div><aside className="scorecard-right"><MomentSection title="The moment it worked" moment={scorecard.bestMoment} signalLabel={signalLabel} turns={turns} tone="up" /><MomentSection title="The moment it didn't" moment={scorecard.worstMoment} signalLabel={signalLabel} turns={turns} tone="down" /><section><h2 className="display-md">Try this next time</h2><Card className="try-next"><Crosshair size={20} strokeWidth={1.5} className="volt" /><p>{scorecard.tryNext}</p></Card>{/* The mission this rep sets, and the same words Train, the brief
      and the live screen will show until the weakest dimension moves.
      It is the connective tissue the audit said was missing. */}
<MissionCard mission={missionFor(scorecard.focus)} kicker="Next rep" /><FocusLinks focus={scorecard.focus} /></section></aside></div><div className="scorecard-actions">{/* THE UPGRADE MOMENT, and the best-placed one in the product. Somebody
    who has just finished the sign-up rep and wants to go again is the whole
    funnel in one click, so Run it back opens the sheet rather than walking
    them to a brief that will refuse them. Everything else on this screen —
    every metric, both moments, the transcript — is theirs either way. */}
{user?.voiceLocked && session.track === 'dating'
  ? <Button onClick={() => setPaywall(true)}>Run it back</Button>
  : <Link className="arena-button arena-button--primary" href={session.track === 'interview' ? `/interview/rep/${session.personaId}/brief` : `/rep/${session.personaId}/brief`}>Run it back</Link>}<Link className="arena-button arena-button--secondary" href={`/session/${session.id}/transcript`}>Read the transcript</Link><Link className="arena-button arena-button--ghost" href="/roster">Next persona</Link>{session.won && session.track === 'dating' ? <ShareButton kind="rep_win" sessionId={session.id} label="Make a card" /> : null}</div><ReportButton sessionId={session.id} /><PaywallSheet open={paywall} onClose={() => setPaywall(false)} locked={user?.voiceLocked ?? false} personaId={session.track === 'dating' ? session.personaId : null} /><LevelUnlockedSheet open={pending !== null} onClose={closeUnlock} unlock={pending} /><ScorecardExplainerSheet open={explainer} onClose={() => setExplainer(false)} /></AppShell>
}

/**
 * `Sloppy / Solid / Sharp / Clean`, from a composite.
 *
 * The most human word on the scorecard, and the one R16 promoted to the hero
 * slot. A function rather than an inline ladder because the reveal now reads it
 * once per frame while the number climbs.
 */
function verdictFor(composite: number): string {
  if (composite < 50) return 'Sloppy'
  if (composite < 70) return 'Solid'
  if (composite < 85) return 'Sharp'
  return 'Clean'
}

/**
 * The 40% that is judgement rather than measurement (§07).
 *
 * It sits in the same list as the metrics and carries points the same way, so
 * the audit line adds up to the composite — but it prints its six sub-scores
 * instead of a target band, because there is no band to have missed.
 */
function JudgementRow({ judgement }: { judgement: JudgementBand }) {
  return <div className="metric-row"><div className="metric-row__head"><span>{judgement.label}</span><span className="data">{judgement.subScores.length ? `${Math.round(judgement.subScores.reduce((sum, entry) => sum + entry.value, 0) / judgement.subScores.length)}/100` : '—'}</span><strong className="data">{judgement.points}/{judgement.maxPoints}</strong></div><div className="judgement-rows">{judgement.subScores.map((entry) => <JudgementSubRow key={entry.key} entry={entry} />)}</div></div>
}

/**
 * One judged dimension (V25).
 *
 * The six measured metrics above this got a bar with a target band on it; the
 * six judged ones — the half users actually argue with — got `<Chip>Opening
 * 84</Chip>`, so the more contestable number was the less legible one. Same
 * bar, same reading direction, plus the dimension's own mark, which is the
 * same mark this sub-score carries on Progress, in the library and on the
 * mission it will set.
 *
 * No target band, because there is none to have missed — that is the whole
 * difference between the judged half and the measured half.
 */
function JudgementSubRow({ entry }: { entry: { key: string; label: string; value: number } }) {
  const mark = dimensionMark(entry.key)
  return (
    <div className="judgement-row">
      {mark ? <Mark name={mark} size={15} /> : null}
      <span className="label">{entry.label}</span>
      <span className="judgement-row__bar" role="presentation"><i style={{ width: `${Math.max(2, Math.min(100, entry.value))}%` }} /></span>
      <strong className="data">{entry.value}</strong>
    </div>
  )
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

/**
 * A moment, placed in the rep it happened in (V26).
 *
 * The two moments are the strongest content on this screen and they were drawn
 * as a blockquote with a number under it — no indication of WHEN in the three
 * minutes it happened, which for "the moment it worked" is half the
 * information. The line is the same warmth trajectory the transcript screen
 * plots, at card size, with this moment's turn as the only marked point.
 *
 * Degrades to exactly the old card when there is no trajectory to draw: a rep
 * still loading its transcript, or one with a single scored turn. A chart of
 * one point is not a chart, and this screen must never wait on it.
 */
function MomentTrack({ turns, moment, tone }: { turns: TranscriptTurn[]; moment: Moment; tone: 'up' | 'down' }) {
  const scored = turns.filter((turn) => turn.warmthAfter !== null)
  if (scored.length < 2) return null
  const width = 260
  const height = 40
  const x = (index: number) => (index / (scored.length - 1)) * (width - 8) + 4
  const y = (value: number) => height - 4 - (Math.max(0, Math.min(100, value)) / 100) * (height - 8)
  const points = scored.map((turn, index) => `${x(index)},${y(turn.warmthAfter ?? 0)}`).join(' ')
  // Matched on the turn the grader named. A moment whose turn is not in the
  // scored set is drawn as a line with nothing marked rather than as a dot in
  // the wrong place.
  const at = scored.findIndex((turn) => turn.index === moment.turnIndex)
  return (
    <div className={`moment-track moment-track--${tone}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} />
        {at >= 0 ? <circle cx={x(at)} cy={y(scored[at]?.warmthAfter ?? 0)} r="3.4" /> : null}
      </svg>
    </div>
  )
}

function MomentSection({ title, moment, signalLabel, turns, tone }: { title: string; moment: Moment | null; signalLabel: string; turns: TranscriptTurn[]; tone: 'up' | 'down' }) {
  if (!moment) return null
  return <section className="moment-section"><h2 className="display-md">{title}</h2><Card className="moment-card"><blockquote>“{moment.quote}”</blockquote><MomentTrack turns={turns} moment={moment} tone={tone} /><div><span className={`data ${moment.delta > 0 ? 'volt' : 'amber'}`}>{moment.delta > 0 ? '+' : ''}{moment.delta}</span><span className="label">{signalLabel} {moment.warmthAfter}</span></div><p>{moment.note}</p></Card></section>
}

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
  return <AppShell title="Transcript"><div className="screen-heading compact"><span className="label">Turn by turn</span><h1 className="display-lg">Transcript</h1><p>{session.personaName} · {formatDuration(session.durationMs)}{silent ? ' · nothing was said' : ` · ${signalLabel} ${session.finalWarmth}`}</p></div>{silent ? <EmptyState mark="state-transcript" title="This rep has no transcript" description="No speech was recorded on either side, so there is nothing to read back. Your rep was not counted — run it again." action={<Link className="arena-button arena-button--primary" href={repHref}>Run it back</Link>} /> : <><Card className="sparkline-card"><WarmthSparkline turns={turns} label={signalLabel} onPoint={scrollToTurn} /></Card><Tabs items={['ALL', 'BIG MOVES'] as const} value={filter} onChange={setFilter} label="Transcript filter" />{loading ? <div className="transcript-list">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} height={96} />)}</div> : filtered.length ? <div className="transcript-list">{filtered.map((turn) => <div key={turn.index} ref={(node) => { refs.current[turn.index] = node }}><TranscriptTurnRow turn={turn} persona={session.personaName} /></div>)}</div> : <EmptyState mark="state-filter" title="No turns match" description="Every turn is in the full transcript — switch back to ALL." action={<Button variant="secondary" onClick={() => setFilter('ALL')}>Show all turns</Button>} />}<div className="transcript-sticky"><Link className="arena-button arena-button--primary arena-button--full" href={repHref}><RotateCcw size={17} strokeWidth={1.5} /> Run it back</Link></div></>}<ReportButton sessionId={session.id} /></AppShell>
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
/**
 * The one-time beats this file fires, by key (§12).
 *
 * `localStorage` rather than `ui_flags`, like the sheets they belong to: these
 * record what has been *displayed*, so the worst a user can do by clearing one
 * is see an explainer twice. Anything earned goes to `unlocks` (§08, §14).
 */
const FIRST_WIN_SEEN = 'nerve:first-win-seen'
const FIRST_LOSS_SEEN = 'nerve:first-loss-seen'
const SCORECARD_SEEN = 'nerve.scorecard.explained'

/**
 * R5. Two sheets, one explanation, stamped together.
 *
 * The first-rejection sheet and the scorecard explainer make the same argument
 * — outcome is worth zero, a clean rep that ends in rejection can score 92 —
 * and §12 only ever wanted it made once. Whichever fires first closes both, so
 * nobody is told the product's central rule twice in ninety seconds.
 */
function markScoringExplained(): void {
  try {
    window.localStorage.setItem(FIRST_LOSS_SEEN, '1')
    window.localStorage.setItem(SCORECARD_SEEN, '1')
  } catch {
    // Private mode. Costs one repeat of an explainer and nothing else.
  }
}
