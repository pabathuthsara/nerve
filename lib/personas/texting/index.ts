/**
 * The texting roster.
 *
 * A SEPARATE ROSTER, and the reason is the dials rather than the fiction
 * (`TEXTING-PLAN.md` §2.1). Every dating persona's `trajectory` was authored
 * and tuned against roughly fifteen user turns inside three minutes. A thread
 * runs twenty to forty with no clock at all, so reusing those numbers means
 * either she sprints to her ceiling in five minutes or somebody retunes nine
 * Tier 0 persona files for a texting reason — which rule 19 forbids.
 *
 * The same argument reaches four more fields: `exitConditions` are authored
 * around a physical scene somebody can walk out of, `sceneBeats` are timed
 * against a three-minute rep, `moods` are an afternoon, and `room` is an
 * acoustic lookup this track never performs.
 *
 * ── THE LADDER ───────────────────────────────────────────────────────────
 *
 *   1  Immy   sending the first message. Warm, fast, nearly unfailable.
 *   2  Noor   not interviewing her. She gives back exactly what she is given.
 *   3  Cleo   reading the delay. Distracted; she slows down before she shortens.
 *   4  Wren   reading a withdrawal that is never announced. Polite to the end,
 *             and `hardCeiling: 58` means she cannot be won all the way.
 *
 * Each rung trains one thing the rung below it did not, and the fourth is the
 * one the presence layer exists for.
 *
 * Authored in the repo and seeded, never generated at runtime (rule 10).
 */

import type { Persona } from '@/lib/voice/types'
import { immy } from './immy'
import { noor } from './noor'
import { cleo } from './cleo'
import { wren } from './wren'

export { immy, noor, cleo, wren }

/** In ladder order, which is also the order they are offered. */
export const TEXTING_PERSONAS: Record<string, Persona> = {
  immy,
  noor,
  cleo,
  wren,
}

export const TEXTING_SLUGS: readonly string[] = Object.keys(TEXTING_PERSONAS)

/** In ladder order. */
export const TEXTING_ROSTER: readonly Persona[] = Object.values(TEXTING_PERSONAS)

export function getTextingPersona(slug: string): Persona | null {
  return TEXTING_PERSONAS[slug] ?? null
}
