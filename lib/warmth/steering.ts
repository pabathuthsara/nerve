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
import { postureClause, type Posture } from './affect'

export interface SteeringContext extends DirectiveContext {
  persona: Persona
  warmth: number
  /** She cooled on a recent turn and he is inside the repair window. */
  repairOpen?: boolean
  /**
   * How interest, comfort and liking stand relative to each other.
   *
   * The band says how much she gives; this says what shape it takes. Omitted —
   * or `level`, when the three agree — adds nothing, which is the common case
   * and keeps the line short.
   */
  posture?: Posture
}

/**
 * A ceiling on the whole line, enforced by construction rather than by
 * truncation — a directive cut off mid-sentence is worse than a shorter one.
 *
 * Round 13 raised this from 340, and the reason is worth writing down because
 * the number looks like a cost regression and is not one. Two clauses were
 * added: a want, which is what stops her being a pure responder, and a posture,
 * which is what a second and third affect axis are FOR. Meanwhile the caller
 * stopped sending this on every VAD trigger and now sends it only when the line
 * actually changes, so a rep carries far fewer copies of a slightly longer
 * line. Total context spent on steering went down.
 *
 * The ceiling still binds, and binding is the point — see `assemble`.
 */
export const STEERING_BUDGET = 420

/** At most this many personality clauses. Past two it stops being a direction. */
const MAX_PERSONALITY_CLAUSES = 2
/** At most this many gates. The newest are the ones worth spending words on. */
const MAX_GATE_CLAUSES = 2

export function composeSteering(context: SteeringContext): string {
  // Priority order, highest first. Everything below the band is droppable, and
  // when the budget binds the LAST ones go — which is why the order is a
  // judgement about what she most needs to be told and not the order the
  // clauses happen to be written in.
  //
  //   band         non-negotiable. It owns how much she gives.
  //   posture      what shape that takes. Only present when the axes disagree,
  //                so when it IS present it is the most informative line here.
  //   repair       rare, and expires in two turns. If it is dropped it is gone.
  //   want         every turn, and the reason she is a person rather than a
  //                response. Above personality because a character with an
  //                agenda and no adjectives still reads as someone; a character
  //                with adjectives and no agenda reads as a chatbot.
  //   personality  colour.
  //   gates        permissions she will still have next turn.
  return assemble([
    // Her own band table when she has one, the shared one otherwise. The band
    // still owns reply length either way — see `BandDirectives`.
    bandDirectiveParts(context.warmth, context, context.persona.bandDirectives),
    postureClauses(context),
    repairClauses(context),
    wantClauses(context.persona, context.warmth),
    personalityClauses(context.persona, context.warmth),
    gateClauses(context.persona, context.warmth),
  ])
}

/**
 * Fit the clauses into the budget, dropping from the bottom.
 *
 * The first group always survives, whatever it costs — a line with no band
 * directive is worse than a long one, because then nothing owns reply length
 * and round 6 happens again. Everything after it is admitted only if it fits
 * whole. Clauses are never cut mid-sentence.
 *
 * This is also a quality rule and not only a cost one. Eight simultaneous
 * directions are obeyed about as well as none: the failure this file already
 * documents — two sets of numbers producing a third answer nobody asked for —
 * is the same failure, and adding axes to the model is exactly the kind of
 * change that would have reintroduced it.
 */
function assemble(groups: string[][]): string {
  const [required = [], ...optional] = groups
  const parts = [...required]
  let length = parts.join(' ').length + 2

  for (const group of optional) {
    for (const clause of group) {
      const cost = clause.length + 1
      if (length + cost > STEERING_BUDGET) continue
      parts.push(clause)
      length += cost
    }
  }
  return `[${parts.join(' ')}]`
}

/**
 * The shape of what she is feeling, when the three axes disagree.
 *
 * Placed directly after the band because it qualifies it: the band has just
 * said how much she gives, and this says whether that is curiosity held at a
 * distance, ease with nothing behind it, or the other way round. Silent when
 * the axes agree, which is most turns — see `postureOf`.
 */
export function postureClauses(context: SteeringContext): string[] {
  if (!context.posture) return []
  const clause = postureClause(context.posture)
  return clause ? [clause] : []
}

/**
 * What she is after, on her own account.
 *
 * Ungated on purpose, and it is the one clause here that is not a reward. Every
 * other line in this file describes how she responds; without this she has no
 * reason to say anything nobody asked for, and outside the warm bands
 * `initiatesTopics` never opens — so on most of the ladder she was a pure
 * responder for the whole rep. A person who only ever answers is the most
 * recognisable tell there is.
 *
 * Warmth changes the DIRECTION of the want, never whether she has one:
 *
 *   cold   it pulls her away from him, and she may say so
 *   mid    it is still there, and he is allowed to be a reason to put it off
 *   warm   she brings him into it
 *
 * One clause, because it is charged on every turn after this one.
 */
export function wantClauses(persona: Persona, warmth: number): string[] {
  const want = persona.want?.trim()
  if (!want) return []

  if (warmth < 20) return [`You would rather be ${want}, and it shows.`]
  if (warmth < 60) return [`You would still rather be ${want}. You are not going yet.`]
  return [`You would rather be ${want}. Bring him into it.`]
}

/**
 * She has just cooled, and this is his next move.
 *
 * A misstep followed by a decent recovery is the strongest bonding move there
 * is, and it was worth nothing: a bad turn cost its points and the conversation
 * carried on as though nothing had happened. That teaches avoidance rather than
 * recovery, which is the opposite of the skill.
 *
 * The engine owns whether the window is open (see `WarmthEngine.repairOpen`).
 * All this does is let her ACKNOWLEDGE it, because a repair the other person
 * does not visibly register is not a repair.
 */
export function repairClauses(context: SteeringContext): string[] {
  if (!context.repairOpen) return []
  return ['He misjudged it and is recovering. Let him, if he earns it.']
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

/**
 * Layer 2's expression, as its steering clause. Exported for the same reason
 * as `EXPRESSION_TAG`: the tests assert that the clause is constant across
 * every warmth band, which is a claim about the composition and not about any
 * one character's current dial.
 */
export const EXPRESSION_CLAUSE: Record<Persona['personality']['expression'], string> = {
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
