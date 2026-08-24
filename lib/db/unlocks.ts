import 'server-only'

/**
 * Recording a moment, and marking it shown. Service role, all of it.
 *
 * `unlocks` grants its owner SELECT and nothing else, for the same reason the
 * ladder position does (§08, §14): a moment the user can write is a moment that
 * has stopped being a record of anything they did. What is unlocked stays
 * DERIVED from history; this table answers only *when did we first tell them*.
 *
 * The once-ever guarantee is two constraints doing one job. `(user_id, kind,
 * ref)` is unique, so the row for a given moment can only ever exist once
 * however many times the write is retried. `announced_at` starts null and is
 * stamped when the sheet has actually been seen, so a user who earns something
 * and closes the tab before it renders still gets it next time — and never
 * gets it twice.
 *
 * Four kinds share this: `level` (a roster tier), `tier` (a field tier),
 * `milestone` (rejections collected) and `persona`/`technique`, which nothing
 * writes yet. One implementation rather than one per kind, because "fires
 * exactly once, ever" is the part that is easy to get subtly wrong.
 *
 * Nothing here throws. A moment lost to a failed write is a moment missed; an
 * exception would take the rep's own writes with it.
 */

import { supabaseAdmin } from './admin'
import { milestoneRef, milestonesCrossed, type Milestone } from '@/lib/field/milestones'

/** The kinds this module writes. `persona` and `technique` exist unused. */
export type UnlockKind = 'level' | 'tier' | 'milestone'

export interface UnlockEntry {
  kind: UnlockKind
  ref: string
}

/**
 * Records moments that have been earned, without announcing them.
 *
 * Idempotent by the unique constraint: already recorded is the expected case
 * on every rep after the first, not a failure.
 */
export async function recordUnlocks(userId: string, entries: readonly UnlockEntry[]): Promise<void> {
  if (entries.length === 0) return
  try {
    await supabaseAdmin()
      .from('unlocks')
      .upsert(
        entries.map((entry) => ({ user_id: userId, kind: entry.kind, ref: entry.ref })),
        { onConflict: 'user_id,kind,ref', ignoreDuplicates: true },
      )
  } catch {
    // Missing the row costs the celebration, never the progression — what is
    // unlocked is derived from history and does not depend on this landing.
  }
}

/**
 * Stamps a moment as shown.
 *
 * Filtered on `announced_at is null`, so a second call writes nothing and the
 * timestamp stays the moment the user actually saw it — which is the only
 * reason the column is worth having later.
 */
export async function announceUnlock(userId: string, kind: UnlockKind, ref: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from('unlocks')
      .update({ announced_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('ref', ref)
      .is('announced_at', null)
  } catch {
    // Missing the stamp shows it once more, which is recoverable. Losing the
    // rep's own writes is not, and that is why nothing here throws.
  }
}

/**
 * Records every rejection milestone crossed by this ask (§09).
 *
 * Returns them so the caller can show the sheet immediately rather than
 * waiting for the next read — but the row is what makes it fire, not the
 * return value.
 */
export async function recordRejectionMilestones(
  userId: string,
  before: number,
  after: number,
): Promise<Milestone[]> {
  const crossed = milestonesCrossed(before, after)
  if (crossed.length === 0) return []
  await recordUnlocks(userId, crossed.map((milestone) => ({
    kind: 'milestone' as const,
    ref: milestoneRef(milestone.at),
  })))
  return crossed
}

/** Kept for the field flow, which speaks in milestones rather than in kinds. */
export async function announceMilestone(userId: string, ref: string): Promise<void> {
  await announceUnlock(userId, 'milestone', ref)
}
