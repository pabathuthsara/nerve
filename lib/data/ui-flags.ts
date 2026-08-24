/**
 * One-time beats, by name (§12).
 *
 * These are the moments the product is allowed to show exactly once ever. The
 * names live here rather than beside the server action that stamps them
 * because a `'use server'` module may only export async functions, and because
 * both the screen that fires a beat and the action that records it have to
 * agree on the string.
 *
 * They are stored in `profiles.ui_flags`, which the user can write. That is
 * deliberate and it is the boundary: a beat is a note about what has been
 * displayed, so the worst a user can do by clearing one is see an explainer
 * twice. Anything that records something *earned* — a level, a field tier, a
 * rejection milestone — goes to `unlocks` instead, which is service-role
 * write (§08, §14).
 */

/** The first time any character ever remembers you. */
export const MEMORY_BEAT_FLAG = 'memory_intro'
