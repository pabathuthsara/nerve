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
import { currentUser } from './session'
import { anxietySeries } from '@/lib/field/anxiety'
import { daysSinceBaseline, findRetest, retestDue, type BaselineRep } from './baseline'
import { EMPTY_WEEK, type WeekStats } from './weekly'
import { nextTierRequirement, unlockedTier } from '@/lib/field/assignment'
import { milestoneFor, type Milestone } from '@/lib/field/milestones'
import { LIBRARY_READ_PREFIX, MEMORY_BEAT_FLAG, planWaitlistFlag } from './ui-flags'
import { daysBetween, localDay, nextLocalMidnight } from './day'
import { currentStreak } from './counters'
import { buildRepRecords, type RepRecord } from './records'
import {
  repsAllowedToday,
  repsRemainingToday,
  signupRepAvailable,
  signupRepSpentOn,
  voicelessPlan,
} from './allowance'
import { qualifyingByLevel, uiBand, uiLevel, uiWarmth, unlockProgress, unlockRequirement, unlockedLevels, wonFromOutcome } from './progression'
import { toScorecard, type StoredMetricScore, type StoredWarmthEvent } from './scorecard'
import { RANKS, type Rank } from './rank'
import type {
  BaselineState,
  WeeklyReview,
  FieldLogEntry,
  FieldOutcome,
  FieldStats,
  LibraryCard,
  LifetimeStats,
  Level,
  PendingUnlock,
  Persona,
  PersonaMemory,
  PersonaProgress,
  Plan,
  ProgressPoint,
  Scorecard,
  SessionSummary,
  SubscriptionState,
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
  const user = await currentUser()
  if (!user) return null

  const [{ data: profile }, { data: entitlement }, { data: streak }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, timezone, active_track, unlocked_tracks, current_level, rank, training_wheels, onboarding_complete, focus_area, ambience, ambience_volume, input_device, output_device')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('entitlements')
      .select('plan, reps_per_day, reps_used_today, reps_day, renews_at, onboarding_rep_used_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('streaks').select('current, last_active_on').eq('user_id', user.id).maybeSingle(),
  ])

  const timezone = profile?.timezone ?? null
  const today = localDay(new Date(), timezone)
  // The reset is stored, not scheduled. A counter belonging to yesterday is
  // simply not this day's counter, so the first read after midnight rolls it
  // without anything having had to run at midnight.
  const usedToday = entitlement && entitlement.reps_day === today ? entitlement.reps_used_today : 0
  // Not `reps_per_day`. The sign-up rep sits on top of the plan's number, and
  // the pill, the brief screen's gate and the Server Action that spends the
  // counter all have to be reading the same figure — see
  // `lib/data/allowance.ts`.
  const signupRep = signupRepAvailable(entitlement?.onboarding_rep_used_at ?? null)
  const perDay = entitlement
    ? repsAllowedToday({
        repsPerDay: entitlement.reps_per_day,
        onboardingRepUsedAt: entitlement.onboarding_rep_used_at,
      })
    : 0
  // Subtracted through `repsRemainingToday` rather than as `perDay - usedToday`,
  // because the sign-up rep is in that counter and is not part of any plan: the
  // account that spends it and then buys Pro an hour later has used none of
  // Pro's three, and the pill has to say so.
  const remainingToday = entitlement
    ? repsRemainingToday({
        repsPerDay: entitlement.reps_per_day,
        onboardingRepUsedAt: entitlement.onboarding_rep_used_at,
        usedToday,
        signupSpentToday:
          entitlement.reps_day === today &&
          signupRepSpentOn(entitlement.onboarding_rep_used_at, timezone, today),
      })
    : 0
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
    // The stored value is a mirror `syncLevel` maintains, so an unrecognised
    // string means a row written before the rail existed — not an error worth
    // failing a page load over.
    rank: RANKS.includes(profile?.rank as Rank) ? (profile?.rank as Rank) : 'rookie',
    repsRemainingToday: remainingToday,
    repsPerDay: perDay,
    repsResetAt: nextLocalMidnight(new Date(), timezone).toISOString(),
    signupRepAvailable: signupRep,
    // The state the upgrade screen exists for: no voice on the plan, and the
    // one free rep already spent. Derived here rather than in each screen so
    // the pill, the brief gate and the refusal sheet cannot disagree about
    // whether this account can open a microphone at all.
    voiceLocked: voicelessPlan(entitlement?.reps_per_day ?? 0) && !signupRep,
    // R15. Not `streak.current` straight off the row: that column is only
    // rewritten when somebody trains, so an account two weeks idle still held
    // the number it stopped on and Train showed a live streak to somebody who
    // had broken it a fortnight ago.
    streakDays: currentStreak({
      stored: streak?.current ?? 0,
      lastActiveOn: streak?.last_active_on ?? null,
      today,
      daysBetween,
    }),
    // R14. Whether today has already been claimed — by a rep or by a field ask.
    // Train reads it to decide whether the evening reminder is honest: a card
    // saying "nothing logged yet" to somebody who trained at breakfast is the
    // guilt copy §4 of the audit rules out.
    streakActiveToday: streak?.last_active_on === today,
    // R15. The last local day anything counted, so Train can tell somebody
    // coming back after a fortnight that it noticed. Null on an account that
    // has never trained — which is a first day, not a comeback.
    lastTrainedOn: streak?.last_active_on ?? null,
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
  const [{ data: rows }, { data: sessions }, { data: scoreRows }] = await Promise.all([
    supabase.from('personas').select(PERSONA_COLUMNS).eq('track', 'dating').eq('published', true).order('level'),
    supabase.from('sessions').select('id, persona_slug').not('ended_at', 'is', null),
    supabase.from('scores').select('session_id, composite'),
  ])

  const personas = (rows ?? []) as PersonaRow[]
  const levelBySlug = new Map(personas.map((row) => [row.slug, uiLevel(row.level)]))
  const compositeBySession = new Map((scoreRows ?? []).map((row) => [row.session_id, row.composite]))

  // The same arithmetic `syncLevel` runs on the server. Two implementations of
  // one rule is how the roster and the stored ladder position come to disagree
  // — and this read used to count wins off `outcome`, so the locked state was
  // decided by the grader's opinion of the conversation rather than by anything
  // the user demonstrated (§07, §08).
  const counts = qualifyingByLevel(
    (sessions ?? []).flatMap((session) => {
      const level = levelBySlug.get(session.persona_slug)
      return level ? [{ level, composite: compositeBySession.get(session.id) ?? null }] : []
    }),
  )
  const open = unlockedLevels(counts)

  return personas.map((row) => toPersona(row, open, counts))
}

