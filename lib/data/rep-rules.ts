/**
 * The rules a rep runs by, with the browser taken out of them.
 *
 * The hook that owns the live session is unavoidably full of transport,
 * analysers and refs. These decisions are the product — how long a rep lasts,
 * whether she ends up willing, when she starts to leave, when it is over — and
 * they are pure functions here so they can be tested without a microphone, a
 * WebRTC stack or a model.
 *
 * THE FORMAT, IN ONE PARAGRAPH. A dating rep is three minutes. Nothing
 * happens at the moment the meter crosses; the rep runs its full length
 * whether it is going well or badly. Thirty seconds from the end she is told
 * one of two things — wind down and leave, or wind down and offer him your
 * number — and which one depends on whether the meter was ever high enough
 * and is still high enough now. Her closing line is allowed to finish after
 * the clock reaches zero.
 */

import type { SceneBeat } from '@/lib/voice/types'

/** A dating rep is three minutes (§05, and §14's "3 reps ≈ 9 min"). */
export const DATING_DURATION_MS = 180_000

/** An interview rep is eight, which is what a real screen call takes. */
export const INTERVIEW_DURATION_MS = 480_000

/**
 * The first time warmth reaches this, the rep is ARMED.
 *
 * Nothing visible happens when it does. No indicator, no sound, no change in
 * the ring — an "you've got it" signal would end the tension and the training
 * in the same instant, and would turn the last minute into a formality.
 */
export const ARM_THRESHOLD = 65

/**
 * Armed, and at or above this at the wind-down, means she offers her number.
 *
 * The gap between the two is deliberate hysteresis. Interest does not work
 * like a switch: once you have made an impression it takes a real collapse to
 * undo it, not one clumsy sentence at 2:50. Ten points of room is what that
 * costs.
 */
export const KEEP_THRESHOLD = 55

/** The interview equivalent of arming: the impression that earns a callback. */
export const INTERVIEW_THRESHOLD = 70

/** How long before the end she is told to wind down. The decision point. */
export const WRAP_UP_MS = 30_000

/**
 * How long her closing line may run past zero.
 *
 * Cutting her off mid-sentence to save twelve seconds of model time would
 * truncate the best moment in the product. The clock still reads 0:00; she is
 * simply finishing, which is what happens in life.
 */
export const CLOSING_GRACE_MS = 20_000

/**
 * How long we wait, in silence, for her to start that closing line.
 *
 * If she is not speaking when the clock runs out and does not begin within
 * this window, the scene is over. Twenty seconds of dead air is not a grace
 * period, it is a bug.
 */
export const CLOSING_IDLE_MS = 4_000

export function repDurationMs(interview: boolean): number {
  return interview ? INTERVIEW_DURATION_MS : DATING_DURATION_MS
}

/** What the ring is drawn against, and what the result screen compares to. */
export function repThreshold(interview: boolean): number {
  return interview ? INTERVIEW_THRESHOLD : ARM_THRESHOLD
}

/**
 * Does this turn arm the rep?
 *
 * Once, and only upward. An interview rep never arms: a callback is decided
 * afterwards by the grade, not in the room.
 */
export function shouldArm(input: {
  warmth: number
  armed: boolean
  interview: boolean
}): boolean {
  if (input.interview || input.armed) return false
  return input.warmth >= ARM_THRESHOLD
}

/**
 * Does she give her number?
 *
 * Evaluated once, at whichever moment the scene ends — the wind-down for a
 * rep that runs its length, or the ending itself for one cut short. Armed is
 * necessary and not sufficient: she also has to still be there.
 *
 * `boundaryCrossed` is the one absolute. Nothing sets it yet — moderation is
 * M4 (§16) — but the rule is written now so that wiring it up later is a
 * caller change rather than a rethink of this function.
 */
export function givesNumber(input: {
  armed: boolean
  warmth: number
  interview: boolean
  boundaryCrossed?: boolean
}): boolean {
  if (input.interview || input.boundaryCrossed) return false
  if (!input.armed) return false
  return input.warmth >= KEEP_THRESHOLD
}

/**
 * Time to tell her she is leaving soon.
 *
 * One directive, once, thirty seconds out. This is the only place the number
 * is decided for a rep that runs its full length, which is why the wind-down
 * and the offer are the same moment rather than two instructions racing.
 */
export function shouldWrapUp(input: {
  msRemaining: number
  alreadyWrapped: boolean
}): boolean {
  if (input.alreadyWrapped) return false
  return input.msRemaining <= WRAP_UP_MS
}

/** The clock has run out. The conversation is over; her sentence may not be. */
export function isTimeUp(msRemaining: number): boolean {
  return msRemaining <= 0
}

/**
 * Is the closing phase over?
 *
 * Two ways out: she finishes (the caller ends it on `agent.speech.stop`), or
 * one of these bounds is reached — silence for `CLOSING_IDLE_MS`, or the hard
 * ceiling at `CLOSING_GRACE_MS` however long she has been talking.
 */
export function isClosingOver(input: {
  msSinceTimeUp: number
  agentSpeaking: boolean
}): boolean {
  if (input.msSinceTimeUp >= CLOSING_GRACE_MS) return true
  return !input.agentSpeaking && input.msSinceTimeUp >= CLOSING_IDLE_MS
}

