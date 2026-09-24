/**
 * Microphone rate → 16 kHz, one 20 ms frame at a time.
 *
 * ── WHY A REAL FILTER, AND NOT EVERY OTHER SAMPLE ───────────────────────
 *
 * The adapter's AudioContext runs at the TTS output rate (24 kHz by default,
 * `PCM_RATES` in `config.ts`) so that nothing on HER path resamples. Smart
 * Turn wants 16 kHz. Picking samples, or interpolating linearly, folds
 * everything between 8 and 12 kHz back down into 4–8 kHz — fricatives,
 * breath, the hiss of a cheap laptop mic — and the top of the mel range is
 * exactly where the model hears the end of a word trail off. It was trained
 * on properly band-limited 16 kHz audio; mirror images of the user's sibilants
 * are not something it has ever been shown.
 *
 * So: a rational polyphase resampler (up by L, down by M, with L/M = 16000 /
 * input rate reduced) around one Kaiser-windowed sinc. 24 kHz is L = 2,
 * M = 3; 22.05 kHz is 320 / 441; 16 kHz is a straight copy.
 *
 * ── THE FILTER ──────────────────────────────────────────────────────────
 *
 * Cutoff at 0.92 of the OUTPUT Nyquist (7.36 kHz), Kaiser β = 7 (≈ 70 dB
 * stopband), and a half-width of 22 output samples scaled to the input rate —
 * 33 taps a side at 24 kHz. That puts the whole transition band between about
 * 6.5 and 8.2 kHz: the top mel filter (≈ 7.4–8 kHz) loses a few dB, and
 * nothing above 8.2 kHz reaches the output at more than −70 dB. The half-width
 * scales with the decimation ratio so the transition stays the same width in
 * HERTZ whatever rate the context was opened at.
 *
 * Each of the L phases is normalised to unit DC gain, so a constant stays
 * exactly that constant. The kernel is centred on each output instant, so
 * there is no group delay to account for: output sample n IS input time
 * n·M/L. The only latency is availability — an output waits for the half-width
 * of input after it, 33 samples, 1.4 ms at 24 kHz.
 *
 * Cost at 24 kHz: 66 multiply-adds per output sample, ≈ 1 M a second of
 * speech. Nothing next to the VAD's own per-frame work.
 *
 * Pure: frames in, frames out. No AudioContext, no timers.
 */

export const TARGET_RATE = 16_000

/** Fraction of the output Nyquist the passband runs to. */
const ROLL_OFF = 0.92
const KAISER_BETA = 7
/** Half-width of the kernel, in OUTPUT samples. */
const HALF_WIDTH_OUT = 22