/**
 * The contact shelf (R10). One row per character, filled or empty.
 *
 * Derived rather than stored, like every other record in this product: the reps
 * that cleared each tier are already in `sessions`, and a stored copy of a
 * derived fact is a copy that can disagree with it. That also means the shelf
 * cannot be written by anybody, including its owner — which is the §14 rule
 * about anything a user could pay to change, applied to the one artefact here
 * somebody would most want to fake.
 *
 * `went_well` is the judge's one line about what worked (§07). It is read here
 * rather than the whole scorecard because that is all a record carries.
 */
export async function fetchRepRecords(): Promise<RepRecord[]> {
  const supabase = supabaseBrowser()
  const [{ data: personaRows }, { data: sessionRows }, { data: scoreRows }] = await Promise.all([
    supabase.from('personas').select('slug, name, level, setting_short').eq('track', 'dating').eq('published', true).order('level'),
    supabase.from('sessions').select('id, persona_slug, started_at, duration_s, outcome, won').not('ended_at', 'is', null),
    supabase.from('scores').select('session_id, composite, went_well'),
  ])

  const scoreBySession = new Map((scoreRows ?? []).map((row) => [row.session_id, row]))

  return buildRepRecords(
    (personaRows ?? []).map((row) => ({
      id: row.slug,
      name: row.name,
      level: uiLevel(row.level),
      settingShort: row.setting_short ?? '',
    })),
    (sessionRows ?? []).map((row) => {
      const score = scoreBySession.get(row.id)
      return {
        id: row.id,
        personaId: row.persona_slug,
        startedAt: row.started_at,
        durationMs: (row.duration_s ?? 0) * 1000,
        // `won` first, `outcome` only as the last resort — reaching for the
        // grade here is how the roster's locked state once came to be decided
        // by the grader's opinion of the conversation (§07).
        won: row.won ?? wonFromOutcome(row.outcome),
        composite: typeof score?.composite === 'number' ? score.composite : null,
        wentWell: typeof score?.went_well === 'string' ? score.went_well : null,
      }
    }),
  )
}

export async function fetchPersona(slug: string): Promise<Persona | null> {
  const all = await fetchPersonas()
  return all.find((persona) => persona.id === slug) ?? null
}

