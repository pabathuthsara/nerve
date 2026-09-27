import { describe, expect, it } from 'vitest'
import manifest from '@/public/hero/manifest.json'
import { CAPTURED_REP, EXCERPT_TURNS } from './captured-rep'

describe('the rep on the first screen', () => {
  it('is a captured recording, not a script, on her side (rule 10)', () => {
    expect(CAPTURED_REP.herScripted).toBe(false)
  })

  it('quotes her words exactly as recorded', () => {
    const recorded = manifest.turns.slice(0, EXCERPT_TURNS)
    expect(CAPTURED_REP.lines).toEqual(recorded.map((turn) => ({ who: turn.who, text: turn.text })))
    expect(CAPTURED_REP.lines.some((line) => line.who === 'her')).toBe(true)
  })

  it('names a real character', () => {
    expect(CAPTURED_REP.name.length).toBeGreaterThan(1)
    expect(CAPTURED_REP.setting.length).toBeGreaterThan(1)
  })
})
