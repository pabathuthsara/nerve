'use client'

/**
 * Every read the Arena frontend makes, against the real database.
 *
 * These run in the browser against the publishable key, which means RLS is the
 * authorisation and not an afterthought: a query that returns someone else's
 * rep would have to get past a policy, not past a code review. It also means
 * the screens keep their loading states — the skeletons were built for a real
 * network and now have one.
 *
 * Writes do NOT live here. A read the user can forge returns them a lie about
 * their own progress; a write the user can forge is a user who has given
 * themselves Elite (§14). Those go through Server Actions.
 */

import { supabaseBrowser } from '@/lib/db/client'
import { nextTierRequirement, unlockedTier } from '@/lib/field/assignment'
import { localDay, nextLocalMidnight } from './day'
import { uiBand, uiLevel, uiWarmth, unlockRequirement, unlockedLevels, wonFromOutcome } from './progression'
import { toScorecard, type StoredWarmthEvent } from './scorecard'
import type {
  FieldLogEntry,
  FieldOutcome,
  FieldStats,
  LifetimeStats,
  Level,
  Persona,
  PersonaProgress,
  Plan,
  Scorecard,
  SessionSummary,
  Track,
  TranscriptTurn,
  UserState,
} from './types'

/** The normalised turn both adapters emit (§04), as stored. */
interface StoredTurn {
  speaker: 'user' | 'agent'
  text: string
  t_start: number
  t_end: number
}

function isPlan(value: string): value is Plan {
  return value === 'free' || value === 'pro' || value === 'elite'
}

function isTrack(value: string): value is Track {
  return value === 'dating' || value === 'interview'
}

/** A display name nobody has typed yet. The local part beats "Account". */
function fallbackName(email: string | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  if (!local) return 'You'
  return local.charAt(0).toUpperCase() + local.slice(1)
}

export async function fetchUserState(): Promise<UserState | null> {
  const supabase = supabaseBrowser()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null

  const [{ data: profile }, { data: entitlement }, { data: streak }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, timezone, active_track, unlocked_tracks, current_level, training_wheels, onboarding_complete, focus_area, ambience, ambience_volume, input_device, output_device')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('entitlements')
      .select('plan, reps_per_day, reps_used_today, reps_day, renews_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('streaks').select('current').eq('user_id', user.id).maybeSingle(),
  ])

  const timezone = profile?.timezone ?? null
  const today = localDay(new Date(), timezone)
  // The reset is stored, not scheduled. A counter belonging to yesterday is
  // simply not this day's counter, so the first read after midnight rolls it
  // without anything having had to run at midnight.
  const usedToday = entitlement && entitlement.reps_day === today ? entitlement.reps_used_today : 0
  const perDay = entitlement?.reps_per_day ?? 0
  const plan = entitlement && isPlan(entitlement.plan) ? entitlement.plan : 'free'
  const activeTrack = profile && isTrack(profile.active_track) ? profile.active_track : 'dating'
  const focus = profile?.focus_area
  const focusArea = focus === 'opening' || focus === 'sustaining' || focus === 'flirting' || focus === 'rejection'
    ? focus
    : null

  return {
    id: user.id,
    email: user.email ?? '',
    displayName: profile?.display_name?.trim() || fallbackName(user.email),
    activeTrack,
    unlockedTracks: (profile?.unlocked_tracks ?? ['dating']).filter(isTrack),
    currentLevel: uiLevel(profile?.current_level ?? 1),
    repsRemainingToday: Math.max(0, perDay - usedToday),
    repsPerDay: perDay,
    repsResetAt: nextLocalMidnight(new Date(), timezone).toISOString(),
    streakDays: streak?.current ?? 0,
    plan,
    trainingWheels: profile?.training_wheels ?? true,
    onboardingComplete: profile?.onboarding_complete ?? false,
    focusArea,
    renewsAt: entitlement?.renews_at ?? null,
    ambience: profile?.ambience ?? true,
    ambienceVolume: profile?.ambience_volume ?? 60,
    inputDevice: profile?.input_device ?? null,
    outputDevice: profile?.output_device ?? null,
  }
}

