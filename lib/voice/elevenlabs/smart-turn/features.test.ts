import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FEATURE_LENGTH,
  N_FRAMES,
  N_MELS,
  WINDOW_SAMPLES,
  LogMelExtractor,
  lastEightSeconds,
  melFilterBank,
  whisperLogMel,
} from './features'
import { readWav16 } from './wav'

/*
 * The reference is `transformers.WhisperFeatureExtractor(chunk_length=8)`,
 * called exactly as pipecat-ai/smart-turn's `inference.py` calls it. The
 * numbers come from `fixtures/make_fixture.py`, which is committed beside
 * them; the header there says what is stored and why it is not all of it.
 */

interface ReferenceCase {
  rowMean: number[]
  colMean: number[]
  max: number
  min: number
  sampled: number[]
  tail: number[]
  samples: number
  signalSum: number
  probability?: number
}

interface Reference {
  sampleStride: number
  tailFrames: number
  cases: { synthetic: ReferenceCase; speech: ReferenceCase }
}

const FIXTURES = join(__dirname, 'fixtures')
const reference = JSON.parse(readFileSync(join(FIXTURES, 'whisper-features.json'), 'utf8')) as Reference

/** The same ten seconds `make_fixture.py` builds, in the same order of operations. */
function synthetic(): Float32Array {
  const out = new Float32Array(10 * 16_000)
  for (let n = 0; n < out.length; n += 1) {
    const t = n / 16_000
    const chirp = Math.sin(2 * Math.PI * (80 * t + 0.5 * 350 * t * t))
    const tone = 0.3 * Math.sin(2 * Math.PI * 1234.5 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.7 * t))
    const high = 0.05 * Math.sin(2 * Math.PI * 6100 * t + 3 * Math.sin(2 * Math.PI * 5 * t))
    const envelope = 0.2 + 0.8 * Math.abs(Math.sin(2 * Math.PI * 0.25 * t))
    out[n] = 0.25 * envelope * (chirp + tone) + high
  }
  return out
}

function speech(): Float32Array {
  return readWav16(new Uint8Array(readFileSync(join(FIXTURES, 'speech.wav')))).samples
}

/** Largest |ours − theirs| over everything the fixture stores for one case. */
function worstError(ours: Float32Array, want: ReferenceCase): number {
  let worst = 0
  const note = (a: number, b: number) => {
    worst = Math.max(worst, Math.abs(a - b))
  }

  for (let m = 0; m < N_MELS; m += 1) {
    let sum = 0
    for (let f = 0; f < N_FRAMES; f += 1) sum += ours[m * N_FRAMES + f]!
    note(sum / N_FRAMES, want.rowMean[m]!)
  }
  for (let f = 0; f < N_FRAMES; f += 1) {
    let sum = 0
    for (let m = 0; m < N_MELS; m += 1) sum += ours[m * N_FRAMES + f]!
    note(sum / N_MELS, want.colMean[f]!)
  }

  let max = -Infinity
  let min = Infinity
  for (const value of ours) {
    if (value > max) max = value
    if (value < min) min = value
  }
  note(max, want.max)
  note(min, want.min)

  want.sampled.forEach((value, k) => note(ours[(k * reference.sampleStride) % FEATURE_LENGTH]!, value))

  const tail = reference.tailFrames
  for (let m = 0; m < N_MELS; m += 1) {
    for (let j = 0; j < tail; j += 1) note(ours[m * N_FRAMES + (N_FRAMES - tail + j)]!, want.tail[m * tail + j]!)
  }
  return worst
}

