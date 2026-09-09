'use client'

/**
 * The accounts table, and the controls under each row.
 *
 * The only client component in the panel, because it is the only part that
 * needs one: everything else is a read and reads render on the server.
 *
 * ── WHAT THIS COMPONENT IS AND IS NOT RESPONSIBLE FOR ────────────────────
 *
 * It is responsible for making the consequences legible before the click —
 * naming the plan, showing what a revoke would take, and putting the account's
 * own address in front of a deletion. It is NOT responsible for permission:
 * every action in `app/admin/users/actions.ts` re-checks `adminUser()` on the
 * server, because a Server Action is a public endpoint and a component that
 * does not render is not a boundary.
 *
 * One row is open at a time. A table where every row is expanded is a table
 * nobody can scan, and the scan — who is paying, who has stopped, who is
 * costing us — is what the screen is for.
 */

import { useState, useTransition } from 'react'
import { useToast } from '@/components/ui'
import { ago, money } from '@/components/admin/panel'
import {
  deleteAccount,
  grantCredits,
  resetDailyReps,
  revokeCredits,
  setInterviewTrack,
  setPlan,
  setSpendHalt,
  type AdminResult,
} from '@/app/admin/users/actions'
import type { AdminUserRow } from '@/lib/db/admin-metrics'

const PLANS = ['free', 'pro', 'elite'] as const

export function UserTable({ rows, selfId }: { rows: readonly AdminUserRow[]; selfId: string }) {
  const [open, setOpen] = useState<string | null>(null)

  if (rows.length === 0) {
    return <p className="admin-fine">No accounts match that search.</p>
  }

  return (
    <div className="admin-users">
      <div className="admin-users__row admin-users__row--head">
        <span>Account</span>
        <span>Plan</span>
        <span>Reps</span>
        <span>Credits</span>
        <span>Last rep</span>
        <span>Cost</span>
      </div>
      {rows.map((row) => {
        const expanded = open === row.userId
        return (
          <div key={row.userId} className={`admin-users__item${expanded ? ' is-open' : ''}`}>
            <button
              type="button"
              className="admin-users__row admin-users__row--button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : row.userId)}
            >
              <span className="admin-users__who">
                <strong className="admin-truncate">{row.email ?? '(no address)'}</strong>
                <small>
                  {row.displayName ? `${row.displayName} · ` : ''}
                  joined {ago(row.createdAt)}
                  {row.spendHaltedAt ? ' · halted' : ''}
                  {row.unlockedTracks.includes('interview') ? ' · interview' : ''}
                </small>
              </span>
              <span className={`data${row.plan === 'free' ? '' : ' admin-users__paying'}`}>{row.plan}</span>
              <span className="data">{row.repsUsedToday}/{row.repsPerDay}</span>
              <span className="data">{row.credits}</span>
              <span className="data">{ago(row.lastSessionAt)}</span>
              <span className="data">{money(row.costCentsTotal)}</span>
            </button>
            {expanded ? <Controls row={row} isSelf={row.userId === selfId} /> : null}
          </div>
        )
      })}
    </div>
  )
}