interface PersonaRow {
  slug: string
  name: string
  level: number
  scene: string
  setting_label: string | null
  setting_short: string | null
  hook: string | null
  blurb: string | null
  responds_to: string[]
  shuts_down_on: string[]
  portrait_url: string | null
}

const PERSONA_COLUMNS =
  'slug, name, level, scene, setting_label, setting_short, hook, blurb, responds_to, shuts_down_on, portrait_url'

/**
 * The roster.
 *
 * Locked is derived from the reps you have run rather than stored, so it
 * cannot disagree with your history — see UNLOCK_RULES. It also means an
 * unlock is never lost because a write failed after a win.
 */
export async function fetchPersonas(): Promise<Persona[]> {
  const supabase = supabaseBrowser()
  const [{ data: rows }, { data: sessions }] = await Promise.all([
    supabase.from('personas').select(PERSONA_COLUMNS).eq('track', 'dating').eq('published', true).order('level'),
    supabase.from('sessions').select('persona_slug, outcome').not('ended_at', 'is', null),
  ])

  const personas = (rows ?? []) as PersonaRow[]
  const levelBySlug = new Map(personas.map((row) => [row.slug, uiLevel(row.level)]))

  const winsByLevel: Record<number, number> = {}
  for (const session of sessions ?? []) {
    if (!wonFromOutcome(session.outcome)) continue
    const level = levelBySlug.get(session.persona_slug)
    if (!level) continue
    winsByLevel[level] = (winsByLevel[level] ?? 0) + 1
  }
  const open = unlockedLevels(winsByLevel)

  return personas.map((row) => toPersona(row, open))
}

export async function fetchPersona(slug: string): Promise<Persona | null> {
  const all = await fetchPersonas()
  return all.find((persona) => persona.id === slug) ?? null
}

function toPersona(row: PersonaRow, open: Set<Level>): Persona {
  const level = uiLevel(row.level)
  const locked = !open.has(level)
  return {
    id: row.slug,
    name: row.name,
    level,
    setting: row.setting_label ?? row.scene,
    settingShort: row.setting_short ?? '',
    hook: row.hook ?? '',
    blurb: row.blurb ?? '',
    respondsTo: row.responds_to ?? [],
    shutsDownOn: row.shuts_down_on ?? [],
    portraitUrl: row.portrait_url ?? '',
    locked,
    unlockRequirement: locked ? unlockRequirement(level) : null,
  }
}

interface SessionRow {
  id: string
  persona_slug: string
  started_at: string
  duration_s: number | null
  outcome: string | null
  won: boolean | null
  final_warmth: number | null
  final_band: string | null
}

/**
 * Finished reps, newest first.
 *
 * A row exists from the moment the transport connects, so an unfinished rep is
 * a crash rather than a session — history shows what actually happened, which
 * means reps that ended.
 */
export async function fetchSessions(limit = 50): Promise<SessionSummary[]> {
  const supabase = supabaseBrowser()
  const { data: rows } = await supabase
    .from('sessions')
    .select('id, persona_slug, started_at, duration_s, outcome, won, final_warmth, final_band')
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit)

  const sessions = (rows ?? []) as SessionRow[]
  if (sessions.length === 0) return []

  const [{ data: personaRows }, { data: scoreRows }] = await Promise.all([
    supabase.from('personas').select('slug, name, setting_short, track'),
    supabase.from('scores').select('session_id, composite').in('session_id', sessions.map((row) => row.id)),
  ])

  const personas = new Map((personaRows ?? []).map((row) => [row.slug, row]))
  const composites = new Map((scoreRows ?? []).map((row) => [row.session_id, row.composite]))

  return sessions.map((row) => {
    const persona = personas.get(row.persona_slug)
    return {
      id: row.id,
      track: persona?.track === 'interview' ? 'interview' : 'dating',
      personaId: row.persona_slug,
      // Denormalised on the session for exactly this reason: a rep stays
      // readable after a character is unpublished.
      personaName: persona?.name ?? row.persona_slug,
      personaSettingShort: persona?.setting_short ?? '',
      startedAt: row.started_at,
      durationMs: (row.duration_s ?? 0) * 1000,
      won: row.won ?? wonFromOutcome(row.outcome),
      finalWarmth: uiWarmth(row.final_warmth),
      finalBand: uiBand(row.final_band),
      compositeScore: composites.get(row.id) ?? null,
    }
  })
}