describe('whisperLogMel against transformers.WhisperFeatureExtractor', () => {
  it('reads the same synthetic signal the reference read', () => {
    const audio = synthetic()
    expect(audio.length).toBe(reference.cases.synthetic.samples)
    let sum = 0
    for (const value of audio) sum += value
    expect(Math.abs(sum - reference.cases.synthetic.signalSum)).toBeLessThan(1e-4)
  })

  it('matches on ten seconds of synthetic signal (the truncation path)', () => {
    const worst = worstError(new LogMelExtractor().extract(synthetic()), reference.cases.synthetic)
    expect(worst).toBeLessThan(1e-3)
  })

  it('matches on a 2.6 s spoken sentence (the left-padding path)', () => {
    const audio = speech()
    expect(audio.length).toBe(reference.cases.speech.samples)
    const worst = worstError(new LogMelExtractor().extract(audio), reference.cases.speech)
    expect(worst).toBeLessThan(1e-3)
  })

  // Every one of the 64 000 values, against matrices too large to commit.
  // `make_fixture.py <wav> <model> <dir>` writes them; point this at <dir>.
  const full = process.env.SMART_TURN_FULL
  it.runIf(full && existsSync(join(full, 'speech.f32')))('matches every value when the full matrices are present', () => {
    const extractor = new LogMelExtractor()
    for (const [name, audio] of [
      ['synthetic', synthetic()],
      ['speech', speech()],
    ] as const) {
      const bytes = readFileSync(join(full!, `${name}.f32`))
      const want = new Float32Array(bytes.buffer, bytes.byteOffset, FEATURE_LENGTH)
      const ours = extractor.extract(audio)
      let worst = 0
      for (let i = 0; i < FEATURE_LENGTH; i += 1) worst = Math.max(worst, Math.abs(ours[i]! - want[i]!))
      expect(worst, name).toBeLessThan(1e-3)
    }
  })
})

describe('the extractor, on its own terms', () => {
  it('returns [1, 80, 800] as 64 000 floats, into the caller’s buffer when given one', () => {
    const out = new Float32Array(FEATURE_LENGTH)
    const result = whisperLogMel(speech(), out)
    expect(result).toBe(out)
    expect(result.length).toBe(N_MELS * N_FRAMES)
  })

  it('refuses a buffer of the wrong size rather than writing past it', () => {
    expect(() => new LogMelExtractor().extract(new Float32Array(16_000), new Float32Array(10))).toThrow(/64000/)
  })

  it('turns a window of pure silence into the floor, not NaN', () => {
    // Zero variance: the epsilon under the square root is what keeps this
    // finite. log10(1e-10) = -10 everywhere, so every value is (-10 + 4) / 4.
    const out = new LogMelExtractor().extract(new Float32Array(WINDOW_SAMPLES))
    for (const value of out) expect(value).toBe(-1.5)
  })

  it('gives the same answer twice from one extractor (no state leaks between calls)', () => {
    const extractor = new LogMelExtractor()
    const first = extractor.extract(speech()).slice()
    extractor.extract(synthetic())
    expect(Array.from(extractor.extract(speech()))).toEqual(Array.from(first))
  })

  it('reads only the last 8 s: audio in front of that changes nothing', () => {
    const audio = speech()
    const longer = new Float32Array(WINDOW_SAMPLES + 5_000)
    longer.set(audio, longer.length - audio.length)
    longer.fill(0.5, 0, 5_000) // loud, and entirely outside the window
    const a = new LogMelExtractor().extract(audio)
    const b = new LogMelExtractor().extract(longer)
    expect(Array.from(b)).toEqual(Array.from(a))
  })
})

describe('lastEightSeconds', () => {
  it('left-pads a short clip with zeros, so the speech sits at the end', () => {
    const out = lastEightSeconds(Float32Array.from([1, 2, 3]))
    expect(out.length).toBe(WINDOW_SAMPLES)
    expect(Array.from(out.subarray(WINDOW_SAMPLES - 3))).toEqual([1, 2, 3])
    expect(out.subarray(0, WINDOW_SAMPLES - 3).every((v) => v === 0)).toBe(true)
  })

  it('keeps the END of a long clip', () => {
    const long = Float32Array.from({ length: WINDOW_SAMPLES + 10 }, (_, i) => i)
    const out = lastEightSeconds(long)
    expect(out.length).toBe(WINDOW_SAMPLES)
    expect(out[0]).toBe(10)
    expect(out[WINDOW_SAMPLES - 1]).toBe(WINDOW_SAMPLES + 9)
  })

  it('passes an exact 8 s clip through untouched', () => {
    const exact = new Float32Array(WINDOW_SAMPLES)
    expect(lastEightSeconds(exact)).toBe(exact)
  })
})

describe('melFilterBank', () => {
  it('builds 80 filters, every one non-empty and inside the 201 bins', () => {
    const bank = melFilterBank()
    expect(bank).toHaveLength(80)
    for (const { start, weights } of bank) {
      expect(weights.length).toBeGreaterThan(0)
      expect(start + weights.length).toBeLessThanOrEqual(201)
      for (const w of weights) expect(w).toBeGreaterThanOrEqual(0)
    }
  })

  it('climbs the spectrum: each filter starts at or after the one below it', () => {
    const starts = melFilterBank().map((f) => f.start)
    for (let i = 1; i < starts.length; i += 1) expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]!)
  })
})
