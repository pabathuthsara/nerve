'use client'

/**
 * Progress (§10 E, §11 `/progress`).
 *
 * Everything numeric except the field's own chart, which lives on `/field`
 * because it belongs to that loop. Five of §10 E's seven features had nothing
 * to read them until this screen existed: the composure trend, the six
 * sub-score lines, the two habit metrics, and the Sunday letters.
 *
 * §02: "There is no dashboard, and Train is not one." That rule is what keeps
 * this off the home screen — a wall of charts you can look at instead of
 * training. It is one tap away in Profile, where looking at it is a deliberate
 * act, and nothing here is on the path to a rep.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useBaseline, useProgress, useWeeklyReviews } from '@/lib/data'
import type { WeeklyReview } from '@/lib/data/types'
import { AppShell } from '@/components/app-shell'
import { Card, EmptyState, Skeleton, Stat } from '@/components/ui'
import { SUB_SCORE_LABELS } from '@/lib/data/scorecard'

/** The six, in §07's order. */
const SUB_SCORES = ['opening', 'curiosity', 'listening', 'signalReading', 'composure', 'close']

/**
 * Below this there is not enough to draw a line through.
 *
 * §15: "Three more reps and this becomes a line" — say exactly what unlocks it
 * rather than showing a shrug or, worse, a chart of two points pretending to be
 * a trend.
 */
const MIN_POINTS = 3

