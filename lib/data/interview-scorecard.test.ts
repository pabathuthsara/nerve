import { describe, expect, it } from 'vitest'
import {
  INTERVIEW_AXES,
  INTERVIEW_FOCUS_INSTRUCTIONS,
} from './interview-scorecard'
import { SUB_SCORE_LABELS, toScorecard, type ScoreRow, type StoredMetricScore } from './scorecard'
import { INTERVIEW_METRIC_BANDS } from '@/lib/grade/interview/metrics'
import { SUB_SCORE_KEYS } from '@/lib/grade/types'

describe('the interview axes', () => {
  /**
   * A stored row with no axis renders as nothing at all — the row is filtered
   * out and the metric silently disappears from the breakdown. So every band
   * the interview grade can produce has to have a word for it here.
   */
  it('has a display axis for every band an interview is scored against', () => {
    for (const band of INTERVIEW_METRIC_BANDS) {
      expect(INTERVIEW_AXES[band.key], band.key).toBeDefined()
    }
    expect(Object.keys(INTERVIEW_AXES)).toHaveLength(INTERVIEW_METRIC_BANDS.length)
  })

  it('gives every axis three verdicts and a format', () => {
    for (const [key, axis] of Object.entries(INTERVIEW_AXES)) {
      expect(axis.notes.below.length, key).toBeGreaterThan(15)
      expect(axis.notes.inside.length, key).toBeGreaterThan(15)
      expect(axis.notes.above.length, key).toBeGreaterThan(15)
      expect(axis.format(1), key).toBeTruthy()
      expect(axis.targetMin, key).toBeGreaterThanOrEqual(0)
      expect(axis.targetMax, key).toBeLessThanOrEqual(100)
      expect(axis.targetMax, key).toBeGreaterThan(axis.targetMin)
    }
  })

  /**
   * The prose is the whole reason this file exists. The dating notes on an
   * interview scorecard read as nonsense at best — *"Questions stacked up
   * faster than answers. It reads as an interview"* — and as advice that would
   * lose somebody an offer at worst.
   */
  it('never says the thing a date says', () => {
    const prose = [
      ...Object.values(INTERVIEW_AXES).flatMap((axis) => Object.values(axis.notes)),
      ...Object.values(INTERVIEW_FOCUS_INSTRUCTIONS),
    ].join(' ').toLowerCase()
    // Not the word "number" — an interview instruction should say *put one
    // number into the answer*. The dating SENSES of it are what must be gone.
    for (const phrase of ['her number', 'phone number', 'flirt', 'make the ask', 'reads as an interview']) {
      expect(prose, phrase).not.toContain(phrase)
    }
  })
})

describe('what to try next time', () => {
  it('covers all six dimensions the grader returns', () => {
    for (const key of SUB_SCORE_KEYS) {
      expect(INTERVIEW_FOCUS_INSTRUCTIONS[key], key).toBeTruthy()
    }
  })

  it('is an instruction rather than a verdict', () => {
    // §07: a focus is the thing to change, not a grade restated. Every line
    // starts with a verb somebody can act on before their next interview.
    for (const [key, line] of Object.entries(INTERVIEW_FOCUS_INSTRUCTIONS)) {
      expect(line.length, key).toBeGreaterThan(30)
      expect(line, key).toMatch(/^[A-Z]/)
    }
  })
})

/* ------------------------------------------------------------------ *
 * The breakdown, read back
 * ------------------------------------------------------------------ */

const metricRow = (key: string, points: number): StoredMetricScore =>
  ({ key, label: key, band: '—', value: 1, points, verdict: 'inside' })

const row = (over: Partial<ScoreRow> = {}): ScoreRow => ({
  composite: 70,
  metric_scores: [],
  focus: ['close', 'listening'],
  went_well: 'You named a number.',
  opening: 70, curiosity: 60, listening: 50, signal_reading: 80, composure: 90, close: 40,
  ...over,
})

