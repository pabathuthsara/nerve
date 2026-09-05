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
import type { PipelineTelemetry, ProviderId, Rate, SessionUsage, TranscriptTurn } from '@/lib/voice/types'
import { activateVoiceSession, abortVoiceStartupAttempt, closeVoiceSession, refundEmptyVoiceSession, serverVoiceSessionExists } from '@/lib/db/voice-session'
import type { Scorecard } from '@/lib/grade/types'
import type { WarmthTelemetry } from '@/lib/warmth/engine'
import type { RepIncidents } from '@/lib/voice/incidents'
import type { CharacterBreak } from '@/lib/metrics/stability'
import { AUDIO_RETENTION_DAYS } from '@/lib/db/retention'
import { asJson } from '@/lib/db/json'
import { consumeRep, recordTrainingDay, refundRep, syncLevel } from '@/lib/db/progress'
import type { RefusalKind } from '@/lib/data/allowance'
import { adjustDifficulty, recentScoresAtLevel } from '@/lib/db/difficulty'
import { wonFromRep } from '@/lib/data/progression'

export interface SaveResult {
  ok: boolean
  /** Null when ok. A short, honest sentence when not. */
  message: string | null
}

export interface StartResult extends SaveResult {
  sessionId: string | null
  /**
   * Why the rep was refused, when it was.
   *
   * `upgrade` means this account has no voice on its plan at all — a different
   * screen from "you are out for today", not a different wording of it. See
   * `voiceRefusal` in `lib/data/allowance.ts`.
   */
  refusal?: RefusalKind
}

const FAILED: SaveResult = { ok: false, message: 'Not saved — you are signed out.' }

/** How long a rep may be resumed on the quota it already spent. */
const RESUME_WINDOW_MS = 10 * 60 * 1000

/**
 * What `finishSession` tells the caller beyond "it saved".
 *
 * `refunded` is true when the rep recorded no user speech and the daily quota
 * was given back. The result screen reads it to say so rather than reporting a
 * rejection that never happened.
 */
export interface FinishResult extends SaveResult {
  refunded: boolean
}

/**
 * Opened when the transport connects, so a rep that crashes still leaves a row.
 *
 * The ElevenLabs token route has already reserved quota and an owned row;
 * this action activates that row. The older transport spends quota here.
 */