export async function fetchSession(sessionId: string): Promise<SessionSummary | null> {
  if (!isUuid(sessionId)) return null
  const sessions = await fetchSessions(200)
  return sessions.find((session) => session.id === sessionId) ?? null
}

/** Postgres will reject a malformed uuid rather than return nothing. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function fetchScorecard(sessionId: string): Promise<Scorecard | null> {
  if (!isUuid(sessionId)) return null
  const supabase = supabaseBrowser()

  const [{ data: score }, { data: transcript }] = await Promise.all([
    supabase
      .from('scores')
      .select('composite, metric_scores, focus, went_well, opening, curiosity, listening, signal_reading, composure, close')
      .eq('session_id', sessionId)
      .maybeSingle(),
    supabase.from('transcripts').select('warmth').eq('session_id', sessionId).maybeSingle(),
  ])

  // Not graded yet, or grading failed. The screen says so rather than drawing
  // an empty scorecard that looks like a zero.
  if (!score) return null

  return toScorecard({
    sessionId,
    score,
    events: warmthEvents(transcript?.warmth),
  })
}

function warmthEvents(value: unknown): StoredWarmthEvent[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is StoredWarmthEvent =>
    !!entry
    && typeof entry === 'object'
    && typeof (entry as StoredWarmthEvent).turnIndex === 'number'
    && typeof (entry as StoredWarmthEvent).delta === 'number')
}

/**
 * The transcript, with the warmth gutter attached.
 *
 * Warmth events are keyed by user-turn ordinal, not by position in the
 * transcript — the engine only ever sees user turns. A turn can carry more
 * than one event, because the slow scorer answers after the fast one has
 * already moved the meter; those are folded into a single visible delta so the
 * gutter shows what the turn was worth rather than how it was computed.
 */
export async function fetchTranscript(sessionId: string): Promise<TranscriptTurn[]> {
  if (!isUuid(sessionId)) return []
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('transcripts')
    .select('turns, warmth')
    .eq('session_id', sessionId)
    .maybeSingle()

  const turns = Array.isArray(data?.turns) ? (data.turns as unknown as StoredTurn[]) : []
  const events = warmthEvents(data?.warmth)

  const folded = new Map<number, { delta: number; warmthAfter: number; reason: string; weight: number }>()
  for (const event of events) {
    const current = folded.get(event.turnIndex)
    if (!current) {
      folded.set(event.turnIndex, {
        delta: event.delta,
        warmthAfter: event.warmthAfter,
        reason: event.reason,
        weight: Math.abs(event.delta),
      })
      continue
    }
    current.delta += event.delta
    current.warmthAfter = event.warmthAfter
    // Keep the reason belonging to the biggest single move on that turn.
    if (Math.abs(event.delta) > current.weight) {
      current.reason = event.reason
      current.weight = Math.abs(event.delta)
    }
  }

  let userTurn = 0
  return turns.map((turn, index) => {
    const isUser = turn.speaker === 'user'
    if (isUser) userTurn += 1
    const event = isUser ? folded.get(userTurn) : undefined
    return {
      index,
      speaker: isUser ? 'user' : 'persona',
      text: turn.text,
      tStart: Math.round(turn.t_start * 1000),
      tEnd: Math.round(turn.t_end * 1000),
      warmthAfter: event ? uiWarmth(event.warmthAfter) : null,
      delta: event ? Math.round(event.delta) : null,
      reason: event?.reason ?? null,
    }
  })
}

/** Your record against each character. Derived; nothing to keep in sync. */
export async function fetchPersonaProgress(): Promise<PersonaProgress[]> {
  const supabase = supabaseBrowser()
  const { data: rows } = await supabase
    .from('sessions')
    .select('persona_slug, started_at, duration_s, outcome, won, final_warmth')
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })

  const progress = new Map<string, PersonaProgress>()
  for (const row of rows ?? []) {
    const entry = progress.get(row.persona_slug) ?? {
      personaId: row.persona_slug,
      attempts: 0,
      wins: 0,
      bestTimeMs: null,
      bestWarmth: 0,
      lastAttemptAt: null,
    }

    entry.attempts += 1
    entry.lastAttemptAt = entry.lastAttemptAt ?? row.started_at
    entry.bestWarmth = Math.max(entry.bestWarmth, uiWarmth(row.final_warmth))

    if (row.won ?? wonFromOutcome(row.outcome)) {
      entry.wins += 1
      // Best time is the fastest WIN. A fast loss is not a record.
      const ms = (row.duration_s ?? 0) * 1000
      if (ms > 0 && (entry.bestTimeMs === null || ms < entry.bestTimeMs)) entry.bestTimeMs = ms
    }

    progress.set(row.persona_slug, entry)
  }

  return [...progress.values()]
}