describe('toScorecard, by track', () => {
  it('reads the rows against the track the rep was actually on', () => {
    const stored = [metricRow('talkRatio', 100)]
    const dating = toScorecard({ sessionId: 's', score: row({ metric_scores: stored }), events: [] })
    const interview = toScorecard({
      sessionId: 's', score: row({ metric_scores: stored }), events: [], track: 'interview',
    })
    expect(dating.metrics[0]?.label).toBe('Talk ratio')
    expect(interview.metrics[0]?.label).toBe('Answer share')
    expect(dating.metrics[0]?.note).not.toBe(interview.metrics[0]?.note)
  })

  it('defaults to dating, so nothing that never passed a track moved', () => {
    const stored = [metricRow('talkRatio', 100)]
    expect(toScorecard({ sessionId: 's', score: row({ metric_scores: stored }), events: [] }))
      .toEqual(toScorecard({ sessionId: 's', score: row({ metric_scores: stored }), events: [], track: 'dating' }))
  })

  it('gives an interview the interview instruction to try next', () => {
    const interview = toScorecard({ sessionId: 's', score: row(), events: [], track: 'interview' })
    expect(interview.tryNext).toBe(INTERVIEW_FOCUS_INSTRUCTIONS.close)
    // The dating one told a candidate to make the ask early enough that it grows
    // out of the conversation.
    const dating = toScorecard({ sessionId: 's', score: row(), events: [] })
    expect(dating.tryNext).not.toBe(interview.tryNext)
  })

  /**
   * The audit line prints `10 + 10 + … = 60` beside the composite and marks
   * itself `.danger` when the two disagree. A fixed ten per row is only correct
   * when exactly six were measured — the interview table has five, so the line
   * was arithmetic that would have been visibly wrong on every interview
   * scorecard.
   */
  it('spreads the deterministic sixty across however many rows scored', () => {
    const six = toScorecard({
      sessionId: 's',
      score: row({ metric_scores: ['a', 'b', 'c', 'd', 'e', 'f'].map(() => metricRow('talkRatio', 100)) }),
      events: [],
    })
    expect(six.metrics.every((metric) => metric.maxPoints === 10)).toBe(true)
    expect(six.metrics.reduce((sum, metric) => sum + metric.points, 0)).toBe(60)

    const five = toScorecard({
      sessionId: 's',
      score: row({
        metric_scores: INTERVIEW_METRIC_BANDS.map((band) => metricRow(band.key, 100)),
      }),
      events: [],
      track: 'interview',
    })
    expect(five.metrics).toHaveLength(5)
    expect(five.metrics.reduce((sum, metric) => sum + metric.points, 0)).toBe(60)
  })

  it('does not count an unmeasured row in the denominator', () => {
    // The same rule `scoreDeterministic` applies when it takes the mean: a
    // metric the rep gave nothing to measure is not a zero.
    const card = toScorecard({
      sessionId: 's',
      score: row({
        metric_scores: [
          ...INTERVIEW_METRIC_BANDS.slice(0, 4).map((band) => metricRow(band.key, 100)),
          { key: 'questionsAsked', label: 'q', band: '—', value: null, points: null, verdict: 'unmeasured' },
        ],
      }),
      events: [],
      track: 'interview',
    })
    expect(card.metrics.reduce((sum, metric) => sum + metric.points, 0)).toBe(60)
    expect(card.metrics.find((metric) => metric.key === 'questions_asked_back')?.points).toBe(0)
  })

  /**
   * §8.4. The card carries the corrections and this puts the NUMBER in the
   * breakdown beside the six it was averaged with — a scored dimension that
   * moved the composite and appeared nowhere in the working would read as a
   * footnote.
   */
  it('puts technical accuracy in the breakdown when the round probed', () => {
    const card = toScorecard({
      sessionId: 's',
      score: row({
        technical_accuracy: 41,
        accuracy: { score: 41, scored: 7, asked: 8, correct: 4, incomplete: 0, wrong: 3, notes: [], reading: 'Three were wrong.' },
      }),
      events: [],
      track: 'interview',
    })
    const seventh = card.judgement?.subScores.find((entry) => entry.key === 'technicalAccuracy')
    expect(seventh?.value).toBe(41)
    expect(seventh?.label).toBe(SUB_SCORE_LABELS.technicalAccuracy)
    expect(card.accuracy?.reading).toBe('Three were wrong.')
  })

  it('leaves it out entirely when there is no reading', () => {
    const card = toScorecard({ sessionId: 's', score: row(), events: [], track: 'interview' })
    expect(card.accuracy).toBeNull()
    expect(card.judgement?.subScores.map((entry) => entry.key)).not.toContain('technicalAccuracy')
    // And a dating rep never has one at all.
    const dating = toScorecard({ sessionId: 's', score: row(), events: [] })
    expect(dating.accuracy).toBeNull()
  })
})
