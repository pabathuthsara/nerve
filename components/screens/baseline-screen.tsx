'use client'

/**
 * Then against now — the week-four comparison (§08).
 *
 * The retention hook the spec plants on day one and cashes on day 28. It is
 * the only screen in the product that shows two scorecards at once, and the
 * only place a number is allowed to make an argument, because both numbers are
 * the user's own.
 *
 * It does not flinch when the second number is lower. A measurement with copy
 * for only one direction is a measurement nobody should believe, and §16 does
 * not let us paper over it with a claim about what training does.
 */

import Link from 'next/link'
import { useBaseline, useScorecard, useSessionHistory } from '@/lib/data'
import { baselineVerdict, compareToBaseline, RETEST_AFTER_DAYS } from '@/lib/data/baseline'
import { AppShell } from '@/components/app-shell'
import { Card, EmptyState, Skeleton } from '@/components/ui'
import { ShareButton } from '@/components/share/share-button'
import { dayCount } from '@/lib/data/rank'

export function BaselineScreen() {
  const { data: state, loading } = useBaseline()
  const { data: sessions } = useSessionHistory()
  const before = useScorecard(state?.baseline.sessionId ?? '')
  const after = useScorecard(state?.retestSessionId ?? '')

  if (loading) {
    return <AppShell title="Then and now"><div className="screen-heading compact"><Skeleton width={220} height={34} /></div><Skeleton height={320} /></AppShell>
  }

  if (!state) {
    return <AppShell title="Then and now"><EmptyState mark="state-chart" title="No baseline yet" description="Your first graded rep becomes the measurement everything after it is compared against. Run one." action={<Link className="arena-button arena-button--primary" href="/train">Start a rep</Link>} /></AppShell>
  }

  const retestHref = `/rep/${state.baseline.personaId}/brief`

  // Earned but not taken. The offer, not the comparison.
  if (!state.retestSessionId) {
    const remaining = Math.max(0, RETEST_AFTER_DAYS - state.daysSince)
    return <AppShell title="Then and now"><div className="screen-heading compact"><span className="label">Week four</span><h1 className="display-lg">Then and now</h1></div><Card className="baseline-card"><span className="label">Your baseline</span><div className="baseline-then"><span className="composite data">{state.baseline.score}</span><p>{state.personaName}, day one. Framed as a measurement rather than a test, because that is what it was.</p></div>{state.due ? <><p className="baseline-note">Four weeks of reps later. Same character, same level, same three minutes — the only thing that has changed is you.</p><Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={retestHref}>Take the re-test</Link></> : <p className="baseline-note">The re-test opens {remaining === 1 ? 'tomorrow' : `in ${remaining} days`}. It is the same character and the same three minutes, so the comparison means something.</p>}</Card></AppShell>
  }

  if (before.loading || after.loading) {
    return <AppShell title="Then and now"><div className="screen-heading compact"><span className="label">Week four</span><h1 className="display-lg">Then and now</h1></div><Skeleton height={420} /></AppShell>
  }

  const thenCard = before.data
  const nowCard = after.data
  if (!thenCard || !nowCard) {
    return <AppShell title="Then and now"><EmptyState mark="state-chart" title="One of the two is missing" description="A comparison needs both scorecards. One of these reps was never graded, or has since been deleted." action={<Link className="arena-button arena-button--primary" href="/profile/history">See your history</Link>} /></AppShell>
  }

  const retestSession = sessions.find((session) => session.id === state.retestSessionId)
  const daysApart = retestSession
    ? Math.max(1, Math.round(
      (Date.parse(retestSession.startedAt) - Date.parse(state.baseline.takenAt)) / 86_400_000))
    : RETEST_AFTER_DAYS

  const comparison = compareToBaseline({
    thenScore: thenCard.composite,
    nowScore: nowCard.composite,
    thenSubScores: thenCard.judgement?.subScores ?? [],
    nowSubScores: nowCard.judgement?.subScores ?? [],
    daysApart,
  })

  const up = comparison.delta > 0
  const flat = comparison.delta === 0

  return <AppShell title="Then and now"><div className="screen-heading compact"><span className="label">{state.personaName} · {dayCount(daysApart)} apart</span><h1 className="display-lg">Then and now</h1></div><Card className="baseline-card"><div className="baseline-pair"><div><span className="label">Day one</span><span className="composite data baseline-pair__then">{comparison.thenScore}</span></div><span className={`baseline-delta data${up ? ' volt' : flat ? '' : ' amber'}`}>{up ? '+' : ''}{comparison.delta}</span><div><span className="label">Now</span><span className="composite data">{comparison.nowScore}</span></div></div><p className="baseline-note"><span className="baseline-span" aria-hidden="true"><i /><b className="data">{dayCount(daysApart)}</b><i /></span>{baselineVerdict(comparison)}</p></Card>{comparison.subScores.length ? <Card className="baseline-rows"><span className="label">Sub-score by sub-score</span>{comparison.subScores.map((row) => <BaselineRow key={row.key} row={row} />)}</Card> : null}<div className="scorecard-actions"><Link className="arena-button arena-button--secondary" href={`/session/${state.baseline.sessionId}/scorecard`}>The first one</Link><Link className="arena-button arena-button--secondary" href={`/session/${state.retestSessionId}/scorecard`}>The re-test</Link><ShareButton kind="baseline" label="Make a card" /></div></AppShell>
}

/**
 * One sub-score, both readings.
 *
 * The bar is the later value and the tick is the earlier one, so a drop reads
 * as a bar that has fallen short of a mark it used to clear rather than as an
 * absence. Amber, never red: a sub-score going down after four weeks is
 * information, not a failure.
 */
function BaselineRow({ row }: { row: { key: string; label: string; then: number; now: number } }) {
  const delta = row.now - row.then
  const tone = delta > 0 ? 'volt' : delta === 0 ? 'flat' : 'amber'
  return <div className="baseline-row"><span className="label">{row.label}</span><div className="baseline-row__track"><i className={`baseline-row__bar baseline-row__bar--${tone}`} style={{ width: `${Math.max(0, Math.min(100, row.now))}%` }} /><i className="baseline-row__mark" style={{ left: `${Math.max(0, Math.min(100, row.then))}%` }} /></div><span className={`baseline-row__delta data${delta > 0 ? ' volt' : delta < 0 ? ' amber' : ''}`}>{row.then} → {row.now}</span></div>
}
