/**
 * A real-input FFT, sized for Whisper's 400-point frame.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────
 *
 * Smart Turn reads Whisper log-mel features: 801 frames of a 400-point real
 * DFT for every 8 s window, and one window per pause the user takes. A direct
 * DFT is 201 x 400 complex products a frame — about 130 million multiply-adds
 * a call — which is a tenth of a second of main-thread time on a phone and
 * would land exactly while the user is waiting for her to answer. 400 is not a
 * power of two, so the textbook radix-2 FFT does not apply either, and pulling
 * in a general FFT library for one fixed size is a dependency to buy a loop.
 *
 * So: the classic real-to-complex trick (a 400-point real transform is one
 * 200-point COMPLEX transform plus an O(n) unpacking pass), and the 200-point
 * complex transform done as a Stockham autosort FFT over the mixed radices
 * 4 x 2 x 5 x 5. Stockham needs no bit-reversal pass for a mixed radix, which
 * is the part that makes non-power-of-two FFTs fiddly, and every twiddle is
 * precomputed once per plan. `fft.test.ts` holds the transform to a naive DFT.
 *
 * Float64 throughout. The reference (`transformers.audio_utils.spectrogram`)
 * transforms a float64 buffer, and the features are compared to it at 1e-3 —
 * there is no reason to spend any of that budget here.
 *
 * Pure: arrays in, arrays out, no allocation per call after the plan is built.
 */

interface Stage {
  /** Radix of this pass. */
  r: number
  /** Sub-transform length after this pass (n / r). */
  m: number
  /** Stride on entry. */
  s: number
  /** W_n^{j·p} for p in [0, m), j in [1, r): [(p·(r−1) + j−1)·2] = re, +1 = im. */
  twiddles: Float64Array
}

/** Radices tried, largest useful first. 4 before 2 halves the passes. */
const RADICES = [4, 2, 5, 3] as const

function factorise(n: number): number[] {
  const factors: number[] = []
  let rest = n
  for (const r of RADICES) {
    while (rest % r === 0) {
      factors.push(r)
      rest /= r
    }
  }
  if (rest !== 1) throw new Error(`FFT size ${n} has a prime factor above 5`)
  return factors
}

/**
 * A complex FFT of one fixed size, forward direction (e^{-2πi·jk/n}).
 *
 * Exposed for the tests; the feature extractor only uses it through
 * `RealFft`.
 */
export class ComplexFft {
  readonly n: number
  private readonly stages: Stage[]
  private readonly scratchRe: Float64Array
  private readonly scratchIm: Float64Array

  constructor(n: number) {
    if (!Number.isInteger(n) || n < 1) throw new Error(`FFT size must be a positive integer, got ${n}`)
    this.n = n
    this.scratchRe = new Float64Array(n)
    this.scratchIm = new Float64Array(n)
    this.stages = []
    let size = n
    let stride = 1
    for (const r of factorise(n)) {
      const m = size / r
      const twiddles = new Float64Array(m * (r - 1) * 2)
      for (let p = 0; p < m; p += 1) {
        for (let j = 1; j < r; j += 1) {
          const angle = (-2 * Math.PI * j * p) / size
          const at = (p * (r - 1) + (j - 1)) * 2
          twiddles[at] = Math.cos(angle)
          twiddles[at + 1] = Math.sin(angle)
        }
      }
      this.stages.push({ r, m, s: stride, twiddles })
      size = m
      stride *= r
    }
  }

  /**
   * Transform `re`/`im` in place.
   *
   * Stockham ping-pongs between the caller's arrays and a private scratch
   * pair; whichever holds the last pass's output is copied back if needed.
   */
  transform(re: Float64Array, im: Float64Array): void {
    let xr = re
    let xi = im
    let yr = this.scratchRe
    let yi = this.scratchIm
    for (const stage of this.stages) {
      switch (stage.r) {
        case 4:
          pass4(stage, xr, xi, yr, yi)
          break
        case 2:
          pass2(stage, xr, xi, yr, yi)
          break
        case 5:
          pass5(stage, xr, xi, yr, yi)
          break
        default:
          pass3(stage, xr, xi, yr, yi)
      }
      const tr = xr
      const ti = xi
      xr = yr
      xi = yi
      yr = tr
      yi = ti
    }
    if (xr !== re) {
      re.set(xr)
      im.set(xi)
    }
  }
}

/*
 * One Stockham decimation-in-frequency pass:
 *
 *   for p < m, q < s:
 *     a_k = x[q + s(p + k·m)]                 k < r
 *     y[q + s(r·p + j)] = (Σ_k a_k ω_r^{jk}) · W_n^{j·p}
 *
 * Each radix gets its own butterfly so the inner loop is straight-line
 * arithmetic rather than an r² table walk.
 */

