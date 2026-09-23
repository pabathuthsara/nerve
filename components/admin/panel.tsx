/**
 * The pieces every admin screen is built from.
 *
 * Server components with no state: the panel reads and the controls are the
 * only client code (`components/admin/user-controls.tsx`). Keeping the chrome
 * on the server is what stops an admin screen from shipping a bundle to a
 * browser that has no use for one.
 *
 * Arena, with one deliberate reading of the volt rule. §"Design system" says
 * volt appears once per screen; on a dashboard the thing it marks is the
 * PRIMARY SERIES — visitors — and Cool carries the second, exactly as the
 * palette says it should. Every other number on these screens is Ink or Ink-2.
 * Amber and Red stay semantic: a halted account, an account about to be
 * deleted.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DayRow, FunnelRow, TopRow } from '@/lib/db/admin-metrics'

export function AdminNav({ here, signedInAs }: { here: 'overview' | 'users' | 'personas'; signedInAs: string }) {
  return (
    <header className="admin-head">
      <div>
        <span className="label">Admin · {signedInAs}</span>
        <h1 className="display-lg">
          {here === 'overview' ? 'The panel' : here === 'users' ? 'Accounts' : 'The bench'}
        </h1>
      </div>
      <nav className="admin-roster" aria-label="Admin sections">
        <Link className={`admin-chip${here === 'overview' ? ' is-on' : ''}`} href="/admin">Overview</Link>
        <Link className={`admin-chip${here === 'users' ? ' is-on' : ''}`} href="/admin/users">Accounts</Link>
        <Link className={`admin-chip${here === 'personas' ? ' is-on' : ''}`} href="/admin/personas">Personas</Link>
      </nav>
    </header>
  )
}

export function StatBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-card">
      <header><h2 className="display-md">{title}</h2></header>
      <div className="admin-stats">{children}</div>
    </section>
  )
}

/**
 * One number.
 *
 * `tone` is semantic and nothing else: amber means somebody should look at it.
 * A stat never takes volt — the chart owns it on this screen.
 */
