import { describe, expect, it } from 'vitest'
import { HOUSE_VISUAL } from './house-visual'
import { RESERVED_ARENA_COLOURS } from '@/lib/personas/visual'

/**
 * The house orb is authored outside `PERSONA_VISUAL`, so it is outside the
 * reach of `lib/personas/visual.test.ts`. These are that file's assertions,
 * run over the one visual it cannot see — because the reason the override
 * exists (it is not a character) is not a reason for it to be exempt from
 * Arena.
 */
function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) throw new Error(`not a hex triple: ${hex}`)
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]
}

function hue([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  if (max === min) return 0
  const d = max - min
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return (h * 60 + 360) % 360
}

const distance = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const luma = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('the house orb', () => {
  const colours = [HOUSE_VISUAL.deep, HOUSE_VISUAL.core, HOUSE_VISUAL.sheen]

  it('gives every colour a well-formed hex triple', () => {
    for (const colour of colours) expect(() => rgb(colour)).not.toThrow()
  })

  it('never borrows an Arena token', () => {
    for (const colour of colours) {
      expect(RESERVED_ARENA_COLOURS).not.toContain(colour.toLowerCase())
    }
  })

  it('keeps its hue out of the volt band', () => {
    // 60–115° is where Volt lives. An orb in that arc competes with the one
    // accent the whole system is built around.
    const h = hue(rgb(HOUSE_VISUAL.core))
    expect(h < 60 || h > 115).toBe(true)
  })

  it('stays a real distance from every accent', () => {
    // The same RGB distance of 60 `visual.test.ts` enforces on the roster.
    for (const reserved of RESERVED_ARENA_COLOURS) {
      expect(distance(rgb(HOUSE_VISUAL.core), rgb(reserved))).toBeGreaterThan(60)
    }
  })

  it('keeps the guarded end darker than the warm end', () => {
    expect(luma(rgb(HOUSE_VISUAL.deep))).toBeLessThan(luma(rgb(HOUSE_VISUAL.core)))
    expect(luma(rgb(HOUSE_VISUAL.core))).toBeLessThan(luma(rgb(HOUSE_VISUAL.sheen)))
  })

  it('is not red, which is what it shipped as by accident', () => {
    /**
     * The regression this file exists for. Without the override, `visualFor`
     * hashed the name "Nerve" onto a roster row and drew the landing page's
     * orb in Nadia's crimson — Red is semantic in Arena and never branding,
     * so the sheet read as an error state.
     */
    const [r, g, b] = rgb(HOUSE_VISUAL.core)
    expect(r).toBeLessThan(Math.max(g, b))
  })
})
