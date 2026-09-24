/**
 * The last 8 seconds of his voice, at 16 kHz, and where his turn began.
 *
 * ── WHY THE TURN MARK, AND NOT SIMPLY "THE LAST 8 SECONDS" ─────────────
 *
 * Smart Turn's own guidance (pipecat-ai/smart-turn README, "Notes on input
 * format") is to give it "the full audio of the user's current turn",
 * truncated from the front to 8 s, and that "audio from previous turns does
 * not need to be included". Pipecat's analyser does exactly that: it slices
 * from the turn's speech start, not from eight seconds ago. The model was
 * trained on single-speaker turns with zeros in front of them.
 *
 * A blind 8 s window would hand it something else. The mic hears the room
 * while SHE talks — echo-cancelled, not echo-free — and her last line would
 * sit in the window in front of his first words. On a short answer ("Yeah,
 * logistics.") most of the window would be her. So the buffer keeps the last
 * 8 s regardless (memory is bounded and nothing is ever re-allocated), and
 * `turnAudio()` returns only what came after the mark, with the extractor
 * left-padding the rest with zeros exactly as the reference does.
 *
 * The mark is set at his first speech onset after she last took the floor and
 * is NOT moved by a pause-and-resume inside his turn: the upstream guidance is
 * explicit that a resumed turn is re-scored whole, "including the new audio,
 * rather than just the new segment".
 *
 * Pure: samples in, samples out. The caller owns the clock.
 */

import { SAMPLE_RATE, WINDOW_SAMPLES } from './features'

/**
 * Audio kept in front of the VAD's onset.
 *
 * The energy VAD dates onset to the first loud frame it believed, and a soft
 * consonant ("h", "f", a breath before "so…") sits under that bar. Two hundred
 * milliseconds is enough to keep the start of the first word, and short enough
 * that it cannot reach back into her last syllable on a quick reply.
 */
export const TURN_PRE_ROLL_MS = 200

const SAMPLES_PER_MS = SAMPLE_RATE / 1000

export class TurnAudioBuffer {
  readonly capacity: number
  private readonly ring: Float32Array
  /** Absolute count of samples ever pushed. The buffer's own clock. */
  private written = 0
  /** Absolute sample index the current turn starts at, or null between turns. */
  private turnStart: number | null = null

  constructor(capacity: number = WINDOW_SAMPLES) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error(`capacity must be a positive integer, got ${capacity}`)
    this.capacity = capacity
    this.ring = new Float32Array(capacity)
  }

  /** Samples ever pushed, at 16 kHz. */
  get total(): number {
    return this.written
  }

  /** Samples currently held (at most `capacity`). */
  get held(): number {
    return Math.min(this.written, this.capacity)
  }

  /** True between `markTurnStart` and `endTurn`. */
  get inTurn(): boolean {
    return this.turnStart !== null
  }

  push(samples: Float32Array): void {
    const n = samples.length
    if (n === 0) return
    if (n >= this.capacity) {
      // Only the newest `capacity` samples can survive; write them in place.
      const tail = samples.subarray(n - this.capacity)
      const at = (this.written + n - this.capacity) % this.capacity
      const first = this.capacity - at
      this.ring.set(tail.subarray(0, first), at)
      this.ring.set(tail.subarray(first), 0)
    } else {
      const at = this.written % this.capacity
      const first = Math.min(n, this.capacity - at)
      this.ring.set(samples.subarray(0, first), at)
      if (first < n) this.ring.set(samples.subarray(first), 0)
    }
    this.written += n
  }

  /**
   * His turn began `msAgo` milliseconds before the newest sample.
   *
   * Pass the VAD's backdated onset plus `TURN_PRE_ROLL_MS`. A second call while
   * a turn is open is ignored — see the header: a resumed turn is one turn.
   */
  markTurnStart(msAgo = 0): void {
    if (this.turnStart !== null) return
    const back = Math.max(0, Math.round(msAgo * SAMPLES_PER_MS))
    this.turnStart = Math.max(0, this.written - back)
  }

  /** She has the floor again. The next onset starts a new turn. */
  endTurn(): void {
    this.turnStart = null
  }

  /**
   * The current turn's audio, oldest first, at most `capacity` samples.
   *
   * Between turns (no mark) this is everything held — the plain "last 8 s",
   * which is the right fallback for a caller that never marks. Always a fresh
   * array: the caller may transfer it to a worker.
   */
  turnAudio(): Float32Array {
    const oldestHeld = this.written - this.held
    const from = this.turnStart === null ? oldestHeld : Math.max(this.turnStart, oldestHeld)
    return this.slice(from, this.written)
  }

  /** The newest `count` samples (or fewer, if fewer are held), oldest first. */
  latest(count: number): Float32Array {
    const n = Math.max(0, Math.min(Math.floor(count), this.held))
    return this.slice(this.written - n, this.written)
  }

  reset(): void {
    this.written = 0
    this.turnStart = null
    this.ring.fill(0)
  }

  /** Absolute [from, to) → a fresh array. `from` must be within what is held. */
  private slice(from: number, to: number): Float32Array {
    const n = to - from
    const out = new Float32Array(n)
    if (n === 0) return out
    const at = from % this.capacity
    const first = Math.min(n, this.capacity - at)
    out.set(this.ring.subarray(at, at + first), 0)
    if (first < n) out.set(this.ring.subarray(0, n - first), first)
    return out
  }
}
