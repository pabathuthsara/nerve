import { describe, expect, it } from 'vitest'
import { chromaFor, dialsFor, type DialInput } from './swarm'

const at = (warmth: number, extra: Partial<DialInput> = {}) =>
  dialsFor({ warmth, self: 0, user: 0, think: 0, ready: 1, pulse: 0, ...extra })

describe('the particle avatar, by warmth', () => {
  it('shows most of her colour by the low sixties, where most reps top out', () => {
    expect(chromaFor(0.62)).toBeGreaterThanOrEqual(0.9)
    expect(chromaFor(0)).toBe(0)
  })

  it('has no step at 65, where the rep silently arms', () => {
    // Rule 3: arming is silent. A visible jump in colour at the arm line would
    // announce it, so the curve must be smooth across it, one point at a time.
    for (let warmth = 55; warmth <= 75; warmth += 1) {
      expect(Math.abs(chromaFor((warmth + 1) / 100) - chromaFor(warmth / 100))).toBeLessThan(0.04)
    }
  })

  it('only ever grows, brightens, speeds up and gets more restless as she warms', () => {
    let previous = at(0)
    for (let warmth = 5; warmth <= 100; warmth += 5) {
      const next = at(warmth / 100)
      expect(next.scale).toBeGreaterThanOrEqual(previous.scale)
      expect(next.chroma).toBeGreaterThanOrEqual(previous.chroma)
      expect(next.speed).toBeGreaterThanOrEqual(previous.speed)
      expect(next.entropy).toBeGreaterThanOrEqual(previous.entropy)
      expect(next.brightness).toBeGreaterThanOrEqual(previous.brightness)
      previous = next
    }
  })

  it('is composed when cold and restless when warm', () => {
    expect(at(0.1).entropy).toBeLessThan(0.15)
    expect(at(0.9).entropy).toBeGreaterThan(0.5)
    // Trails lengthen with restlessness, but never to a smear that never clears.
    expect(at(0.9).decay).toBeGreaterThan(at(0.1).decay)
    expect(at(1).decay).toBeLessThan(0.95)
  })

  it('swells while she speaks and draws in while he does', () => {
    expect(at(0.4, { self: 1 }).scale).toBeGreaterThan(at(0.4).scale)
    expect(at(0.4, { user: 1 }).scale).toBeLessThan(at(0.4).scale)
  })

  it('holds her small and quiet until she can hear him', () => {
    const connecting = at(0.4, { ready: 0 })
    expect(connecting.scale).toBeLessThan(at(0.4).scale)
    expect(connecting.brightness).toBeLessThan(at(0.4).brightness)
    expect(connecting.speed).toBeLessThan(at(0.4).speed)
  })

  it('stills on the loss beat', () => {
    expect(at(0.4, { think: 1 }).speed).toBeLessThan(at(0.4).speed)
    expect(at(0.4, { think: 1 }).entropy).toBeLessThan(at(0.4).entropy)
  })
})
