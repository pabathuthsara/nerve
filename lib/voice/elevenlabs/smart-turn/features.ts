/**
 * Whisper log-mel features, byte-for-byte the recipe Smart Turn was trained on.
 *
 * ── WHAT "EXACT" MEANS HERE, AND WHY IT HAS TO BE ───────────────────────
 *
 * Smart Turn v3.x is a Whisper Tiny encoder with a linear head. It never sees
 * audio: it sees the matrix `WhisperFeatureExtractor(chunk_length=8)` makes,
 * called exactly as `inference.py` in pipecat-ai/smart-turn calls it. A model
 * fed features that are merely "log-mel-ish" does not fail loudly — it returns
 * a confident probability of something else, and the only symptom is a
 * character who cuts people off slightly more often than she used to. So every
 * step below is the reference's step, in the reference's order, and
 * `features.test.ts` holds the output to numbers computed by `transformers`
 * itself (the fixture and the script that made it are committed together).
 *
 * The recipe, as `inference.py` runs it:
 *
 *   1. Keep the LAST 8 s at 16 kHz; a shorter clip is left-padded with zeros
 *      (`audio_utils.truncate_audio_to_last_n_seconds`), so the speech sits
 *      at the END of the window — which is where the model looks for the end
 *      of a turn.
 *   2. `do_normalize=True`: zero mean, unit variance over the whole padded
 *      8 s, zeros included, epsilon 1e-7 under the square root. The padding
 *      is part of the statistics because the attention mask the extractor
 *      builds covers every sample of an already-padded array.
 *   3. STFT: n_fft 400, periodic Hann, hop 160, `center=True` with reflect
 *      padding of 200 either side → 801 frames. Power spectrum (|X|²).
 *   4. 80 Slaney-normalised mel filters on the Slaney mel scale, 0–8000 Hz.
 *   5. log10 of max(mel, 1e-10). Drop the LAST frame (800 remain).
 *   6. Floor at (global max − 8), then (x + 4) / 4.
 *
 * Output is [1, 80, 800] row-major (mel-major), float32 — the ONNX input
 * `input_features` exactly.
 *
 * ── COST ───────────────────────────────────────────────────────────────
 *
 * One call is 800 real 400-point FFTs (`fft.ts`) and a sparse mel product —
 * each Slaney filter touches a handful of bins, so the 80 x 201 matrix is
 * applied as a list of (start, weights) runs rather than a dense multiply.
 * Frame 801 is never computed at all, because step 5 throws it away before
 * step 6 reads the maximum. Buffers are allocated once per extractor.
 *
 * Pure: samples in, features out. No DOM, no audio APIs, no model.
 */

import { RealFft } from './fft'

export const SAMPLE_RATE = 16_000
export const WINDOW_SECONDS = 8
export const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS // 128 000
export const N_FFT = 400
export const HOP_LENGTH = 160
export const N_MELS = 80
/** 1 + 128 000 / 160 = 801 frames with centring; the last one is dropped. */
export const N_FRAMES = WINDOW_SAMPLES / HOP_LENGTH // 800
export const FEATURE_LENGTH = N_MELS * N_FRAMES // 64 000
/** The ONNX input's shape, [1, 80, 800]. */
export const FEATURE_DIMS: readonly [number, number, number] = [1, N_MELS, N_FRAMES]

const N_BINS = N_FFT / 2 + 1 // 201
const PAD = N_FFT / 2 // 200, reflect padding either side
const NORMALISE_EPSILON = 1e-7
const MEL_FLOOR = 1e-10
const DYNAMIC_RANGE = 8 // in log10 units, i.e. 80 dB
const F_MAX = 8000

/**
 * Step 1: the last 8 s, left-padded with zeros when shorter.
 *
 * `truncate_audio_to_last_n_seconds`, verbatim. Returns the input unchanged
 * (not copied) when it is already exactly 8 s long.
 */
export function lastEightSeconds(samples: Float32Array): Float32Array {
  if (samples.length === WINDOW_SAMPLES) return samples
  if (samples.length > WINDOW_SAMPLES) return samples.subarray(samples.length - WINDOW_SAMPLES)
  const out = new Float32Array(WINDOW_SAMPLES)
  out.set(samples, WINDOW_SAMPLES - samples.length)
  return out
}

/* ------------------------------------------------------------------ *
 * The mel filter bank (`transformers.audio_utils.mel_filter_bank`)
 * ------------------------------------------------------------------ */

const MIN_LOG_HERTZ = 1000
const MIN_LOG_MEL = 15
const LOG_STEP = 27 / Math.log(6.4)

function hertzToMelSlaney(hz: number): number {
  return hz >= MIN_LOG_HERTZ ? MIN_LOG_MEL + Math.log(hz / MIN_LOG_HERTZ) * LOG_STEP : (3 * hz) / 200
}

function melToHertzSlaney(mel: number): number {
  return mel >= MIN_LOG_MEL ? MIN_LOG_HERTZ * Math.exp((mel - MIN_LOG_MEL) / LOG_STEP) : (200 * mel) / 3
}

/** One filter as the run of bins it is non-zero on. */
export interface MelFilter {
  start: number
  weights: Float64Array
}

