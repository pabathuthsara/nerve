import 'server-only'

/**
 * Reading and writing the per-user difficulty offset (§08).
 *
 * Service-role write, read-only to its owner — the same argument as the ladder
 * position, and the strongest case for it in the product: turning your own
 * difficulty down is precisely the thing that would make every score after it
 * meaningless (§14).
 *
 * **Nothing here returns anything the UI could announce on the way down.** The
 * decision is made by `nextDifficulty`, which carries `announce` and sets it
 * false for every ease by construction; this module only persists the result.
 */

import { supabaseAdmin } from './admin'
import { NO_OFFSET, nextDifficulty, type DifficultyChange, type DifficultyOffset } from '@/lib/data/difficulty'

/** The offset in force for one user on one engine level. */
export async function readOffset(userId: string, level: number): Promise<DifficultyOffset> {
  try {
    const { data } = await supabaseAdmin()
      .from('difficulty_offsets')
      .select('start_bonus, gain_bonus')
      .eq('user_id', userId)
      .eq('level', level)
      .maybeSingle()

    if (!data) return NO_OFFSET
    return { startBonus: Number(data.start_bonus), gainBonus: Number(data.gain_bonus) }
  } catch {
    // An unreadable offset is a rep at the authored difficulty, which is
    // exactly what a first rep is. Never a reason to fail to open one.
    return NO_OFFSET
  }
}

/**
 * Recompute the offset after a graded rep, and store it if it moved.
 *
 * Returns the decision so the caller can announce an upward bump through the
 * existing modal — and only an upward one. `announce` is false for every ease.
 *
 * Scores are the composites of the recent reps at THIS level, newest first;
 * two of them have to agree before anything moves.
 */
export async function adjustDifficulty(input: {
  userId: string
  level: number
  recent: readonly number[]
}): Promise<DifficultyChange> {
  const current = await readOffset(input.userId, input.level)
  const change = nextDifficulty({ recent: input.recent, current })
  if (change.direction === 'hold') return change

  try {
    await supabaseAdmin()
      .from('difficulty_offsets')
      .upsert({
        user_id: input.userId,
        level: input.level,
        start_bonus: change.offset.startBonus,
        gain_bonus: change.offset.gainBonus,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,level' })
  } catch {
    // A lost adjustment means the next rep is as hard as the last one. That is
    // a worse rep, not a broken one, and the grade it followed is already
    // stored — nothing here is worth failing that for.
    return { direction: 'hold', offset: current, announce: false }
  }

  return change
}

/**
 * The recent composites at one level, newest first.
 *
 * Ungraded reps are excluded rather than counted as zero: a rep whose grade
 * never landed says nothing about how hard she should be next time, and
 * treating it as a failure would ease difficulty for a network error.
 */
export async function recentScoresAtLevel(userId: string, level: number, limit = 2): Promise<number[]> {
  try {
    const admin = supabaseAdmin()
    const [{ data: personas }, { data: sessions }] = await Promise.all([
      admin.from('personas').select('slug, level').eq('level', level),
      admin
        .from('sessions')
        .select('id, persona_slug, started_at')
        .eq('user_id', userId)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(40),
    ])

    const slugs = new Set((personas ?? []).map((row) => row.slug))
    const atLevel = (sessions ?? []).filter((row) => slugs.has(row.persona_slug))
    if (atLevel.length === 0) return []

    const { data: scores } = await admin
      .from('scores')
      .select('session_id, composite')
      .in('session_id', atLevel.map((row) => row.id))

    const byId = new Map((scores ?? []).map((row) => [row.session_id, row.composite]))
    return atLevel
      .map((row) => byId.get(row.id))
      .filter((composite): composite is number => typeof composite === 'number')
      .slice(0, limit)
  } catch {
    return []
  }
}
