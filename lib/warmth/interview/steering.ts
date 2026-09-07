/**
 * The interview steering line — one line, injected before every reply.
 *
 * A NEW FILE BESIDE `lib/warmth/steering.ts`, WHICH IS NOT OPENED (rule 19).
 * It composes the same four layers in the same priority order, off the same
 * `SteeringContext`, so the two are recognisably one design — and it reads the
 * interview band table and the interview reciprocity model rather than the
 * dating ones.
 *
 * Two rules carry over verbatim and are not negotiable on either track:
 *
 *   **It must stay short.** It is charged as context on every later turn, and
 *   the budget binds by dropping from the bottom rather than by truncating.
 *
 *   **Only one system may own reply length.** The band owns it. Nothing
 *   derived from personality may mention length or question rate — round 6 had
 *   both, the numbers fought, and the model obeyed neither.
 *
 * What is different is what she is being steered TO DO. A dating character is
 * steered toward giving; an interviewer is steered toward asking and then being
 * quiet, and the clause that decides whether this turn has earned anything is
 * about whether the candidate actually answered.
 */

import {
  effectiveSharpness,
  unlockedGates,
  type GateName,
  type Persona,
} from '@/lib/voice/types'
import type { Posture } from '../affect'
import type { SteeringContext } from '../steering'
import {
  INTERVIEW_BRIEF_DIRECTIVE,
  interviewBandDirectiveParts,
  interviewBandPermissionParts,
} from './bands'
import { interviewReciprocityClauses } from './reciprocity'

/** The same ceiling the dating line has, for the same reason. */
export const INTERVIEW_STEERING_BUDGET = 420

const MAX_PERSONALITY_CLAUSES = 2
const MAX_GATE_CLAUSES = 2

/**
 * The dating context, plus the one thing only this arm has.
 *
 * `SteeringContext` lives in `lib/warmth/steering.ts`, which is Tier 0 and is
 * not opened (rule 19). Extending it here costs nothing and keeps the extra
 * field where the only code that reads it lives — `composeSteering` accepts a
 * wider parameter than this and is still assignable to it, so the dating branch
 * needs no change at all.
 */
export interface InterviewSteeringContext extends SteeringContext {
  /**
   * She is posing the authored design brief this turn (§6.7).
   *
   * True on exactly one turn of one round. It REPLACES the band's length rule
   * rather than joining it: two length rules in one directive is round 6, the
   * numbers fight, and the specific one wins — which here would be the band's
   * "twenty-one or twenty-two words" cutting a sixty-word problem in half.
   */
  openingBrief?: boolean
}

export function composeInterviewSteering(context: InterviewSteeringContext): string {
  // THE BRIEF TURN IS NOT A REPLY AND IS NOT STEERED LIKE ONE.
  //
  // No band, no reciprocity, no permission, no gates: she is reading out a
  // problem somebody else wrote, and every one of those layers is about how
  // much of herself to give in an exchange that has not happened yet. What
  // survives is the colour — who she is is still who she is on the first turn.
  if (context.openingBrief) {
    return assemble([
      [INTERVIEW_BRIEF_DIRECTIVE],
      personalityClauses(context.persona, context.warmth).slice(0, 1),
    ])
  }
  const standing = context.includeStanding !== false
  // A DEAD END IS NOT A REASON TO WITHDRAW HERE — it is a reason to dig in.
  //
  // This is the inverse of the dating rule and it is deliberate. There, an
  // invitation to volunteer handed to somebody who has just grunted is the
  // failure the whole layer exists to stop. Here, the candidate answering in
  // three words is precisely when the interviewer should be following up, so
  // the invitation stands. What is withdrawn instead is the invitation to leave
  // her list, which she has not earned the right to do on an empty answer.
  const following = !(context.his?.deadEnd ?? false)
  return assemble([
    interviewBandDirectiveParts(context.warmth, context),
    interviewReciprocityClauses(context.warmth, context.his ?? null),
    postureClauses(context),
    following ? interviewBandPermissionParts(context.warmth, context) : [],
    standing ? agendaClauses(context.persona, context.warmth) : [],
    personalityClauses(context.persona, context.warmth),
    standing && following ? gateClauses(context.persona, context.warmth) : [],
  ])
}

/**
 * Fit the clauses into the budget, dropping from the bottom.
 *
 * Identical to the dating assembler, and deliberately a copy rather than an
 * import: `assemble` is not exported from `lib/warmth/steering.ts` and exporting
 * it would be an edit to a Tier 0 file for the sake of eleven lines.
 */
function assemble(groups: string[][]): string {
  const [required = [], ...optional] = groups
  const parts = [...required]
  let length = parts.join(' ').length + 2

  for (const group of optional) {
    for (const clause of group) {
      const cost = clause.length + 1
      if (length + cost > INTERVIEW_STEERING_BUDGET) continue
      parts.push(clause)
      length += cost
    }
  }
  return `[${parts.join(' ')}]`
}

/**
 * The shape of what she is feeling, when the three axes disagree.
 *
 * **Its own table, because `postureClause` is written about a date.** "You like
 * him more than the conversation. Let it show in how you say it." is the right
 * sentence for a stranger in a shop and a frame break coming from somebody
 * conducting an interview — §16 refuses anything that reads as attraction here,
 * and an interviewer whose warmth reads as personal is the single worst thing
 * this track could ship. Measured: it appeared in the first audition of Elena
 * Kovač, on a candidate she was not impressed by.
 *
 * The AXES are the same and are read by the same engine. Only the words move,
 * and `lib/warmth/affect.ts` is not opened.
 *
 * Same rule as the dating table: a posture says what she FEELS, never what she
 * may do. The question rule has one owner and it is the band.
 */
