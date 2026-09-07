/**
 * The question rail (INTERVIEW-PLAN C6, §5.11).
 *
 * `lib/data/rep.ts` returned `questionIndex: 0, questionTotal: 0, question: null`
 * with the comment "Interview reps are M4", and the screen that renders them has
 * been finished since August. This is what those three fields actually are.
 *
 * ── IT IS A CAPTION AND NEVER A PROMPT ───────────────────────────────────
 *
 * §05 allows three things on a live screen and this is a fourth, deliberately,
 * on one track, behind a setting that is off by default. What makes it
 * defensible is that it shows what the interviewer **asked** — her own words,
 * out of the transcript — and nothing else. It may never gain a suggested
 * answer, a hint, a structure reminder or an example line. `assertCaption`
 * refuses anything that is not verbatim hers, and the test walks it: this is
 * enforced in code rather than in a style note, the same way `assertNoScript`
 * and `assertGuidedStep` are.
 *
 * The one guided rail in this product is Tess's, it is one character wide, and
 * it stays that way (rule 8, `LAUNCH-GAP.md` D13).
 *
 * ── AND THE COUNTER ADVANCES ON COMPLETED EXCHANGES ──────────────────────
 *
 * D13's lesson, and it applies to any rail that counts. Advancing on his turns
 * alone told a user to "follow one answer twice" against a silence with no
 * answer in it — so a step needs his turn AND her reply. A rail that moves
 * while the pipeline is failing is a rail that is lying about where he is.
 */

import { roundType, type RoundTypeId } from './interview-credits'
import { difficultySpec, type DifficultyLevel } from './interview-difficulty'
import { DESIGN_LADDER, designRungDirection, type DesignRung } from './interview-briefs'
import { INTERVIEW_EXCHANGE_MS } from '@/lib/warmth/interview/trajectory'
import type { TranscriptTurn } from '@/lib/voice/types'

export interface AgendaStep {
  /** 1-based, for the screen. 0 before the first exchange completes. */
  index: number
  /** How many the round plans for. A guide, not a contract. */
  total: number
}

/**
 * Which question he is on.
 *
 * `min(userTurns, agentTurns)` is the count of COMPLETED exchanges, which is
 * the whole rule in one expression: an unanswered turn does not advance
 * anything, and neither does an opening line she has not replied to.
 *
 * The wind-down owns the last step outright. That is the other half of D13 —
 * a close reachable by counting alone ended the one free rep at 74 seconds of
 * 180 — and here it also happens to be true to the format: "any questions for
 * me?" is the last thing asked, whenever the clock says so.
 */
export function agendaStep(input: {
  userTurns: number
  agentTurns: number
  wrapping: boolean
  round: RoundTypeId
}): AgendaStep {
  const total = roundType(input.round).questions
  if (input.wrapping) return { index: total, total }
  const completed = Math.min(input.userTurns, input.agentTurns)
  return { index: Math.max(0, Math.min(total - 1, completed)), total }
}

/**
 * The caption: the interviewer's most recent question, in her own words.
 *
 * Her LAST turn that reads as a question, not her last turn — she answers
 * things too, and captioning "Fair enough, carry on" as the question on screen
 * would be worse than captioning nothing. Null when she has not asked anything
 * yet, which is the correct state for the first few seconds of a rep.
 *
 * Trimmed to one sentence because the screen has one line and because the
 * question is the part worth reading; a two-sentence preamble plus the question
 * would push the question off the end.
 */
export function questionCaption(turns: readonly TranscriptTurn[]): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (!turn || turn.speaker !== 'agent') continue
    const asked = lastQuestionIn(turn.text)
    if (asked) return asked
  }
  return null
}

/** The last sentence of hers that ends in a question mark. */
export function lastQuestionIn(text: string): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index]!
    if (sentence.endsWith('?')) return sentence
  }
  return null
}

