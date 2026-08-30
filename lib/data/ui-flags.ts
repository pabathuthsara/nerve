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

/**
 * Interest in a paid plan, recorded before there is anything to sell.
 *
 * Billing is not built (§14 picks the merchant of record; nothing is wired to
 * it yet), and an Upgrade button that does nothing at all is the worst thing
 * to put on the one screen where a user is deciding whether to trust you with
 * money. This records the ask instead, which is the honest version and is also
 * the only demand signal available before launch.
 */
export const planWaitlistFlag = (plan: 'pro' | 'elite') => `waitlist:${plan}` as const

/**
 * A library card this person has read.
 *
 * A flag rather than a table because it is exactly what this column is for: a
 * note about what has been displayed, worth nothing to anybody, and the worst
 * a user can do by clearing it is see an unread mark on something they have
 * read. Fourteen cards is fourteen keys in one jsonb blob, which is cheaper
 * than a migration and cheaper than a round trip per card.
 */
export const LIBRARY_READ_PREFIX = 'library:'
export const libraryReadFlag = (slug: string) => `${LIBRARY_READ_PREFIX}${slug}` as const

/**
 * A track somebody asked for before it existed.
 *
 * The onboarding track step offers interview training, which is M4 by §17's
 * own ordering. It used to answer that ask with a screen reading "Demand
 * recorded" over a `setTimeout` and nothing else — a sentence about a write
 * that was never made, on the one screen in the product that could tell us
 * whether the track is worth building.
 *
 * Same shape and same argument as `planWaitlistFlag`: a flag rather than a
 * table, because the ask is worth counting and is worth nothing to a user who
 * clears it. Countable with one `ui_flags ? 'waitlist:track:interview'` when
 * M4 is scheduled.
 */
export const trackWaitlistFlag = (track: 'interview' | 'english') => `waitlist:track:${track}` as const
