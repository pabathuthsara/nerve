import { describe, expect, it } from 'vitest'
import { ComplexFft, RealFft } from './fft'

/** A deterministic pseudo-random sequence, so a failure reproduces. */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000 - 0.5
  }
}

function naiveDft(re: ArrayLike<number>, im: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
  const n = re.length
  const outRe = new Float64Array(n)
  const outIm = new Float64Array(n)
  for (let k = 0; k < n; k += 1) {
    let sr = 0
    let si = 0
    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * k * t) / n
      const c = Math.cos(angle)
      const s = Math.sin(angle)
      sr += re[t]! * c - im[t]! * s
      si += re[t]! * s + im[t]! * c
    }
    outRe[k] = sr
    outIm[k] = si
  }
  return { re: outRe, im: outIm }
}

describe('ComplexFft', () => {
  // Every radix on its own, every pair, and the two sizes the extractor uses.
  it.each([1, 2, 3, 4, 5, 8, 9, 10, 15, 16, 20, 25, 40, 50, 60, 100, 200, 400])(
    'matches a naive DFT at n = %i',
    (n) => {
      const next = lcg(n)
      const re = Float64Array.from({ length: n }, next)
      const im = Float64Array.from({ length: n }, next)
      const expected = naiveDft(re, im)
      new ComplexFft(n).transform(re, im)
      for (let k = 0; k < n; k += 1) {
        expect(Math.abs(re[k]! - expected.re[k]!)).toBeLessThan(1e-9)
        expect(Math.abs(im[k]! - expected.im[k]!)).toBeLessThan(1e-9)
      }
    },
  )

  it('refuses a size with a prime factor it has no butterfly for', () => {
    expect(() => new ComplexFft(14)).toThrow(/prime factor/)
  })

  it('is reusable: a second transform on the same plan gives the same answer', () => {
    const fft = new ComplexFft(200)
    const next = lcg(7)
    const re = Float64Array.from({ length: 200 }, next)
    const im = Float64Array.from({ length: 200 }, next)
    const re2 = re.slice()
    const im2 = im.slice()
    fft.transform(re, im)
    fft.transform(re2, im2)
    expect(Array.from(re2)).toEqual(Array.from(re))
    expect(Array.from(im2)).toEqual(Array.from(im))
  })
})

describe('RealFft', () => {
  it('gives the one-sided power spectrum of a real 400-point frame', () => {
    const next = lcg(400)
    const frame = Float64Array.from({ length: 400 }, next)
    const expected = naiveDft(frame, new Float64Array(400))
    const power = new Float64Array(201)
    new RealFft(400).power(frame, power)
    for (let k = 0; k <= 200; k += 1) {
      const want = expected.re[k]! ** 2 + expected.im[k]! ** 2
      expect(Math.abs(power[k]! - want)).toBeLessThan(1e-9 * Math.max(1, want))
    }
  })

  it('puts a pure tone in its bin and nowhere else', () => {
    const frame = Float64Array.from({ length: 400 }, (_, t) => Math.cos((2 * Math.PI * 37 * t) / 400))
    const power = new Float64Array(201)
    new RealFft(400).power(frame, power)
    expect(power[37]).toBeCloseTo(200 * 200, 6)
    for (let k = 0; k <= 200; k += 1) if (k !== 37) expect(power[k]).toBeLessThan(1e-12)
  })

  it('refuses an odd length', () => {
    expect(() => new RealFft(401)).toThrow(/even/)
  })
})
