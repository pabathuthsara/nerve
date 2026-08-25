'use client'

import Link from 'next/link'
import { Check, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { useBaseline, useFieldToday, usePersonaProgress, usePersonas, useSessionHistory, useUserState, useWeeklyReview } from '@/lib/data'
import type { PersonaProgress, SessionSummary } from '@/lib/data/types'
import { chooseTodayPersona, LEVEL_NAMES, levelTone } from '@/lib/data/progression'
import { RANKS, RANK_BLURBS, RANK_NAMES, nextRankRequirement, rankIndex, type Rank } from '@/lib/data/rank'
import { FieldActions, FieldSheets, useFieldFlow } from '@/components/field/flow'
import { MilestoneSheet } from '@/components/field/milestone-sheet'
import { REJECTION_MILESTONES, type Milestone } from '@/lib/field/milestones'
import { AppShell, RepsRemaining, StreakCounter } from '@/components/app-shell'
import { Button, Card, Chip, Sheet, Skeleton, Stat } from '@/components/ui'
import { ShareButton } from '@/components/share/share-button'
import { FluidPersona } from '@/components/fluid-persona'

export function TrainScreen() {
  return <AppShell title="Train"><TrainContent /></AppShell>
}

function TrainContent() {
  const userState = useUserState()
  const { data: user, loading: userLoading } = userState
  const { data: sessions, loading: sessionsLoading } = useSessionHistory()
  const { data: personas, loading: personaLoading } = usePersonas()
  const { data: progressRaw, loading: progressLoading } = usePersonaProgress()
  const field = useFieldToday()
  const { data: assignment, loading: challengeLoading } = field
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  // An ask made moves the streak as well as the card (§09) — and can cross a
  // rejection milestone, which has to land here too rather than waiting for
  // the user to happen to open `/field`.
  const flow = useFieldFlow(assignment, {
    onChanged: () => { field.reload(); userState.reload() },
    onMilestone: (at) => setMilestone(REJECTION_MILESTONES.find((entry) => entry.at === at) ?? null),
  })
  const [paywallOpen, setPaywallOpen] = useState(false)
  const loading = userLoading || personaLoading || progressLoading
  // Chosen for you, not picked off a list: the decision before the rep is the
  // part people use to avoid the rep.
  const progress: PersonaProgress[] = Array.isArray(progressRaw) ? progressRaw : []
  // The onboarding answer, finally spending. It is the last tie-break inside
  // `chooseTodayPersona`, so it decides the first rep and then gets out of the
  // way of the rotation.
  const persona = chooseTodayPersona(personas, progress, user?.currentLevel ?? 1, user?.focusArea)
  const personaProgress = persona ? progress.find((item) => item.personaId === persona.id) : undefined
  const last = sessions[0]
  const challenge = assignment?.challenge
  const remaining = user?.repsRemainingToday ?? 0
  const repHref = persona ? `/rep/${persona.id}/brief` : '/roster'

  return (
    <>
      <div className="train-grid">
        <section>
          <div className="train-meta-row">
            {userLoading || !user ? <><Skeleton width={108} height={32} /><Skeleton width={108} height={20} /></> : <><RepsRemaining count={user.repsRemainingToday} resetAt={user.repsResetAt} /><StreakCounter days={user.streakDays} /></>}
          </div>
          {loading || !persona ? <Skeleton height={430} /> : (
            <article className="today-card">
              <div className="today-card__visual" />
              <FluidPersona name={persona.name} personaId={persona.id} warmth={personaProgress && personaProgress.attempts > 0 ? personaProgress.bestWarmth : 18} fill className="today-card__persona" />
              <div className="today-card__grain" />
              <div className="today-card__content">
                <div><Chip tone="band" band={levelTone(persona.level)}>Level {String(persona.level).padStart(2, '0')} — {LEVEL_NAMES[persona.level]}</Chip></div>
                <h1 className="display-xl">{persona.name}</h1>
                <span className="label">{persona.setting}</span>
                <p className="today-card__hook">{persona.hook}</p>
                {/* The activation cliff, closed (F-14). The primary action on
                    this screen used to read OUT OF REPS in amber — a dead
                    control the whole layout pointed at, on the screen a new
                    user lands on ten minutes after signing up. Text mode costs
                    no quota and is the same character, so when the day's voice
                    reps are gone the screen reorganises around what is still
                    open instead of around waiting. */}
                <div className="today-card__action">
                  {remaining > 0
                    ? <Link href={repHref} className="arena-button arena-button--primary arena-button--lg arena-button--full">Start rep</Link>
                    : <Link href={`/text/${persona.id}`} className="arena-button arena-button--primary arena-button--lg arena-button--full">Talk to {persona.name} in text</Link>}
                  {remaining > 0
                    ? <Link href="/roster" className="arena-button arena-button--ghost arena-button--sm arena-button--full"><RotateCcw size={16} strokeWidth={1.5} /> Someone else</Link>
                    : <Button variant="ghost" size="sm" fullWidth onClick={() => setPaywallOpen(true)}>Voice reps are done for today</Button>}
                </div>
              </div>
            </article>
          )}
        </section>
        <aside className="side-stack">
          {userLoading || !user ? <Skeleton height={86} /> : <RankRail rank={user.rank} />}
          <div className="side-stats">
            {/* Day one is three reps on any plan (`lib/data/allowance.ts`), and
                a counter that silently reads 3 / 3 today and 1 / 1 tomorrow
                looks like a bug. Saying so is the whole point of the grant. */}
            <div>{userLoading || !user ? <Skeleton height={50} /> : <Stat label="Reps remaining" value={`${user.repsRemainingToday} / ${user.repsPerDay}`} size="lg" detail={user.dayOne ? 'Day one — three on us' : undefined} />}</div>
            <div>{userLoading || !user ? <Skeleton height={50} /> : <Stat label="Current streak" value={`${user.streakDays} days`} size="lg" />}</div>
          </div>
          <Card className="field-card">
            {challengeLoading || !challenge ? <><Skeleton width={82} height={24} /><Skeleton height={28} /><Skeleton height={42} /><Skeleton height={36} /></> : flow.status === 'done' || flow.status === 'skipped' ? <div className="field-card__head"><span>{flow.status === 'done' ? <Check size={18} strokeWidth={1.5} className="volt" /> : <X size={18} strokeWidth={1.5} className="muted" />} <span className="label">{flow.status === 'done' ? 'Field rep logged' : 'Logged honestly'}</span></span><Link className="label volt-link" href="/field">The log</Link></div> : <>
              <div className="field-card__head"><span className="label">Today in the field</span><Chip>Tier {challenge.tier}</Chip></div>
              <div><h2 className="display-md">{challenge.title}</h2><p className="field-card__copy">{challenge.brief}</p></div>
              <FieldActions flow={flow} size="sm" />
            </>}
          </Card>
          <WeeklyReviewCard />
          <BaselineCard />
          <Card className="last-result">
            <span className="label">Last rep</span>
            {sessionsLoading ? <Skeleton height={62} /> : last ? <SessionRow session={last} /> : <p className="muted">Your last rep will land here.</p>}
          </Card>
          <p className="label mute" style={{ margin: '0 2px' }}>One rep. One field move. Then leave it alone.</p>
        </aside>
      </div>
      <FieldSheets flow={flow} title={challenge?.title ?? ''} />
      <MilestoneSheet milestone={milestone} onClose={() => setMilestone(null)} />
      <Sheet open={paywallOpen} onClose={() => setPaywallOpen(false)} title="Today&apos;s voice reps are done">
        <div style={{ display: 'grid', gap: 20 }}><p className="muted" style={{ margin: 0 }}>Your voice reps reset tonight. Text mode and the field stay open, and neither of them uses a rep.</p><div className="plan-mini"><Stat label="Pro" value="3 / day" /><Stat label="Elite" value="6 / day" /></div>{persona ? <Link href={`/text/${persona.id}`} className="arena-button arena-button--secondary arena-button--full">Keep talking in text</Link> : null}<Link href="/profile/subscription" className="arena-button arena-button--primary arena-button--full">See plans</Link><Button variant="ghost" fullWidth onClick={() => setPaywallOpen(false)}>Maybe later</Button></div>
      </Sheet>
    </>
  )
}

/**
 * The Sunday letter (§09, §11).
 *
 * The fourth reason to come back. It appears when one has been written and
 * says nothing at all otherwise — a card that explains it will have something
 * to say on Sunday is a card taking up room for six days.
 */
function WeeklyReviewCard() {
  const { data: review, loading } = useWeeklyReview()
  if (loading || !review) return null
  return <Card className="weekly-card"><div className="field-card__head"><span className="label">Your week</span><Chip>{formatWeek(review.weekStart)}</Chip></div><p className="weekly-card__copy">{review.copy}</p><div className="weekly-card__figures"><Stat label="Reps" value={review.stats.reps} /><Stat label="Asks" value={review.stats.asksMade} /><Stat label="Refusals" value={review.stats.rejections} /></div><ShareButton kind="weekly" label="Make a card" /></Card>
}

function formatWeek(weekStart: string): string {
  const [year = 0, month = 1, day = 1] = weekStart.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * The week-four offer (§08).
 *
 * Silent until day 28, and silent again once the re-test has been taken — at
 * which point it becomes the way back to the comparison, which is the actual
 * reward. A card that nags about a measurement is a card people learn to skip.
 */
function BaselineCard() {
  const { data: state, loading } = useBaseline()
  if (loading || !state) return null
  if (!state.due && !state.retestSessionId) return null
  const done = state.retestSessionId !== null
  return <Card className="baseline-offer"><div className="field-card__head"><span className="label">{done ? 'Week four' : 'Four weeks in'}</span><Chip tone="volt">{state.baseline.score} → ?</Chip></div><div><h2 className="display-md">{done ? 'Then and now' : 'Re-take the measurement'}</h2><p className="field-card__copy">{done ? `Your first rep scored ${state.baseline.score}. See what four weeks did to it.` : `${state.personaName}, same level, same three minutes. The only thing that has changed is you.`}</p></div><div className="field-card__actions">{done ? <Link className="arena-button arena-button--secondary arena-button--sm" href="/progress/baseline">See both</Link> : <Link className="arena-button arena-button--primary arena-button--sm" href={`/rep/${state.baseline.personaId}/brief`}>Take it</Link>}</div></Card>
}

export function SessionRow({ session }: { session: SessionSummary }) {
  const minutes = Math.floor(session.durationMs / 60000)
  const seconds = Math.floor((session.durationMs % 60000) / 1000)
  // A composite of null is a rep that has not been graded yet — a dash, never
  // a zero somebody could read as a verdict.
  return <Link className="session-row" href={`/session/${session.id}/scorecard`}><span className="session-row__main"><span className={`session-row__outcome${session.won ? ' session-row__outcome--won' : ''}`}>{session.won ? <Check size={15} strokeWidth={1.5} /> : <X size={15} strokeWidth={1.5} />}</span><span><strong style={{ display: 'block', fontWeight: 500 }}>{session.personaName}</strong><span className="label">{session.personaSettingShort} · {minutes}:{String(seconds).padStart(2, '0')}</span></span></span><span className="session-row__score">{session.compositeScore ?? '—'}</span></Link>
}

/**
 * The §08 rank rail. "Shown as a rail on the home screen rather than as a
 * badge shelf."
 *
 * The distinction in that sentence is the whole brief: a badge says you have
 * one, a rail says where you are and what is above you. So every rank is drawn
 * — including the ones not yet reached — and the next one names its price in
 * the same words the roster uses, because a rail with no next step is a badge
 * with extra steps.
 *
 * Rank is the slow number. The level moves when you unlock a character; this
 * moves when you have proven you can hold one, and it is deliberately harder
 * to move than the thing next to it.
 */
function RankRail({ rank }: { rank: Rank }) {
  const here = rankIndex(rank)
  const next = nextRankRequirement(rank)
  return (
    <Card className="rank-rail">
      <div className="rank-rail__head">
        <span className="label">Rank</span>
        <strong className="display-md volt">{RANK_NAMES[rank]}</strong>
      </div>
      <ol className="rank-rail__track" aria-label={`Rank ${RANK_NAMES[rank]}, ${here + 1} of ${RANKS.length}`}>
        {RANKS.map((entry, index) => (
          <li
            key={entry}
            className={index === here ? 'is-here' : index < here ? 'is-done' : undefined}
            aria-current={index === here ? 'step' : undefined}
          >
            <i />
            <span className="label">{RANK_NAMES[entry]}</span>
          </li>
        ))}
      </ol>
      <p>{RANK_BLURBS[rank]}</p>
      {next ? <span className="label mute">Next · {next}</span> : null}
    </Card>
  )
}
