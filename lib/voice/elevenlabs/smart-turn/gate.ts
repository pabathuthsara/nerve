/**
 * The VAD, the end-of-turn rule and the model's ears, as one object the
 * adapter can hold instead of a bare `VadDetector`.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * `policy.ts` says WHEN to concede given a silence and a probability. Getting
 * it into the adapter needs three more things, each of which is easy to get
 * subtly wrong at a call site:
 *
 *  1. A silence clock that agrees with the VAD's to the frame. The VAD does
 *     not expose its own (`vad.ts` is not ours to widen), so the gate mirrors
 *     it: `rms >= vad.threshold`, read immediately BEFORE `vad.push`, is the
 *     exact test `push` makes first, and a quiet run starts on the first quiet
 *     frame's timestamp exactly as the VAD's does.
 *  2. A VAD that never concedes before the rule would. It is built at the
 *     longest the rule can wait (`extendedSilenceMs`); an earlier concession is
 *     made by the gate, through `vad.flush`, and reported in the VAD's own
 *     event shape — `atMs` where the silence began, `silenceMs` how long it
 *     was waited out — so `onUserSpeechStop` cannot tell the two apart.
 *  3. The audio the model reads: the mic frames, resampled to 16 kHz, held for
 *     8 s, and marked where his turn began (`ring.ts` says why the mark).
 *
 * With no answer from the model the gate emits exactly the events a plain
 * `VadDetector` at the calibrated silence emits, frame for frame
 * (`gate.test.ts`). That is the whole fail-soft contract, and it is why the
 * gate can be switched on before the model has ever loaded on a given phone.
 *
 * The model itself is not in here. The gate asks for a probe (`step.probe`),
 * the caller runs `SmartTurnDetector.probability(gate.turnAudio())`, and hands
 * the answer back with `answer()`. Keeping the async edge outside is what
 * keeps this file pure: frames and numbers in, events out, no timers, no
 * promises, no worker.
 */

import { VadDetector, frameRms, type VadEvent, type VadOptions } from '../vad'
import { decideEndOfTurn, extendedSilenceMs, shouldProbe, usableProbability } from './policy'
import { StreamingResampler } from './resample'
import { TURN_PRE_ROLL_MS, TurnAudioBuffer } from './ring'

export interface EndOfTurnGateOptions {
  /** `resolveSilenceMs(calibration)` — `minted.pipeline.turn.silenceMs` in the adapter. */
  calibratedMs: number
  /** The AudioContext's rate, which is the rate the capture frames arrive at. */
  inputRate: number
  /** Everything else the VAD takes. `silenceMs` is the gate's to set. */
  vad?: Omit<VadOptions, 'silenceMs'>
}

export interface GateStep {
  /**
   * What happened to the turn on this frame, in `VadDetector.push`'s own
   * shape. Handle it exactly as the adapter handles `vad.push` today.
   */
  event: VadEvent | null
  /**
   * Set on the one frame per pause the model should be asked: the pause's
   * id, to hand back to `answer()` with the probability.
   */
  probe: number | null
}

const NOTHING: GateStep = { event: null, probe: null }

export class EndOfTurnGate {
  /**
   * The detector itself. The adapter keeps calling `setDucked`,
   * `setDuckedActivationRatio`, `isSpeaking`, `flush` and `reset` on it as
   * it does today — none of those move the gate's clock.
   */
  readonly vad: VadDetector
  readonly calibratedMs: number
  private readonly resampler: StreamingResampler
  private readonly ring = new TurnAudioBuffer()

  /** Counts pauses, so a late answer can be matched to the pause it was for. */
  private pause = 0
  /** When the current pause's first quiet frame arrived, or null outside a pause. */
  private quietSince: number | null = null
  private probed = false
  private probability: number | null = null

  constructor(options: EndOfTurnGateOptions) {
    this.calibratedMs = options.calibratedMs
    this.vad = new VadDetector({ ...options.vad, silenceMs: extendedSilenceMs(options.calibratedMs) })
    this.resampler = new StreamingResampler(options.inputRate)
  }

  /**
   * One capture frame, at the context's rate. Call it where the adapter calls
   * `vad.push` today, after `setDucked` for the frame.
   */
  push(frame: Float32Array, atMs: number): GateStep {
    this.ring.push(this.resampler.push(frame))

    const rms = frameRms(frame)
    const wasSpeaking = this.vad.isSpeaking
    // Read before `push`: this is the comparison `push` makes on its first line.
    const loud = rms >= this.vad.threshold
    const event = this.vad.push(rms, atMs)

    if (event) {
      this.endPause()
      // Every onset the VAD reports starts a new turn: a pause inside his turn
      // never reaches `speech.stop`, so it never produces a second onset. The
      // `endTurn` first is for the one other way a turn can close — the
      // adapter calling `vad.flush()` or `vad.reset()` directly — so a stale
      // mark can never put her last line in front of his next one.
      this.ring.endTurn()
      // `atMs` on an onset is backdated to the first loud frame.
      if (event.type === 'speech.start') this.ring.markTurnStart(atMs - event.atMs + TURN_PRE_ROLL_MS)
      return { event, probe: null }
    }

    if (!wasSpeaking || loud) {
      // Not in his turn, or talking through it: no pause is running.
      this.endPause()
      return NOTHING
    }

    if (this.quietSince === null) {
      this.quietSince = atMs
      this.pause += 1
    }
    const silenceMs = atMs - this.quietSince
    const stop = this.concedeIfDue(atMs)
    if (stop) return { event: stop, probe: null }

    if (!shouldProbe(silenceMs, this.probed)) return NOTHING
    this.probed = true
    return { event: null, probe: this.pause }
  }

  /**
   * The model's answer for `pause`, arriving at `atMs`.
   *
   * Returns the stop event when the answer concedes the turn on the spot.
   * An answer for a pause that has already ended — he spoke again, or the
   * calibrated silence ran out first — is discarded: it describes audio that
   * is no longer the end of his turn.
   */
  answer(pause: number, probability: number | null, atMs: number): VadEvent | null {
    if (pause !== this.pause || this.quietSince === null) return null
    this.probability = usableProbability(probability)
    return this.concedeIfDue(atMs)
  }

  /**
   * His turn so far, 16 kHz, at most the last 8 s: the model's input. Fresh
   * every call, so it can be transferred to the worker.
   */
  turnAudio(): Float32Array {
    return this.ring.turnAudio()
  }

  /** Forget the turn and the audio. Call beside `vad.reset()`. */
  reset(): void {
    this.vad.reset()
    this.ring.reset()
    this.resampler.reset()
    this.endPause()
  }

  private concedeIfDue(atMs: number): VadEvent | null {
    const since = this.quietSince
    if (since === null) return null
    const silenceMs = atMs - since
    const decision = decideEndOfTurn({ silenceMs, probability: this.probability, calibratedMs: this.calibratedMs })
    if (decision !== 'concede') return null
    this.vad.flush(atMs)
    this.endPause()
    this.ring.endTurn()
    return { type: 'speech.stop', atMs: since, silenceMs }
  }

  private endPause(): void {
    this.quietSince = null
    this.probed = false
    this.probability = null
  }
}
