/**
 * Impulse response synthesis.
 *
 * Pure maths, no AudioContext, so the acoustic model is testable and so that
 * changing a scene needs no asset pipeline — a room is a handful of numbers
 * rather than a WAV somebody has to source and license.
 *
 * The bookshop needs a response that is mostly EARLY REFLECTIONS with almost no
 * tail. A stock hall or room preset is the wrong shape entirely: it models a
 * space where sound survives, and this is a room whose walls are packed paper.
 */

import type { ReverbProfile } from './types'

/**
 * -60dB as a natural-log decay constant, in AMPLITUDE.
 *
 * -60dB is a factor of 1000 in amplitude (10^(-60/20)), not 10^6 — that is the
 * ratio in POWER, and using it here made every tail decay twice as fast as the
 * profile asked for. A 0.3s bookshop measured 0.15s.
 */
const LN_1000 = Math.log(1000) // ~6.9078

/**
 * Builds a stereo impulse response for a profile.
 *
 * Structure, in order:
 *   1. pre-delay silence — the distance cue
 *   2. a sparse cluster of discrete early reflections
 *   3. an exponentially decaying diffuse tail, low-passed for damping
 *
 * `earlyReflectionRatio` splits energy between 2 and 3. Near 1.0 the tail is
 * vestigial, which is exactly what a cluttered absorbent room sounds like.
 */
export function buildImpulseResponse(
  profile: ReverbProfile,
  sampleRate: number,
  rng: () => number = Math.random,
): { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; frames: number } {
  const tailSeconds = Math.max(0.05, profile.rt60Seconds)
  const preDelayFrames = Math.round((profile.preDelayMs / 1000) * sampleRate)
  const frames = preDelayFrames + Math.ceil(tailSeconds * sampleRate)

  const left = new Float32Array(new ArrayBuffer(frames * Float32Array.BYTES_PER_ELEMENT))
  const right = new Float32Array(new ArrayBuffer(frames * Float32Array.BYTES_PER_ELEMENT))

  const early = Math.max(0, Math.min(1, profile.earlyReflectionRatio))
  const tailGain = 1 - early

  // --- diffuse tail: decaying noise, damped ---
  // One-pole lowpass coefficient for the damping frequency.
  const dampingCoefficient = Math.exp(
    (-2 * Math.PI * Math.max(200, profile.dampingHz)) / sampleRate,
  )
  let lastL = 0
  let lastR = 0

  for (let i = preDelayFrames; i < frames; i += 1) {
    const t = (i - preDelayFrames) / sampleRate
    const envelope = Math.exp((-LN_1000 * t) / tailSeconds)

    const noiseL = rng() * 2 - 1
    const noiseR = rng() * 2 - 1
    // Damping: the tail loses high frequencies faster than low ones, which is
    // what makes paper-lined shelves sound like paper rather than plaster.
    lastL = noiseL * (1 - dampingCoefficient) + lastL * dampingCoefficient
    lastR = noiseR * (1 - dampingCoefficient) + lastR * dampingCoefficient

    left[i] = lastL * envelope * tailGain
    right[i] = lastR * envelope * tailGain
  }

  // --- early reflections: discrete taps in the first ~35ms ---
  // Prime-ish spacings so the taps never line up into an audible pitch.
  const tapMs = [1.7, 4.3, 7.9, 11.3, 15.1, 19.7, 24.1, 29.3, 34.7]
  tapMs.forEach((ms, index) => {
    const offset = preDelayFrames + Math.round((ms / 1000) * sampleRate)
    if (offset >= frames) return
    const decay = Math.exp((-LN_1000 * (ms / 1000)) / tailSeconds)
    const amplitude = early * decay * (1 - index / (tapMs.length * 1.5))
    // Alternate sides so the room has width without sounding like an effect.
    const spread = index % 2 === 0 ? 1 : 0.6
    left[offset] = (left[offset] ?? 0) + amplitude * spread
    right[offset] = (right[offset] ?? 0) + amplitude * (1.6 - spread)
  })

  normalise(left, right)
  return { left, right, frames }
}

/** Keeps wetMix meaning the same thing across profiles of different lengths. */
function normalise(left: Float32Array, right: Float32Array): void {
  let peak = 0
  for (let i = 0; i < left.length; i += 1) {
    peak = Math.max(peak, Math.abs(left[i] ?? 0), Math.abs(right[i] ?? 0))
  }
  if (peak <= 0) return
  const gain = 0.9 / peak
  for (let i = 0; i < left.length; i += 1) {
    left[i] = (left[i] ?? 0) * gain
    right[i] = (right[i] ?? 0) * gain
  }
}

/** Measured RT60 of a generated response. Used by tests to check the model. */
export function measureRt60(channel: Float32Array, sampleRate: number): number {
  let peak = 0
  let peakIndex = 0
  for (let i = 0; i < channel.length; i += 1) {
    const value = Math.abs(channel[i] ?? 0)
    if (value > peak) {
      peak = value
      peakIndex = i
    }
  }
  if (peak <= 0) return 0
  const threshold = peak / 1000 // -60dB
  for (let i = channel.length - 1; i > peakIndex; i -= 1) {
    if (Math.abs(channel[i] ?? 0) > threshold) {
      return (i - peakIndex) / sampleRate
    }
  }
  return 0
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}
