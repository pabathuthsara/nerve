/**
 * When to give her the floor: silence, plus what his voice sounded like.
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────
 *
 * Today the turn is conceded after a fixed stretch of silence — the user's
 * calibrated number, `resolveSilenceMs`, 600 ms by default — and nothing
 * else. That number is a compromise between two failures that pull in
 * opposite directions: too short and she talks over a nervous man's
 * mid-sentence pause (`HUMANNESS-PLAN.md` §5.1 calls it the most inhuman thing
 * the product can do); too long and every finished sentence is followed by
 * dead air before she even starts thinking. A timer cannot tell the two
 * pauses apart. Smart Turn can, from prosody — a falling, finished contour
 * against a held, suspended one — and `PERSONA-REALISM-REPORT` §3.2 L4 is the
 * rule below.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────
 *
 * The model is asked ONCE per pause, after `PROBE_AFTER_MS` of silence, on his
 * whole turn so far. Its answer, p = P(turn is complete), sets the deadline:
 *
 *   p ≥ 0.7          he sounds done        concede now (at the probe)
 *   0.5 ≤ p < 0.7    leaning done          the calibrated silence (today)
 *   p < 0.5          he sounds unfinished  the EXTENDED silence (below)
 *   no answer        model off, failed,    the calibrated silence (today)
 *                    or not back yet
 *
 * Speech resuming ends the pause and discards its answer; the next pause is
 * probed afresh on the longer turn. Nothing here ever concedes EARLIER than
 * the probe, and "no answer" is today's behaviour to the millisecond —
 * `gate.test.ts` drives a plain `VadDetector` at the calibrated silence beside
 * the gate that applies this rule, and requires both to emit the same events
 * on the same frames. That is the fail-soft promise: a phone that cannot load
 * the model gets exactly the product it has now.
 *
 * ── WHAT "NOW" COSTS IN A BROWSER ───────────────────────────────────────
 *
 * The report's "~12 ms" is native ONNX Runtime on several cores. In a browser
 * the model runs as single-threaded WebAssembly — threads need cross-origin
 * isolation, which means COOP/COEP headers — and that is a different number.
 * Measured on an Apple M4, int8 model, p50 of 20 runs (24 September 2026):
 *
 *   Chrome 153, WebAssembly, 1 thread               305 ms
 *   Chrome 153, WebAssembly, 4 threads (isolated)   119 ms
 *   Node 22, the same WebAssembly, 1 thread         303 ms  (`npm run smart-turn:check`)
 *   native ONNX Runtime, 1 thread / all cores       67 / 26 ms
 *
 * (The fp32 export is no faster in WebAssembly — 281 ms — and four times the
 * download.) Log-mel is ~5 ms on top. So on a fast laptop the p ≥ 0.7 branch
 * concedes at about 200 + 20 (a frame) + 310 ≈ 530 ms of silence: roughly
 * 70 ms sooner than today, not the report's 350. The report's figure needs the
 * threaded build. On a device where the answer takes more than ~400 ms, it
 * lands after the calibrated silence has already conceded the pause, and is
 * discarded (`EndOfTurnGate.answer`) — so a slow phone gets today's product,
 * never a worse one. The extension below still works whenever the answer
 * beats the calibrated silence, and the extension is the half that stops her
 * talking over him.
 *
 * Probing EARLIER to buy the latency back would be off-distribution: pipecat
 * runs the model after its VAD's 200 ms stop, and on synthesised speech a
 * 10 ms change in the trailing silence alone moves p by up to 0.4. The probe
 * point is what the model was trained against; move it only with recordings.
 *
 * ── WHY THE EXTENSION IS 1.6× AND NEVER PAST 1200 MS ────────────────────
 *
 * The calibrated number was always a ceiling on patience for EVERY pause, so
 * it had to stay short. Once the extension applies only to pauses that sound
 * unfinished it can afford to be longer — the report's point — but it cannot
 * be unbounded, because the model is sometimes wrong, and when it is wrong on
 * a finished line every extra millisecond is dead air on top of a reply that
 * already lands ~3.4 s after him (§1.1). So:
 *
 *  - Multiplicative, so calibration keeps its meaning: a quick speaker at
 *    400 ms gets 640, a slow one at 700 gets 1120. One fixed bonus would give
 *    the quick speaker proportionally the most dead air.
 *  - 1.6× at the 600 ms default is 960 ms: past the bulk of the hesitation
 *    pauses inside a turn (the "medium" 200 ms–1 s band in Campione & Véronis'
 *    cross-language pause study, 2002), and a worst case of +360 ms when the
 *    model is wrong.
 *  - Capped at 1200 ms, just past Jefferson's (1989) "standard maximum"
 *    silence of about one second. A silence longer than that stops reading as
 *    him pausing and starts reading as the floor being offered — waiting out
 *    more than that is her failing to answer, not her being patient.
 *  - Never BELOW the calibrated number. A user already calibrated past 1200
 *    keeps his own number; the model can shorten his wait, never lengthen it.
 *
 * The three numbers are named constants so the first measured reps can move
 * them; `PERSONA-REALISM-REPORT` §3.1 budgets the whole end-of-turn stage at
 * 200–300 ms, which is the p ≥ 0.7 branch — reachable with the threaded
 * build (≈ 340 ms), not with the single-threaded one this ships with.
 *
 * Pure: numbers in, a decision out.
 */

