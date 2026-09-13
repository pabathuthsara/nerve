/**
 * The texting steering line.
 *
 * A NEW FILE BESIDE `lib/warmth/steering.ts`, WHICH IS NOT OPENED (rule 19,
 * `TEXTING-PLAN.md` §0). Four of its clause builders are `export`ed and are
 * READ here rather than copied — `postureClauses`, `repairClauses`,
 * `personalityClauses` and `gateClauses` describe who a character is and how
 * she is feeling, and neither of those is a thing the medium changes. What is
 * rewritten below is only what texting genuinely does differently.
 *
 * ── WHAT IS DIFFERENT, AND WHY, CLAUSE BY CLAUSE ─────────────────────────
 *
 *   band          the texting table (`./bands.ts`), which runs shorter at the
 *                 cold end and longer at the warm one, and controls tone with
 *                 punctuation rather than only with length
 *   reciprocity   the texting gates (`./reciprocity.ts`), which know about the
 *                 one thing speech cannot do: sending three messages in a row
 *   leaving       texting's own, because there is no number to offer here. The
 *                 dating clause's whole warm branch is `closing === 'number'`,
 *                 which this section has no concept of — `TEXTING_WARMTH_CEILING`
 *                 puts the arm threshold permanently out of reach
 *   want          rationed exactly as on the dating arm, and for the same
 *                 reason: an agenda restated before every generation stops
 *                 being an agenda and becomes an instruction to abandon him
 *
 * ── AND NOTHING HERE ARGUES WITH AN EXIT ─────────────────────────────────
 *
 * `lib/warmth/leaving.ts`'s header is the write-up: `wantClauses` at warmth
 * 20-59 shipped "You are not going yet." as the last system message before
 * every generation, so on the turn after "just fuck off" the most recent thing
 * she had been told was that she was staying. She stayed, three times, and the
 * rep ran to the clock. Every clause below that tells her to DO something is
 * withheld once the exit has left `present`.
 */

import { isLeaving, type SceneExit } from '../leaving'
import {
  gateClauses,
  personalityClauses,
  postureClauses,
  repairClauses,
  wantClauses,
  type SteeringContext,
} from '../steering'
import { textingBandParts, textingPermissionParts } from './bands'
import { textingReciprocityClauses, type TextingTurnShape } from './reciprocity'

/** The same ceiling the other two lines have, for the same reason. */
export const TEXTING_STEERING_BUDGET = 420

/**
 * The dating context, narrowed to texting's turn shape.
 *
 * `SteeringContext` lives in a Tier 0 file and is not opened. Extending it here
 * costs nothing and keeps the shared clause builders callable with this object.
 * `TextingTurnShape` is structurally a `UserTurnShape` plus `messages`, so the
 * narrowing is legal and the shared builders that read `his` keep working.
 */
export interface TextingSteeringContext extends SteeringContext {
  his?: TextingTurnShape | null
  /** Where the thread is (`lib/texting/exit.ts`). Absent means `'present'`. */
  exit?: SceneExit
}

/**
 * She is going, and this is the only thing she needs to be told.
 *
 * Two states and they are genuinely different. `wrapping` is a decision taken —
 * she is finishing this, not continuing it — and she may take a turn or two to
 * do it. `leaving` is the last message.
 *
 * **There is no warm branch and there must never be one.** The dating clause's
 * is `closing === 'number'`, and texting is capped below `ARM_THRESHOLD` by
 * construction so the arming decision cannot be reached here. A character who
 * offered contact details in a thread would be farming the voice rep's payoff
 * in the mode that costs nothing, which is the argument
 * `lib/texting/warmth.ts` is built on.
 */
export function textingLeavingClauses(context: TextingSteeringContext): string[] {
  const exit = context.exit ?? 'present'
  if (exit === 'present') return []
  if (exit === 'wrapping') return ['You are done with this conversation. Say one short thing and go.']
  return ['This is your last message. Send it and go.']
}

/**
 * He has said hello and nothing else.
 *
 * The dating file exports its own `bareGreeting`, and it reads `firstExchange`
 * and `his` — both of which mean the same thing here. It is reimplemented
 * rather than imported for one reason: the dating one is typed against
 * `SteeringContext` and would silently accept a texting context whose `his` has
 * a `messages` field it knows nothing about. Three lines is cheaper than a
 * subtle disagreement later.
 */
function bareTextingGreeting(context: TextingSteeringContext): boolean {
  if (!context.firstExchange) return false
  if (!context.his) return false
  return !context.his.askedQuestion && !context.his.disclosed
}

/**
 * The whole of what a greeting is answered with.
 *
 * A SHAPE and never a script (rule 10). "Nothing else yet" is the load-bearing
 * half: it is the only instruction in the composed line that tells her a reply
 * can be finished in one word, which in a thread is not merely allowed but
 * usual.
 */
const TEXTING_GREETING_CLAUSE = [
  'He has only said hello. Say hello back and nothing else yet.',
]

/**
 * Whether she may be handed a permission to DRIVE this turn.
 *
 * The same question the dating arm asks, and the same answer: a permission to
 * volunteer, start a topic or use his name, handed to somebody who has just
 * sent "k", is the failure this whole layer exists to stop. What he has
 * offered decides it, and nothing else — no warmth floor of its own, which is
 * the mistake `lib/warmth/reciprocity.ts`'s header records.
 */
function invitedThisTurn(context: TextingSteeringContext): boolean {
  const his = context.his
  // `undefined` means the caller has no reciprocity signal at all, which is not
  // the same claim as `null` ("he has not spoken"). Neither earns an invitation.
  if (his === undefined || his === null) return false
  if (his.deadEnd) return false
  if (bareTextingGreeting(context)) return false
  return true
}

export function composeTextingSteering(context: TextingSteeringContext): string {
  const standing = context.includeStanding !== false
  const invited = invitedThisTurn(context)
  const leaving = isLeaving(context.exit ?? 'present')
  const greeting = bareTextingGreeting(context)

  // Priority order, highest first. Everything below the band is droppable and
  // the LAST ones go when the budget binds, so this order is a judgement about
  // what she most needs to be told.
  return assemble([
    textingBandParts(context.warmth, context),
    textingReciprocityClauses(context.warmth, context.his ?? null),
    textingLeavingClauses(context),
    greeting ? TEXTING_GREETING_CLAUSE : [],
    postureClauses(context),
    repairClauses(context),
    invited && !leaving ? textingPermissionParts(context.warmth, context) : [],
    standing && !greeting && !leaving ? wantClauses(context.persona, context.warmth) : [],
    personalityClauses(context.persona, context.warmth),
    standing && invited && !leaving ? gateClauses(context.persona, context.warmth) : [],
  ])
}

/**
 * Fit the clauses into the budget, dropping from the bottom.
 *
 * A copy of the dating assembler, exactly as `lib/warmth/interview/steering.ts`
 * carries one: `assemble` is not exported from the Tier 0 file, and exporting
 * it would be an edit to that file for the sake of twelve lines.
 */
function assemble(groups: string[][]): string {
  const [required = [], ...optional] = groups
  const parts = [...required]
  let length = parts.join(' ').length + 2

  for (const group of optional) {
    for (const clause of group) {
      const cost = clause.length + 1
      if (length + cost > TEXTING_STEERING_BUDGET) continue
      parts.push(clause)
      length += cost
    }
  }
  return `[${parts.join(' ')}]`
}