/**
 * The next thing the scene does to her, if it is due.
 *
 * Her availability used to change only in response to the user, which is not
 * how strangers work. Erin has a train in four minutes and it never arrived;
 * Jules's friend never came back; the argument with the brother never escalated.
 * A scene that only reacts is a scene with one person in it.
 *
 * Fired on the rep's own clock, in authored order, once each. Nothing here
 * touches warmth — a beat is a fact about the room, and how she takes it is
 * hers. That is also what makes it a training signal: recovering from an
 * interruption you did not cause is most of what actually happens in a bar.
 *
 * Beats past `LAST_BEAT_FRACTION` are ignored however they were authored. The
 * wind-down owns the end of a rep, and a character being handed two different
 * directions thirty seconds out is an argument this codebase has already had.
 */
export const LAST_BEAT_FRACTION = 0.75

export function dueSceneBeat(input: {
  beats: readonly SceneBeat[] | undefined
  /** 0-1 through the rep. */
  elapsedFraction: number
  /** How many have already fired this rep. */
  fired: number
}): SceneBeat | null {
  const beats = input.beats
  if (!beats || input.fired >= beats.length) return null

  const next = beats[input.fired]
  if (!next) return null
  if (next.at > LAST_BEAT_FRACTION) return null
  return input.elapsedFraction >= next.at ? next : null
}

/**
 * How far under the bar still counts as nearly.
 *
 * Eight points, and the number is the product decision rather than the
 * arithmetic: RETENTION-AUDIT R4 is that a rep which missed by four and a rep
 * that was never in it rendered as the same screen, and "she wasn't interested
 * from the start" is a reasonable thing to tell the second person and a
 * demotivating lie to tell the first.
 *
 * Wide enough that a real near-miss lands inside it and narrow enough that it
 * stays true — at nine or ten points under, "you were close" is flattery, and
 * a product that flatters on a loss is a product whose praise is worth nothing
 * on a win.
 */
export const NEAR_MISS_POINTS = 8

export interface ResultReading {
  /** The number to show against the threshold. */
  warmth: number
  threshold: number
  /** True when no decision warmth was stored and this is the final reading. */
  fallback: boolean
  /**
   * She was told to leave, and then the meter climbed past the bar anyway.
   *
   * Correct behaviour, and the single most confusing thing the result screen
   * can be asked to explain — so it is named here rather than inferred from
   * two numbers at the point of rendering.
   */
  lateSurge: boolean
  /**
   * How far under the bar the decision was taken. Negative on a late surge,
   * which is the only way a lost rep can read above the threshold.
   */
  close: number
  /**
   * Near enough that the screen is allowed to say so (R4).
   *
   * A late surge is always a near-miss however the arithmetic falls: getting
   * there thirty seconds after she answered is the definition of nearly, and
   * `close` is negative in that case rather than small.
   */
  nearMiss: boolean
}

/**
 * Which reading actually explains the outcome.
 *
 * **Not where the meter finished.** The ending is decided once, at the
 * wind-down, and may not change afterwards — so warmth can rise through the
 * last thirty seconds of a rep she has already been told to leave. Showing the
 * final value against `ARM_THRESHOLD` compares two numbers that were never
 * compared to each other, and it produced a real screen reading `71 / 65`
 * under the words "She left", captioned "You were close".
 *
 * `decisionWarmth` is null for reps recorded before it was kept; the final
 * reading stands in, and callers say which one they are showing.
 */
export function resultReading(input: {
  decisionWarmth: number | null
  finalWarmth: number
  interview: boolean
  /** Whether she gave it. Used to read a late surge off an older rep. */
  won: boolean
}): ResultReading {
  const threshold = repThreshold(input.interview)
  const fallback = input.decisionWarmth === null
  const warmth = input.decisionWarmth ?? input.finalWarmth

  // Finishing above the bar and not getting it is itself proof the decision
  // was taken on a lower number — there is no other way for both to be true.
  // So an older rep with no stored decision can still be read correctly, which
  // matters: those are the reps already sitting in somebody's history.
  const lateSurge = fallback
    ? !input.won && input.finalWarmth > threshold
    : warmth < threshold && input.finalWarmth > threshold

  const close = threshold - warmth

  return {
    warmth,
    threshold,
    fallback,
    lateSurge,
    close,
    nearMiss: !input.won && (lateSurge || (close > 0 && close <= NEAR_MISS_POINTS)),
  }
}

/**
 * `Four points`, not `4 points` — and `One point`, not `1 points`.
 *
 * The near-miss headline is the most motivating sentence the result screen can
 * produce, and a numeral in a headline reads as data. This is the one place in
 * the product where a number is deliberately spelled: everywhere else digits
 * are the house style (`tabular-nums` on all of them), and the difference is
 * that this one is being *said* rather than measured.
 */
const SPELLED = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const

export function pointsShort(points: number): string {
  const whole = Math.max(0, Math.round(points))
  const word = SPELLED[whole] ?? String(whole)
  const capital = word.charAt(0).toUpperCase() + word.slice(1)
  return `${capital} ${whole === 1 ? 'point' : 'points'}`
}

/**
 * The number on the card.
 *
 * Ours, not the model's. She is told to offer in her own words and never to
 * speak digits, because a number she improvises out loud and a number printed
 * on the screen would be a rep that ends in a contradiction. Random per rep,
 * so two wins are not the same trophy.
 */
export function inventNumber(random: () => number = Math.random): string {
  const prefixes = ['70', '71', '72', '74', '75', '76', '77', '78']
  const prefix = prefixes[Math.floor(random() * prefixes.length)] ?? '77'
  const block = (length: number) => String(Math.floor(random() * 10 ** length)).padStart(length, '0')
  return `+94 ${prefix} ${block(3)} ${block(4)}`
}
