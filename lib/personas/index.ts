/**
 * The roster. Eight characters, one per level (§06).
 *
 * A persona is a config record, not code — these are seeded into `personas`
 * by `npm run db:seed`. The registry stays the source: it is what is tuned and
 * tested, and both the token route and the live page read it, so they cannot
 * disagree about who the user is talking to.
 *
 * Nadia and Alex were authored first and are the two ends of the ladder:
 * between them they exercise every clamp, gate and asymmetry in the engine.
 * The six rungs between them were authored against the §06 table — receptivity,
 * effort, distraction and signal clarity per level — and each one trains a
 * named skill rather than simply being harder than the last.
 */

import type { Persona } from '@/lib/voice/types'
import { nadia } from './nadia'
import { priya } from './priya'
import { maya } from './maya'
import { jules } from './jules'
import { erin } from './erin'
import { sam } from './sam'
import { robin } from './robin'
import { alex } from './alex'

export const PERSONAS: Record<string, Persona> = {
  [nadia.slug]: nadia,
  [priya.slug]: priya,
  [maya.slug]: maya,
  [jules.slug]: jules,
  [erin.slug]: erin,
  [sam.slug]: sam,
  [robin.slug]: robin,
  [alex.slug]: alex,
}

export function getPersona(slug: string): Persona | null {
  return PERSONAS[slug] ?? null
}

export const PERSONA_SLUGS: readonly string[] = Object.keys(PERSONAS)

export { nadia, priya, maya, jules, erin, sam, robin, alex }