function pass2(st: Stage, xr: Float64Array, xi: Float64Array, yr: Float64Array, yi: Float64Array): void {
  const { m, s, twiddles } = st
  for (let p = 0; p < m; p += 1) {
    const w1r = twiddles[p * 2]!
    const w1i = twiddles[p * 2 + 1]!
    for (let q = 0; q < s; q += 1) {
      const i0 = q + s * p
      const i1 = i0 + s * m
      const ar = xr[i0]!, ai = xi[i0]!
      const br = xr[i1]!, bi = xi[i1]!
      const o = q + s * 2 * p
      yr[o] = ar + br
      yi[o] = ai + bi
      const dr = ar - br, di = ai - bi
      yr[o + s] = dr * w1r - di * w1i
      yi[o + s] = dr * w1i + di * w1r
    }
  }
}

function pass3(st: Stage, xr: Float64Array, xi: Float64Array, yr: Float64Array, yi: Float64Array): void {
  const { m, s, twiddles } = st
  const c = -0.5
  const sn = Math.sqrt(3) / 2 // sin(2π/3)
  for (let p = 0; p < m; p += 1) {
    const t = p * 2 * 2
    const w1r = twiddles[t]!, w1i = twiddles[t + 1]!
    const w2r = twiddles[t + 2]!, w2i = twiddles[t + 3]!
    for (let q = 0; q < s; q += 1) {
      const i0 = q + s * p
      const a0r = xr[i0]!, a0i = xi[i0]!
      const a1r = xr[i0 + s * m]!, a1i = xi[i0 + s * m]!
      const a2r = xr[i0 + 2 * s * m]!, a2i = xi[i0 + 2 * s * m]!
      const tr = a1r + a2r, ti = a1i + a2i
      const ur = a1r - a2r, ui = a1i - a2i
      const mr = a0r + c * tr, mi = a0i + c * ti
      // b1 = m − i·sn·u, b2 = m + i·sn·u
      const b1r = mr + sn * ui, b1i = mi - sn * ur
      const b2r = mr - sn * ui, b2i = mi + sn * ur
      const o = q + s * 3 * p
      yr[o] = a0r + tr
      yi[o] = a0i + ti
      yr[o + s] = b1r * w1r - b1i * w1i
      yi[o + s] = b1r * w1i + b1i * w1r
      yr[o + 2 * s] = b2r * w2r - b2i * w2i
      yi[o + 2 * s] = b2r * w2i + b2i * w2r
    }
  }
}

function pass4(st: Stage, xr: Float64Array, xi: Float64Array, yr: Float64Array, yi: Float64Array): void {
  const { m, s, twiddles } = st
  const sm = s * m
  for (let p = 0; p < m; p += 1) {
    const t = p * 3 * 2
    const w1r = twiddles[t]!, w1i = twiddles[t + 1]!
    const w2r = twiddles[t + 2]!, w2i = twiddles[t + 3]!
    const w3r = twiddles[t + 4]!, w3i = twiddles[t + 5]!
    for (let q = 0; q < s; q += 1) {
      const i0 = q + s * p
      const a0r = xr[i0]!, a0i = xi[i0]!
      const a1r = xr[i0 + sm]!, a1i = xi[i0 + sm]!
      const a2r = xr[i0 + 2 * sm]!, a2i = xi[i0 + 2 * sm]!
      const a3r = xr[i0 + 3 * sm]!, a3i = xi[i0 + 3 * sm]!
      const s02r = a0r + a2r, s02i = a0i + a2i
      const d02r = a0r - a2r, d02i = a0i - a2i
      const s13r = a1r + a3r, s13i = a1i + a3i
      const d13r = a1r - a3r, d13i = a1i - a3i
      // b1 = d02 − i·d13, b3 = d02 + i·d13
      const b1r = d02r + d13i, b1i = d02i - d13r
      const b2r = s02r - s13r, b2i = s02i - s13i
      const b3r = d02r - d13i, b3i = d02i + d13r
      const o = q + s * 4 * p
      yr[o] = s02r + s13r
      yi[o] = s02i + s13i
      yr[o + s] = b1r * w1r - b1i * w1i
      yi[o + s] = b1r * w1i + b1i * w1r
      yr[o + 2 * s] = b2r * w2r - b2i * w2i
      yi[o + 2 * s] = b2r * w2i + b2i * w2r
      yr[o + 3 * s] = b3r * w3r - b3i * w3i
      yi[o + 3 * s] = b3r * w3i + b3i * w3r
    }
  }
}

const C1 = Math.cos((2 * Math.PI) / 5)
const C2 = Math.cos((4 * Math.PI) / 5)
const S1 = Math.sin((2 * Math.PI) / 5)
const S2 = Math.sin((4 * Math.PI) / 5)

