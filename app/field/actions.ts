'use server'

/**
 * The field loop (§09).
 *
 * One challenge a day, accepted with a prediction before you go, logged with
 * what it actually felt like afterwards. The two numbers are the point: over
 * time, actual sits below predicted, and watching your own data prove that is
 * more persuasive than any amount of encouragement.
 *
 * Three rules the code has to hold up, not just the copy:
 *
 * 1. **The prediction is taken before.** `anxiety_pre` is written by the
 *    accept, and the update is filtered on `status = 'pending'` so it cannot
 *    be revised once you know how it went.
 * 2. **The log cannot be rewritten.** `field_logs` grants insert, select and
 *    delete and no update, to anybody. A number you can edit afterwards is not
 *    evidence.
 * 3. **Streaks run on asks made** (§09). Logging honestly that you could not
 *    do it keeps the challenge on your list; it does not extend the streak.
 *    A rep does, which is why the field carries the day when voice minutes are
 *    gone (§14).
 *
 * Like every other write in this app, each returns a result rather than
 * throwing — a Server Action error reaches the client as an opaque digest.
 */

import { revalidatePath } from 'next/cache'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { recordTrainingDay } from '@/lib/db/progress'
import { localDay } from '@/lib/data/day'
import { chooseChallenge, unlockedTier } from '@/lib/field/assignment'
import type { FieldAssignment, FieldChallenge, FieldOutcome, FieldStatus } from '@/lib/data/types'

export interface FieldResult {
  ok: boolean
  message: string | null
  assignment: FieldAssignment | null
}

const SIGNED_OUT: FieldResult = {
  ok: false,
  message: 'Not saved — you are signed out.',
  assignment: null,
}

/** How far back a challenge counts as already done. */
const REPEAT_WINDOW_DAYS = 30

const CHALLENGE_COLUMNS = 'id, slug, tier, title, brief, done_when, safety_note, setting'

interface ChallengeRow {
  id: string
  slug: string
  tier: number
  title: string
  brief: string
  done_when: string
  safety_note: string | null
  setting: string
}

function toChallenge(row: ChallengeRow): FieldChallenge {
  return {
    id: row.id,
    slug: row.slug,
    tier: Math.min(4, Math.max(1, row.tier)) as FieldChallenge['tier'],
    title: row.title,
    brief: row.brief,
    doneWhen: row.done_when,
    safetyNote: row.safety_note,
    setting: row.setting,
  }
}

function toAssignment(row: {
  id: string
  assigned_on: string
  status: string
  anxiety_pre: number | null
}, challenge: FieldChallenge): FieldAssignment {
  return {
    id: row.id,
    challenge,
    assignedOn: row.assigned_on,
    status: row.status as FieldStatus,
    anxietyPre: row.anxiety_pre,
  }
}

/**
 * Today's challenge, creating it if this is the first look of the day.
 *
 * Idempotent, and deterministic underneath: the pick is seeded from the user
 * and the local day, so a refresh, a second device and a race between two tabs
 * all land on the same challenge. The unique index does the rest.
 */
export async function assignToday(): Promise<FieldResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, current_level')
    .eq('id', user.id)
    .maybeSingle()

  const today = localDay(new Date(), profile?.timezone ?? null)

  const existing = await liveAssignment(supabase, user.id, today)
  if (existing) return { ok: true, message: null, assignment: existing }

  return createAssignment({ supabase, userId: user.id, today, level: profile?.current_level ?? 1 })
}

async function liveAssignment(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  today: string,
): Promise<FieldAssignment | null> {
  const { data } = await supabase
    .from('field_assignments')
    .select(`id, assigned_on, status, anxiety_pre, field_challenges (${CHALLENGE_COLUMNS})`)
    .eq('user_id', userId)
    .eq('assigned_on', today)
    .neq('status', 'swapped')
    .maybeSingle()

  // A to-one embed: the foreign key lives on the assignment, so PostgREST
  // returns an object here rather than an array. Verified against the API.
  const challenge = data?.field_challenges as ChallengeRow | null | undefined
  if (!data || !challenge) return null
  return toAssignment(data, toChallenge(challenge))
}

async function createAssignment(input: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>
  userId: string
  today: string
  level: number
  attempt?: number
}): Promise<FieldResult> {
  const { supabase, userId, today, level } = input
  const tier = unlockedTier(level)

  const [{ data: challenges }, { data: recent }] = await Promise.all([
    supabase.from('field_challenges').select(CHALLENGE_COLUMNS).eq('published', true),
    supabase
      .from('field_logs')
      .select('challenge_id')
      .eq('user_id', userId)
      .gte('logged_on', shiftDays(today, -REPEAT_WINDOW_DAYS)),
  ])

  const rows = (challenges ?? []) as ChallengeRow[]
  const chosen = chooseChallenge({
    challenges: rows.map((row) => ({ id: row.id, tier: row.tier })),
    tier,
    recentIds: (recent ?? []).map((row) => row.challenge_id).filter((id): id is string => id !== null),
    seed: `${userId}:${today}`,
    ...(input.attempt === undefined ? {} : { attempt: input.attempt }),
  })

  const row = rows.find((candidate) => candidate.id === chosen?.id)
  if (!row) {
    return { ok: false, message: 'No challenge is available for you today.', assignment: null }
  }

  const { data, error } = await supabase
    .from('field_assignments')
    .insert({ user_id: userId, challenge_id: row.id, assigned_on: today })
    .select('id, assigned_on, status, anxiety_pre')
    .single()

  if (error) {
    // Another tab got there first. The pick is deterministic, so whatever
    // landed is the same challenge this one would have chosen.
    const raced = await liveAssignment(supabase, userId, today)
    if (raced) return { ok: true, message: null, assignment: raced }
    return { ok: false, message: `Not assigned — ${error.message}`, assignment: null }
  }

  revalidatePath('/field')
  revalidatePath('/train')
  return { ok: true, message: null, assignment: toAssignment(data, toChallenge(row)) }
}

