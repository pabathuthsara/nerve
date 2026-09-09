/**
 * The admin overview.
 *
 * One screen answering three questions in the order they matter before a
 * launch: did anybody come, did they sign up, and what is it costing us. Every
 * number on it is first-party — nothing here needs PostHog to be keyed
 * (`LAUNCH-GAP.md` B7), which is the point: an operator has to be able to read
 * the product's own numbers on a deployment nobody has configured.
 *
 * Gated on `adminUser()`, and a non-admin gets `notFound()` rather than a 403,
 * so this route answers a stranger with exactly what a misspelt URL answers.
 * See `lib/db/admin-gate.ts` for what that does and does not buy.
 *
 * `force-dynamic` because a cached dashboard is a lie with a timestamp on it.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminUser } from '@/lib/db/admin-gate'
import {
  adminDaily,
  adminOverview,
  adminTopPaths,
  adminTopReferrers,
  recentAdminActions,
} from '@/lib/db/admin-metrics'
import { AdminNav, DayBars, Figure, StatBlock, TopTable, ago, money } from '@/components/admin/panel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  // Never indexed, never previewed. An admin route in a search result is an
  // admin route somebody found without guessing.
  robots: { index: false, follow: false },
}

/** A share of something, or a dash when the denominator is zero. */
function share(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `${Math.round((part / whole) * 100)}%`
}

export default async function AdminOverviewPage() {
  const user = await adminUser()
  if (!user) notFound()

  // In parallel: five independent reads, each of which fails soft on its own.
  const [overview, daily, paths, referrers, audit] = await Promise.all([
    adminOverview(),
    adminDaily(30),
    adminTopPaths(7, 10),
    adminTopReferrers(7, 8),
    recentAdminActions(12),
  ])

  const signups30d = daily.reduce((sum, row) => sum + row.signups, 0)

  /**
   * Signup rate, counted only over the days traffic was actually recorded.
   *
   * Accounts are older than this counter. Dividing thirty days of signups by
   * however many days of traffic exist reported "1800% of visitors" on the day
   * the beacon shipped — a number that is not wrong so much as meaningless,
   * and the kind a dashboard is believed about anyway. So the window is the
   * days with any traffic in them, on both sides of the division, and before
   * there are any it says so instead of dividing.
   */
  const countingFrom = daily.find((row) => row.views > 0)?.day ?? null
  const comparable = countingFrom ? daily.filter((row) => row.day >= countingFrom) : []
  const visitorsSince = comparable.reduce((sum, row) => sum + row.visitors, 0)
  const signupsSince = comparable.reduce((sum, row) => sum + row.signups, 0)

  return (
    <main className="admin-page">
      <AdminNav here="overview" signedInAs={user.email ?? ''} />

      <p className="admin-note">
        First-party numbers, counted by this product and nobody else. Days are UTC.
        Traffic starts from the moment the beacon shipped — a flat line before that is
        an absence of history, not an absence of visitors.
      </p>

      <div className="admin-charts">
        <DayBars rows={daily} pick={(row) => row.visitors} series="primary" caption="Visitors · 30 days" />
        <DayBars rows={daily} pick={(row) => row.reps} series="second" caption="Reps · 30 days" />
      </div>

      <StatBlock title="Who arrived">
        <Figure label="Visitors today" value={overview.visitorsToday.toLocaleString()} />
        <Figure label="Visitors · 7d" value={overview.visitors7d.toLocaleString()} />
        <Figure label="Page views · 7d" value={overview.views7d.toLocaleString()} />
        <Figure
          label="Signups · 30d"
          value={signups30d.toLocaleString()}
          note={
            countingFrom && visitorsSince > 0
              ? `${share(signupsSince, visitorsSince)} of visitors since ${countingFrom}`
              : 'no traffic history yet'
          }
        />
      </StatBlock>

      <StatBlock title="Who stayed">
        <Figure label="Accounts" value={overview.accounts.toLocaleString()} note={`${overview.accounts7d} in the last 7 days`} />
        {/* Activation is one rep, not one signup. It is the only number here
            that says whether the product was reached at all. */}
        <Figure
          label="Ran a rep"
          value={overview.activated.toLocaleString()}
          note={`${share(overview.activated, overview.accounts)} of accounts`}
        />
        <Figure label="Paying" value={overview.paying.toLocaleString()} note={`${share(overview.paying, overview.accounts)} of accounts`} />
        <Figure label="Field logs · 30d" value={overview.fieldLogs30d.toLocaleString()} />
      </StatBlock>

      <StatBlock title="What they did">
        <Figure label="Reps today" value={overview.repsToday.toLocaleString()} />
        <Figure label="Reps · 7d" value={overview.reps7d.toLocaleString()} />
        <Figure label="Reps · 30d" value={overview.reps30d.toLocaleString()} note={`${overview.interviewReps30d} on the interview track`} />
        <Figure label="Voice minutes · 30d" value={overview.minutes30d.toLocaleString()} />
      </StatBlock>

      <StatBlock title="What it cost">
        <Figure label="Voice spend today" value={money(overview.costCentsToday)} />
        <Figure label="Voice spend · 30d" value={money(overview.costCents30d)} />
        <Figure
          label="Cost per rep · 30d"
          value={overview.reps30d > 0 ? money(Math.round(overview.costCents30d / overview.reps30d)) : '—'}
        />
        <Figure label="Interview credits held" value={overview.creditsOutstanding.toLocaleString()} />
      </StatBlock>

      {/* Amber, because a halted account is a customer who cannot train. It is
          the one figure on this page anybody is meant to act on. */}
      {overview.halted > 0 ? (
        <section className="admin-card">
          <header><h2 className="display-md">Halted</h2></header>
          <p className="admin-fine admin-fine--amber">
            {overview.halted} account{overview.halted === 1 ? ' is' : 's are'} spend-halted and cannot start a
            rep. <Link href="/admin/users">Open the accounts table</Link> to see which.
          </p>
        </section>
      ) : null}

      <div className="admin-grid">
        <TopTable title="Where they landed" rows={paths} head="Path · 7d" empty="No page views yet." />
        <TopTable title="Where they came from" rows={referrers} head="Referrer · 7d" empty="No referrers yet." />
      </div>

      <section className="admin-card">
        <header><h2 className="display-md">Recent admin actions</h2></header>
        {audit.length === 0 ? (
          <p className="admin-fine">Nothing has been changed by hand.</p>
        ) : (
          <div className="admin-readout admin-readout--audit">
            <div className="admin-readout__row admin-readout__row--head">
              <span>When</span><span>Who</span><span>What</span><span>Account</span>
            </div>
            {audit.map((row) => (
              <div key={row.id} className="admin-readout__row">
                <span className="data">{ago(row.at)}</span>
                <span className="admin-truncate">{row.actor}</span>
                <span className="data">{row.action}</span>
                <span className="admin-truncate data">{row.subject?.slice(0, 8) ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
