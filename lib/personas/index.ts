/**
 * The roster. Three characters, one per rung (§06, and the drift note below).
 *
 * A persona is a config record, not code — these are seeded into `personas`
 * by `npm run db:seed`. The registry stays the source: it is what is tuned and
 * tested, and both the token route and the live page read it, so they cannot
 * disagree about who the user is talking to.
 *
 * ── WHY THREE AND NOT EIGHT ──────────────────────────────────────────────
 *
 * §06 authors eight rungs and this file used to ship all eight. Eight thin
 * characters is worse than three that hold up, and the persona contracts are
 * the one part of this product that can only be fixed by running reps against
 * them: everything else — schema, RLS, grading, the field loop — is verifiable
 * at a desk. Eight characters is eight tuning surfaces and eight sets of
 * golden transcripts; §17's calibration gate is twenty transcripts total, which
 * across eight characters is two or three each and proves nothing per
 * character.
 *
 * The five below are RETIRED, not deleted. They stay authored, reviewed and
 * importable, because retiring a character is a roster decision and deleting
 * one throws away tuning work that is expensive to redo. `alex` in particular
 * is still what exercises every clamp in the warmth engine — she is imported
 * by `engine.test.ts` directly and must stay that way.
 *
 * Recorded as drift in `LAUNCH-GAP.md` §4, per the rule that the build is
 * measured against the spec rather than the spec quietly rewritten.
 *
 * ── THE RUNGS ────────────────────────────────────────────────────────────
 *
 *   1  Nadia   bookshop      nearly impossible to fail
 *   2  Maya    coffee shop   not running dry at ninety seconds
 *   4  Robin   hotel lobby   reading whether a no is a no
 *
 * The gap at 3 is deliberate. A level's difficulty curve IS the trajectory of
 * the character holding it (`lib/warmth/levels.ts`), so the three rungs above
 * are the three authored curves, and an unheld rung falls back to its nearest
 * neighbour rather than to an interpolation nobody designed. Robin sits at 4
 * and not at 3 because §12 takes the warmth digits off the screen from level 4
 * — the top rung is where the user should be reading a person rather than a
 * meter, and that is precisely the skill she trains.
 */

import type { Persona } from '@/lib/voice/types'
import { nadia } from './nadia'
import { maya } from './maya'
import { robin } from './robin'
import { priya } from './priya'
import { jules } from './jules'
import { erin } from './erin'
import { sam } from './sam'
import { alex } from './alex'

/** The shipped roster. Seeded, listed, and reachable by a rep. */
export const PERSONAS: Record<string, Persona> = {
  [nadia.slug]: nadia,
  [maya.slug]: maya,
  [robin.slug]: robin,
}

/**
 * Authored, kept, and not shipped.
 *
 * Deliberately NOT merged into `PERSONAS`: `getPersona` is what the token route
 * and the live page resolve against, so a slug that is only in here cannot be
 * started as a rep by typing a URL. History is unaffected — `sessions` stores
 * `persona_slug` denormalised for exactly this case, and the database rows stay
 * present and unpublished rather than being removed.
 *
 * Their trajectories are the record of eight rungs of tuning. Two of them are
 * in service right now: Maya carries the rung-2 curve and Robin the rung-4 one.
 */
export const RETIRED_PERSONAS: Record<string, Persona> = {
  [priya.slug]: priya,
  [jules.slug]: jules,
  [erin.slug]: erin,
  [sam.slug]: sam,
  [alex.slug]: alex,
}

/** Resolves a shipped character only. A retired slug is not a rep you can run. */
export function getPersona(slug: string): Persona | null {
  return PERSONAS[slug] ?? null
}

/**
 * Resolves a character whether or not she is shipped.
 *
 * For the paths that are about the past rather than the present — reading an
 * old transcript, rendering a history row — where refusing to name a character
 * the user actually talked to would be a bug rather than a guard.
 */
export function getPersonaEverAuthored(slug: string): Persona | null {
  return PERSONAS[slug] ?? RETIRED_PERSONAS[slug] ?? null
}

export const PERSONA_SLUGS: readonly string[] = Object.keys(PERSONAS)

export { nadia, maya, robin, priya, jules, erin, sam, alex }
