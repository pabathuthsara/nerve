/**
 * The accounts table.
 *
 * Every account in the product, with the controls that were previously three
 * scripts and a database console: `npm run db:plan`, `npm run db:interview`,
 * and an UPDATE somebody typed by hand at two in the morning. Those scripts
 * still exist and still work; this is the same writes with a record attached
 * (`admin_actions`) and without an SSH session.
 *
 * The search is a plain `GET` form, so the URL is the state: a filtered table
 * can be reloaded, shared and bookmarked, and the screen needs no client
 * component to have a search box. `q` is passed to Postgres as a parameter and
 * never interpolated.
 *
 * Gated on `adminUser()` with `notFound()` for everybody else, exactly as
 * `/admin` and `/admin/personas` are.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminUser } from '@/lib/db/admin-gate'
import { adminUserRows } from '@/lib/db/admin-metrics'
import { AdminNav } from '@/components/admin/panel'
import { UserTable } from '@/components/admin/user-controls'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Accounts',
  robots: { index: false, follow: false },
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await adminUser()
  if (!user) notFound()

  const { q } = await searchParams
  const search = typeof q === 'string' ? q.slice(0, 120) : ''
  const rows = await adminUserRows(search || null, 200)

  const paying = rows.filter((row) => row.plan !== 'free').length
  const halted = rows.filter((row) => row.spendHaltedAt).length

  return (
    <main className="admin-page">
      <AdminNav here="users" signedInAs={user.email ?? ''} />

      <form className="admin-search" method="get" action="/admin/users">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Address or display name"
          aria-label="Search accounts"
          autoComplete="off"
        />
        <button type="submit" className="arena-button arena-button--ghost">Search</button>
        {search ? <Link className="arena-button arena-button--ghost" href="/admin/users">Clear</Link> : null}
      </form>

      <p className="admin-note">
        {rows.length} account{rows.length === 1 ? '' : 's'}
        {search ? ` matching “${search}”` : ''} · {paying} paying
        {halted > 0 ? ` · ${halted} halted` : ''}. Newest first, capped at 200.
        Open a row for its controls.
      </p>

      <UserTable rows={rows} selfId={user.id} />
    </main>
  )
}