export function Figure({
  label,
  value,
  note,
  tone = 'plain',
}: {
  label: string
  value: string | number
  note?: string
  tone?: 'plain' | 'amber'
}) {
  return (
    <div className={`admin-figure${tone === 'amber' ? ' admin-figure--amber' : ''}`}>
      <span className="label">{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  )
}

/**
 * A day-by-day bar chart, drawn as one inline SVG.
 *
 * No library and no client component: the series is thirty numbers and a
 * `<rect>` each. A charting dependency here would be ~40 kB of JavaScript to
 * draw something `Math.max` can position.
 *
 * The zero baseline is drawn even when every value is zero, because an empty
 * chart has to look like "nobody came" rather than like a component that
 * failed to render — which is exactly what this will show on the day the
 * beacon ships and there is no history yet.
 */
export function DayBars({
  rows,
  pick,
  series,
  caption,
}: {
  rows: readonly DayRow[]
  pick: (row: DayRow) => number
  series: 'primary' | 'second'
  caption: string
}) {
  const values = rows.map(pick)
  const peak = Math.max(1, ...values)
  const total = values.reduce((sum, value) => sum + value, 0)
  const width = 100
  const height = 34
  const gap = rows.length > 40 ? 0.2 : 0.6
  const step = rows.length > 0 ? width / rows.length : width

  return (
    <div className="admin-chart">
      <div className="admin-chart__head">
        <span className="label">{caption}</span>
        <strong className="data">{total.toLocaleString()}</strong>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={`admin-chart__svg admin-chart__svg--${series}`}
        role="img"
        aria-label={`${caption}: ${total} over ${rows.length} days, peaking at ${peak}.`}
      >
        {rows.map((row, index) => {
          const value = pick(row)
          // A day with something in it is never invisible: one thin unit of
          // height, so "one visitor" and "no visitors" are different pictures.
          const bar = value === 0 ? 0 : Math.max(1, (value / peak) * (height - 1))
          return (
            <rect
              key={row.day}
              x={index * step}
              y={height - bar}
              width={Math.max(0.5, step - gap)}
              height={bar}
            />
          )
        })}
        <line x1="0" y1={height} x2={width} y2={height} className="admin-chart__base" />
      </svg>
      <div className="admin-chart__axis">
        <span>{rows[0]?.day ?? ''}</span>
        <span>peak {peak.toLocaleString()}</span>
        <span>{rows[rows.length - 1]?.day ?? ''}</span>
      </div>
    </div>
  )
}

export function TopTable({
  title,
  rows,
  empty,
  head,
}: {
  title: string
  rows: readonly TopRow[]
  empty: string
  head: string
}) {
  return (
    <section className="admin-card">
      <header><h2 className="display-md">{title}</h2></header>
      {rows.length === 0 ? (
        <p className="admin-fine">{empty}</p>
      ) : (
        <div className="admin-readout admin-readout--top">
          <div className="admin-readout__row admin-readout__row--head">
            <span>{head}</span><span>Views</span><span>People</span>
          </div>
          {rows.map((row) => (
            <div key={row.key} className="admin-readout__row">
              <span className="admin-truncate">{row.key}</span>
              <span className="data">{row.views.toLocaleString()}</span>
              <span className="data">{row.visitors.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * The `/start` run, screen by screen, with a bar per row.
 *
 * Its own component rather than a `TopTable` with an extra column, because it
 * is answering a different question and has to be read differently: the rows
 * are in RUN ORDER rather than sorted by size, so the eye reads down a
 * descending staircase and the step where it falls off a cliff is the finding.
 * Sorting these by volume, which is right for paths and referrers, would
 * destroy the only thing the table is for.
 *
 * The percentage is of the FIRST screen throughout, not of the previous row.
 * Step-to-step figures read more dramatically and answer the wrong question:
 * what an operator needs is how many of the people who arrived are still here.
 */
export function FunnelTable({ rows, days }: { rows: readonly FunnelRow[]; days: number }) {
  const started = rows[0]?.visitors ?? 0
  return (
    <section className="admin-card">
      <header><h2 className="display-md">Where they stopped</h2></header>
      {started === 0 ? (
        <p className="admin-fine">
          Nobody has walked the run in the last {days} days — or the step beacon shipped after the
          last person did. A flat table here is an absence of history, not an absence of visitors.
        </p>
      ) : (
        <div className="admin-readout admin-readout--funnel">
          <div className="admin-readout__row admin-readout__row--head">
            <span>Screen</span><span>People</span><span>Reached</span><span />
          </div>
          {rows.map((row) => (
            <div key={row.key} className="admin-readout__row">
              <span className="admin-truncate">{row.key}</span>
              <span className="data">{row.visitors.toLocaleString()}</span>
              <span className="data">{row.reachedPct}%</span>
              {/* Ink-2, never volt. Nothing on this page is the current
                  action, and a volt bar per row would put nine accents on
                  one screen. */}
              <span className="admin-funnel__bar" role="presentation">
                <i style={{ width: `${row.reachedPct}%` }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Cents, as an amount somebody reads rather than an integer they decode. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** A timestamp, as how long ago it was. Dashboards are read in relative time. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return '—'
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 90) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 60) return `${days}d ago`
  return `${Math.round(days / 30)}mo ago`
}

/** Milliseconds, as seconds with one place, or a dash. */
function seconds(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`
}

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

/**
 * How fast she answers and what that does to the ladder
 * (PERSONA-REALISM-REPORT L8, W1). The report's two numbers, per rung, beside
 * the arm rate they decide: re-read this after the latency work lands and
 * before any trajectory moves.
 */
export function LatencyTable({
  data,
}: {
  data: {
    days: number
    overall: { reps: number; replyGapP50: number | null; replyGapP90: number | null; firstReplyP50: number | null; firstReplyP90: number | null; agentTurnsPerRep: number | null }
    rungs: ReadonlyArray<{ personaSlug: string; reps: number; replyGapP50: number | null; firstReplyP50: number | null; agentTurnsPerRep: number | null; armedShare: number | null; engagedShare: number | null }>
  }
}) {
  const { overall } = data
  return (
    <section className="admin-card">
      <header><h2 className="display-md">How fast she answers</h2></header>
      {overall.reps === 0 ? (
        <p className="admin-fine">
          No dating rep of a minute or more in the last {data.days} days, so there is nothing to time.
        </p>
      ) : (
        <>
          <div className="admin-stats">
            <Figure label={`Reply gap · p50 · ${data.days}d`} value={seconds(overall.replyGapP50)} note={`p90 ${seconds(overall.replyGapP90)}`} />
            <Figure label="First reply · p50" value={seconds(overall.firstReplyP50)} note={`p90 ${seconds(overall.firstReplyP90)}`} />
            <Figure label="Her turns per rep" value={overall.agentTurnsPerRep ?? '—'} note="The ladder is tuned for fifteen" />
          </div>
          <div className="admin-readout admin-readout--latency">
            <div className="admin-readout__row admin-readout__row--head">
              <span>Rung</span><span>Reps</span><span>Gap</span><span>First</span><span>Turns</span><span>Armed</span><span>Engaged</span>
            </div>
            {data.rungs.map((row) => (
              <div key={row.personaSlug} className="admin-readout__row">
                <span className="admin-truncate">{presentationName(row.personaSlug)}</span>
                <span className="data">{row.reps}</span>
                <span className="data">{seconds(row.replyGapP50)}</span>
                <span className="data">{seconds(row.firstReplyP50)}</span>
                <span className="data">{row.agentTurnsPerRep ?? '—'}</span>
                <span className="data">{pct(row.armedShare)}</span>
                <span className="data">{pct(row.engagedShare)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/** The name a user knows her by. The slug for rung 1 is still `tess`. */
function presentationName(slug: string): string {
  return slug === 'tess' ? 'Cass' : slug.charAt(0).toUpperCase() + slug.slice(1)
}