function toPersona(row: PersonaRow, open: Set<Level>, counts: Record<number, number> = {}): Persona {
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
    // R8. The same gate, with the user's own position in it, so the roster
    // draws a bar that moved rather than a sentence that never does.
    unlockProgress: locked ? unlockProgress(level, counts) : null,
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
  decision_warmth: number | null
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
    .select('id, persona_slug, started_at, duration_s, outcome, won, final_warmth, decision_warmth, final_band')
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
      decisionWarmth: row.decision_warmth === null ? null : uiWarmth(row.decision_warmth),
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
  const user = await currentUser()

  const [{ data: rows }, { data: streak }, { data: scoreRows }] = await Promise.all([
    supabase
      .from('sessions')
      .select('duration_s, outcome, won, start_warmth, final_warmth')
      .not('ended_at', 'is', null),
    user
      ? supabase.from('streaks').select('current, longest, last_active_on').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('scores').select('composite'),
  ])

  const sessions = rows ?? []
  const wins = sessions.filter((row) => row.won ?? wonFromOutcome(row.outcome))

  const winTimes = wins
    .map((row) => (row.duration_s ?? 0) * 1000)
    .filter((ms) => ms > 0)

  const gains = sessions
    .filter((row) => typeof row.start_warmth === 'number' && typeof row.final_warmth === 'number')
    .map((row) => (row.final_warmth as number) - (row.start_warmth as number))

  // Only graded reps count towards the average. An ungraded one is a missing
  // measurement, not a zero — averaging zeros in would punish a user for a
  // model call that failed on them.
  const composites = (scoreRows ?? []).map((row) => row.composite).filter((value): value is number => typeof value === 'number')

  return {
    totalReps: sessions.length,
    // R7. Every second ever spent talking to somebody who might say no. It is
    // summed rather than stored because it is a fact about the reps that exist,
    // and a stored copy of a derived fact is a copy that can disagree with it.
    totalMs: sessions.reduce((sum, row) => sum + Math.max(0, (row.duration_s ?? 0) * 1000), 0),
    averageScore: composites.length ? Math.round(composites.reduce((sum, value) => sum + value, 0) / composites.length) : null,
    bestTimeMs: winTimes.length ? Math.min(...winTimes) : null,
    averageWarmthGain: gains.length ? Math.round(gains.reduce((sum, gain) => sum + gain, 0) / gains.length) : null,
    // R15, same as `fetchUserState`: the stored column is only rewritten when
    // somebody trains, so a broken streak has to be read as broken rather than
    // reported at the number it stopped on.
    currentStreak: currentStreak({
      stored: streak?.current ?? 0,
      lastActiveOn: streak?.last_active_on ?? null,
      today: localDay(new Date(), null),
      daysBetween,
    }),
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
    // Rows written in the same instant would otherwise come back in whatever
    // order the planner felt like, and history that reshuffles on refresh reads
    // as a bug.
    .order('id', { ascending: false })
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
  const user = await currentUser()

  const [{ data: logs }, { data: profile }, { data: challenges }] = await Promise.all([
    supabase
      .from('field_logs')
      .select('challenge_id, tier, asked, outcome, anxiety_pre, anxiety_post, logged_on'),
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

  // The same function the chart draws from, so the figure on the profile and
  // the line on `/field` can never disagree about the gap.
  const series = anxietySeries(
    rows.map((row) => ({
      anxietyPre: row.anxiety_pre,
      anxietyPost: row.anxiety_post,
      loggedOn: row.logged_on,
    })),
  )

  return {
    asksMade: rows.filter((row) => row.asked).length,
    rejectionsCollected: rows.filter((row) => row.outcome === 'declined').length,
    tier,
    tierDone: atTier.size,
    tierTotal: (challenges ?? []).filter((row) => row.tier === tier).length,
    nextTierAt: nextTierRequirement(tier),
    anxiety:
      series.meanPredicted !== null && series.meanActual !== null && series.meanGap !== null
        ? {
            meanPredicted: series.meanPredicted,
            meanActual: series.meanActual,
            meanGap: series.meanGap,
            points: series.points.length,
          }
        : null,
  }
}

/* ------------------------------------------------------------------ *
 * Character memory (§08)
 * ------------------------------------------------------------------ */

/**
 * What she still has in mind, for the brief screen.
 *
 * The live rep reads this again on the server, because that is where the
 * character contract is compiled. This read is only ever for showing the user
 * what she is carrying and offering to clear it — the two must agree, so both
 * read the same row rather than one being handed the other's answer.
 */
export async function fetchPersonaMemory(slug: string): Promise<PersonaMemory | null> {
  // The interview track passes an empty slug rather than branching at the call
  // site; an interviewer carrying a memory of your last attempt is a different
  // feature with different rules (§08).
  if (!slug) return null

  const supabase = supabaseBrowser()
  const user = await currentUser()
  if (!user) return null

  const { data: persona } = await supabase
    .from('personas')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (!persona) return null

  const [{ data: memory }, { data: profile }] = await Promise.all([
    supabase
      .from('persona_memory')
      .select('summary, last_seen_at')
      .eq('user_id', user.id)
      .eq('persona_id', persona.id)
      .maybeSingle(),
    supabase.from('profiles').select('ui_flags').eq('id', user.id).maybeSingle(),
  ])

  const line = memory?.summary?.trim()
  if (!line) return null

  const flags = profile?.ui_flags
  const seen = !!(flags && typeof flags === 'object' && !Array.isArray(flags)
    && (flags as Record<string, unknown>)[MEMORY_BEAT_FLAG])

  return { line, lastSeenAt: memory?.last_seen_at ?? null, firstEver: !seen }
}

/** Which paid plans this user has already asked to be told about. */
/**
 * The billing mirror, for the subscription screen.
 *
 * Read under RLS from the browser like every other hook here — `subscriptions`
 * grants read-own and no write policy at all, so this is a read of a table the
 * user can look at and cannot touch (rule 9).
 *
 * A row whose `status` or `plan` is not one this build understands is treated
 * as no row rather than as an error. The provider's vocabulary is normalised at
 * the webhook (`lib/billing/events.ts`) and anything that reaches the column
 * outside the check constraint is a row written by a version of this app that
 * no longer exists — not something to fail a page load over.
 */
export async function fetchSubscription(): Promise<SubscriptionState | null> {
  const supabase = supabaseBrowser()
  const user = await currentUser()
  if (!user) return null

  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end, last_event')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data || !isPlan(data.plan) || !isSubscriptionStatus(data.status)) return null

  return {
    plan: data.plan,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    manageUrl: manageUrlFrom(data.last_event),
  }
}

/**
 * The provider's management page, off the stored event blob.
 *
 * Read defensively and validated as an absolute URL rather than trusted: this
 * value comes from a vendor payload and ends up in an `href`, and a `javascript:`
 * string in a webhook is the shape of attack this check costs nothing to close.
 */
function manageUrlFrom(lastEvent: unknown): string | null {
  if (typeof lastEvent !== 'object' || lastEvent === null || Array.isArray(lastEvent)) return null
  const value = (lastEvent as Record<string, unknown>)['manage_url']
  return typeof value === 'string' && /^https:\/\//i.test(value) ? value : null
}

function isSubscriptionStatus(value: string): value is SubscriptionState['status'] {
  return value === 'trialing' || value === 'active' || value === 'past_due'
    || value === 'canceled' || value === 'incomplete'
}

export async function fetchPlanWaitlist(): Promise<string[]> {
  const supabase = supabaseBrowser()
  const user = await currentUser()
  if (!user) return []

  const { data: profile } = await supabase.from('profiles').select('ui_flags').eq('id', user.id).maybeSingle()
  const flags = profile?.ui_flags
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return []
  const record = flags as Record<string, unknown>
  return (['pro', 'elite'] as const).filter((plan) => !!record[planWaitlistFlag(plan)])
}

/**
 * Which library cards this person has already read (§10 D).
 *
 * Slugs, off the same `ui_flags` blob the one-time beats use. A card with no
 * read mark is not "new" — it is simply unread, which is the only state worth
 * drawing on a fourteen-card library.
 */
export async function fetchLibraryReads(): Promise<string[]> {
  const supabase = supabaseBrowser()
  const user = await currentUser()
  if (!user) return []

  const { data: profile } = await supabase.from('profiles').select('ui_flags').eq('id', user.id).maybeSingle()
  const flags = profile?.ui_flags
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return []
  return Object.keys(flags as Record<string, unknown>)
    .filter((key) => key.startsWith(LIBRARY_READ_PREFIX))
    .map((key) => key.slice(LIBRARY_READ_PREFIX.length))
}

/**
 * The milestone that has been earned and not yet shown.
 *
 * Read rather than remembered: the sheet fires off a row, so closing the tab
 * on the tenth ask means it lands next time instead of being lost. Oldest
 * first, because crossing two at once should be walked through in order.
 */
export async function fetchPendingMilestone(): Promise<Milestone | null> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('unlocks')
    .select('ref')
    .eq('kind', 'milestone')
    .is('announced_at', null)
    .order('unlocked_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data ? milestoneFor(data.ref) : null
}

/**
 * The most recent Sunday review, if one has been written (§09, §11).
 *
 * Read, never computed here. The letter is stored because it is about one
 * specific week and has to keep saying seven in October.
 */
export async function fetchWeeklyReview(): Promise<WeeklyReview | null> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('weekly_reviews')
    .select('week_start, copy, stats')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const stats = (data.stats ?? {}) as Partial<WeekStats>
  return {
    weekStart: data.week_start,
    copy: data.copy,
    stats: { ...EMPTY_WEEK, ...stats },
  }
}

/* ------------------------------------------------------------------ *
 * The baseline, and the week-four re-test (§08)
 * ------------------------------------------------------------------ */

/**
 * Where this account stands against its own first rep.
 *
 * Everything derived rather than stored beyond the two baseline columns: which
 * rep counts as the re-test is a rule, and a rule that is also a column is a
 * rule that can disagree with itself.
 */
export async function fetchBaseline(): Promise<BaselineState | null> {
  const supabase = supabaseBrowser()
  const user = await currentUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('baseline_session_id, baseline_score, timezone')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.baseline_session_id || profile.baseline_score === null) return null

  const sessions = await fetchSessions(200)
  const first = sessions.find((session) => session.id === profile.baseline_session_id)
  // The session is gone — deleted under §16.7. The number survives it, and
  // that is exactly why the score is denormalised, but there is nothing left to
  // compare side by side.
  if (!first) return null

  const baseline: BaselineRep = {
    sessionId: first.id,
    personaId: first.personaId,
    score: profile.baseline_score,
    takenAt: first.startedAt,
  }

  const graded = sessions.map((session) => ({
    id: session.id,
    personaId: session.personaId,
    startedAt: session.startedAt,
    compositeScore: session.compositeScore,
  }))

  const timezone = profile.timezone ?? null
  const retest = findRetest({ baseline, sessions: graded, timezone })

  return {
    baseline,
    personaName: first.personaName,
    retestSessionId: retest?.id ?? null,
    due: retestDue({ baseline, retest, now: new Date(), timezone }),
    daysSince: daysSinceBaseline(baseline.takenAt, new Date(), timezone),
  }
}

/**
 * A level or field tier earned and not yet celebrated (§12).
 *
 * Read rather than returned by the write, for the same reason the milestone is:
 * grading lands seconds after the rep ends, and a user who closes the scorecard
 * before it arrives should still get the moment next time rather than lose it.
 * Oldest first, so clearing two at once walks them in the order they happened.
 */
export async function fetchPendingUnlock(): Promise<PendingUnlock | null> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('unlocks')
    .select('kind, ref')
    .in('kind', ['level', 'tier'])
    .is('announced_at', null)
    .order('unlocked_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const ref = Number(data.ref)
  if (!Number.isInteger(ref) || ref < 1 || ref > 4) return null
  return { kind: data.kind === 'tier' ? 'tier' : 'level', ref: ref as Level }
}

/* ------------------------------------------------------------------ *
 * The library (§10 D)
 * ------------------------------------------------------------------ */

const LIBRARY_COLUMNS = 'slug, kind, title, summary, body, targets, setting, examples, drill'

function toCard(row: Record<string, unknown>): LibraryCard {
  return {
    slug: String(row['slug'] ?? ''),
    kind: (row['kind'] as LibraryCard['kind']) ?? 'technique',
    title: String(row['title'] ?? ''),
    summary: String(row['summary'] ?? ''),
    body: String(row['body'] ?? ''),
    targets: Array.isArray(row['targets']) ? (row['targets'] as string[]) : [],
    setting: typeof row['setting'] === 'string' ? row['setting'] : null,
    // `examples` is jsonb. A card with a malformed array is a content bug worth
    // seeing as an empty list rather than a thrown page.
    examples: Array.isArray(row['examples']) ? (row['examples'] as unknown[]).map(String) : [],
    drill: typeof row['drill'] === 'string' ? row['drill'] : null,
  }
}

export async function fetchLibrary(): Promise<LibraryCard[]> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('techniques')
    .select(LIBRARY_COLUMNS)
    .eq('published', true)
    .order('kind')
  return (data ?? []).map((row) => toCard(row as Record<string, unknown>))
}

