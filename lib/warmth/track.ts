/**
 * THE SEAM (INTERVIEW-PLAN B2).
 *
 * One selector per judgement, reading `persona.track`, with **dating as the
 * default branch that reaches exactly the code it reached yesterday**. Nothing
 * in `lib/warmth/bands.ts`, `reciprocity.ts`, `steering.ts`, `prompt.ts`,
 * `fast.ts` or `levels.ts` is opened to make this work — the interview arm is a
 * parallel set of files under `./interview/` and this is the only place that
 * knows both exist.
 *
 * ── WHY A SELECTOR AND NOT A PARAMETER ───────────────────────────────────
 *
 * A shared `TrackRules` record chosen at one seam is the better long-term
 * design, and §0 says explicitly that it is not what this plan does: arriving
 * at it means opening four files that currently produce output somebody is
 * happy with, and `PERSONA-AUDIT.md` records what a well-argued edit to a
 * shared judgement file did to a character nobody was auditing. If the
 * interview track proves out and both arms are stable, unifying them later is a
 * refactor with two working references and a suite pinning both.
 *
 * ── AND A THIRD TRACK IS A THIRD DIRECTORY ───────────────────────────────
 *
 * Not a third `if`. `TrackId` already carries `language`; when it arrives it
 * gets `lib/warmth/language/` and one more case in each function here, and
 * neither of the two existing arms is touched.
 */

import type { Persona, TrackId } from '@/lib/voice/types'
import { UNSTEERED_WORD_CAP, wordCapFor } from './bands'
import { composeSteering, type SteeringContext } from './steering'
import {
  mayAskFor,
  mayStaySilentFor,
  mayVolunteerFor,
  mirrorCapFor,
  type UserTurnShape,
} from './reciprocity'
import { INTERVIEW_BRIEF_WORD_CAP, interviewWordCapFor, type InterviewTurnKind } from './interview/bands'
import { composeInterviewSteering, type InterviewSteeringContext } from './interview/steering'
import {
  interviewMayAsk,
  interviewMayFollowUp,
  interviewWordCap,
} from './interview/reciprocity'

/** Everything a track decides about what she says and what it was worth. */
export interface TrackJudgement {
  track: TrackId
  /**
   * The whole steering line, composed.
   *
   * The parameter is the interview context because it is the wider of the two:
   * `composeSteering` takes the narrower `SteeringContext` and is assignable
   * here unchanged, which is what lets the interview arm carry a field of its
   * own without `lib/warmth/steering.ts` being opened.
   */
  steer(context: InterviewSteeringContext): string
  /**
   * Her ceiling this turn, given what he just did.
   *
   * `turnKind` is the interview arm's brief carve-out (§6.7) and is ignored on
   * the dating arm, whose `mirrorCapFor` takes two arguments and is assigned
   * here unchanged.
   */
  wordCap(value: number, his: UserTurnShape | null, turnKind?: InterviewTurnKind): number
  /** The band's ceiling alone, with no turn to mirror against. */
  bandCap(value: number, turnKind?: InterviewTurnKind): number
  /** May she ask him something this turn? */
  mayAsk(value: number, his: UserTurnShape | null): boolean
  /** May she say nothing at all? */
  maySayNothing(
    value: number,
    his: UserTurnShape | null,
    options?: {
      silentLastTurn?: boolean
      opening?: boolean
      turnsSinceSilence?: number
      askedDirectly?: boolean
    },
  ): boolean
  /** May she offer something nobody asked for? */
  mayVolunteer(value: number, his: UserTurnShape | null): boolean
  /**
   * The most of her recent turns that may end in a question.
   *
   * §4e's "questions in at most 40% of turns" is a DATING rule and a correct
   * one: a stranger in a shop who asks something every turn is interrogating,
   * and round 6 reached a question on 83% of them.
   *
   * **An interviewer asks a question on nearly every turn, because that is what
   * an interview is.** Applying the dating quota to one gags her on four turns
   * in five — measured in the first audition of Dan Whitfield, where
   * `suppressQuestion` was true on almost every turn and "Do not follow up this
   * turn" was issued and ignored every time. A directive that is disobeyed
   * every turn is worse than no directive: it teaches the model that the
   * bracketed line is optional, and the bracketed line is the only thing that
   * owns reply length.
   *
   * 1 means no quota. What stops an interviewer interrogating is her contract
   * ("one question at a time, never one you have already asked") and the cold
   * bands, which forbid a follow-up in their own words.
   */
  maxQuestionShare: number
}

