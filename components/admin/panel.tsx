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
import type { DayRow, TopRow } from '@/lib/db/admin-metrics'

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