export async function fetchLibraryCard(slug: string): Promise<LibraryCard | null> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('techniques')
    .select(LIBRARY_COLUMNS)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  return data ? toCard(data as Record<string, unknown>) : null
}

/**
 * The weakest sub-score from the last graded rep (§10 D — technique of the
 * session).
 *
 * Read off `scores.focus`, which grading already wrote, rather than recomputed
 * — the brief screen and the scorecard must not disagree about what somebody
 * is supposed to be working on.
 *
 * Empty before the first graded rep, which is correct: a technique of the
 * session on session one would be advice about a rep that has not happened.
 */
export async function fetchLatestFocus(): Promise<string[]> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('scores')
    .select('focus, graded_at')
    .order('graded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return Array.isArray(data?.focus) ? (data.focus as string[]) : []
}

/* ------------------------------------------------------------------ *
 * Progress (§10 E)
 * ------------------------------------------------------------------ */

/** How many reps the trend screens look back over. */
export const PROGRESS_WINDOW = 30

/**
 * The graded reps behind every line on `/progress`.
 *
 * One query rather than one per chart: the six sub-score lines, the composure
 * trend and the two habit metrics are all the same rows read different ways,
 * and fetching them separately is three chances for the charts on one screen to
 * disagree about which reps they are describing.
 *
 * Oldest first, because that is the direction a trend is read in.
 */
