import 'server-only'

/**
 * Everything `/admin` reads.
 *
 * One module, on the service role, so there is exactly one place where a query
 * crosses every account at once. The aggregation itself happens in Postgres
 * (`supabase/migrations/20260909092000_admin_metrics.sql`) — see that file for
 * why. What is here is the typing, the clamping and the failure behaviour.
 *
 * **Every read here fails soft and returns an empty shape.** An admin panel
 * that throws on a slow query is a panel that cannot be used during the
 * incident it exists for, and each of these four sections is independent: a
 * traffic query that times out must not take the user table down with it. The
 * screen draws a dash where a number is missing rather than a stack trace.
 */

import { supabaseAdmin } from './admin'

export interface Overview {
  accounts: number
  accounts7d: number
  accounts30d: number
  activated: number
  paying: number
  halted: number
  repsToday: number
  reps7d: number
  reps30d: number
  repsTotal: number
  interviewReps30d: number
  minutes30d: number
  costCentsToday: number
  costCents30d: number
  visitorsToday: number
  visitors7d: number
  views7d: number
  creditsOutstanding: number
  fieldLogs30d: number
}

export interface DayRow {
  day: string
  visitors: number
  views: number
  signups: number
  reps: number
}

export interface TopRow {
  key: string
  views: number
  visitors: number
}

export interface AdminUserRow {
  userId: string
  email: string | null
  createdAt: string
  lastSignInAt: string | null
  displayName: string | null
  plan: string
  repsPerDay: number
  repsUsedToday: number
  renewsAt: string | null
  spendHaltedAt: string | null
  activeTrack: string
  unlockedTracks: string[]
  rank: string
  currentLevel: number
  onboardingComplete: boolean
  credits: number
  sessionsTotal: number
  sessions7d: number
  lastSessionAt: string | null
  bestScore: number | null
  costCentsTotal: number
  fieldLogs: number
}

export interface AuditRow {
  id: number
  at: string
  actor: string
  action: string
  subject: string | null
  detail: Record<string, unknown>
}

const EMPTY_OVERVIEW: Overview = {
  accounts: 0, accounts7d: 0, accounts30d: 0, activated: 0, paying: 0, halted: 0,
  repsToday: 0, reps7d: 0, reps30d: 0, repsTotal: 0, interviewReps30d: 0, minutes30d: 0,
  costCentsToday: 0, costCents30d: 0, visitorsToday: 0, visitors7d: 0, views7d: 0,
  creditsOutstanding: 0, fieldLogs30d: 0,
}

/** Whole numbers only. Postgres hands `bigint` and `numeric` back as strings. */
function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function adminOverview(): Promise<Overview> {
  try {
    const { data, error } = await supabaseAdmin().rpc('admin_overview')
    const row = data?.[0]
    if (error || !row) return EMPTY_OVERVIEW
    return {
      accounts: num(row.accounts),
      accounts7d: num(row.accounts_7d),
      accounts30d: num(row.accounts_30d),
      activated: num(row.activated),
      paying: num(row.paying),
      halted: num(row.halted),
      repsToday: num(row.reps_today),
      reps7d: num(row.reps_7d),
      reps30d: num(row.reps_30d),
      repsTotal: num(row.reps_total),
      interviewReps30d: num(row.interview_reps_30d),
      minutes30d: num(row.minutes_30d),
      costCentsToday: num(row.cost_cents_today),
      costCents30d: num(row.cost_cents_30d),
      visitorsToday: num(row.visitors_today),
      visitors7d: num(row.visitors_7d),
      views7d: num(row.views_7d),
      creditsOutstanding: num(row.credits_outstanding),
      fieldLogs30d: num(row.field_logs_30d),
    }
  } catch {
    return EMPTY_OVERVIEW
  }
}