export async function startSession(input: {
  personaSlug: string
  provider: ProviderId
  model: string
  existingSessionId?: string | null
}): Promise<StartResult> {
  const user = await currentUser()
  if (!user) return { ...FAILED, sessionId: null }

  const supabase = await supabaseServer()

  if (input.existingSessionId) {
    const { data: owned } = await supabase.from('sessions').select('id')
      .eq('id', input.existingSessionId).eq('user_id', user.id)
      .eq('persona_slug', input.personaSlug).is('ended_at', null).maybeSingle()
    if (!owned) return { ok: false, sessionId: null, message: 'This rep is no longer available.' }
    const activated = await activateVoiceSession({ userId: user.id, sessionId: owned.id })
    return activated.ok ? { ok: true, message: null, sessionId: owned.id }
      : { ok: false, sessionId: null, message: 'We could not start the rep. Please try again.' }
  }

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

  if (open) {
    try {
      if (await serverVoiceSessionExists({ userId: user.id, sessionId: open.id })) {
        const activated = await activateVoiceSession({ userId: user.id, sessionId: open.id })
        if (!activated.ok) return { ok: false, sessionId: null, message: 'This rep has ended.' }
      }
    } catch { return { ok: false, sessionId: null, message: 'We could not verify this rep. Please try again.' } }
    return { ok: true, message: null, sessionId: open.id }
  }

  const quota = await consumeRep(user.id)
  if (!quota.ok) return { ok: false, message: quota.message, sessionId: null, refusal: quota.refusal ?? 'daily' }

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

/** Idempotent cleanup for a microphone/transport setup that never became a rep. */
export async function abandonSession(input: { sessionId: string; operationId: string }): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return FAILED
  const result = await abortVoiceStartupAttempt({ userId: user.id, ...input })
  return { ok: result.ok, message: result.ok ? null : 'The rep could not be closed.' }
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
  pipeline?: PipelineTelemetry | null
  /** The meter, as it was read at the end of the rep. */
  warmth?: WarmthTelemetry | null
  /**
   * The warmth the ending was DECIDED on, which is not the warmth it ended on.
   *
   * The decision is taken once at the wind-down and cannot change afterwards,
   * so the meter can keep climbing past the threshold on a rep she had already
   * been told to leave. Storing only `final_warmth` left the result screen
   * comparing two numbers that were never compared to each other.
   */
  decisionWarmth?: number
  /**
   * Whether she gave her number.
   *
   * Passed explicitly rather than re-derived, because the number is given the
   * moment warmth crosses and warmth can drift back down in the seconds
   * afterwards. A rep the user watched end in a phone number is a win however
   * the meter finished.
   */
  won?: boolean
  /**
   * What the transport did to this rep.
   *
   * Stored because a transcript is only evidence if you know whether it is what
   * the user heard. A rep where she was cut off on most replies, or where real
   * user turns were deleted as echo, produces a low grade that is not about the
   * user at all — and without this there is no way to tell those two apart
   * after the fact. See lib/voice/incidents.ts.
   */
  incidents?: RepIncidents | null
  /**
   * What the stability meter caught, kept rather than discarded.
   *
   * §05's countermeasure 3 has run in the live rep since the pipeline shipped
   * and thrown its findings away: a break fired a reminder into the model and
   * was never written down, so "she drifts" has only ever been arguable by
   * reading transcripts by hand. Diagnostic, never shown to the user, and
   * deliberately not `pipeline_incidents` — that column is what the TRANSPORT
   * did to a rep and this is what the CHARACTER did.
   */
  characterBreaks?: readonly CharacterBreak[] | null
}): Promise<FinishResult> {
  const user = await currentUser()
  if (!user) return { ...FAILED, refunded: false }

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
      decision_warmth: input.decisionWarmth === undefined ? null : round2(input.decisionWarmth),
      pipeline_incidents: input.incidents ? asJson(input.incidents) : null,
      pipeline_telemetry: input.pipeline ? asJson(input.pipeline) : null,
      // Nullable AND written on a clean rep, for the same reason
      // `pipeline_incidents` is: an empty array and a null mean different
      // things, and "she never broke frame" has to stay distinguishable from
      // "nothing was measured". The first rep after the meter was wired
      // produced no breaks at all and stored a null, which reads identically to
      // every row written before the column existed.
      //
      // Capped at sixty: a rep that breaks on every turn is a bug report, not a
      // record, and the row must not become the biggest thing in the table.
      character_breaks: input.characterBreaks
        ? asJson(input.characterBreaks.slice(0, 60))
        : null,
    })
    .eq('id', input.sessionId)

  if (sessionError) return { ok: false, message: `Not saved — ${sessionError.message}`, refunded: false }

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
    return { ok: false, message: `Transcript not saved — ${transcriptError.message}`, refunded: false }
  }

  let serverMetered: boolean
  try {
    serverMetered = await serverVoiceSessionExists({ userId: user.id, sessionId: input.sessionId })
  } catch {
    // Never substitute a browser estimate when authoritative accounting is
    // temporarily unavailable. The transcript remains saved and grading can run.
    return { ok: false, message: 'Transcript saved; usage confirmation is pending.', refunded: false }
  }
  if (serverMetered) {
    // Provider operations already wrote their own usage. Client telemetry is
    // diagnostic and must not overwrite it or append the old elapsed-time estimate.
    await closeVoiceSession({ userId: user.id, sessionId: input.sessionId })
  } else {
    await appendUsage({ ...input, userId: user.id, seconds })
  }

  // Did this rep hear the user at all?
  //
  // Not `turns.length`, which counts her side too: a session where the
  // character talked into silence for three minutes has turns and is still a
  // rep the user never had. A muted headset, the wrong input device, a
  // permission the browser quietly withheld — all of them land here, and all
  // of them used to be scored as though the user had simply been unappealing.
  const heardUser = input.turns.some((turn) => turn.speaker === 'user' && turn.text.trim().length > 0)

  // A streak built out of failed connections is worth nothing to anybody.
  if (heardUser) await recordTrainingDay(user.id)

  // The quota was spent when the transport connected, before anybody could
  // know that. Give it back rather than charging a free account's only attempt
  // of the day for a rep that produced nothing (§14 meters what was used; this
  // was not used).
  let refunded = false
  if (!heardUser) {
    if (serverMetered) {
      const credit = await refundEmptyVoiceSession({ userId: user.id, sessionId: input.sessionId })
      refunded = credit.ok && credit.refunded === true
    } else {
      const credit = await refundRep(user.id)
      refunded = credit.ok
    }
  }

  revalidateReadPaths()
  return { ok: true, message: null, refunded }
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
  /**
   * The ENGINE level (1-8) this rep was at, for the difficulty offset.
   *
   * Passed rather than looked up: the live rep already holds the persona, and
   * a second round trip to read a number it is holding is a round trip for
   * nothing. Optional so a caller that does not know simply skips the nudge.
   */
  personaLevel?: number
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
    .select('final_warmth, peak_warmth, won, persona_id')
    .eq('id', input.sessionId)
    .maybeSingle()

  await supabase
    .from('sessions')
    .update({
      outcome: card.outcome,
      // **The grade never revises the win, in either direction.** The live rep
      // is the only thing that knows what she was told at the wind-down, so
      // once it has answered, that answer stands — a grader calling the
      // exchange "receptive" afterwards does not hand over a number the meter
      // never earned, and one calling it "neutral" does not take back a number
      // the user watched arrive.
      //
      // The old guard only protected the second of those. It read
      // `won === true ? true : recompute(..., outcome)`, so a stored `false`
      // was recomputed with the grader's outcome in the mix and flipped to
      // true. Falling back only when there is no answer at all is the whole
      // fix; `wonFromRep` no longer takes an outcome either.
      won: session?.won ?? wonFromRep({
        finalWarmth: session?.final_warmth ?? null,
        peakWarmth: session?.peak_warmth ?? null,
      }),
    })
    .eq('id', input.sessionId)

  // Unlocks are derived from wins, so the ladder position is recomputed once
  // the outcome that decides the win is known — never before it.
  await syncLevel(user.id)

  await rememberEncounter({
    userId: user.id,
    personaId: session?.persona_id ?? null,
    line: card.memoryLine,
  })

  await recordBaseline({ sessionId: input.sessionId, composite: card.composite })

  // Adaptive difficulty (§08). Deliberately last, and deliberately ignored:
  // the decision carries an `announce` flag that is false for every downward
  // adjustment, and this path has nothing to show either way. The scorecard
  // reads the flag if it wants to celebrate a bump; a user being eased off is
  // told nothing, by anything, ever (§12).
  await adjustAfterGrade(user.id, input.personaLevel ?? null)

  revalidateReadPaths()
  return { ok: true, message: null }
}