/** `YYYY-MM-DD`, shifted. Used for the repeat window. */
function shiftDays(day: string, delta: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, date + delta))
  return shifted.toISOString().slice(0, 10)
}

/**
 * Accepting captures the prediction.
 *
 * The filter on `status = 'pending'` is the enforcement: a second call, or one
 * arriving after the ask has happened, updates nothing. Predicting how hard
 * something was going to be after doing it is not a prediction.
 */
export async function acceptChallenge(assignmentId: string, anxietyPre: number): Promise<FieldResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const value = Math.round(anxietyPre)
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    return { ok: false, message: 'That number is outside the scale.', assignment: null }
  }

  const supabase = await supabaseServer()
  const { error } = await supabase
    .from('field_assignments')
    .update({ status: 'accepted', anxiety_pre: value, accepted_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .eq('user_id', user.id)
    .eq('status', 'pending')

  if (error) return { ok: false, message: `Not saved — ${error.message}`, assignment: null }

  revalidatePath('/field')
  revalidatePath('/train')
  return { ok: true, message: null, assignment: null }
}

/**
 * Swapping retires today's row and deals another.
 *
 * The partial unique index only counts rows that are not `swapped`, so this
 * is a legal second assignment for the same day rather than a hole in the
 * constraint. The pick walks the pool, so swapping three times gives three
 * different challenges instead of three rolls of the same die.
 */
export async function swapChallenge(assignmentId: string): Promise<FieldResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, current_level')
    .eq('id', user.id)
    .maybeSingle()

  const today = localDay(new Date(), profile?.timezone ?? null)

  const { error } = await supabase
    .from('field_assignments')
    .update({ status: 'swapped', resolved_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .eq('user_id', user.id)
    .in('status', ['pending', 'accepted'])

  if (error) return { ok: false, message: `Not swapped — ${error.message}`, assignment: null }

  const { count } = await supabase
    .from('field_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('assigned_on', today)
    .eq('status', 'swapped')

  return createAssignment({
    supabase,
    userId: user.id,
    today,
    level: profile?.current_level ?? 1,
    attempt: count ?? 1,
  })
}

/**
 * The log. One row per ask, and the day is over.
 *
 * `asked` is what the streak reads, and it is deliberately separate from the
 * outcome: being turned down is an ask, and so is a yes. Only "I could not do
 * it" is not.
 */
export async function logAsk(input: {
  assignmentId: string
  asked: boolean
  outcome: FieldOutcome
  anxietyPost?: number | null
  note?: string | null
}): Promise<FieldResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { data: assignment } = await supabase
    .from('field_assignments')
    .select(`id, assigned_on, anxiety_pre, field_challenges (${CHALLENGE_COLUMNS})`)
    .eq('id', input.assignmentId)
    .eq('user_id', user.id)
    .maybeSingle()

  const challenge = assignment?.field_challenges as ChallengeRow | null | undefined
  if (!assignment || !challenge) {
    return { ok: false, message: 'That challenge is no longer on your list.', assignment: null }
  }

  const post = typeof input.anxietyPost === 'number'
    ? Math.min(10, Math.max(0, Math.round(input.anxietyPost)))
    : null

  const { error } = await supabase.from('field_logs').insert({
    user_id: user.id,
    assignment_id: assignment.id,
    challenge_id: challenge.id,
    // Denormalised so the log stays readable after a challenge is retired.
    challenge_title: challenge.title,
    tier: challenge.tier,
    asked: input.asked,
    outcome: input.outcome,
    anxiety_pre: assignment.anxiety_pre,
    anxiety_post: post,
    note: input.note?.trim() || null,
    logged_on: assignment.assigned_on,
  })

  if (error) return { ok: false, message: `Not logged — ${error.message}`, assignment: null }

  await supabase
    .from('field_assignments')
    .update({ status: input.asked ? 'done' : 'skipped', resolved_at: new Date().toISOString() })
    .eq('id', assignment.id)
    .eq('user_id', user.id)

  // §09: streaks run on asks made, never on asks accepted — and never on an
  // ask that did not happen. Honesty keeps the challenge; it does not keep
  // the streak.
  if (input.asked) await recordTrainingDay(user.id)

  revalidatePath('/field')
  revalidatePath('/train')
  revalidatePath('/profile')
  return { ok: true, message: null, assignment: null }
}