/**
 * The 80 Slaney filters, as sparse runs over the 201 FFT bins.
 *
 * Mirrors `mel_filter_bank(201, 80, 0, 8000, 16000, norm="slaney",
 * mel_scale="slaney")`: centre frequencies evenly spaced on the Slaney mel
 * scale, triangular in HERTZ between neighbours, each scaled by
 * 2 / (upper edge − lower edge) so every filter has unit area.
 */
export function melFilterBank(): MelFilter[] {
  const melMax = hertzToMelSlaney(F_MAX)
  const edges = new Float64Array(N_MELS + 2)
  const step = melMax / (N_MELS + 1)
  for (let i = 0; i < edges.length; i += 1) edges[i] = melToHertzSlaney(i === N_MELS + 1 ? melMax : i * step)

  const filters: MelFilter[] = []
  for (let m = 0; m < N_MELS; m += 1) {
    const lower = edges[m]!
    const centre = edges[m + 1]!
    const upper = edges[m + 2]!
    const enorm = 2 / (upper - lower)
    const dense = new Float64Array(N_BINS)
    let first = -1
    let last = -1
    for (let k = 0; k < N_BINS; k += 1) {
      const hz = (k * (SAMPLE_RATE / 2)) / (N_BINS - 1)
      const down = (hz - lower) / (centre - lower)
      const up = (upper - hz) / (upper - centre)
      const weight = Math.max(0, Math.min(down, up)) * enorm
      dense[k] = weight
      if (weight > 0) {
        if (first < 0) first = k
        last = k
      }
    }
    filters.push(first < 0 ? { start: 0, weights: new Float64Array(0) } : { start: first, weights: dense.slice(first, last + 1) })
  }
  return filters
}

/** Periodic Hann: `window_function(400, "hann")` = np.hanning(401)[:-1]. */
function periodicHann(n: number): Float64Array {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i += 1) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  return w
}

/* ------------------------------------------------------------------ *
 * The extractor
 * ------------------------------------------------------------------ */

export class LogMelExtractor {
  private readonly fft = new RealFft(N_FFT)
  private readonly window = periodicHann(N_FFT)
  private readonly filters = melFilterBank()
  /** The normalised 8 s window, with 200 samples of reflection either side. */
  private readonly padded = new Float32Array(WINDOW_SAMPLES + 2 * PAD)
  private readonly frame = new Float64Array(N_FFT)
  private readonly power = new Float64Array(N_BINS)

  /**
   * Features for the model, from 16 kHz mono float samples of any length.
   *
   * Only the last 8 s are read. `out`, when given, must hold 64 000 floats
   * and is returned filled; otherwise a new array is allocated.
   */
  extract(samples: Float32Array, out: Float32Array = new Float32Array(FEATURE_LENGTH)): Float32Array {
    if (out.length !== FEATURE_LENGTH) throw new Error(`features need ${FEATURE_LENGTH} floats, got ${out.length}`)
    const audio = lastEightSeconds(samples)
    this.normaliseInto(audio)
    this.reflect()

    const { padded, frame, window, power, filters, fft } = this
    let max = -Infinity
    for (let f = 0; f < N_FRAMES; f += 1) {
      const offset = f * HOP_LENGTH
      for (let i = 0; i < N_FFT; i += 1) frame[i] = padded[offset + i]! * window[i]!
      fft.power(frame, power)
      for (let m = 0; m < N_MELS; m += 1) {
        const { start, weights } = filters[m]!
        let energy = 0
        for (let i = 0; i < weights.length; i += 1) energy += weights[i]! * power[start + i]!
        // The reference casts to float32 after the log, so round here too:
        // the maximum below is taken over float32 values there.
        const value = Math.fround(Math.log10(energy > MEL_FLOOR ? energy : MEL_FLOOR))
        out[m * N_FRAMES + f] = value
        if (value > max) max = value
      }
    }

    const floor = max - DYNAMIC_RANGE
    for (let i = 0; i < FEATURE_LENGTH; i += 1) {
      const value = out[i]!
      out[i] = ((value > floor ? value : floor) + 4) / 4
    }
    return out
  }

  /**
   * Step 2, written straight into the centre of the padded buffer.
   *
   * Mean and variance in float64 (the reference reduces float32 with pairwise
   * summation, which lands within a few ulps of this), then stored as float32
   * because that is the dtype the reference normalises into.
   */
  private normaliseInto(audio: Float32Array): void {
    let sum = 0
    for (let i = 0; i < audio.length; i += 1) sum += audio[i]!
    const mean = sum / audio.length
    let squares = 0
    for (let i = 0; i < audio.length; i += 1) {
      const d = audio[i]! - mean
      squares += d * d
    }
    const scale = 1 / Math.sqrt(squares / audio.length + NORMALISE_EPSILON)
    const target = this.padded
    for (let i = 0; i < audio.length; i += 1) target[PAD + i] = (audio[i]! - mean) * scale
  }

  /** numpy's `reflect` mode: the edge sample is not repeated. */
  private reflect(): void {
    const p = this.padded
    const n = WINDOW_SAMPLES
    for (let i = 1; i <= PAD; i += 1) {
      p[PAD - i] = p[PAD + i]!
      p[PAD + n - 1 + i] = p[PAD + n - 1 - i]!
    }
  }
}

let shared: LogMelExtractor | null = null

/** Convenience: one lazily-built extractor per realm (page or worker). */
export function whisperLogMel(samples: Float32Array, out?: Float32Array): Float32Array {
  shared ??= new LogMelExtractor()
  return shared.extract(samples, out)
}
