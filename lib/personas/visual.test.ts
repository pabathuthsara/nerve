import { describe, expect, it } from 'vitest'
import { PERSONAS } from './index'
import { PERSONA_VISUAL, RESERVED_ARENA_COLOURS, hashIdentity, lodFor, visualFor } from './visual'

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

/** Hue in degrees, from the HSL cylinder. Chroma-free comparison. */
function hue(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => channel / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let value: number
  if (max === r) value = ((g - b) / delta) % 6
  else if (max === g) value = (b - r) / delta + 2
  else value = (r - g) / delta + 4
  return (value * 60 + 360) % 360
}

function distance(a: string, b: string): number {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2)
}

const EVERY_COLOUR = Object.values(PERSONA_VISUAL).flatMap((visual) => [visual.deep, visual.core, visual.sheen])

describe('persona visual registry', () => {
  it('covers every character on the roster', () => {
    for (const slug of Object.keys(PERSONAS)) {
      expect(PERSONA_VISUAL[slug], `${slug} has no authored avatar`).toBeDefined()
    }
  })

  it('gives every colour a well-formed hex triple', () => {
    for (const colour of EVERY_COLOUR) expect(colour).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('never borrows an Arena token', () => {
    // Volt is the only accent; Cool is a second data series; Amber and Red are
    // semantic. An avatar wearing one of those makes a claim it cannot back.
    for (const colour of EVERY_COLOUR) {
      for (const reserved of RESERVED_ARENA_COLOURS) {
        expect(distance(colour, reserved), `${colour} sits on top of ${reserved}`).toBeGreaterThan(60)
      }
    }
  })

  it('keeps every hue out of the volt band', () => {
    // Volt is a yellow-green at roughly 75°. Nothing on the roster goes near it,
    // however dark, because warmth lights these colours up.
    for (const visual of Object.values(PERSONA_VISUAL)) {
      const angle = hue(visual.core)
      expect(angle < 55 || angle > 120, `core ${visual.core} is at ${Math.round(angle)}°`).toBe(true)
    }
  })

  it('keeps the guarded end darker than the warm end', () => {
    // Chroma and light both arrive with warmth. If `deep` were the brighter of
    // the two, a cold character would shout louder than a warm one.
    for (const visual of Object.values(PERSONA_VISUAL)) {
      const deep = channels(visual.deep).reduce((sum, channel) => sum + channel, 0)
      const core = channels(visual.core).reduce((sum, channel) => sum + channel, 0)
      const sheen = channels(visual.sheen).reduce((sum, channel) => sum + channel, 0)
      expect(deep).toBeLessThan(core)
      expect(core).toBeLessThan(sheen)
    }
  })

  it('keeps characters visually distinct from one another', () => {
    const cores = Object.entries(PERSONA_VISUAL)
    for (const [slugA, a] of cores) {
      for (const [slugB, b] of cores) {
        if (slugA >= slugB) continue
        const sameShape = a.mode === b.mode && a.petals === b.petals
        expect(sameShape && distance(a.core, b.core) < 40, `${slugA} and ${slugB} are hard to tell apart`).toBe(false)
      }
    }
  })
})

describe('visualFor', () => {
  it('matches on the exact persona id', () => {
    expect(visualFor('Nadia', 'nadia').mode).toBe(PERSONA_VISUAL.nadia!.mode)
    expect(visualFor('Elena Kovač', 'elena-kovac').core).toBe(PERSONA_VISUAL['elena-kovac']!.core)
  })

  it('falls back to a substring match when the slug has grown', () => {
    expect(visualFor('Maya', 'maya-coffee-shop').core).toBe(PERSONA_VISUAL.maya!.core)
  })

  it('is deterministic for an unknown character', () => {
    const first = visualFor('Someone New', 'someone-new')
    const second = visualFor('Someone New', 'someone-new')
    expect(first).toEqual(second)
    expect(first.seed).toBe(hashIdentity('someone-new someone new'))
  })

  it('always returns an authored row rather than inventing one', () => {
    const authored = Object.values(PERSONA_VISUAL)
    for (const id of ['zzz', 'unknown-1', 'unknown-2', 'q']) {
      const visual = visualFor('Unknown', id)
      expect(authored.some((row) => row.core === visual.core && row.mode === visual.mode)).toBe(true)
    }
  })

  it('tolerates a missing persona id', () => {
    expect(() => visualFor('Robin')).not.toThrow()
    expect(visualFor('Robin').core).toBe(PERSONA_VISUAL.robin!.core)
  })
})

describe('lodFor', () => {
  it('scales detail with measured pixels, not with a prop', () => {
    // The bug this replaces: every `fill` call site left `size` at its default
    // of 96, so the 430px live stage rendered at the smallest tier.
    const card = lodFor(112, 2)
    const stage = lodFor(430, 2)
    expect(stage.tubular).toBeGreaterThan(card.tubular)
    expect(stage.radial).toBeGreaterThan(card.radial)
  })

  it('never falls as size rises', () => {
    let previous = lodFor(1, 1)
    for (const size of [40, 96, 132, 180, 240, 330, 430, 900]) {
      const next = lodFor(size, 2)
      expect(next.radial).toBeGreaterThanOrEqual(previous.radial)
      expect(next.tubular).toBeGreaterThanOrEqual(previous.tubular)
      expect(next.motes).toBeGreaterThanOrEqual(previous.motes)
      previous = next
    }
  })

  it('caps the device-pixel ratio at two', () => {
    expect(lodFor(200, 3).pixelRatio).toBe(2)
    expect(lodFor(200, 0.5).pixelRatio).toBe(1)
  })

  it('spends fewer frames on a roster card than on the live stage', () => {
    expect(lodFor(112, 2).fps).toBeLessThan(lodFor(430, 2).fps)
  })
})
