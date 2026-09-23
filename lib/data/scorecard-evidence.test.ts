/**
 * The scorecard's evidence rows (PERSONA-REALISM S3, S4) and the talk band
 * that can move (S5), as the screen reads them back off a stored rep.
 */

import { describe, expect, it } from 'vitest'
import type { TranscriptTurn } from '@/lib/voice/types'
import { assertFactSentence } from '@/lib/grade/signal-reading'
import { movedPercentBand, storedTurns, toScorecard, type ScoreRow, type StoredMetricScore } from './scorecard'
import type { Axis } from './scorecard-axis'

const row = (over: Partial<ScoreRow> = {}): ScoreRow => ({
  composite: 70,
  metric_scores: [],
  focus: ['listening', 'close'],
  went_well: 'You asked what she was reading.',
  opening: 70, curiosity: 60, listening: 50, signal_reading: 80, composure: 90, close: 40,
  ...over,
})

type Line = [speaker: 'user' | 'agent', text: string, at: number]
const rep = (lines: Line[]): TranscriptTurn[] =>
  lines.map(([speaker, text, at]) => ({ speaker, text, t_start: at, t_end: at + 2.5 }))

/** Collected-rep register: a missed bid at 1:12 and a disclosure he followed. */
const TRANSCRIPT = rep([
  ['user', 'Is this seat taken?', 60],
  ['agent', 'No, go ahead.', 63],
  ['user', 'Busy in here today.', 67],
  ['agent', 'It always is. So what do you do?', 72],
  ['user', 'Accounts, mostly. Where are you from?', 76],
  ['agent', 'Round here. My sister runs the café next door.', 80],
  ['user', 'Does your sister ever get a day off?', 85],
  ['agent', 'Not really.', 89],
])

describe('the evidence rows', () => {
  it('are absent on a scorecard read without a transcript, which is every old caller', () => {
    const card = toScorecard({ sessionId: 's', score: row(), events: [] })
    expect(card.responsiveness).toBeNull()
    expect(card.signals).toEqual([])
  })

  it('count and place the moments on a dating rep', () => {
    const card = toScorecard({ sessionId: 's', score: row(), events: [], turns: TRANSCRIPT })
    expect(card.responsiveness).toEqual({
      followUps: { count: 1, of: 2 },
      callbacks: 0,
      bidsTurnedToward: { count: 0, of: 1 },
      reciprocalDisclosures: { count: 0, of: 1 },
    })
    expect(card.signals.map((signal) => [signal.clock, signal.read])).toEqual([['1:12', false], ['1:20', true]])
    expect(card.signals[0]?.sentence).toBe('At 1:12 she asked you something back. You answered in two words and changed the subject.')
    for (const signal of card.signals) expect(() => assertFactSentence(signal.sentence)).not.toThrow()
  })

  it('never appear on an interview, where asking is the format', () => {
    const card = toScorecard({ sessionId: 's', score: row(), events: [], turns: TRANSCRIPT, track: 'interview' })
    expect(card.responsiveness).toBeNull()
    expect(card.signals).toEqual([])
  })

  it('leave every scored row exactly where it was', () => {
    const stored: StoredMetricScore[] = [
      { key: 'talkRatio', label: 'talk ratio', band: '40%–55%', value: 0.5, points: 96, verdict: 'inside' },
    ]
    const without = toScorecard({ sessionId: 's', score: row({ metric_scores: stored }), events: [] })
    const withTurns = toScorecard({ sessionId: 's', score: row({ metric_scores: stored }), events: [], turns: TRANSCRIPT })
    expect(withTurns.metrics).toEqual(without.metrics)
    expect(withTurns.judgement).toEqual(without.judgement)
    expect(withTurns.composite).toBe(without.composite)
  })
})

describe('the stored turns', () => {
  it('keeps the shape both adapters emit and drops anything else', () => {
    expect(storedTurns([
      { speaker: 'user', text: 'Hi.', t_start: 0, t_end: 1 },
      { speaker: 'persona', text: 'Hi.', t_start: 1, t_end: 2 },
      { speaker: 'agent', text: 7, t_start: 1, t_end: 2 },
      null,
      { speaker: 'agent', text: 'Hello.', t_start: 2, t_end: 3, marks: ['probe'] },
    ])).toEqual([
      { speaker: 'user', text: 'Hi.', t_start: 0, t_end: 1 },
      { speaker: 'agent', text: 'Hello.', t_start: 2, t_end: 3 },
    ])
    expect(storedTurns(null)).toEqual([])
    expect(storedTurns({ turns: [] })).toEqual([])
  })
})

describe('a talk band that moved for her (S5)', () => {
  const axis = { targetMin: 40, targetMax: 55 } as Axis

  it('reads only a percentage band that differs from the axis', () => {
    expect(movedPercentBand('40%–55%', axis)).toBeNull()
    expect(movedPercentBand('44%–59%', axis)).toEqual({ min: 44, max: 59 })
    expect(movedPercentBand('36%–50%', axis)).toEqual({ min: 36, max: 50 })
    expect(movedPercentBand('≤ 4.0', axis)).toBeNull()
    expect(movedPercentBand('59%–44%', axis)).toBeNull()
  })

  it('draws the band the grade was scored against, and says why it moved', () => {
    const talk = (band: string): StoredMetricScore =>
      ({ key: 'talkRatio', label: 'talk ratio', band, value: 0.57, points: 94, verdict: 'inside' })
    const raised = toScorecard({ sessionId: 's', score: row({ metric_scores: [talk('44%–59%')] }), events: [] }).metrics[0]
    expect(raised).toMatchObject({ targetMin: 44, targetMax: 59, targetLabel: '44%–59%' })
    // The reason rides the note, after the verdict sentence it would otherwise
    // replace, so the target label stays one short mono line at phone width.
    expect(raised?.note).toBe(
      'You shared the floor without disappearing from it. Your target sat higher this rep because she kept her answers short.',
    )
    const lowered = toScorecard({ sessionId: 's', score: row({ metric_scores: [talk('36%–50%')] }), events: [] }).metrics[0]
    expect(lowered?.targetLabel).toBe('36%–50%')
    expect(lowered?.note).toMatch(/Your target sat lower this rep because she had more to say\.$/)
    const plain = toScorecard({ sessionId: 's', score: row({ metric_scores: [talk('40%–55%')] }), events: [] }).metrics[0]
    expect(plain).toMatchObject({
      targetMin: 40, targetMax: 55, targetLabel: '40%–55%', note: 'You shared the floor without disappearing from it.',
    })
  })

  it('never moves an interview band, whatever the row says', () => {
    const talk: StoredMetricScore = { key: 'talkRatio', label: 'answer share', band: '44%–59%', value: 0.6, points: 90, verdict: 'inside' }
    const metric = toScorecard({ sessionId: 's', score: row({ metric_scores: [talk] }), events: [], track: 'interview' }).metrics[0]
    expect(metric?.targetLabel).toBe('44%–59%')
    expect(metric?.targetMin).toBe(55)
  })
})