export async function adminDaily(days = 30): Promise<DayRow[]> {
  try {
    const { data, error } = await supabaseAdmin().rpc('admin_daily', { days: clamp(days, 1, 180) })
    if (error || !data) return []
    return data.map((row) => ({
      day: String(row.day),
      visitors: num(row.visitors),
      views: num(row.views),
      signups: num(row.signups),
      reps: num(row.reps),
    }))
  } catch {
    return []
  }
}

export async function adminTopPaths(days = 7, limit = 12): Promise<TopRow[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .rpc('admin_top_paths', { days: clamp(days, 1, 180), lim: clamp(limit, 1, 50) })
    if (error || !data) return []
    return data.map((row) => ({ key: row.path, views: num(row.views), visitors: num(row.visitors) }))
  } catch {
    return []
  }
}

export async function adminTopReferrers(days = 7, limit = 12): Promise<TopRow[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .rpc('admin_top_referrers', { days: clamp(days, 1, 180), lim: clamp(limit, 1, 50) })
    if (error || !data) return []
    return data.map((row) => ({ key: row.host, views: num(row.views), visitors: num(row.visitors) }))
  } catch {
    return []
  }
}

export async function adminUserRows(search: string | null, limit = 200): Promise<AdminUserRow[]> {
  try {
    const { data, error } = await supabaseAdmin().rpc('admin_user_rows', {
      // Passed as a parameter, never interpolated. A `%` in it widens the
      // ILIKE and does nothing else.
      search: search?.trim() ? search.trim().slice(0, 120) : null,
      lim: clamp(limit, 1, 500),
    })
    if (error || !data) return []
    return data.map((row) => ({
      userId: row.user_id,
      email: row.email,
      createdAt: row.created_at,
      lastSignInAt: row.last_sign_in_at,
      displayName: row.display_name,
      plan: row.plan,
      repsPerDay: num(row.reps_per_day),
      repsUsedToday: num(row.reps_used_today),
      renewsAt: row.renews_at,
      spendHaltedAt: row.spend_halted_at,
      activeTrack: row.active_track,
      unlockedTracks: row.unlocked_tracks ?? ['dating'],
      rank: row.rank,
      currentLevel: num(row.current_level),
      onboardingComplete: row.onboarding_complete,
      credits: num(row.credits),
      sessionsTotal: num(row.sessions_total),
      sessions7d: num(row.sessions_7d),
      lastSessionAt: row.last_session_at,
      bestScore: row.best_score === null ? null : num(row.best_score),
      costCentsTotal: num(row.cost_cents_total),
      fieldLogs: num(row.field_logs),
    }))
  } catch {
    return []
  }
}

export async function recentAdminActions(limit = 25): Promise<AuditRow[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from('admin_actions')
      .select('id, at, actor, action, subject, detail')
      .order('at', { ascending: false })
      .limit(clamp(limit, 1, 200))
    if (error || !data) return []
    return data.map((row) => ({
      id: row.id,
      at: row.at,
      actor: row.actor,
      action: row.action,
      subject: row.subject,
      detail: (row.detail ?? {}) as Record<string, unknown>,
    }))
  } catch {
    return []
  }
}

/**
 * Record what an admin just did.
 *
 * Called by every write in `app/admin/users/actions.ts`, after the write rather
 * than before it, so the log says what happened and not what was attempted.
 * It returns nothing and swallows its own failures on purpose: a plan grant
 * that succeeded must not be reported as failed because the audit insert lost a
 * connection. The audit is best-effort, the way persistence around a live rep
 * is; the write it describes is not.
 */
export async function logAdminAction(input: {
  actor: string
  action: string
  subject?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabaseAdmin().from('admin_actions').insert({
      actor: input.actor.slice(0, 254),
      action: input.action.slice(0, 64),
      subject: input.subject ?? null,
      detail: (input.detail ?? {}) as never,
    })
  } catch {
    // Deliberately empty. See above.
  }
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low
  return Math.min(high, Math.max(low, Math.round(value)))
}
