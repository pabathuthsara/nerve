/**
 * What warmth does to the particle avatar — pure, so it is tested rather than
 * described. `components/fluid-persona/particles.ts` draws it.
 *
 * Cold: small, pale, composed — neighbours share their paths and the flow is
 * slow. Warm: larger, in her full colour, faster and restless, with gusts and
 * a wandering wind — but neighbours still move together, because a swarm where
 * every particle does its own thing reads as television static, not fluid.
 *
 * Her colour is mostly there by the low sixties, because most reps never pass
 * 65, and it is SMOOTH through 65, because that is where the rep silently arms
 * (rule 3) and a visible step there would announce it. `swarm.test.ts` holds
 * both of those to account.
 *
 * Tuned by eye in a local lab on 30 September 2026.
 */

/** The smoothed state one frame is drawn from. All 0–1. */
export interface DialInput {
  warmth: number
  /** Her voice, weighted by whether she is the one speaking. */
  self: number
  /** His voice, weighted the same way. */
  user: number
  /** The loss beat. */
  think: number
  /** 0 while connecting, 1 once she can hear him. */
  ready: number
  /** A warmth change, signed, decaying to 0. */
  pulse: number
}

export interface Dials {
  /** On-screen size of the unit swarm. */
  scale: number
  speed: number
  /** Noise frequency: high is busy little eddies, low is broad swirls. */
  curlSize: number
  attraction: number
  /** How restless: gusts, wind, churn, divergence. */
  entropy: number
  /** How much of her colour is showing. */
  chroma: number
  /** How much of each frame survives into the next — trail length. */
  decay: number
  /** Per-particle brightness before the trail and count corrections. */
  brightness: number
}

/** The lab's chosen default for how restless warmth makes her. */
export const ENTROPY_GAIN = 0.7

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * How much of her colour is showing, from warmth 0–1. Mostly there by the low
 * sixties and smooth through 65 — see the file header.
 */
export function chromaFor(warmth: number): number {
  return smoothstep(0.05, 0.7, warmth)
}

export function dialsFor(input: DialInput): Dials {
  const w = clamp01(input.warmth)
  const ready = clamp01(input.ready)
  const think = clamp01(input.think)
  const entropy = clamp01((0.08 + 0.92 * Math.pow(w, 1.3) + 0.15 * input.self) * ENTROPY_GAIN * (1 - 0.7 * think))
  const chroma = chromaFor(w)
  return {
    // Grows with warmth, swells a little while she speaks and on a rise,
    // draws in a little while he speaks, and is held small until she can hear.
    scale: (0.6 + 0.18 * w) * (1 + 0.07 * input.self) * (1 - 0.035 * input.user) * (1 + 0.1 * input.pulse) * (0.72 + 0.28 * ready),
    speed: (0.35 + 1.5 * Math.pow(w, 1.2) + 0.5 * input.self) * (1 - 0.6 * think) * (0.4 + 0.6 * ready),
    curlSize: 1.9 - 0.9 * w,
    attraction: 1.5 - 0.8 * w + 0.4 * input.user,
    entropy,
    chroma,
    decay: 0.8 + 0.12 * entropy,
    brightness: (0.55 + 0.45 * chroma + 0.25 * input.pulse + 0.1 * input.user) * (0.35 + 0.65 * ready),
  }
}