function Controls({ row, isSelf }: { row: AdminUserRow; isSelf: boolean }) {
  const { push } = useToast()
  const [pending, start] = useTransition()
  const [credits, setCredits] = useState('1')
  const [confirm, setConfirm] = useState('')

  /**
   * Every button goes through here.
   *
   * The actions return `{ ok, message }` rather than throwing (§02), so the
   * failure path is a sentence somebody can read — "the ledger refused the
   * write, nothing was granted" — and never an opaque digest.
   */
  function run(work: () => Promise<AdminResult>): void {
    start(async () => {
      const result = await work()
      push(result.message, result.ok ? 'volt' : 'red')
    })
  }

  const amount = Math.max(1, Math.min(50, Math.round(Number(credits) || 1)))
  const hasInterview = row.unlockedTracks.includes('interview')

  return (
    <div className="admin-users__panel">
      <div className="admin-users__facts">
        <span className="label">Reps</span><strong className="data">{row.sessionsTotal} total · {row.sessions7d} this week</strong>
        <span className="label">Best composite</span><strong className="data">{row.bestScore ?? '—'}</strong>
        <span className="label">Field logs</span><strong className="data">{row.fieldLogs}</strong>
        <span className="label">Rank · level</span><strong className="data">{row.rank || '—'} · {row.currentLevel}</strong>
        <span className="label">Track</span><strong className="data">{row.activeTrack} · {row.unlockedTracks.join(', ')}</strong>
        <span className="label">Onboarded</span><strong className="data">{row.onboardingComplete ? 'yes' : 'no'}</strong>
        <span className="label">Last sign-in</span><strong className="data">{ago(row.lastSignInAt)}</strong>
        <span className="label">Renews</span><strong className="data">{row.renewsAt ? new Date(row.renewsAt).toISOString().slice(0, 10) : '—'}</strong>
      </div>

      <fieldset className="admin-users__group" disabled={pending}>
        <legend className="label">Plan</legend>
        <div className="admin-actions">
          {PLANS.map((plan) => (
            <button
              key={plan}
              type="button"
              className={`arena-button arena-button--ghost${row.plan === plan ? ' is-on' : ''}`}
              onClick={() => run(() => setPlan(row.userId, plan))}
            >
              {plan}
            </button>
          ))}
        </div>
        <p className="admin-fine">
          Grants the entitlement only. No subscription is created at the provider, so a comped
          account shows as paying here and as nothing at Whop — which is what it is.
        </p>
      </fieldset>

      <fieldset className="admin-users__group" disabled={pending}>
        <legend className="label">Interview credits · holds {row.credits}</legend>
        <div className="admin-actions">
          <input
            className="admin-number"
            type="number"
            min={1}
            max={50}
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            aria-label="How many credits"
          />
          <button type="button" className="arena-button arena-button--ghost" onClick={() => run(() => grantCredits(row.userId, amount))}>
            Grant {amount}
          </button>
          <button type="button" className="arena-button arena-button--ghost" onClick={() => run(() => revokeCredits(row.userId, amount))}>
            Revoke {amount}
          </button>
        </div>
        <p className="admin-fine">
          Granted, never purchased: a grant expires in thirty days, a purchase never expires.
          Granting one opens the interview track by itself.
        </p>
      </fieldset>

      <fieldset className="admin-users__group" disabled={pending}>
        <legend className="label">Access</legend>
        <div className="admin-actions">
          <button type="button" className="arena-button arena-button--ghost" onClick={() => run(() => setInterviewTrack(row.userId, !hasInterview))}>
            {hasInterview ? 'Close interview track' : 'Open interview track'}
          </button>
          <button type="button" className="arena-button arena-button--ghost" onClick={() => run(() => resetDailyReps(row.userId))}>
            Reset today&rsquo;s reps
          </button>
          <button type="button" className="arena-button arena-button--ghost" onClick={() => run(() => setSpendHalt(row.userId, !row.spendHaltedAt))}>
            {row.spendHaltedAt ? 'Resume spending' : 'Halt spending'}
          </button>
        </div>
        {row.spendHaltedAt ? (
          <p className="admin-fine admin-fine--amber">
            Halted {ago(row.spendHaltedAt)}. Every paid route refuses on this account until it is resumed.
          </p>
        ) : null}
      </fieldset>

      {/* The one irreversible control on the screen, and the only red on it.
          The address has to be typed back because the rows look alike. */}
      <fieldset className="admin-users__group admin-users__group--danger" disabled={pending || isSelf}>
        <legend className="label">Delete</legend>
        {isSelf ? (
          <p className="admin-fine">This is the account you are signed in as. It cannot be deleted from here.</p>
        ) : (
          <>
            <div className="admin-actions">
              <input
                className="admin-number admin-number--wide"
                type="text"
                autoComplete="off"
                placeholder={row.email ?? 'the address'}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-label="Type the address to confirm"
              />
              <button
                type="button"
                className="arena-button arena-button--danger"
                disabled={confirm.trim().toLowerCase() !== (row.email ?? '').toLowerCase()}
                onClick={() => run(() => deleteAccount(row.userId, confirm))}
              >
                Delete account
              </button>
            </div>
            <p className="admin-fine">
              Removes the sign-in and everything that cascades off it — profile, sessions,
              transcripts, audio, scores, ledger, credits. There is no undo and no export first.
            </p>
          </>
        )}
      </fieldset>
    </div>
  )
}
