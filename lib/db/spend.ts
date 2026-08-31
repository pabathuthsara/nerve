import 'server-only'

/**
 * The ceiling on the routes that spend money (B9, §14, §18).
 *
 * `requireUser` answers "is this somebody?". It does not answer "should we
 * spend more on them?", and until this existed nothing did: a signed-in user
 * could post transcripts to `/api/grade` in a loop, and a leaked cookie could
 * do it faster. §18's margins assume nobody is trying, which is not a
 * assumption a public URL gets to make.
 *
 * Three gates, in one round trip:
 *
 *   1. **The kill switches.** A project-wide one in the environment, and a
 *      per-account one on `entitlements`. Both are hand-operated: the point of
 *      a kill switch is that a human can stop the bill at three in the morning
 *      without a deploy.
 *   2. **The daily spend cap**, read off the append-only ledger in the user's
 *      own local day — the same boundary the rep quota uses, because a person
 *      whose reps reset at midnight Colombo and whose spend resets at midnight
 *      UTC is living in two different days.
 *   3. **The per-user rate limit**, per route family.
 *
 * One round trip is deliberate rather than clever. `/api/voice/tts` sits on the
 * critical path of every reply she speaks, and three sequential checks would be
 * three hops added to `ttsFirstByteMs`. `spend_allowance` answers all three in
 * a single call and is the only database work any of these routes does to
 * decide.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from './admin'

/**
 * One allowance per route family, never one shared allowance.
 *
 * A runaway grader loop must not be able to eat the budget the live rep needs
 * to keep talking. The failure that shares a bucket is the one where a bug in
 * a screen nobody is looking at silences the character mid-sentence.
 */
export type SpendBucket = 'token' | 'grade' | 'warmth' | 'llm' | 'tts' | 'text' | 'safety'

interface BucketPolicy {
  /** Requests allowed inside the window. */
  limit: number
  windowSeconds: number
}

/**
 * Sized from what a real rep actually does, then given real headroom.
 *
 * A three-minute rep is about fifteen user turns. `/api/warmth/score` fires
 * once per turn (≈5/min), the pipeline routes once per reply, and `/api/grade`
 * exactly once at the end (≈0.3/min). Every limit below is several times the
 * honest rate, because the job here is to bound a runaway, not to police a
 * talkative user — a limit a real session can reach is a limit that will
 * eventually cut somebody off mid-rep, and §05 is clear that nothing may
 * interrupt a live rep.
 */
const POLICY: Record<SpendBucket, BucketPolicy> = {
  // Minting a Realtime credential is the single most expensive thing this
  // product does, and `mayOpenSession` already bounds it to the day's reps.
  // The limit here is not about volume, it is so that the kill switches and the
  // spend cap reach the route at all — a halt that does not stop a rep starting
  // is not a halt.
  token: { limit: 10, windowSeconds: 60 },
  grade: { limit: 10, windowSeconds: 60 },
  warmth: { limit: 40, windowSeconds: 60 },
  llm: { limit: 60, windowSeconds: 60 },
  tts: { limit: 60, windowSeconds: 60 },
  // Text mode (P1). One call per message somebody types, and nobody types
  // faster than this — but it gets its own allowance rather than sharing the
  // live rep's, because the whole point of one bucket per route family is that
  // a loop in the cheap unmetered thing cannot silence the expensive metered
  // one. Text costs no voice minutes and no quota; it still costs tokens.
  text: { limit: 30, windowSeconds: 60 },
  // Moderation (§16.3, B3). The widest bucket in the table, because it is the
  // only route called on BOTH streams: a three-minute rep is ~15 of his turns
  // and ~15 of hers, and the one limit that must never be the thing that
  // silences the safety layer is the safety layer's own.
  //
  // The vendor call behind it is free. The bucket exists so the kill switches
  // reach the route at all — a halt that leaves one endpoint answering is not
  // a halt — and so a stuck client cannot hold a connection open forever.
  safety: { limit: 120, windowSeconds: 60 },
}

/**
 * What one account may spend in its own day, in cents, by plan.
 *
 * A three-minute rep costs ≈20 cents at the ceiling rate in `lib/voice/rates.ts`
 * — and that rate is itself a ceiling only reached when the provider reported no
 * usage at all. So pro (3 reps) lands near 60 and elite (6) near 120, and each
 * cap below is roughly five times its plan's honest day.
 *
 * Five times, deliberately. This is a backstop against a loop, not a second
 * quota: `entitlements.reps_per_day` is the quota and it is the thing a user is
 * told about. If anybody ever trips one of these numbers in normal use, the bug
 * is upstream and the cap is the alarm, which is why the reason is distinct
 * from the rate limit's in the response.
 *
 * **Free's cap did not follow free's quota to zero, and must not.** A free
 * account grants no reps a day, but it still runs the one sign-up rep, and text
 * mode, moderation and grading all spend on a plan that buys no voice at all.
 * A cap of zero would halt the account the first time it typed a message. The
 * ceiling stays where it was: five times a single rep, which comfortably covers
 * the one voice rep a free account ever runs plus an evening of text.
 */
