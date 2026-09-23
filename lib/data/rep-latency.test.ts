import { describe, expect, it } from 'vitest'
import { agentTurnCount, firstReplyGapMs, latencySummary, percentile, replyGapsMs, rungRows, type RepSample, type StoredTurn } from './rep-latency'

const t = (speaker: 'user' | 'agent', start: number, end: number, text = 'words'): StoredTurn => ({ speaker, text, t_start: start, t_end: end })

describe('reply gaps (PERSONA-REALISM-REPORT L8)', () => {
  const turns = [t('user', 0, 2), t('agent', 9.6, 11), t('user', 13, 15), t('agent', 18.4, 20), t('user', 22, 23), t('user', 24, 25), t('agent', 27, 28)]

  it('measures him finishing to her starting, and only across a real exchange', () => {
    expect(replyGapsMs(turns)).toEqual([7600, 3400, 2000])
    expect(firstReplyGapMs(turns)).toBe(7600)
    expect(agentTurnCount(turns)).toBe(3)
  })

  it('ignores empty turns and survives an empty rep', () => {
    expect(replyGapsMs([t('user', 0, 1), t('agent', 2, 3, '  ')])).toEqual([])
    expect(firstReplyGapMs([])).toBeNull()
    expect(percentile([], 50)).toBeNull()
  })
})

describe('the ladder, re-measured (W1)', () => {
  const rep = (slug: string, peak: number | null, duration = 180): RepSample => ({
    personaSlug: slug, peakWarmth: peak, durationSeconds: duration,
    turns: [t('user', 0, 2), t('agent', 5, 6), t('user', 8, 9), t('agent', 11, 12)],
  })

  it('reports arm and ENGAGED rates per rung, leaving out reps under a minute', () => {
    const rows = rungRows([rep('tess', 70), rep('tess', 50), rep('nadia', 62), rep('nadia', 90, 30)], ['tess', 'nadia', 'maya'])
    expect(rows.map((row) => [row.personaSlug, row.reps, row.armedShare, row.engagedShare])).toEqual([
      ['tess', 2, 0.5, 0.5], ['nadia', 1, 0, 1], ['maya', 0, null, null],
    ])
    expect(latencySummary([rep('tess', 70)])).toMatchObject({ reps: 1, agentTurnsPerRep: 2, firstReplyP50: 3000 })
  })
})
