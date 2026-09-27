import { describe, expect, it } from 'vitest'
import { momentNote, pointParts, previousComposite, progressReading, progressSentence, splitMetrics } from './result-view'
import type { MetricBand } from './types'

const metric = (key: MetricBand['key'], points: number, max = 10): MetricBand => ({
  key, label: key, displayValue: '', numericValue: 50, targetLabel: '', targetMin: 20, targetMax: 60,
  verdict: 'GOOD', points, maxPoints: max, note: '',
})

describe('the line under the score rail', () => {
  const gate = { level: 2 as const, fromLevel: 1 as const, have: 0, need: 1 }

  it('never says 0 while the grade is still coming', () => {
    const reading = progressReading({ composite: null, repLevel: 1, before: gate, after: gate })
    expect(reading.kind).toBe('pending')
    expect(progressSentence(reading)).toMatch(/scoring/i)
  })

  it('names the unlock only when this rep moved the gate', () => {
    const after = { level: 3 as const, fromLevel: 2 as const, have: 0, need: 2 }
    const reading = progressReading({ composite: 74, repLevel: 1, before: gate, after })
    expect(reading).toMatchObject({ kind: 'unlocked', level: 2 })
    expect(progressSentence(reading)).toBe('Level 02 — Receptive is open.')
  })

  it('says how far short, in points, at the tier that counts', () => {
    const reading = progressReading({ composite: 63, repLevel: 1, before: gate, after: gate })
    expect(progressSentence(reading)).toBe('7 points short of Level 02 — Receptive.')
    expect(progressSentence(progressReading({ composite: 69, repLevel: 1, before: gate, after: gate }))).toMatch(/^1 point short/)
  })

  it('counts a qualifying rep on a tier that wants two', () => {
    const before = { level: 3 as const, fromLevel: 2 as const, have: 0, need: 2 }
    const after = { ...before, have: 1 }
    expect(progressSentence(progressReading({ composite: 80, repLevel: 2, before, after })))
      .toBe('That one counted. 1 more at 70+ opens Level 03 — Neutral.')
  })

  it('does not pretend a rep on another tier moved the gate', () => {
    const after = { level: 3 as const, fromLevel: 2 as const, have: 0, need: 2 }
    expect(progressReading({ composite: 90, repLevel: 1, before: after, after }).kind).toBe('elsewhere')
  })

  it('says nothing when there is nothing left to open', () => {
    expect(progressSentence(progressReading({ composite: 90, repLevel: 4, before: null, after: null }))).toBeNull()
  })
})

describe('the scorecard parts', () => {
  it('adds up to the composite, with what each part left on the table', () => {
    const parts = pointParts([metric('talk_ratio', 9), metric('open_closed', 0)], { label: 'Judgement', points: 23, maxPoints: 40, subScores: [], wentWell: null })
    expect(parts.reduce((sum, part) => sum + part.points, 0)).toBe(32)
    expect(parts.map((part) => part.lost)).toEqual([1, 10, 17])
  })

  it('expands only the rows that cost points, biggest first', () => {
    const { misses, held } = splitMetrics([metric('talk_ratio', 9), metric('filler_words', 2), metric('open_closed', 0), metric('question_rate', 10)])
    expect(misses.map((row) => row.key)).toEqual(['open_closed', 'filler_words'])
    expect(held.map((row) => row.key)).toEqual(['talk_ratio', 'question_rate'])
  })

  it('compares against the graded rep before this one, by time', () => {
    const history = [
      { id: 'c', track: 'dating' as const, startedAt: '2026-09-27T10:00:00Z', compositeScore: 70 },
      { id: 'b', track: 'dating' as const, startedAt: '2026-09-26T10:00:00Z', compositeScore: null },
      { id: 'a', track: 'dating' as const, startedAt: '2026-09-25T10:00:00Z', compositeScore: 55 },
      { id: 'i', track: 'interview' as const, startedAt: '2026-09-26T12:00:00Z', compositeScore: 90 },
    ]
    expect(previousComposite(history, { id: 'c', track: 'dating', startedAt: '2026-09-27T10:00:00Z' })).toBe(55)
    expect(previousComposite(history, { id: 'a', track: 'dating', startedAt: '2026-09-25T10:00:00Z' })).toBeNull()
  })
})

describe('a moment note, in words', () => {
  it('turns the scorer codes into sentences', () => {
    expect(momentNote('open-question')).toMatch(/open question/i)
    expect(momentNote('no signal')).toBe('She did not react either way.')
    expect(momentNote('no signal', true)).toBe('They did not react either way.')
  })

  it('passes a sentence through and de-hyphenates an unknown code', () => {
    expect(momentNote('Joined her reality before asking for anything.')).toBe('Joined her reality before asking for anything.')
    expect(momentNote('some-new-code')).toBe('Some new code.')
  })
})
