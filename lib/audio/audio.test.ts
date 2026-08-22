/**
 * Acoustic model tests. Pure maths only — no AudioContext, no network.
 */

import { describe, expect, it } from 'vitest'
import { buildImpulseResponse, measureRt60, dbToGain } from './impulse'
import { nextIntervalSeconds, pickOneShot } from './schedule'
import { BOOKSHOP, BAR, sceneFor } from './scenes'
import type { OneShot } from './types'

const SR = 48000
/** Deterministic pseudo-noise so a test asserts the model, not a dice roll. */
function seeded(seed = 1): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('impulse response', () => {
  it('produces a tail envelope matching the requested RT60', () => {
    // Measured on a tail-dominant profile. In a dead room the early
    // reflections are the loudest thing in the response, so measuring from the
    // global peak would conflate tail length with early/late balance — those
    // are two separate parameters and the test below covers the other one.
    for (const rt60 of [0.3, 0.8, 1.1]) {
      const { left } = buildImpulseResponse(
        { ...BOOKSHOP.reverb, rt60Seconds: rt60, earlyReflectionRatio: 0.05 },
        SR,
        seeded(7),
      )
      const measured = measureRt60(left, SR)
      expect(Math.abs(measured - rt60), `rt60 ${rt60}`).toBeLessThan(rt60 * 0.25)
    }
  })

  it('makes a dead room decay audibly faster than its nominal RT60', () => {
    // Physically right, and worth pinning: with most energy in early
    // reflections the audible decay is shorter than the tail constant implies.
    const dead = measureRt60(buildImpulseResponse(BOOKSHOP.reverb, SR, seeded(7)).left, SR)
    expect(dead).toBeLessThan(BOOKSHOP.reverb.rt60Seconds)
  })

  it('models the bookshop as early reflections with almost no tail', () => {
    // The whole point: a hall or room preset is wrong for a space whose walls
    // are packed paper. Energy must sit at the front.
    const { left } = buildImpulseResponse(BOOKSHOP.reverb, SR, seeded(3))
    const firstFortyMs = left.slice(0, Math.round(0.04 * SR))
    const energy = (frames: Float32Array) =>
      frames.reduce((sum, value) => sum + value * value, 0)

    const earlyEnergy = energy(firstFortyMs)
    const totalEnergy = energy(left)
    expect(earlyEnergy / totalEnergy).toBeGreaterThan(0.5)
  })

  it('gives the bar a longer, brighter tail than the bookshop', () => {
    const tailOnly = (profile: typeof BOOKSHOP.reverb) =>
      measureRt60(
        buildImpulseResponse({ ...profile, earlyReflectionRatio: 0.05 }, SR, seeded(1)).left,
        SR,
      )
    expect(tailOnly(BAR.reverb)).toBeGreaterThan(tailOnly(BOOKSHOP.reverb) * 2)
    expect(BAR.reverb.dampingHz).toBeGreaterThan(BOOKSHOP.reverb.dampingHz)
  })

  it('respects the pre-delay before anything arrives', () => {
    const profile = { ...BOOKSHOP.reverb, preDelayMs: 20 }
    const { left } = buildImpulseResponse(profile, SR, seeded(5))
    const silentFrames = Math.round((profile.preDelayMs / 1000) * SR)
    for (let i = 0; i < silentFrames; i += 1) {
      expect(left[i]).toBe(0)
    }
  })

  it('normalises so wet mix means the same thing across scenes', () => {
    for (const profile of [BOOKSHOP.reverb, BAR.reverb]) {
      const { left, right } = buildImpulseResponse(profile, SR, seeded(9))
      const peak = Math.max(
        ...Array.from(left, Math.abs),
        ...Array.from(right, Math.abs),
      )
      expect(peak).toBeGreaterThan(0.5)
      expect(peak).toBeLessThanOrEqual(0.9001)
    }
  })

  it('converts dB to gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 5)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2)
    expect(dbToGain(-40)).toBeCloseTo(0.01, 4)
  })
})

describe('one-shot scheduling', () => {
  it('stays inside the configured window', () => {
    const rng = seeded(11)
    for (let i = 0; i < 500; i += 1) {
      const seconds = nextIntervalSeconds(BOOKSHOP.ambient.oneShotIntervalSeconds, rng)
      expect(seconds).toBeGreaterThanOrEqual(20)
      expect(seconds).toBeLessThanOrEqual(40)
    }
  })

  it('never produces a fixed rhythm', () => {
    const rng = seeded(13)
    const draws = Array.from({ length: 50 }, () =>
      nextIntervalSeconds(BOOKSHOP.ambient.oneShotIntervalSeconds, rng),
    )
    expect(new Set(draws.map((d) => d.toFixed(3))).size).toBeGreaterThan(45)
  })

  it('picks by weight', () => {
    const shots: OneShot[] = [
      { kind: 'page-turn', weight: 9, levelDb: -30 },
      { kind: 'distant-door', weight: 1, levelDb: -30 },
    ]
    const rng = seeded(17)
    const picks = Array.from({ length: 2000 }, () => pickOneShot(shots, rng)?.kind)
    const pages = picks.filter((kind) => kind === 'page-turn').length
    expect(pages / picks.length).toBeGreaterThan(0.8)
    expect(pages / picks.length).toBeLessThan(0.96)
  })

  it('handles an empty or zero-weight set without throwing', () => {
    expect(pickOneShot([], seeded())).toBeNull()
    expect(pickOneShot([{ kind: 'page-turn', weight: 0, levelDb: -30 }], seeded())).toBeNull()
  })
})

describe('scene presets', () => {
  it('keeps everything distinctive out of the looping bed', () => {
    // A page turn heard twice inside a loop is worse than no page turn at all.
    for (const scene of [BOOKSHOP, BAR]) {
      for (const layer of scene.ambient.layers) {
        expect(['hvac-hum', 'traffic-through-glass', 'room-rumble', 'crowd-wash', 'platform-wind'])
          .toContain(layer.kind)
      }
      expect(scene.ambient.oneShots.length).toBeGreaterThan(0)
    }
  })

  it('makes the bookshop far quieter than a loud room', () => {
    expect(BOOKSHOP.ambient.masterDb).toBeLessThan(BAR.ambient.masterDb - 10)
    expect(BOOKSHOP.ambient.masterDb).toBeLessThanOrEqual(-40)
  })

  it('keeps the bookshop wet mix subtle', () => {
    expect(BOOKSHOP.reverb.wetMix).toBeGreaterThanOrEqual(0.08)
    expect(BOOKSHOP.reverb.wetMix).toBeLessThanOrEqual(0.12)
  })

  it('rolls high frequencies off in the bookshop, because paper eats treble', () => {
    expect(BOOKSHOP.reverb.dampingHz).toBeLessThanOrEqual(6000)
    for (const layer of BOOKSHOP.ambient.layers) {
      expect(layer.highCutHz ?? 0).toBeLessThan(1000)
    }
  })

  it('resolves scenes by id', () => {
    expect(sceneFor('bookshop')?.id).toBe('bookshop')
    expect(sceneFor('train-platform')).toBeNull()
  })
})