export function ProgressScreen() {
  const { data: points, loading } = useProgress()
  const { data: reviews, loading: reviewsLoading } = useWeeklyReviews()
  const { data: baseline } = useBaseline()

  if (loading) {
    return <AppShell title="Progress"><div className="progress-stack"><Skeleton height={220} /><Skeleton height={280} /></div></AppShell>
  }

  if (points.length === 0) {
    return <AppShell title="Progress"><EmptyState title="Nothing to plot yet" description="Every graded rep adds a point to these lines. The first one is the hardest and the only one that has to happen today." action={<Link className="arena-button arena-button--primary" href="/train">Run a rep</Link>} /></AppShell>
  }

  const composites = points.map((point) => point.composite)
  const recent = composites.slice(-5)
  const mean = (values: number[]) =>
    values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)

  return (
    <AppShell title="Progress">
      <div className="screen-heading">
        <span className="label">Last {points.length} graded {points.length === 1 ? 'rep' : 'reps'}</span>
        <h1 className="display-lg">Progress</h1>
        <p>How you played, over time. Outcome is not in here — it never was (§07).</p>
      </div>

      <div className="progress-stack">
        <section className="progress-summary">
          <Stat label="Best" value={Math.max(...composites)} size="lg" />
          <Stat label="Last five" value={mean(recent) ?? '—'} size="lg" />
          <Stat label="All time" value={mean(composites) ?? '—'} size="lg" />
          {baseline ? <Stat label="Baseline" value={baseline.baseline.score} size="lg" /> : null}
        </section>

        <Card className="progress-card">
          <div className="card-heading">
            <div><span className="label">Composure score</span><h2 className="display-md">The trend</h2></div>
          </div>
          {points.length < MIN_POINTS
            ? <NotEnough have={points.length} />
            : <Trend values={composites} label="Composure score over recent reps" />}
        </Card>

        <Card className="progress-card">
          <div className="card-heading">
            <div><span className="label">Six sub-scores</span><h2 className="display-md">Where it moves</h2></div>
          </div>
          {points.length < MIN_POINTS ? <NotEnough have={points.length} /> : (
            <div className="subscore-grid">
              {SUB_SCORES.map((key) => {
                const series = points
                  .map((point) => point.subScores[key])
                  .filter((value): value is number => typeof value === 'number')
                return (
                  <div key={key} className="subscore-cell">
                    <div className="subscore-cell__head">
                      <span className="label">{SUB_SCORE_LABELS[key] ?? key}</span>
                      <strong className="data">{series.length > 0 ? series[series.length - 1] : '—'}</strong>
                    </div>
                    {series.length >= 2
                      ? <Trend values={series} compact label={`${SUB_SCORE_LABELS[key] ?? key} over recent reps`} />
                      : <p className="subscore-cell__empty">Not graded yet</p>}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="progress-card">
          <div className="card-heading">
            <div>
              <span className="label">Habits</span>
              <h2 className="display-md">Fillers and talk ratio</h2>
            </div>
          </div>
          {/* §07 calls the filler rate "the number people most enjoy watching
              fall". It only earns that if it is somewhere they can watch it. */}
          <HabitRow
            title="Fillers per minute"
            target="under 4"
            values={points.map((point) => point.fillerRate)}
            format={(value) => value.toFixed(1)}
          />
          <HabitRow
            title="Talk ratio"
            target="40–55%"
            values={points.map((point) => point.talkRatio)}
            format={(value) => `${Math.round(value * 100)}%`}
          />
        </Card>

        <section>
          <div className="card-heading">
            <div><span className="label">Sunday</span><h2 className="display-md">Weekly reviews</h2></div>
          </div>
          {reviewsLoading ? <Skeleton height={90} /> : reviews.length === 0
            ? <p className="muted">The first one is written on the Sunday after your first rep.</p>
            : <div className="review-list">{reviews.map((review) => <ReviewTile key={review.weekStart} review={review} />)}</div>}
        </section>
      </div>
    </AppShell>
  )
}

function NotEnough({ have }: { have: number }) {
  const needed = MIN_POINTS - have
  return <p className="muted">{needed} more graded {needed === 1 ? 'rep' : 'reps'} and this becomes a line.</p>
}

/**
 * A trend line. No axis, no gridlines beyond the band, no tooltip.
 *
 * The question this answers is "is it going up", and everything else on the
 * chart is in the way of that. The exact number for any one rep is on that
 * rep's own scorecard.
 */
function Trend({ values, compact = false, label }: { values: number[]; compact?: boolean; label: string }) {
  const height = compact ? 44 : 120
  const width = 400
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const y = (value: number) => height - (Math.max(0, Math.min(100, value)) / 100) * (height - 6) - 3
  const points = values.map((value, index) => `${index * step},${y(value)}`).join(' ')
  return (
    <div className={compact ? 'trend trend--compact' : 'trend'}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {!compact ? <g className="chart-grid"><line x1="0" y1={y(70)} x2={width} y2={y(70)} /></g> : null}
        <polyline className="chart-score" points={points} />
      </svg>
    </div>
  )
}

/**
 * One habit metric, as a first-to-last comparison rather than a line.
 *
 * These two move slowly and noisily, so a line invites reading a bad Tuesday as
 * a trend. Where you started against where you are is the honest shape.
 */
function HabitRow({ title, target, values, format }: {
  title: string
  target: string
  values: (number | null)[]
  format: (value: number) => string
}) {
  const measured = values.filter((value): value is number => typeof value === 'number')
  if (measured.length === 0) {
    return <div className="habit-row"><span className="label">{title}</span><p className="muted">Not measured yet.</p></div>
  }
  const first = measured[0] as number
  const last = measured[measured.length - 1] as number
  return (
    <div className="habit-row">
      <div className="habit-row__head">
        <span className="label">{title}</span>
        <span className="label mute">Target {target}</span>
      </div>
      <div className="habit-row__values">
        <div><span className="label">First</span><strong className="data">{format(first)}</strong></div>
        <div><span className="label">Now</span><strong className="data">{format(last)}</strong></div>
        <div><span className="label">Best</span><strong className="data">{format(Math.min(...measured))}</strong></div>
      </div>
    </div>
  )
}

function ReviewTile({ review }: { review: WeeklyReview }) {
  return (
    <Link href={`/progress/week/${review.weekStart}`} className="review-tile">
      <Card>
        <span className="label">Week of {review.weekStart}</span>
        <p>{review.copy}</p>
      </Card>
    </Link>
  )
}

/** One stored Sunday letter (§11 `/progress/week/[id]`). */
export function WeeklyReviewScreen({ weekStart }: { weekStart: string }) {
  const { data: reviews, loading } = useWeeklyReviews()
  if (loading) return <AppShell title="Weekly review"><Skeleton height={280} /></AppShell>

  const review = reviews.find((entry) => entry.weekStart === weekStart)
  if (!review) {
    return <AppShell title="Weekly review"><EmptyState title="No review for that week" description="Reviews are written on Sunday, for weeks with something in them." action={<Link className="arena-button arena-button--primary" href="/progress">All reviews</Link>} /></AppShell>
  }

  return (
    <AppShell title="Weekly review">
      <div className="library-detail">
        <Link href="/progress" className="label volt-link library-detail__back"><ArrowLeft size={14} strokeWidth={1.6} /> Progress</Link>
        <div className="screen-heading">
          <span className="label">Week of {review.weekStart}</span>
          <h1 className="display-lg">The week</h1>
        </div>
        {/* The letter, exactly as it was written. Stored rather than recomputed
            because it is about one specific week and has to keep saying seven
            in October. */}
        <p className="weekly-copy">{review.copy}</p>
        <div className="progress-summary">
          <Stat label="Reps" value={review.stats.reps} />
          <Stat label="Asks made" value={review.stats.asksMade} />
          <Stat label="Rejections" value={review.stats.rejections} />
          <Stat label="Streak" value={`${review.stats.streak} days`} />
        </div>
      </div>
    </AppShell>
  )
}