/** The profile header. Six figures, all of them counted rather than assumed. */
export async function fetchLifetimeStats(): Promise<LifetimeStats> {
  const supabase = supabaseBrowser()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user

  const [{ data: rows }, { data: streak }] = await Promise.all([
    supabase
      .from('sessions')
      .select('duration_s, outcome, won, start_warmth, final_warmth')
      .not('ended_at', 'is', null),
    user
      ? supabase.from('streaks').select('current, longest').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const sessions = rows ?? []
  const wins = sessions.filter((row) => row.won ?? wonFromOutcome(row.outcome))

  const winTimes = wins
    .map((row) => (row.duration_s ?? 0) * 1000)
    .filter((ms) => ms > 0)

  const gains = sessions
    .filter((row) => typeof row.start_warmth === 'number' && typeof row.final_warmth === 'number')
    .map((row) => (row.final_warmth as number) - (row.start_warmth as number))

  return {
    totalReps: sessions.length,
    winRate: sessions.length ? Math.round((wins.length / sessions.length) * 100) : null,
    bestTimeMs: winTimes.length ? Math.min(...winTimes) : null,
    averageWarmthGain: gains.length ? Math.round(gains.reduce((sum, gain) => sum + gain, 0) / gains.length) : null,
    currentStreak: streak?.current ?? 0,
    longestStreak: streak?.longest ?? 0,
  }
}

/* ------------------------------------------------------------------ *
 * The field (§09)
 * ------------------------------------------------------------------ *
 *
 * Today's assignment is not here: creating one is a write, so it lives in
 * `app/field/actions.ts` behind `assignToday()`. These are the two pure reads
 * — what has been logged, and what the counters say.
 */

/** Every ask, newest first. The raw material for the chart in item 2. */
export async function fetchFieldLog(limit = 100): Promise<FieldLogEntry[]> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('field_logs')
    .select('id, challenge_title, tier, asked, outcome, anxiety_pre, anxiety_post, note, logged_on, logged_at')
    .order('logged_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => ({
    id: row.id,
    challengeTitle: row.challenge_title,
    tier: row.tier,
    asked: row.asked,
    outcome: row.outcome as FieldOutcome,
    anxietyPre: row.anxiety_pre,
    anxietyPost: row.anxiety_post,
    note: row.note,
    loggedOn: row.logged_on,
    loggedAt: row.logged_at,
  }))
}

/**
 * The counters.
 *
 * Rejections collected is the headline, never successes (§09). Asks made is
 * what the streak reads. Tier progress counts DISTINCT challenges, so doing
 * the same one four times does not fill the bar.
 */
export async function fetchFieldStats(): Promise<FieldStats> {
  const supabase = supabaseBrowser()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user

  const [{ data: logs }, { data: profile }, { data: challenges }] = await Promise.all([
    supabase.from('field_logs').select('challenge_id, tier, asked, outcome'),
    user
      ? supabase.from('profiles').select('current_level').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('field_challenges').select('id, tier').eq('published', true),
  ])

  const tier = unlockedTier(profile?.current_level ?? 1)
  const rows = logs ?? []
  const atTier = new Set(
    rows.filter((row) => row.tier === tier && row.challenge_id).map((row) => row.challenge_id as string),
  )

  return {
    asksMade: rows.filter((row) => row.asked).length,
    rejectionsCollected: rows.filter((row) => row.outcome === 'declined').length,
    tier,
    tierDone: atTier.size,
    tierTotal: (challenges ?? []).filter((row) => row.tier === tier).length,
    nextTierAt: nextTierRequirement(tier),
  }
}