function gcd(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** Modified Bessel function of the first kind, order zero (series form). */
function besselI0(x: number): number {
  let sum = 1
  let term = 1
  const q = (x * x) / 4
  for (let k = 1; k < 64; k += 1) {
    term *= q / (k * k)
    sum += term
    if (term < sum * 1e-17) break
  }
  return sum
}

function sinc(x: number): number {
  if (x === 0) return 1
  const px = Math.PI * x
  return Math.sin(px) / px
}

export class StreamingResampler {
  readonly inputRate: number
  readonly outputRate: number
  /** Interpolation factor L. */
  private readonly up: number
  /** Decimation factor M. */
  private readonly down: number
  /** Taps either side of the output instant, in INPUT samples. */
  private readonly half: number
  /** L phases × 2·half taps. */
  private readonly table: Float32Array
  private readonly passthrough: boolean

  /** Retained input. `buffer[0]` is absolute input index `bufferStart`. */
  private buffer: Float32Array
  private bufferLength = 0
  private bufferStart = 0
  /** Total input samples received. */
  private received = 0
  /** Input index and phase of the next output sample: time = index + phase/L. */
  private nextIndex = 0
  private nextPhase = 0

  constructor(inputRate: number, outputRate: number = TARGET_RATE) {
    if (!Number.isInteger(inputRate) || inputRate <= 0) throw new Error(`input rate must be a positive integer, got ${inputRate}`)
    if (!Number.isInteger(outputRate) || outputRate <= 0) throw new Error(`output rate must be a positive integer, got ${outputRate}`)
    this.inputRate = inputRate
    this.outputRate = outputRate
    const g = gcd(inputRate, outputRate)
    this.up = outputRate / g
    this.down = inputRate / g
    this.passthrough = inputRate === outputRate
    this.half = Math.ceil(HALF_WIDTH_OUT * Math.max(1, inputRate / outputRate))
    this.table = this.passthrough ? new Float32Array(0) : this.buildTable()
    this.buffer = new Float32Array(Math.max(4096, 4 * this.half))
    this.reset()
  }

  /** Samples of input an output waits for. The resampler's only latency. */
  get latencySamples(): number {
    return this.passthrough ? 0 : this.half
  }

  /** Back to silence, as if newly built. */
  reset(): void {
    // Pre-roll of zeros standing in for the time before the first frame, so
    // the first output sample has a full kernel's worth of (silent) past.
    this.bufferLength = this.half
    this.buffer.fill(0, 0, this.half)
    this.bufferStart = -this.half
    this.received = 0
    this.nextIndex = 0
    this.nextPhase = 0
  }

  /**
   * Feed one block of input; get back every output sample it completes.
   *
   * Block size is free — 480, 1, 10 000 — and the concatenated output is
   * identical however the same input was split (`resample.test.ts`).
   */
  push(input: Float32Array): Float32Array {
    if (this.passthrough) return input.slice()
    this.append(input)
    this.received += input.length

    const { up, down, half, table } = this
    const taps = 2 * half
    // Upper bound on how many outputs this block can complete.
    const capacity = Math.ceil(((input.length + half) * up) / down) + 2
    const out = new Float32Array(capacity)
    let count = 0
    while (this.nextIndex + half < this.received) {
      const base = this.nextIndex - half + 1 - this.bufferStart
      const row = this.nextPhase * taps
      let acc = 0
      for (let k = 0; k < taps; k += 1) acc += table[row + k]! * this.buffer[base + k]!
      out[count++] = acc
      this.nextPhase += down
      while (this.nextPhase >= up) {
        this.nextPhase -= up
        this.nextIndex += 1
      }
    }
    this.compact()
    return count === capacity ? out : out.slice(0, count)
  }

  private buildTable(): Float32Array {
    const { up, half } = this
    const taps = 2 * half
    // Cutoff as a fraction of the INPUT Nyquist.
    const cutoff = (ROLL_OFF * Math.min(this.inputRate, this.outputRate)) / this.inputRate
    const norm = besselI0(KAISER_BETA)
    const table = new Float32Array(up * taps)
    for (let phase = 0; phase < up; phase += 1) {
      let sum = 0
      const row = new Float64Array(taps)
      for (let k = 0; k < taps; k += 1) {
        // Distance, in input samples, from the output instant to tap k.
        const d = phase / up + (half - 1 - k)
        const x = d / half
        const window = Math.abs(x) >= 1 ? 0 : besselI0(KAISER_BETA * Math.sqrt(1 - x * x)) / norm
        const h = cutoff * sinc(cutoff * d) * window
        row[k] = h
        sum += h
      }
      for (let k = 0; k < taps; k += 1) table[phase * taps + k] = row[k]! / sum
    }
    return table
  }

  private append(input: Float32Array): void {
    const needed = this.bufferLength + input.length
    if (needed > this.buffer.length) {
      const grown = new Float32Array(Math.max(needed, this.buffer.length * 2))
      grown.set(this.buffer.subarray(0, this.bufferLength))
      this.buffer = grown
    }
    this.buffer.set(input, this.bufferLength)
    this.bufferLength = needed
  }

  /** Drop input no future output can reach. */
  private compact(): void {
    const keepFrom = this.nextIndex - this.half + 1
    const drop = keepFrom - this.bufferStart
    if (drop <= 0) return
    this.buffer.copyWithin(0, drop, this.bufferLength)
    this.bufferLength -= drop
    this.bufferStart = keepFrom
  }
}
