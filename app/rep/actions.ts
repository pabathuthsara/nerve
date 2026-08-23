'use server'

/**
 * Persistence for a rep (§13).
 *
 * **Every function here is best-effort and returns a result rather than
 * throwing.** A rep is a live voice session against a remote model; if a
 * Postgres write fails halfway through, the correct behaviour is to lose the
 * row and keep the conversation, not the other way round. The caller surfaces
 * failures as notices and carries on.
 *
 * The one exception to "user context does the write" is usage_ledger, which
 * has no insert policy at all. Metering is appended with the service role so
 * that a user cannot write their own meter (§14).
 */

import { revalidatePath } from 'next/cache'
import { supabaseServer, currentUser } from '@/lib/db/server'
import { supabaseAdmin } from '@/lib/db/admin'
import type { ProviderId, Rate, SessionUsage, TranscriptTurn } from '@/lib/voice/types'
import type { Scorecard } from '@/lib/grade/types'
import type { WarmthTelemetry } from '@/lib/warmth/engine'
import { AUDIO_RETENTION_DAYS } from '@/lib/db/retention'
import { asJson } from '@/lib/db/types'
import { consumeRep, recordTrainingDay, syncLevel } from '@/lib/db/progress'
import { wonFromRep } from '@/lib/data/progression'

export interface SaveResult {
  ok: boolean
  /** Null when ok. A short, honest sentence when not. */
  message: string | null
}

export interface StartResult extends SaveResult {
  sessionId: string | null
}

const FAILED: SaveResult = { ok: false, message: 'Not saved — you are signed out.' }

/** How long a rep may be resumed on the quota it already spent. */
const RESUME_WINDOW_MS = 10 * 60 * 1000

/**
 * Opened when the transport connects, so a rep that crashes still leaves a row.
 *
 * This is also where the daily quota is spent (§14). It is deliberately not
 * spent when the brief screen is opened — a rep the user backed out of is not
 * a rep — and the refusal is returned rather than thrown so the caller can say
 * what happened.
 */
export async function startSession(input: {
  personaSlug: string
  provider: ProviderId
  model: string
}): Promise<StartResult> {
  const user = await currentUser()
  if (!user) return { ...FAILED, sessionId: null }

  const supabase = await supabaseServer()

  // A reload, a dropped connection, a reconnect: the same rep, coming back.
  // Reusing the open row costs nothing and means a refresh does not cost
  // somebody their only rep of the day. Ten minutes is comfortably longer
  // than a two-minute rep and far shorter than a second sitting.
  const resumeAfter = new Date(Date.now() - RESUME_WINDOW_MS).toISOString()
  const { data: open } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('persona_slug', input.personaSlug)
    .is('ended_at', null)
    .gte('started_at', resumeAfter)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (open) return { ok: true, message: null, sessionId: open.id }

  const quota = await consumeRep(user.id)
  if (!quota.ok) return { ok: false, message: quota.message, sessionId: null }

  // Resolve the character row if it has been seeded. The slug is stored either
  // way, so a rep against an unseeded persona is still a complete record.
  const { data: persona } = await supabase
    .from('personas')
    .select('id')
    .eq('slug', input.personaSlug)
    .maybeSingle()

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      persona_id: persona?.id ?? null,
      persona_slug: input.personaSlug,
      provider: input.provider,
      model: input.model,
    })
    .select('id')
    .single()

  if (error) return { ok: false, message: `Not saved — ${error.message}`, sessionId: null }
  return { ok: true, message: null, sessionId: data.id }
}

/**
 * Closes the rep: duration, how it ended, and the transcript.
 *
 * `ended_by` is the provider's own reason. `outcome` is deliberately left null
 * here — it belongs to the scorecard, and writing a guess now would mean two
 * sources disagreeing about the same rep.
 */
