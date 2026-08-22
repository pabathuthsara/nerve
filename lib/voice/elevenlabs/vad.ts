/**
 * Our voice-activity detector.
 *
 * The reason this branch uses raw text-to-speech rather than ElevenAgents:
 * a managed agent owns turn-taking, and turn-taking is the one thing we are not
 * willing to hand over. The calibrated silence threshold (§05, problem one) is
 * a per-user number measured on the mic-check screen, and a nervous speaker who
 * pauses mid-sentence is precisely the case a vendor default gets wrong.
 *
 * Two jobs, and they have different deadlines:
 *
 *  - **End of turn.** Wait out `silenceMs` before conceding. Deliberately slow;
 *    this is the patience dial.
 *  - **Barge-in onset.** Fire as soon as speech is credible. Deliberately fast,
 *    because every millisecond here is audio of hers that keeps playing over
 *    the top of the user.
 *
 * Pure: energy in, events out. No AudioContext, no timers, no DOM — so the
 * whole state machine is testable without a microphone.
 */

export type VadEventType = 'speech.start' | 'speech.stop'

export interface VadEvent {
  type: VadEventType
  /** Milliseconds on the caller's clock. */
  atMs: number
  /**
   * For `speech.stop`, how long the detector waited before conceding — the
   * `vadSilenceMs` stage in the pipeline telemetry. It is the one stage we
   * choose rather than measure, and it belongs in the breakdown so it is not
   * mistaken for network time.
   */
  silenceMs?: number
}

export interface VadOptions {
  /** Silence before the turn is conceded. Calibrated per user; 600 default. */
  silenceMs: number
  /**
   * Consecutive speech-energy time before onset is believed.
   *
   * Short, because it gates barge-in. A door slam gets through occasionally and
   * costs one cancelled clip; being slow here costs overlapping speech on every
   * single interruption, which is what the round-8 log was full of.
   */
  onsetMs?: number
  /** How far above the running noise floor counts as speech. */
  activationRatio?: number
  /**
   * The same ratio while her voice is playing out of the speakers.
   *
   * Echo cancellation removes most of her from the mic but not all of it, and a
   * false barge-in is worse than a late one: it truncates a turn the user was
   * happily listening to. So the bar goes up while she talks.
   */
  duckedActivationRatio?: number
  /** Absolute RMS below which nothing is ever speech, whatever the floor says. */
  noiseGate?: number
}

const DEFAULTS = {
  onsetMs: 90,
  activationRatio: 2.5,
  duckedActivationRatio: 4.5,
  noiseGate: 0.006,
} as const

export class VadDetector {
  private readonly silenceMs: number
  private readonly onsetMs: number
  private readonly activationRatio: number
  private duckedActivationRatio: number
  private readonly noiseGate: number

  /** Running estimate of the room, adapted only while nobody is speaking. */
  private noiseFloor = 0.004
  private speaking = false
  /** When the current run of above/below-threshold frames began. */
  private runStartedMs: number | null = null
  private ducked = false
  private lastAtMs = 0

  constructor(options: VadOptions) {
    this.silenceMs = Math.max(100, options.silenceMs)
    this.onsetMs = options.onsetMs ?? DEFAULTS.onsetMs
    this.activationRatio = options.activationRatio ?? DEFAULTS.activationRatio
    this.duckedActivationRatio = options.duckedActivationRatio ?? DEFAULTS.duckedActivationRatio
    this.noiseGate = options.noiseGate ?? DEFAULTS.noiseGate
  }

  /** True while her audio is playing, so the activation bar is raised. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked
  }

  /**
   * How hard the user has to try to take the floor back while she is talking.
   *
   * The Level 5 dial lands here. A character permitted to cut across the user
   * is also permitted to hold a floor she has taken, so the bar goes up; one
   * who may never talk over anyone yields at the first sign of speech.
   */
  setDuckedActivationRatio(ratio: number): void {
    this.duckedActivationRatio = Math.max(1, ratio)
  }

  get isSpeaking(): boolean {
    return this.speaking
  }

  /** The bar a frame has to clear right now. Exposed for the harness readout. */
  get threshold(): number {
    const ratio = this.ducked ? this.duckedActivationRatio : this.activationRatio
    return Math.max(this.noiseGate, this.noiseFloor * ratio)
  }

  /**
   * One frame of microphone energy.
   *
   * `rms` is root-mean-square amplitude over the frame, 0–1. `atMs` is a
   * monotonic clock; frame size is inferred from the gap, so an irregular
   * callback interval does not skew the silence window.
   */
  push(rms: number, atMs: number): VadEvent | null {
    this.lastAtMs = atMs
    const loud = rms >= this.threshold

    // The floor only learns from silence. Adapting it during speech would let a
    // long sentence raise the bar until the speaker's own voice fell under it.
    if (!loud && !this.speaking) {
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05
    }

    if (loud === this.speaking) {
      // The run agreeing with the current state means nothing is pending.
      this.runStartedMs = null
      return null
    }

    if (this.runStartedMs === null) {
      this.runStartedMs = atMs
      return null
    }

    const held = atMs - this.runStartedMs
    if (this.speaking) {
      if (held < this.silenceMs) return null
      this.speaking = false
      this.runStartedMs = null
      // Timestamped at the moment speech actually stopped, not at the moment we
      // conceded — otherwise every latency measurement carries the silence
      // window twice, once here and once in `perceivedMs`.
      return { type: 'speech.stop', atMs: this.runStartedMsOrigin(atMs, held), silenceMs: held }
    }

    if (held < this.onsetMs) return null
    this.speaking = true
    this.runStartedMs = null
    return { type: 'speech.start', atMs: atMs - held }
  }

  /**
   * Force the turn closed — the rep ended, or the transport dropped, while she
   * was mid-sentence. Returns the stop event if one was owed.
   */
  flush(atMs = this.lastAtMs): VadEvent | null {
    if (!this.speaking) return null
    this.speaking = false
    this.runStartedMs = null
    return { type: 'speech.stop', atMs, silenceMs: 0 }
  }

  reset(): void {
    this.speaking = false
    this.runStartedMs = null
    this.noiseFloor = 0.004
  }

  private runStartedMsOrigin(atMs: number, held: number): number {
    return atMs - held
  }
}

/** RMS of one frame of mono float samples. */
export function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0
  let sum = 0
  for (let i = 0; i < frame.length; i += 1) {
    const sample = frame[i] ?? 0
    sum += sample * sample
  }
  return Math.sqrt(sum / frame.length)
}