export async function fetchProgress(): Promise<ProgressPoint[]> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('scores')
    .select('session_id, graded_at, composite, opening, curiosity, listening, signal_reading, composure, close, metric_scores')
    .order('graded_at', { ascending: false })
    .limit(PROGRESS_WINDOW)

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, persona_slug')
    .in('id', (data ?? []).map((row) => row.session_id))

  const slugById = new Map((sessions ?? []).map((row) => [row.id, row.persona_slug]))

  return (data ?? [])
    .map((row) => toProgressPoint(row as ProgressRow, slugById.get(row.session_id) ?? ''))
    .reverse()
}

/** The stored shape `/progress` reads, before it is mapped. */
export interface ProgressRow {
  session_id: string
  graded_at: string
  composite: number
  opening: number | null
  curiosity: number | null
  listening: number | null
  signal_reading: number | null
  composure: number | null
  close: number | null
  metric_scores: unknown
}

/**
 * One stored score row, as a point on the trend lines.
 *
 * Exported and pure so it can be run against real rows rather than trusted:
 * the two habit metrics are dug out of a jsonb array by key, and a rename in
 * `METRIC_BANDS` would silently turn both lines flat with nothing failing.
 * `npm run db:rep` puts a real row through it.
 *
 * A sub-score the judge did not return is left out rather than defaulted to
 * zero — a missing grade and a grade of nought are different facts, and a line
 * that dips to the floor for the first is a lie.
 */