export async function finishSession(input: {
  sessionId: string
  seconds: number
  reason: 'user' | 'character' | 'cap' | 'error'
  turns: TranscriptTurn[]
  usage: SessionUsage | null
  rate: Rate
  provider: ProviderId
  model: string
  /** The meter, as it was read at the end of the rep. */
  warmth?: WarmthTelemetry | null
  /**
   * Whether she gave her number.
   *
   * Passed explicitly rather than re-derived, because the number is given the
   * moment warmth crosses and warmth can drift back down in the seconds
   * afterwards. A rep the user watched end in a phone number is a win however
   * the meter finished.
   */
  won?: boolean
}): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return FAILED

  const supabase = await supabaseServer()
  const seconds = Math.max(0, Math.round(input.seconds))

  const warmth = input.warmth ?? null

  const { error: sessionError } = await supabase
    .from('sessions')
    .update({
      ended_at: new Date().toISOString(),
      duration_s: Math.min(seconds, 600),
      ended_by: input.reason,
      // The meter readings the result screen, the roster record and the
      // profile chart all read. Rounded to two places, which is more precision
      // than a warmth number has ever needed and keeps the numeric column
      // honest about what it stores.
      start_warmth: warmth ? round2(warmth.rolledStart) : null,
      final_warmth: warmth ? round2(warmth.end) : null,
      peak_warmth: warmth ? round2(warmth.peak) : null,
      final_band: warmth ? warmth.bandsVisited[warmth.bandsVisited.length - 1] ?? null : null,
      // The live rep decides this: it is the only thing that knows what she
      // was told at the wind-down. The fallback reads the arm/keep pair off
      // the meter for a row written by anything else. See wonFromRep.
      won: input.won
        ?? (warmth ? wonFromRep({ finalWarmth: warmth.end, peakWarmth: warmth.peak }) : null),
    })
    .eq('id', input.sessionId)

  if (sessionError) return { ok: false, message: `Not saved — ${sessionError.message}` }

  const { error: transcriptError } = await supabase.from('transcripts').upsert(
    {
      session_id: input.sessionId,
      user_id: user.id,
      turns: asJson(input.turns),
      // The gutter: what each user turn was worth and why. Stored beside the
      // turns rather than inside them, because the turn array is the shape
      // BOTH adapters emit (§04) and only one of them has a meter attached.
      warmth: asJson(
        (warmth?.events ?? []).map((event) => ({
          turnIndex: event.turnIndex,
          delta: round2(event.delta),
          warmthAfter: round2(event.warmthAfter),
          band: event.band,
          reason: event.reason,
          userText: event.userText,
        })),
      ),
    },
    { onConflict: 'session_id' },
  )

  if (transcriptError) {
    return { ok: false, message: `Transcript not saved — ${transcriptError.message}` }
  }

  await appendUsage({ ...input, userId: user.id, seconds })

  // A rep that produced no turns is a connection that failed, and a streak
  // built out of failed connections is worth nothing to anybody.
  if (input.turns.length > 0) await recordTrainingDay(user.id)

  revalidateReadPaths()
  return { ok: true, message: null }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Every route that reads a rep.
 *
 * The Arena screens fetch from the browser, so this matters less than it will
 * once those reads move server-side — but a stale RSC payload for /train after
 * a rep is exactly the kind of thing that is invisible in development and
 * obvious to the one person whose streak did not move.
 */
function revalidateReadPaths(): void {
  for (const path of ['/', '/train', '/roster', '/profile', '/profile/history']) {
    revalidatePath(path)
  }
}

/**
 * Append-only metering. Service role, because the table grants no insert
 * policy to anyone else.
 *
 * Prefers the provider's own token-priced number and falls back to the rate
 * card only when the provider reported no usage — a dropped connection, say.
 * Provider, model and rate are stamped so history survives a repricing or a
 * provider switch (§04, §14).
 */