const DATING: TrackJudgement = {
  track: 'dating',
  steer: composeSteering,
  wordCap: mirrorCapFor,
  bandCap: wordCapFor,
  mayAsk: mayAskFor,
  maySayNothing: (value, his, options = {}) =>
    mayStaySilentFor(value, his, { ...(options.silentLastTurn !== undefined ? { silentLastTurn: options.silentLastTurn } : {}) }),
  mayVolunteer: mayVolunteerFor,
  // §4e, unchanged. The number that has always been there.
  maxQuestionShare: 0.4,
}

const INTERVIEW: TrackJudgement = {
  track: 'interview',
  steer: composeInterviewSteering,
  // The brief turn takes the carve-out outright rather than being mirrored
  // against his last turn: there is nothing to mirror, and a candidate who has
  // said "hi" would otherwise cap the problem statement at two words.
  wordCap: (value, his, turnKind) =>
    turnKind === 'brief' ? INTERVIEW_BRIEF_WORD_CAP : interviewWordCap(value, his),
  bandCap: interviewWordCapFor,
  // An interviewer always has a question; what varies is whether it follows up
  // or moves to the next item, and the band owns that. See `interviewMayAsk`,
  // which is deliberately NOT `interviewMayFollowUp` — the first audition is
  // the note.
  mayAsk: interviewMayAsk,
  /**
   * **OFF, AND THE FIRST REAL INTERVIEW IS WHY.**
   *
   * `interviewMayLetPauseSit` is a good rule about a real technique and it does
   * not survive a voice-only medium. Measured on 7 September: three silences in
   * a ten-minute rep, and all three were read as a dropped connection. The
   * candidate said *"Hello"*, then *"Did you hear what I said?"*, then
   * *"There"* — and answering the second of those cost her a frame break, the
   * only one in the rep: *"I did hear you."*
   *
   * The dating arm's silence works because the user can see a live waveform, a
   * timer and an avatar, and because a stranger going quiet IS the signal being
   * taught — noticing it is the skill. Here she is the only feedback in the
   * room, so her saying nothing is indistinguishable from the product being
   * broken, and a candidate who spends the pause debugging the app has learned
   * nothing about interviews.
   *
   * The function and its tests stay. This is a claim about the MEDIUM, not
   * about the rule: give the live screen a visible "she is listening" state and
   * it becomes shippable. Until then an interviewer always answers.
   */
  maySayNothing: () => false,
  // Volunteering, for an interviewer, is telling the candidate something about
  // the role. It rides the same gate the follow-up does because it is the same
  // question — has this answer earned her leaving the list.
  mayVolunteer: interviewMayFollowUp,
  maxQuestionShare: 1,
}

/**
 * The language track is specified (§01) and unbuilt. It reads the dating
 * tables until it has its own, which is honest: a stub that silently produced
 * different numbers would be worse than one that produces the shipped ones.
 */
const BY_TRACK: Record<TrackId, TrackJudgement> = {
  dating: DATING,
  interview: INTERVIEW,
  language: DATING,
}

export function judgementFor(persona: Pick<Persona, 'track'>): TrackJudgement {
  return BY_TRACK[persona.track] ?? DATING
}

/**
 * The ceiling for a turn no band is steering.
 *
 * Shared deliberately. `UNSTEERED_WORD_CAP` is a runaway guard for the one turn
 * the directive stands down — the wind-down — and forty words is generous on
 * both tracks and a bug on neither.
 */
export { UNSTEERED_WORD_CAP }
