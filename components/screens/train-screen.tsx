'use client'

import Link from 'next/link'
import { Check, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { useFieldToday, usePersonaProgress, usePersonas, useSessionHistory, useUserState } from '@/lib/data'
import type { PersonaProgress, SessionSummary } from '@/lib/data/types'
import { chooseTodayPersona, LEVEL_NAMES, levelTone } from '@/lib/data/progression'
import { FieldActions, FieldSheets, useFieldFlow } from '@/components/field/flow'
import { AppShell, RepsRemaining, StreakCounter } from '@/components/app-shell'
import { Button, Card, Chip, Sheet, Skeleton, Stat } from '@/components/ui'

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
  // An ask made moves the streak as well as the card (§09).
  const flow = useFieldFlow(assignment, () => { field.reload(); userState.reload() })
  const [paywallOpen, setPaywallOpen] = useState(false)
  const loading = userLoading || personaLoading || progressLoading
  // Chosen for you, not picked off a list: the decision before the rep is the
  // part people use to avoid the rep.
  const progress: PersonaProgress[] = Array.isArray(progressRaw) ? progressRaw : []
  const persona = chooseTodayPersona(personas, progress, user?.currentLevel ?? 1)
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
              <div className="today-card__grain" />
              <div className="today-card__portrait-mark" aria-hidden="true">{persona.name.charAt(0)}</div>
              <div className="today-card__content">
                <div><Chip tone="band" band={levelTone(persona.level)}>Level {String(persona.level).padStart(2, '0')} — {LEVEL_NAMES[persona.level]}</Chip></div>
                <h1 className="display-xl">{persona.name}</h1>
                <span className="label">{persona.setting}</span>
                <p className="today-card__hook">{persona.hook}</p>
                <div className="today-card__action">
                  {remaining > 0 ? <Link href={repHref} className="arena-button arena-button--primary arena-button--lg arena-button--full">Start rep</Link> : <Button variant="secondary" size="lg" fullWidth onClick={() => setPaywallOpen(true)}><span className="amber">Out of reps</span></Button>}
                  <Link href="/roster" className="arena-button arena-button--ghost arena-button--sm arena-button--full"><RotateCcw size={16} strokeWidth={1.5} /> Someone else</Link>
                </div>
              </div>
            </article>
          )}
        </section>
        <aside className="side-stack">
          <div className="side-stats">
            <div>{userLoading || !user ? <Skeleton height={50} /> : <Stat label="Reps remaining" value={`${user.repsRemainingToday} / ${user.repsPerDay}`} size="lg" />}</div>
            <div>{userLoading || !user ? <Skeleton height={50} /> : <Stat label="Current streak" value={`${user.streakDays} days`} size="lg" />}</div>
          </div>
          <Card className="field-card">
            {challengeLoading || !challenge ? <><Skeleton width={82} height={24} /><Skeleton height={28} /><Skeleton height={42} /><Skeleton height={36} /></> : flow.status === 'done' || flow.status === 'skipped' ? <div className="field-card__head"><span>{flow.status === 'done' ? <Check size={18} strokeWidth={1.5} className="volt" /> : <X size={18} strokeWidth={1.5} className="muted" />} <span className="label">{flow.status === 'done' ? 'Field rep logged' : 'Logged honestly'}</span></span><Link className="label volt-link" href="/field">The log</Link></div> : <>
              <div className="field-card__head"><span className="label">Today in the field</span><Chip>Tier {challenge.tier}</Chip></div>
              <div><h2 className="display-md">{challenge.title}</h2><p className="field-card__copy">{challenge.brief}</p></div>
              <FieldActions flow={flow} size="sm" />
            </>}
          </Card>
          <Card className="last-result">
            <span className="label">Last rep</span>
            {sessionsLoading ? <Skeleton height={62} /> : last ? <SessionRow session={last} /> : <p className="muted">Your last rep will land here.</p>}
          </Card>
          <p className="label mute" style={{ margin: '0 2px' }}>One rep. One field move. Then leave it alone.</p>
        </aside>
      </div>
      <FieldSheets flow={flow} title={challenge?.title ?? ''} />
      <Sheet open={paywallOpen} onClose={() => setPaywallOpen(false)} title="Today&apos;s reps are done">
        <div style={{ display: 'grid', gap: 20 }}><p className="muted" style={{ margin: 0 }}>Your voice reps reset tonight. Field work stays open.</p><div className="plan-mini"><Stat label="Pro" value="3 / day" /><Stat label="Elite" value="6 / day" /></div><Link href="/profile/subscription" className="arena-button arena-button--primary arena-button--full">See plans</Link><Button variant="ghost" fullWidth onClick={() => setPaywallOpen(false)}>Maybe later</Button></div>
      </Sheet>
    </>
  )
}

export function SessionRow({ session }: { session: SessionSummary }) {
  const minutes = Math.floor(session.durationMs / 60000)
  const seconds = Math.floor((session.durationMs % 60000) / 1000)
  // A composite of null is a rep that has not been graded yet — a dash, never
  // a zero somebody could read as a verdict.
  return <Link className="session-row" href={`/session/${session.id}/scorecard`}><span className="session-row__main"><span className={`session-row__outcome${session.won ? ' session-row__outcome--won' : ''}`}>{session.won ? <Check size={15} strokeWidth={1.5} /> : <X size={15} strokeWidth={1.5} />}</span><span><strong style={{ display: 'block', fontWeight: 500 }}>{session.personaName}</strong><span className="label">{session.personaSettingShort} · {minutes}:{String(seconds).padStart(2, '0')}</span></span></span><span className="session-row__score">{session.compositeScore ?? '—'}</span></Link>
}