/**
 * The caption is hers, or there is no caption.
 *
 * **This is the enforcement §11 asks for**, and it is deliberately not a
 * vocabulary filter. A banned-word list would be an argument about which hints
 * are acceptable; this refuses the entire category by construction — if the
 * string is not a substring of something the interviewer actually said in this
 * rep, it does not go on the screen. There is no phrasing of "try the STAR
 * method" that survives it.
 *
 * Throws rather than returning false, in development and in tests, because a
 * caption carrying a hint is a product failure and not a rendering one. The
 * caller uses `captionOrNull` in production, which is the same rule with a
 * silent failure mode: §05's objection is to coaching, and a blank line is not
 * coaching.
 */
export function assertCaption(caption: string, turns: readonly TranscriptTurn[]): void {
  const hers = turns.filter((turn) => turn.speaker === 'agent').map((turn) => turn.text)
  const found = hers.some((text) => text.includes(caption))
  if (!found) {
    throw new Error(
      'An interview caption may only ever contain the interviewer\'s own words. '
      + `"${caption}" is not in anything she said (INTERVIEW-PLAN C6, §11).`,
    )
  }
}

/** The caption, or null when it is not verbatim hers. */
export function captionOrNull(
  caption: string | null,
  turns: readonly TranscriptTurn[],
): string | null {
  if (!caption) return null
  try {
    assertCaption(caption, turns)
    return caption
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Moving on
 * ------------------------------------------------------------------ */

/**
 * **THE DEFECT THIS EXISTS FOR.**
 *
 * First real interview, 7 September, Aisha Rahman, ten minutes: she opened with
 * *"tell me about a software project you've worked on end to end"* and then
 * spent **fifteen of her seventeen turns** following up on that one answer.
 * One question reached the CV, at 429 seconds of a 502-second rep.
 *
 * Nothing was broken. Every gate did what it was told: `interviewMayFollowUp`
 * is true whenever there is something to follow up on, the OPEN band says *"you
 * may follow up once on what they actually said"*, and ENGAGED says *"you may
 * follow the thread rather than your list"*. **Nothing anywhere told her to
 * come back to the list**, and the round's plan — "roughly five questions" —
 * reached her once, in the brief, as a sentence with "it is a guide" attached.
 *
 * A model with permission to follow a thread and no pressure to leave it will
 * follow one thread forever. So the agenda gets a clock, the same way the scene
 * does: authored beats, fired once each at a fraction of the rep, delivered on
 * the same bracketed channel as `dueSceneBeat`. She is not told what to ask —
 * that would be a script — only that this one is finished.
 */
export interface AgendaBeat {
  /** Which question she is being moved onto, 1-based. */
  index: number
  direction: string
}

/**
 * How much of the round is reserved for the wind-down and the last answer.
 *
 * Beats stop before it for the same reason `LAST_BEAT_FRACTION` stops scene
 * beats: being told to change the subject and to wind down inside the same
 * thirty seconds is two directions at once, which is an argument this codebase
 * has already had and settled.
 */
export const LAST_AGENDA_FRACTION = 0.8

export function dueAgendaBeat(input: {
  /** 0-1 through the rep. */
  elapsedFraction: number
  round: RoundTypeId
  /** How many agenda beats have already fired this rep. */
  fired: number
}): AgendaBeat | null {
  const planned = roundType(input.round).questions
  // The last question needs no beat: the wind-down is what ends it.
  const beats = Math.max(0, planned - 1)
  if (input.fired >= beats) return null

  // Evenly spaced across the part of the rep that is not the wind-down, so a
  // five-question ten-minute screen moves on about every ninety seconds.
  const at = ((input.fired + 1) / planned) * LAST_AGENDA_FRACTION
  if (input.elapsedFraction < at) return null

  const index = input.fired + 2
  return {
    index,
    // A direction about the AGENDA, never about the answer. It says the thread
    // is finished; what she asks next is hers, off her own field and their CV.
    direction: index >= planned
      ? '(You have one more question in you. Leave this thread — do not follow it any further — and ask about something you have not covered at all yet.)'
      : '(You have spent long enough on this. Leave the thread, do not return to it, and open a new question on something you have not asked about yet.)',
  }
}

/* ------------------------------------------------------------------ *
 * Going deeper
 * ------------------------------------------------------------------ */

/**
 * **THE DEFECT THIS ONE EXISTS FOR** (INTERVIEW-TECHNICAL-PLAN §2).
 *
 * Four interview reps ran on a real microphone on 7 September and **not one
 * question in any of them asked whether the candidate KNEW anything.** Every
 * question asked what they had DONE. That was not a tuning failure — it is
 * exactly what was authored: all six `software` stems are experiential, and
 * `compileInterviewBrief` points her at the CV in as many words.
 *
 * `dueAgendaBeat` pushes SIDEWAYS — it says this thread is finished. This is
 * its sibling and pushes **DOWN**: stop asking what they did, take one
 * technical thing they just named, and ask how it actually works.
 *
 * Like the agenda beat, and for the same reason, **it never names the topic**.
 * A direction naming the question is a script, and §05 and §11 both refuse one.
 * What makes that survivable is that the DOMAINS are authored and already in
 * her contract (`lib/data/interview-probes.ts`) — she is not being asked to
 * invent a syllabus mid-rep, she is being asked to pick from one she has read.
 */
export interface ProbeBeat {
  /** Which probe this is, 1-based. */
  index: number
  /**
   * Which rung of the system design ladder this is, or `'probe'` on a mixed
   * technical round. Carried so the audition harness and the transcript mark
   * can say what kind of turn was asked for.
   */
  rung: DesignRung | 'probe'
  direction: string
}

/**
 * How much of the rep passes before a probe may fire.
 *
 * She has to let them get something on the table first. Probing a candidate
 * who has not managed to describe anything yet produces the interrogation in
 * rep `e9c74f80` — nine of eleven turns were increasingly narrow demands for
 * one specific detail — and `grounded` is the other half of the same guard.
 */
export const FIRST_PROBE_FRACTION = 0.15

/**
 * How long a user turn has to be before the candidate counts as grounded.
 *
 * Fifteen words is about one real sentence with a fact in it. Deliberately a
 * floor on a SINGLE turn rather than a running total: five three-word answers
 * is a candidate who has not described anything, and a probe fired at them is
 * the interrogation this gate exists to prevent.
 */
export const GROUNDING_WORDS = 15

/** Has the candidate put anything concrete on the table yet? */
export function isGrounded(turns: readonly TranscriptTurn[]): boolean {
  return turns.some(
    (turn) => turn.speaker === 'user'
      && turn.text.trim().split(/\s+/).filter(Boolean).length >= GROUNDING_WORDS,
  )
}

/**
 * Is a probe due, and what kind?
 *
 * `probeShare` decides HOW MANY probes the round plans for and therefore how
 * often one is due. It is a target and never a quota (§4.1): nothing here
 * refuses a turn, and there is no per-turn gate anywhere that reads it —
 * `INTERVIEW-PLAN.md` §14 records what a hard 40% quota did the first time it
 * was tried, and this file is not going to repeat it.
 *
 * Returns null on a behavioural round, on a field with no authored probe
 * domains, and on a candidate who has not grounded. All three are the same
 * answer: the round runs as the interview it was before this plan.
 */
export function dueProbeBeat(input: {
  /** 0-1 through the rep. */
  elapsedFraction: number
  round: RoundTypeId
  difficulty: DifficultyLevel
  /** How many probes have fired this rep. */
  fired: number
  /** Whether the candidate has put anything concrete on the table yet. */
  grounded: boolean
}): ProbeBeat | null {
  const spec = roundType(input.round)
  if (spec.probeShare <= 0) return null
  // A candidate who has described nothing cannot be probed on it. This is the
  // whole `grounded: false` gate and it suppresses the beat entirely.
  if (!input.grounded) return null

  const shape = spec.shape
  const planned = shape === 'system_design'
    ? DESIGN_LADDER.length
    // The share of the round's questions that go deep rather than wide, floored
    // at one: a round that probes at all probes at least once.
    : Math.max(1, Math.round(spec.questions * spec.probeShare))
  if (input.fired >= planned) return null

  // Evenly spaced across the part of the rep that is neither the opening
  // ground-laying nor the wind-down. `LAST_AGENDA_FRACTION` is shared with the
  // agenda beat on purpose: being told to go deeper and to wind down inside the
  // same thirty seconds is two directions at once.
  const span = LAST_AGENDA_FRACTION - FIRST_PROBE_FRACTION
  const at = FIRST_PROBE_FRACTION + (input.fired / planned) * span
  if (input.elapsedFraction < at) return null

  const index = input.fired + 1
  if (shape === 'system_design') {
    const rung = DESIGN_LADDER[input.fired]!
    return { index, rung, direction: designRungDirection(rung) }
  }

  return {
    index,
    rung: 'probe',
    // A direction about the KIND of question, never about its subject. The
    // difficulty line is the one thing here that changes with the slider, and
    // it changes how hard to pitch rather than what to ask about (§5.3).
    direction: `(Stop asking what they did. Take one technical thing they just named and ask how it`
      + ` actually works — the mechanism, not their experience of it. One question, and make it one`
      + ` they cannot answer from memory of their own project. ${difficultySpec(input.difficulty).directive})`,
  }
}

/**
 * ONE DIRECTION PER TURN, DECIDED IN ONE PLACE.
 *
 * The agenda beat and the probe beat are two clocks answering two questions —
 * *this thread is finished* and *go deeper on what they just named* — and they
 * are flatly contradictory if they arrive together. `rep-rules.ts` already had
 * this argument once and settled it with `LAST_BEAT_FRACTION`; the arithmetic
 * cannot settle it here, because two independent evenly-spaced schedules
 * collide by construction.
 *
 * So the spacing is enforced in TIME rather than in arithmetic: nothing fires
 * within one exchange of the last thing she was told. A beat that is due and
 * suppressed is not lost — it is still due on the next tick, and the tick runs
 * five times a second.
 *
 * **The probe wins a tie**, because the probe is what this plan exists to add
 * and because §6.3's ladder puts it before the move: HOOK, PROBE, ESCALATE,
 * then MOVE. An agenda beat one exchange later costs nothing.
 */
export const INTERVIEW_BEAT_SPACING_MS = INTERVIEW_EXCHANGE_MS

export type InterviewBeat =
  | { kind: 'agenda'; beat: AgendaBeat }
  | { kind: 'probe'; beat: ProbeBeat }

export function dueInterviewBeat(input: {
  elapsedFraction: number
  round: RoundTypeId
  difficulty: DifficultyLevel
  agendaFired: number
  probeFired: number
  /**
   * Whether the probe ladder runs at all this rep — `probeLadderEnabled`.
   *
   * Both halves matter and the field is the half that is easy to forget: a
   * `deep_technical` round in marketing is a real thing somebody may have
   * bought, and it runs as the interview it was before this plan.
   */
  ladder: boolean
  /** Has the candidate put anything concrete on the table yet? */
  grounded: boolean
  /** Since the last direction of any kind reached her. */
  msSinceLastBeat: number
}): InterviewBeat | null {
  if (input.msSinceLastBeat < INTERVIEW_BEAT_SPACING_MS) return null

  const probe = input.ladder
    ? dueProbeBeat({
      elapsedFraction: input.elapsedFraction,
      round: input.round,
      difficulty: input.difficulty,
      fired: input.probeFired,
      grounded: input.grounded,
    })
    : null
  if (probe) return { kind: 'probe', beat: probe }

  /**
   * **A SYSTEM DESIGN ROUND HAS ONE THREAD AND IT IS THE PROBLEM.**
   *
   * `dueAgendaBeat` says *"leave the thread, do not return to it, and open a
   * new question on something you have not asked about yet"*, which is exactly
   * right on a round built out of five or six separate questions and exactly
   * wrong on one built out of a single design problem. Firing it here would
   * walk her off the brief she had just posed — which is the same defect this
   * plan exists to fix, arrived at from the opposite direction.
   *
   * Only suppressed when the ladder is actually running. A design round in a
   * field with no authored problems has no brief to be walked off and keeps the
   * agenda beat, because without it nothing in the build pushes her off a
   * thread at all.
   */
  if (input.ladder && roundType(input.round).shape === 'system_design') return null

  const agenda = dueAgendaBeat({
    elapsedFraction: input.elapsedFraction,
    round: input.round,
    fired: input.agendaFired,
  })
  return agenda ? { kind: 'agenda', beat: agenda } : null
}