function pass5(st: Stage, xr: Float64Array, xi: Float64Array, yr: Float64Array, yi: Float64Array): void {
  const { m, s, twiddles } = st
  const sm = s * m
  for (let p = 0; p < m; p += 1) {
    const t = p * 4 * 2
    const w1r = twiddles[t]!, w1i = twiddles[t + 1]!
    const w2r = twiddles[t + 2]!, w2i = twiddles[t + 3]!
    const w3r = twiddles[t + 4]!, w3i = twiddles[t + 5]!
    const w4r = twiddles[t + 6]!, w4i = twiddles[t + 7]!
    for (let q = 0; q < s; q += 1) {
      const i0 = q + s * p
      const a0r = xr[i0]!, a0i = xi[i0]!
      const a1r = xr[i0 + sm]!, a1i = xi[i0 + sm]!
      const a2r = xr[i0 + 2 * sm]!, a2i = xi[i0 + 2 * sm]!
      const a3r = xr[i0 + 3 * sm]!, a3i = xi[i0 + 3 * sm]!
      const a4r = xr[i0 + 4 * sm]!, a4i = xi[i0 + 4 * sm]!
      const t1r = a1r + a4r, t1i = a1i + a4i
      const t2r = a2r + a3r, t2i = a2i + a3i
      const t3r = a1r - a4r, t3i = a1i - a4i
      const t4r = a2r - a3r, t4i = a2i - a3i
      const m1r = a0r + C1 * t1r + C2 * t2r, m1i = a0i + C1 * t1i + C2 * t2i
      const m2r = a0r + C2 * t1r + C1 * t2r, m2i = a0i + C2 * t1i + C1 * t2i
      const n1r = S1 * t3r + S2 * t4r, n1i = S1 * t3i + S2 * t4i
      const n2r = S2 * t3r - S1 * t4r, n2i = S2 * t3i - S1 * t4i
      // b1 = m1 − i·n1, b4 = m1 + i·n1, b2 = m2 − i·n2, b3 = m2 + i·n2
      const b1r = m1r + n1i, b1i = m1i - n1r
      const b4r = m1r - n1i, b4i = m1i + n1r
      const b2r = m2r + n2i, b2i = m2i - n2r
      const b3r = m2r - n2i, b3i = m2i + n2r
      const o = q + s * 5 * p
      yr[o] = a0r + t1r + t2r
      yi[o] = a0i + t1i + t2i
      yr[o + s] = b1r * w1r - b1i * w1i
      yi[o + s] = b1r * w1i + b1i * w1r
      yr[o + 2 * s] = b2r * w2r - b2i * w2i
      yi[o + 2 * s] = b2r * w2i + b2i * w2r
      yr[o + 3 * s] = b3r * w3r - b3i * w3i
      yi[o + 3 * s] = b3r * w3i + b3i * w3r
      yr[o + 4 * s] = b4r * w4r - b4i * w4i
      yi[o + 4 * s] = b4r * w4i + b4i * w4r
    }
  }
}

/**
 * The one-sided power spectrum of a real frame of even length n.
 *
 * Packs the frame as n/2 complex samples (even → real, odd → imaginary), takes
 * one n/2-point complex FFT, then separates the even and odd halves:
 *
 *   E[k] = (Z[k] + conj Z[n/2 − k]) / 2
 *   O[k] = (Z[k] − conj Z[n/2 − k]) / 2i
 *   X[k] = E[k] + W_n^k · O[k]            k ∈ [0, n/2]
 */
export class RealFft {
  readonly n: number
  readonly bins: number
  private readonly half: ComplexFft
  private readonly zr: Float64Array
  private readonly zi: Float64Array
  private readonly wr: Float64Array
  private readonly wi: Float64Array

  constructor(n: number) {
    if (n % 2 !== 0) throw new Error(`RealFft needs an even length, got ${n}`)
    this.n = n
    this.bins = n / 2 + 1
    this.half = new ComplexFft(n / 2)
    this.zr = new Float64Array(n / 2)
    this.zi = new Float64Array(n / 2)
    this.wr = new Float64Array(this.bins)
    this.wi = new Float64Array(this.bins)
    for (let k = 0; k < this.bins; k += 1) {
      const angle = (-2 * Math.PI * k) / n
      this.wr[k] = Math.cos(angle)
      this.wi[k] = Math.sin(angle)
    }
  }

  /**
   * |X[k]|² for k ∈ [0, n/2], written into `power` (length ≥ n/2 + 1).
   * `frame` must hold at least n samples; only the first n are read.
   */
  power(frame: ArrayLike<number>, power: Float64Array): void {
    const half = this.n / 2
    const { zr, zi, wr, wi } = this
    for (let j = 0; j < half; j += 1) {
      zr[j] = frame[2 * j]!
      zi[j] = frame[2 * j + 1]!
    }
    this.half.transform(zr, zi)
    for (let k = 0; k <= half; k += 1) {
      const a = k === half ? 0 : k
      const b = k === 0 ? 0 : half - k
      const pr = zr[a]!, pi = zi[a]!
      // conj(Z[n/2 − k])
      const qr = zr[b]!, qi = -zi[b]!
      const er = 0.5 * (pr + qr), ei = 0.5 * (pi + qi)
      // (p − q) / 2i  =  −i·(p − q)/2
      const dr = 0.5 * (pr - qr), di = 0.5 * (pi - qi)
      const or = di, oi = -dr
      const xr = er + wr[k]! * or - wi[k]! * oi
      const xi = ei + wr[k]! * oi + wi[k]! * or
      power[k] = xr * xr + xi * xi
    }
  }
}
