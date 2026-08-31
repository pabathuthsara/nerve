/**
 * What the onboarding answer is for.
 *
 * Step two asks what the hard part is — opening, sustaining, flirting or
 * handling a no — and until now nothing downstream moved as a result. A
 * questionnaire that takes an answer and returns nothing is a survey, and
 * users learn to click through it.
 *
 * So this is the one place that says what each answer buys, and three surfaces
 * read it: the character the first rep is against, the first field challenge,
 * and the technique card shown on the brief before there is a graded rep to
 * draw one from.
 *
 * Authored content, in the repo, reviewed in a pull request — the same rule
 * personas and challenges follow (§16). Nothing here is generated, and nothing
 * here is a runtime decision about what somebody should be asked to do.
 *
 * Pure, so it can be asserted rather than eyeballed.
 */

import type { SubScore } from '@/lib/techniques/library'

/** The four answers `profiles.focus_area` may hold. */
export type FocusArea = 'opening' | 'sustaining' | 'flirting' | 'rejection'

export interface FocusPlan {
  /** How the answer reads back to the user, in their words. */
  label: string
  /** The §07 sub-score this answer is really about. */
  subScore: SubScore
  /** The library card to open with, before any rep has been graded. */
  cardSlug: string
  /**
   * The tier-1 field challenge to hand out first.
   *
   * Tier 1 only, because a brand-new account is gated to tier 1 anyway
   * (`lib/field/assignment.ts`) and a preference that names a locked challenge
   * would be a preference the assigner has to ignore.
   */
  challengeSlug: string
  /**
   * Which characters suit this answer, best first.
   *
   * A tie-break, never a gate: it is applied among personas that are already
   * unlocked and equally unpractised, so it decides the FIRST rep and then
   * gets out of the way of the rotation. Two tiers are open on a fresh
   * account, so it now genuinely chooses between Tess and Nadia rather than
   * falling through to the only reachable character. It is the mechanism the
   * roster is being filled for (`LAUNCH-GAP.md`, P2).
   *
   * **Tess leads three of the four**, because the sign-up rep is against
   * whoever this list puts first and that rep is the one authored to be won
   * (`lib/personas/tess.ts`). The exception is `rejection`, where the honest
   * first character is not the one who says yes.
   */
  personaSlugs: readonly string[]
}

export const FOCUS_PLANS: Record<FocusArea, FocusPlan> = {
  opening: {
    label: 'starting the conversation',
    subScore: 'opening',
    cardSlug: 'the-shared-situation',
    // Opening with a statement is the exercise; the number is not the point.
    challengeSlug: 'statement-not-question',
    // Tess first: a launderette queue hands you the shared situation, so the
    // opener this answer is about is the easy one to reach for. Nadia behind
    // her is the same lesson with slightly less help.
    personaSlugs: ['tess', 'nadia', 'maya', 'robin'],
  },
  sustaining: {
    label: 'keeping it going',
    subScore: 'curiosity',
    cardSlug: 'the-second-question',
    challengeSlug: 'stay-on-the-topic',
    // Maya is the rung authored around not running dry at ninety seconds — but
    // she is behind a gate on a new account now, so the list falls through to
    // Tess, who will not let a conversation die and is the right room to learn
    // that it can be kept alive at all.
    personaSlugs: ['maya', 'tess', 'nadia', 'robin'],
  },
  flirting: {
    label: 'making it flirty without being weird',
    // Not a sub-score of its own. "Without being weird" is reading whether it
    // landed, which is signal reading, and that is the thing that can be
    // taught. Charm cannot.
    subScore: 'signalReading',
    cardSlug: 'the-shorter-answer',
    challengeSlug: 'say-the-observation',
    // Tess opens her gated layers earliest on the roster, so "did that land"
    // is answerable at all inside three minutes. Maya is the same question with
    // the answer withheld, which is the version worth graduating to.
    personaSlugs: ['tess', 'maya', 'robin', 'nadia'],
  },
  rejection: {
    label: 'handling it when she is not interested',
    subScore: 'composure',
    cardSlug: 'recovery-flat-response',
    // The tier-1 ask exists to make somebody hear the word out loud.
    challengeSlug: 'ask-alex',
    // Robin is the rung about reading whether a no is a no — but she is the
    // top of the ladder, so on a new account this list falls through and the
    // answer is honoured later rather than never. Nadia rather than Tess is
    // the fall-through here, and deliberately: somebody whose hard part is
    // being turned down is not served by the character least likely to do it.
    personaSlugs: ['robin', 'maya', 'nadia', 'tess'],
  },
}

export function focusPlan(focus: FocusArea | null | undefined): FocusPlan | null {
  return focus ? FOCUS_PLANS[focus] ?? null : null
}

/**
 * Where a persona sits in this answer's preference, for sorting.
 *
 * Unlisted characters sort last rather than being excluded — a roster addition
 * must never make somebody unreachable because nobody remembered to add them
 * here.
 */
export function personaRankFor(focus: FocusArea | null | undefined, personaId: string): number {
  const plan = focusPlan(focus)
  if (!plan) return 0
  const index = plan.personaSlugs.indexOf(personaId)
  return index === -1 ? plan.personaSlugs.length : index
}
