/**
 * What a tier is, in the words that persuade somebody to want it.
 *
 * This used to live inside `components/modals.tsx`, shown only by
 * `LevelUnlockedSheet` — which fires **after** the tier opens, at the exact
 * moment the copy has stopped being persuasive. RETENTION-AUDIT R9: the bodies
 * for levels 3 and 4 are the best writing in the codebase and the roster was
 * hiding them behind a chevron, so curiosity — the actual pull up the ladder —
 * was the thing being collapsed.
 *
 * One record, two readers: the unlock sheet reads it as a reward, and the
 * roster's locked section reads it as an argument. They must not drift, because
 * a tier that promises one thing before and another after is a tier the user
 * stops believing.
 *
 * Level 02's entry was `Open from the start.` and never rendered. It has real
 * copy now, because tier 2 is a rung (see `FIRST_UNLOCK_REPS`).
 */

import type { FieldTier, Level } from './types'

export interface UnlockCopy {
  title: string
  /** Why this tier is harder, and why anybody would want it. */
  body: string
  /** Who is standing there. Empty when the tier is not a roster tier. */
  names: string[]
  action: string
}

export const LEVEL_COPY: Record<Level, UnlockCopy> = {
  1: {
    title: 'Level 01',
    body: 'Tess is glad somebody spoke to her, and she will carry the conversation if you let her. Everybody starts here.',
    names: ['Tess'],
    action: 'See the roster',
  },
  2: {
    title: 'Level 02 unlocked',
    body: 'Nadia will meet you halfway and no further. She answers warmly, she gives you something to work with every time, and she stops expecting you to do something with it. This is the level where the second question starts to matter more than the first.',
    names: ['Nadia'],
    action: 'See her',
  },
  3: {
    title: 'Level 03 unlocked',
    body: 'Maya came to the coffee shop on her own and meant it. She will answer what you ask and then stop, and the pause after that is yours to fill. This is the level where a strong opening followed by nothing stops being good enough.',
    names: ['Maya'],
    action: 'See her',
  },
  4: {
    title: 'Level 04 unlocked',
    body: 'The last one. Robin is polite the whole way through and never says anything cutting, and that is the hard part — the work is deciding whether this is a no while she is still being perfectly nice about it. The warmth number is gone from here. You read her, or you guess.',
    names: ['Robin'],
    action: 'See her',
  },
}

/** Field tiers (§09). T1 is day one and never fires. */
export const FIELD_TIER_COPY: Record<FieldTier, UnlockCopy> = {
  1: { title: 'Tier 1 unlocked', body: 'Open from the start.', names: [], action: 'See the field' },
  2: {
    title: 'Tier 2 unlocked',
    body: 'Low stakes, outside the app. Asking for a discount, a free refill, something that is not on the menu. No social risk at all — the only thing at stake is hearing the word no out loud.',
    names: [],
    action: 'See today’s',
  },
  3: {
    title: 'Tier 3 unlocked',
    body: 'Real interaction now, and still nothing romantic. Complimenting a stranger and walking on, asking to join a table. The worst realistic outcome is still a polite no.',
    names: [],
    action: 'See today’s',
  },
  4: {
    title: 'Tier 4 unlocked',
    body: 'The real thing. Asking for a name, a number, someone out with a specific plan. Everything you have been practising, with nobody grading it but you.',
    names: [],
    action: 'See today’s',
  },
}