/**
 * What she carries into the next rep (§08).
 *
 * Written in the user's own context rather than with the service role, and
 * that is deliberate: unlike plan, quota and the ladder position, this is not
 * something anybody could pay to change. It is the user's own memory of their
 * own rep, `persona_memory` grants them all four verbs, and the reset in
 * `app/profile/actions.ts` needs the delete.
 *
 * **A dropped line leaves the previous one standing.** The alternative is that
 * one forgettable rep erases the blue book, which is the opposite of
 * continuity — the line is what she still has in mind, not a log of the most
 * recent conversation. Forgetting is something the user asks for, on purpose.
 */
async function rememberEncounter(input: {
  userId: string
  personaId: string | null
  line: string | null
}): Promise<void> {
  // No line, or a character who was never seeded and therefore has no row to
  // key against. Either way there is nothing to write.
  if (!input.line || !input.personaId) return

  try {
    const supabase = await supabaseServer()
    await supabase.from('persona_memory').upsert(
      {
        user_id: input.userId,
        persona_id: input.personaId,
        summary: input.line,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,persona_id' },
    )
  } catch {
    // The rep is graded and stored. Losing the callback line costs one nice
    // moment next time; it must never cost the score that was just written.
  }
}

/**
 * Nudge the dials for the level this rep was at (§08).
 *
 * The upward direction may be announced through the existing modal; the
 * downward one may not, and the shape of `nextDifficulty` is what enforces
 * that rather than a comment asking nicely. Nothing is returned to the caller
 * here at all, so this path cannot leak an ease even by accident.
 */
async function adjustAfterGrade(userId: string, level: number | null): Promise<void> {
  if (level === null) return
  try {
    const recent = await recentScoresAtLevel(userId, level)
    await adjustDifficulty({ userId, level, recent })
  } catch {
    // A rep at the last difficulty is a worse rep, not a broken one.
  }
}

/**
 * The measurement the first rep is framed as (§08).
 *
 * "The very first session is framed as a measurement, not a test. It is re-run
 * at week four and the two are shown side by side." That makes session one
 * valuable in itself and plants a retention hook four weeks deep on day one —
 * and it is currently the cheapest retention mechanism in the spec.
 *
 * **Written exactly once.** The UPDATE is filtered on `baseline_session_id is
 * null`, so the second graded rep writes nothing however the timing falls: a
 * baseline that moves is not a baseline, and the week-four comparison would be
 * measuring against a target that had been quietly walking towards it.
 *
 * The score is denormalised alongside the id on purpose. §16.7 lets a user
 * delete any single rep, and the foreign key is `on delete set null` — losing
 * the first session should cost the side-by-side, not the number.
 */
async function recordBaseline(input: { sessionId: string; composite: number }): Promise<void> {
  const user = await currentUser()
  if (!user) return

  try {
    const supabase = await supabaseServer()
    await supabase
      .from('profiles')
      .update({ baseline_session_id: input.sessionId, baseline_score: input.composite })
      .eq('id', user.id)
      .is('baseline_session_id', null)
  } catch {
    // The rep is graded and stored. A missing baseline costs one comparison
    // four weeks out; it must never cost the score that was just written.
  }
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