const DAILY_CAP_CENTS: Record<string, number> = {
  free: 100,
  pro: 300,
  elite: 600,
}

/** The cap for an unknown or missing plan. Free's, because it is the lowest. */
const DEFAULT_CAP_CENTS = DAILY_CAP_CENTS.free ?? 100

/**
 * The project-wide kill switch.
 *
 * An environment variable rather than a row, so that stopping the bill is a
 * dashboard toggle and a redeploy rather than a database migration — and so it
 * still works when the reason for stopping is that the database is the problem.
 */
function projectHalted(): boolean {
  const flag = process.env.NERVE_SPEND_HALT?.trim().toLowerCase()
  return flag === '1' || flag === 'true'
}

/**
 * A union rather than an object with an optional field, so that reaching for
 * `response` without having checked `ok` does not compile — the same shape
 * `requireUser` uses, for the same reason.
 */
export type SpendDecision = { ok: true } | { ok: false; response: Response }

/**
 * The same verdict, before it is dressed as an HTTP response.
 *
 * Server Actions need this shape: they return `{ ok, message }` rather than
 * throwing (a thrown Server Action error reaches the client as an opaque
 * digest), so handing one a `Response` to unpack would mean serialising a
 * refusal only to parse it back. `maySpend` is this plus the wrapper.
 */
export type SpendVerdict =
  | { ok: true }
  | { ok: false; status: number; message: string; retryAfter?: number }

/**
 * May this caller spend on this route, right now?
 *
 * Returns a union rather than throwing, the same shape and for the same reason
 * as `requireUser`: `if (!allowed.ok) return allowed.response` reads as a guard,
 * and a handler that forgets to stop does not compile.
 *
 * **Fails OPEN on an unreachable database, and that is the considered choice.**
 * If the allowance cannot be read, the alternative is refusing every paid route
 * in the product because a counter is unavailable — which converts a database
 * blip into a total outage, and which would end live reps mid-sentence. The
 * exposure is bounded by everything else that is still standing: the session
 * check, the rep quota at `/api/voice/token`, and the two kill switches, of
 * which the project-wide one needs no database at all and is checked first.
 */
export async function maySpend(
  userId: string,
  bucket: SpendBucket,
): Promise<SpendDecision> {
  const verdict = await spendVerdict(userId, bucket)
  if (verdict.ok) return { ok: true }
  const headers = verdict.status === 429 && verdict.retryAfter
    ? { 'Retry-After': String(verdict.retryAfter) }
    : undefined
  return {
    ok: false,
    response: NextResponse.json(
      { error: verdict.message },
      { status: verdict.status, ...(headers ? { headers } : {}) },
    ),
  }
}

/** The decision itself. See `SpendVerdict`. */
export async function spendVerdict(
  userId: string,
  bucket: SpendBucket,
): Promise<SpendVerdict> {
  // Internal callers are the calibration harnesses, which drive the deployed
  // routes on purpose so they measure the route rather than a re-implementation
  // of it. They authenticate with `INTERNAL_API_SECRET`, which is not set in
  // production, so this is not a hole a request can open for itself.
  if (userId === 'internal') return { ok: true }

  if (projectHalted()) {
    return {
      ok: false,
      status: 503,
      message: 'Training is paused right now. Nothing is wrong with your account.',
    }
  }

  const policy = POLICY[bucket]
  const admin = supabaseAdmin()

  const { data: entitlement } = await admin
    .from('entitlements')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle()

  const cap = DAILY_CAP_CENTS[entitlement?.plan ?? 'free'] ?? DEFAULT_CAP_CENTS

  const { data, error } = await admin.rpc('spend_allowance', {
    p_user_id: userId,
    p_bucket: bucket,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
    p_cap_cents: cap,
  })

  // See the note above: an unreadable allowance must not take the product down.
  if (error) return { ok: true }

  const verdict = Array.isArray(data) ? data[0] : data
  if (!verdict || verdict.allowed) return { ok: true }

  if (verdict.reason === 'halted') {
    return {
      ok: false,
      status: 503,
      message: 'This account is paused. Get in touch and we will sort it out.',
    }
  }

  if (verdict.reason === 'cap') {
    return {
      ok: false,
      status: 429,
      message: 'You have hit today’s limit. It resets at midnight your time.',
    }
  }

  return {
    ok: false,
    status: 429,
    message: 'Too fast. Give it a moment.',
    retryAfter: Math.max(1, Math.round(verdict.retry_after ?? 1)),
  }
}

/** Exported for the tests and the harness, so the numbers have one home. */
export const SPEND_POLICY = { POLICY, DAILY_CAP_CENTS, DEFAULT_CAP_CENTS } as const
