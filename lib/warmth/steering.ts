/**
 * The steering item — one line, injected before every reply.
 *
 * Round 10 composes it from all four persona layers instead of the band alone:
 *
 *   TRAJECTORY   arrives as the warmth band. Difficulty is never stated.
 *   PERSONALITY  how this band sounds coming from THIS character.
 *   GATED        what she has earned the right to do at this warmth.
 *   ROOM         implicit; the contract already put her in it.
 *
 * Two constraints shape everything here.
 *
 * **It must stay short.** This is appended on every user turn and re-charged as
 * context on every turn after that. The character contract is the cached prefix
 * and must stay byte-identical, so this is appended as a conversation item and
 * never written into the system prompt — round 5 rewrote instructions
 * mid-session and paid 2.9x for the next response.
 *
 * **Only one system may own reply length.** The band owns it. Nothing derived
 * from personality is allowed to mention length or question rate, which is why
 * `talkativeness` — the one personality dial that is about verbosity — is
 * deliberately absent from this file and lives in the contract instead. Round 6
 * had both, the two sets of numbers fought, and she obeyed neither.
 */

import {
  effectiveSharpness,
  unlockedGates,
  type GateName,
  type Persona,
} from '@/lib/voice/types'
import { bandDirectiveParts, type DirectiveContext } from './bands'

export interface SteeringContext extends DirectiveContext {
  persona: Persona
  warmth: number
}

/**
 * A ceiling on the whole line, enforced by construction rather than by
 * truncation — a directive cut off mid-sentence is worse than a shorter one.
 */
export const STEERING_BUDGET = 340

/** At most this many personality clauses. Past two it stops being a direction. */
const MAX_PERSONALITY_CLAUSES = 2
/** At most this many gates. The newest are the ones worth spending words on. */
const MAX_GATE_CLAUSES = 2

export function composeSteering(context: SteeringContext): string {
  const parts = [
    ...bandDirectiveParts(context.warmth, context),
    ...personalityClauses(context.persona, context.warmth),
    ...gateClauses(context.persona, context.warmth),
  ]
  return `[${parts.join(' ')}]`
}

/**
 * How this band sounds coming from this particular person.
 *
 * Expression always ships, because it is the cheapest and most load-bearing
 * word in the line. The rest are ranked by how far past their threshold they
 * are, so a character who is merely a bit distracted does not spend a clause
 * saying so.
 */
export function personalityClauses(persona: Persona, warmth: number): string[] {
  const p = persona.personality
  const clauses: string[] = [EXPRESSION_CLAUSE[p.expression]]

  const candidates: { strength: number; text: string }[] = []

  // The sharpness curve (§2). A stranger who is already cold is sharper than a
  // neutral one, so this can fire on a character whose base sharpness is mild.
  const sharp = effectiveSharpness(p, warmth)
  if (sharp >= 60) {
    candidates.push({
      strength: sharp,
      text: sharp >= 80 ? 'Cutting, and you do not soften it.' : 'A little cutting if he fumbles.',
    })
  }
  if (p.patience <= 40) {
    candidates.push({ strength: 100 - p.patience, text: 'You have no patience for fumbling.' })
  }
  if (p.distraction >= 60) {
    candidates.push({ strength: p.distraction, text: 'Half your attention is elsewhere.' })
  }
  if (p.humour >= 70) {
    candidates.push({ strength: p.humour, text: 'Tease him if he gives you an opening.' })
  }
  if (p.signalClarity <= 33) {
    candidates.push({
      strength: 100 - p.signalClarity,
      text: 'Stay pleasant either way. Never say plainly that you want to go.',
    })
  }

  candidates.sort((a, b) => b.strength - a.strength)
  for (const candidate of candidates.slice(0, MAX_PERSONALITY_CLAUSES)) {
    clauses.push(candidate.text)
  }
  return clauses
}

const EXPRESSION_CLAUSE: Record<Persona['personality']['expression'], string> = {
  playful: 'Light.',
  dry: 'Dry.',
  earnest: 'Straight, no irony.',
  flat: 'Flat.',
}

/**
 * What she has earned the right to do.
 *
 * Only unlocked behaviours are named. A locked one is not mentioned at all —
 * telling a model what it may not do invites it to think about doing it, and
 * every word here is charged on every subsequent turn.
 *
 * When more than two are open, the most recently unlocked win: those are the
 * ones the model has not been told about on many previous turns, and they are
 * what the user just earned.
 */
export function gateClauses(persona: Persona, warmth: number): string[] {
  const open = unlockedGates(persona.gated, warmth)
  if (open.length === 0) return []

  const ranked = [...open].sort(
    (a, b) => persona.gated[b].unlocksAt - persona.gated[a].unlocksAt,
  )

  return ranked
    .slice(0, MAX_GATE_CLAUSES)
    .map((name) => gateText(persona, name))
    .filter((text): text is string => text !== null)
}

function gateText(persona: Persona, name: GateName): string | null {
  const gate = persona.gated[name]
  switch (name) {
    case 'flirtiness': {
      const ceiling = 'ceiling' in gate ? gate.ceiling : 0
      // An unlocked behaviour with a ceiling of zero is unlocked in name only.
      if (ceiling <= 0) return null
      return ceiling >= 50 ? 'You may flirt.' : 'You may flirt, barely.'
    }
    case 'personalDisclosure': {
      const ceiling = 'ceiling' in gate ? gate.ceiling : 0
      if (ceiling <= 0) return null
      return ceiling >= 50
        ? 'You may say something real about your life.'
        : 'One small true thing about yourself, no more.'
    }
    case 'initiatesTopics':
      return 'You may start a topic.'
    case 'usesYourName':
      return 'You may use his name.'
  }
}
