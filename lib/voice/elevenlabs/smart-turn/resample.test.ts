import { describe, expect, it } from 'vitest'
import { StreamingResampler, TARGET_RATE } from './resample'

function tone(hz: number, rate: number, seconds: number, amplitude = 0.5): Float32Array {
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, n) => amplitude * Math.sin((2 * Math.PI * hz * n) / rate))
}

/** Push in the given block sizes (cycled), return everything that came out. */
function run(resampler: StreamingResampler, input: Float32Array, blocks: number[]): Float32Array {
  const parts: Float32Array[] = []
  let at = 0
  let b = 0
  while (at < input.length) {
    const size = blocks[b % blocks.length]!
    parts.push(resampler.push(input.subarray(at, at + size)))
    at += size
    b += 1
  }
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const part of parts) {
    out.set(part, o)
    o += part.length
  }
  return out
}

function rms(samples: Float32Array, from = 0, to = samples.length): number {
  let sum = 0
  for (let i = from; i < to; i += 1) sum += samples[i]! ** 2
  return Math.sqrt(sum / Math.max(1, to - from))
}

describe('StreamingResampler, 24 kHz → 16 kHz', () => {
  it('makes two samples for every three, less only its 1.4 ms of look-ahead', () => {
    const resampler = new StreamingResampler(24_000)
    const out = run(resampler, new Float32Array(24_000), [480])
    const owed = Math.ceil((resampler.latencySamples * 2) / 3)
    expect(out.length).toBeLessThanOrEqual(16_000)
    expect(out.length).toBeGreaterThanOrEqual(16_000 - owed - 1)
    expect(resampler.latencySamples / 24).toBeLessThan(2) // ms
  })

  it('gives the same output however the input is split into blocks', () => {
    const input = tone(440, 24_000, 1.3)
    const whole = run(new StreamingResampler(24_000), input, [input.length])
    for (const blocks of [[480], [1], [7, 1000, 3, 480], [4096]]) {
      expect(Array.from(run(new StreamingResampler(24_000), input, blocks))).toEqual(Array.from(whole))
    }
  })

  it('keeps a constant exactly that constant (unit DC gain in every phase)', () => {
    const out = run(new StreamingResampler(24_000), new Float32Array(4_800).fill(0.25), [480])
    // Past the kernel's reach into the zeros before the first frame.
    for (let n = 40; n < out.length; n += 1) expect(Math.abs(out[n]! - 0.25)).toBeLessThan(1e-6)
  })

  it('passes speech-band tones through at unit gain and in phase: output n is input time 1.5·n', () => {
    for (const hz of [150, 1000, 3000, 5000]) {
      const out = run(new StreamingResampler(24_000), tone(hz, 24_000, 0.5), [480])
      let worst = 0
      for (let n = 100; n < out.length - 100; n += 1) {
        const want = 0.5 * Math.sin((2 * Math.PI * hz * n) / TARGET_RATE)
        worst = Math.max(worst, Math.abs(out[n]! - want))
      }
      // 0.5 amplitude; 0.005 is -40 dB of error, i.e. well under 0.1 dB of gain.
      expect(worst, `${hz} Hz`).toBeLessThan(0.005)
    }
  })

  it('removes what 16 kHz cannot hold instead of folding it back down as a false tone', () => {
    // 10 kHz would alias to 6 kHz, and 11 kHz to 5 kHz, with naive decimation.
    for (const hz of [9_000, 10_000, 11_000]) {
      const out = run(new StreamingResampler(24_000), tone(hz, 24_000, 0.5), [480])
      expect(rms(out, 100, out.length - 100), `${hz} Hz`).toBeLessThan(0.5 * 0.001) // -60 dB
    }
  })

  it('starts over cleanly on reset', () => {
    const input = tone(700, 24_000, 0.2)
    const resampler = new StreamingResampler(24_000)
    const first = run(resampler, input, [480])
    run(resampler, tone(2000, 24_000, 0.3), [480])
    resampler.reset()
    expect(Array.from(run(resampler, input, [480]))).toEqual(Array.from(first))
  })
})

describe('StreamingResampler, other context rates', () => {
  it('handles 22.05 kHz (L = 320, M = 441) at unit gain', () => {
    const out = run(new StreamingResampler(22_050), tone(1000, 22_050, 0.5), [441])
    expect(Math.abs(out.length - 8_000)).toBeLessThan(40)
    let worst = 0
    for (let n = 100; n < out.length - 100; n += 1) {
      worst = Math.max(worst, Math.abs(out[n]! - 0.5 * Math.sin((2 * Math.PI * 1000 * n) / TARGET_RATE)))
    }
    expect(worst).toBeLessThan(0.005)
  })

  it('copies 16 kHz straight through, with no latency', () => {
    const resampler = new StreamingResampler(16_000)
    const input = tone(300, 16_000, 0.1)
    const out = resampler.push(input)
    expect(Array.from(out)).toEqual(Array.from(input))
    expect(out).not.toBe(input)
    expect(resampler.latencySamples).toBe(0)
  })

  it('refuses a rate that is not a positive integer', () => {
    expect(() => new StreamingResampler(0)).toThrow()
    expect(() => new StreamingResampler(44_100.5)).toThrow()
    expect(() => new StreamingResampler(24_000, -1)).toThrow()
  })
})