export function toProgressPoint(row: ProgressRow, personaSlug: string): ProgressPoint {
  const stored = Array.isArray(row.metric_scores) ? (row.metric_scores as StoredMetricScore[]) : []
  const valueOf = (key: string) => {
    const found = stored.find((entry) => entry.key === key)
    return typeof found?.value === 'number' ? found.value : null
  }
  return {
    sessionId: row.session_id,
    gradedAt: row.graded_at,
    personaSlug,
    composite: row.composite,
    subScores: {
      ...(row.opening !== null ? { opening: row.opening } : {}),
      ...(row.curiosity !== null ? { curiosity: row.curiosity } : {}),
      ...(row.listening !== null ? { listening: row.listening } : {}),
      ...(row.signal_reading !== null ? { signalReading: row.signal_reading } : {}),
      ...(row.composure !== null ? { composure: row.composure } : {}),
      ...(row.close !== null ? { close: row.close } : {}),
    },
    fillerRate: valueOf('fillerRate'),
    talkRatio: valueOf('talkRatio'),
  }
}

/** Every stored Sunday letter, newest first (§11 `/progress/week/[id]`). */
export async function fetchWeeklyReviews(): Promise<WeeklyReview[]> {
  const supabase = supabaseBrowser()
  const { data } = await supabase
    .from('weekly_reviews')
    .select('week_start, copy, stats')
    .order('week_start', { ascending: false })
    .limit(12)

  return (data ?? []).map((row) => ({
    weekStart: row.week_start,
    copy: row.copy,
    stats: { ...EMPTY_WEEK, ...((row.stats ?? {}) as Partial<WeekStats>) },
  }))
}
