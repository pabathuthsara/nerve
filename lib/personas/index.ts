/**
 * The roster. Eight characters at MVP (§06); one at M0.
 *
 * A persona is a config record, not code — these become database rows at M1.
 * Until then this registry is the single source, read by both the token route
 * and the rep page so they cannot disagree about who the user is talking to.
 */

import type { Persona } from '@/lib/voice/types'
import { nadia } from './nadia'

export const PERSONAS: Record<string, Persona> = {
  [nadia.id]: nadia,
}

export function getPersona(id: string): Persona | null {
  return PERSONAS[id] ?? null
}

export { nadia }