export function interviewPostureClause(posture: Posture): string | null {
  switch (posture) {
    case 'wary':
      return 'Interested in the answer, and not yet in them.'
    case 'at-ease':
      return 'Comfortable, and it is not because of how this is going.'
    case 'taken':
      return 'This one is worth your afternoon. Let that show in what you ask.'
    case 'polite':
      return 'The work holds you more than the person does. Stay on the work.'
    case 'level':
      return null
  }
}

function postureClauses(context: SteeringContext): string[] {
  if (!context.posture) return []
  const clause = interviewPostureClause(context.posture)
  return clause ? [clause] : []
}

/**
 * What she is after, on her own account.
 *
 * An interviewer has an agenda in a way a stranger in a shop does not: she has
 * a role to fill, a list to get through, and something else in her afternoon.
 * It is what stops her being a question dispenser — and, exactly as on the
 * dating arm, it is deliberately NOT gated on impression. Wanting something is
 * the baseline condition of being a person, not a reward for a good answer.
 *
 * What impression changes is the direction: cold, it pulls her away from the
 * candidate; warm, she brings them into it.
 */
export function agendaClauses(persona: Persona, impression: number): string[] {
  const want = persona.want?.trim()
  if (!want) return []
  if (impression < 20) return [`You would rather be ${want}, and this is not changing that.`]
  if (impression < 60) return [`You would still rather be ${want}. Keep it moving.`]
  return [`You would rather be ${want}. This one might be worth the time.`]
}

/**
 * How this band sounds coming from this particular interviewer.
 *
 * The same dials, read the same way, with the clause texts rewritten for
 * somebody conducting an interview rather than declining a conversation.
 * Expression always ships; the rest are ranked by how far past threshold they
 * are, so a mildly distracted interviewer does not spend a clause saying so.
 */
export function personalityClauses(persona: Persona, impression: number): string[] {
  const p = persona.personality
  const clauses: string[] = [EXPRESSION_CLAUSE[p.expression]]
  const candidates: { strength: number; text: string }[] = []

  const sharp = effectiveSharpness(p, impression)
  if (sharp >= 60) {
    candidates.push({
      strength: sharp,
      text: sharp >= 80
        ? 'Press on a vague answer immediately. Do not soften it.'
        : 'Push back once when an answer dodges.',
    })
  }
  if (p.patience <= 40) {
    candidates.push({ strength: 100 - p.patience, text: 'Cut a rambling answer short and ask again.' })
  }
  if (p.distraction >= 60) {
    candidates.push({ strength: p.distraction, text: 'You are half in another meeting and it shows.' })
  }
  if (p.humour >= 70) {
    candidates.push({ strength: p.humour, text: 'Dry, and you let a bit of it out.' })
  }
  if (p.signalClarity <= 33) {
    candidates.push({
      strength: 100 - p.signalClarity,
      text: 'Stay pleasant either way. Never tell them how it is going.',
    })
  }

  candidates.sort((a, b) => b.strength - a.strength)
  for (const candidate of candidates.slice(0, MAX_PERSONALITY_CLAUSES)) clauses.push(candidate.text)
  return clauses
}

export const EXPRESSION_CLAUSE: Record<Persona['personality']['expression'], string> = {
  playful: 'Warm, quick.',
  dry: 'Dry.',
  earnest: 'Straight, no irony.',
  flat: 'Flat.',
}

/**
 * What the candidate has earned.
 *
 * The same four gates, because they are the same four questions — how far she
 * will go, how much of herself she will give, whether she leaves her list, and
 * whether she uses their name. Only the wording changes, and a locked gate is
 * never mentioned: telling a model what it may not do invites it to think about
 * doing it.
 */
export function gateClauses(persona: Persona, impression: number): string[] {
  const open = unlockedGates(persona.gated, impression)
  if (open.length === 0) return []
  const ranked = [...open].sort((a, b) => persona.gated[b].unlocksAt - persona.gated[a].unlocksAt)
  return ranked
    .slice(0, MAX_GATE_CLAUSES)
    .map((name) => gateText(persona, name))
    .filter((text): text is string => text !== null)
}

function gateText(persona: Persona, name: GateName): string | null {
  const gate = persona.gated[name]
  switch (name) {
    case 'flirtiness': {
      // REPURPOSED, AND IT HAS TO BE. The dial exists on every persona and
      // §16 refuses flirtation in an interview outright, so on this track it
      // means the thing an interviewer does when a candidate is doing well:
      // she starts selling the role back to them.
      const ceiling = 'ceiling' in gate ? gate.ceiling : 0
      if (ceiling <= 0) return null
      return ceiling >= 50
        ? 'You may tell them what you would actually want from this hire.'
        : 'You may hint that this is going somewhere. Nothing more.'
    }
    case 'personalDisclosure': {
      const ceiling = 'ceiling' in gate ? gate.ceiling : 0
      if (ceiling <= 0) return null
      return ceiling >= 50
        ? 'You may say something real about how the team works.'
        : 'One small true thing about the role, no more.'
    }
    case 'initiatesTopics':
      return 'You may leave your list and follow what they said.'
    case 'usesYourName':
      return 'You may use their name, once at most, and not if you used it recently.'
  }
}