/** Silence before the model is asked. Also the earliest she can ever take the floor. */
export const PROBE_AFTER_MS = 200
/** At or above this, he sounds finished: concede at the probe. */
export const CONFIDENT_COMPLETE = 0.7
/** Below this, he sounds mid-thought: wait out the extended silence. */
export const SOUNDS_UNFINISHED_BELOW = 0.5
/** How much longer an unfinished-sounding pause may run than the calibrated one. */
export const EXTENSION_FACTOR = 1.6
/** The extension never runs past this. */
export const EXTENSION_CEILING_MS = 1200

export type EndOfTurnDecision = 'concede' | 'wait'

export interface EndOfTurnInput {
  /** Continuous silence so far in this pause, on the VAD's clock. */
  silenceMs: number
  /**
   * P(turn complete) from the model FOR THIS PAUSE, or null: model disabled,
   * failed, still loading, or the answer not back yet. Anything that is not a
   * finite number in [0, 1] is treated as null.
   */
  probability: number | null
  /** `resolveSilenceMs(calibration)` — today's whole rule. */
  calibratedMs: number
}

/** A probability the policy is willing to act on, or null. */
export function usableProbability(probability: number | null | undefined): number | null {
  if (probability === null || probability === undefined) return null
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return null
  return probability
}

/** The longest an unfinished-sounding pause may run before she takes the floor. */
export function extendedSilenceMs(calibratedMs: number): number {
  const stretched = Math.min(Math.round(calibratedMs * EXTENSION_FACTOR), EXTENSION_CEILING_MS)
  return Math.max(calibratedMs, stretched)
}

/**
 * The silence at which this pause is conceded, given what the model said.
 *
 * The VAD's own `silenceMs` must be set to `extendedSilenceMs(calibrated)` so
 * it never concedes on its own before this does. `EndOfTurnGate` (`gate.ts`)
 * builds its VAD that way; nothing else should need to.
 */
export function concedeAtMs(probability: number | null, calibratedMs: number): number {
  const p = usableProbability(probability)
  if (p === null) return calibratedMs
  if (p >= CONFIDENT_COMPLETE) return Math.min(PROBE_AFTER_MS, calibratedMs)
  if (p < SOUNDS_UNFINISHED_BELOW) return extendedSilenceMs(calibratedMs)
  return calibratedMs
}

/** The whole rule. Call it on every silent frame, and again when an answer arrives. */
export function decideEndOfTurn(input: EndOfTurnInput): EndOfTurnDecision {
  return input.silenceMs >= concedeAtMs(input.probability, input.calibratedMs) ? 'concede' : 'wait'
}

/**
 * Whether to ask the model now: once per pause, from `PROBE_AFTER_MS` on.
 *
 * Asking only once is the report's rule and pipecat's practice (one inference
 * per VAD stop). A second ask later in the same pause is the same voice with a
 * longer tail of silence behind it, and letting a flip on that tail cut off a
 * pause the first answer protected would make the extension worth nothing.
 */
export function shouldProbe(silenceMs: number, alreadyProbed: boolean): boolean {
  return !alreadyProbed && silenceMs >= PROBE_AFTER_MS
}
