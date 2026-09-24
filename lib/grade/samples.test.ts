import { describe, expect, it } from 'vitest'
import { medianSample } from './samples'
import type { SubScores } from './types'

const s = (n: number, tag: string) => ({
  scores: { opening: n, curiosity: n, listening: n, signalReading: n, composure: n, close: n } as SubScores,
  parsed: { tag },
})

describe('medianSample (S6)', () => {
  it('takes the median of each dimension and cannot be dragged by one odd reading', () => {
    const chosen = medianSample([s(60, 'a'), s(62, 'b'), s(95, 'c')])!
    expect(chosen.scores.close).toBe(62)
    expect(chosen.parsed).toEqual({ tag: 'b' })
  })

  it('reads the median per dimension, not per sample', () => {
    const a = { scores: { opening: 50, curiosity: 80, listening: 60, signalReading: 60, composure: 60, close: 60 }, parsed: { tag: 'a' } }
    const b = { scores: { opening: 70, curiosity: 40, listening: 60, signalReading: 60, composure: 60, close: 60 }, parsed: { tag: 'b' } }
    const c = { scores: { opening: 60, curiosity: 60, listening: 60, signalReading: 60, composure: 60, close: 60 }, parsed: { tag: 'c' } }
    const chosen = medianSample([a, b, c])!
    expect(chosen.scores).toMatchObject({ opening: 60, curiosity: 60 })
    expect(chosen.parsed).toEqual({ tag: 'c' })
  })

  it('passes one sample through and answers null for none', () => {
    expect(medianSample([s(70, 'only')])).toEqual(s(70, 'only'))
    expect(medianSample([])).toBeNull()
  })
})