async function appendUsage(input: {
  userId: string
  sessionId: string
  seconds: number
  usage: SessionUsage | null
  rate: Rate
  provider: ProviderId
  model: string
}): Promise<void> {
  const measured = input.usage?.pricedCostUsd
  const costUsd =
    typeof measured === 'number' && Number.isFinite(measured)
      ? measured
      : (input.seconds / 60) * input.rate.perMinute

  try {
    await supabaseAdmin()
      .from('usage_ledger')
      .insert({
        user_id: input.userId,
        session_id: input.sessionId,
        seconds: input.seconds,
        provider: input.provider,
        model: input.model,
        rate: input.rate.perMinute,
        cost_cents: Math.max(0, Number((costUsd * 100).toFixed(4))),
      })
  } catch {
    // The rep is over and the transcript is already stored. A ledger row that
    // fails to land is a reconciliation problem, not a user-facing one.
  }
}

/** Written once, after grading. Stamped with the model and the voice provider. */
export async function saveScore(input: {
  sessionId: string
  scorecard: Scorecard
  provider: ProviderId
}): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return FAILED

  const supabase = await supabaseServer()
  const card = input.scorecard

  const { error } = await supabase.from('scores').insert({
    session_id: input.sessionId,
    user_id: user.id,
    composite: card.composite,
    opening: card.subScores.opening,
    curiosity: card.subScores.curiosity,
    listening: card.subScores.listening,
    signal_reading: card.subScores.signalReading,
    composure: card.subScores.composure,
    close: card.subScores.close,
    deterministic_score: card.deterministicScore,
    metrics: asJson(card.metrics),
    metric_scores: asJson(card.metricScores),
    evidence: asJson(card.evidence),
    went_well: card.wentWell,
    focus: card.focus,
    outcome: card.outcome,
    model_version: card.model,
    voice_provider: input.provider,
  })

  if (error) return { ok: false, message: `Score not saved — ${error.message}` }

  // Outcome lives on the session too, for history reads that never join scores.
  // It is recorded and worth zero points (§07).
  const { data: session } = await supabase
    .from('sessions')
    .select('final_warmth, peak_warmth, won')
    .eq('id', input.sessionId)
    .maybeSingle()

  await supabase
    .from('sessions')
    .update({
      outcome: card.outcome,
      // A win that already happened is not up for reconsideration: she gave
      // her number, the user watched it happen, and a grader calling the
      // exchange "neutral" afterwards does not take it back.
      won: session?.won === true
        ? true
        : wonFromRep({
            finalWarmth: session?.final_warmth ?? null,
            peakWarmth: session?.peak_warmth ?? null,
            outcome: card.outcome,
          }),
    })
    .eq('id', input.sessionId)

  // Unlocks are derived from wins, so the ladder position is recomputed once
  // the outcome that decides the win is known — never before it.
  await syncLevel(user.id)

  revalidateReadPaths()
  return { ok: true, message: null }
}

/** User-deletable (§05). Cascades to the transcript and the score. */
export async function deleteSession(sessionId: string): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return FAILED

  const supabase = await supabaseServer()

  // Remove the audio first. Deleting the row would orphan the object, and the
  // 30-day purge only looks at sessions it can still see.
  const { data: session } = await supabase
    .from('sessions')
    .select('audio_path')
    .eq('id', sessionId)
    .maybeSingle()

  if (session?.audio_path) {
    await supabase.storage.from('session-audio').remove([session.audio_path])
  }

  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
  if (error) return { ok: false, message: `Not deleted — ${error.message}` }

  revalidatePath('/')
  return { ok: true, message: null }
}

/**
 * Records where the audio landed, and when it dies.
 *
 * The expiry is stored rather than computed at purge time so that changing the
 * retention window later does not silently re-date audio a user was told would
 * be gone in thirty days (§05, §16).
 */
export async function attachAudio(input: {
  sessionId: string
  path: string
}): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return FAILED

  const expires = new Date()
  expires.setUTCDate(expires.getUTCDate() + AUDIO_RETENTION_DAYS)

  const supabase = await supabaseServer()
  const { error } = await supabase
    .from('sessions')
    .update({ audio_path: input.path, audio_expires_at: expires.toISOString() })
    .eq('id', input.sessionId)

  if (error) return { ok: false, message: `Audio not linked — ${error.message}` }
  return { ok: true, message: null }
}
