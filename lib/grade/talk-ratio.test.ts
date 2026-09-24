/**
 * S5 — the talk-ratio target, normalised to her.
 *
 * Two promises, and this file is the proof of both. The DEFAULT path is the
 * one `dating-arm.test.ts` pins and nothing about it moves — same object, same
 * numbers, same grader text. The NORMALISED path moves only for a rep whose
 * band-time says she was asked to say something other than OPEN's seven words,
 * and never by more than eight points.
 */

import { describe, expect, it } from 'vitest'
import { getPersona } from '@/lib/personas'
import { bandFor } from '@/lib/warmth/bands'
import type { TranscriptTurn } from '@/lib/voice/types'
import { composeScorecard } from './index'
import { METRIC_BANDS, computeDeterministicMetrics, scoreMetrics, type DeterministicMetrics } from './metrics'
import { renderMetrics } from './prompt'
import {
  MAX_TALK_SHIFT,
  MIN_BAND_SECONDS,
  REFERENCE_WORDS,
  bandTimeFromEvents,
  datingMetricBands,
  expectedReplyWords,
  talkRatioBandFor,
  type BandEvent,
} from './talk-ratio'

const DEFAULT_TALK = METRIC_BANDS.find((band) => band.key === 'talkRatio')!

/** A rep where he held 60% of the floor — out of band on the §07 table. */
const METRICS: DeterministicMetrics = {
  talkRatio: 0.6,
  questionsAsked: 6,
  questionsPer3Min: 6,
  openQuestions: 4,
  closedQuestions: 2,
  openClosedRatio: 2,
  fillerRate: 1.5,
  longestMonologue: 9,
  meanResponseLatency: 1.1,
  specificPlanOffered: false,
  planQuality: null,
  cleanExit: true,
  exitQuality: 1,
  userTurns: 12,
  agentTurns: 12,
  sessionSeconds: 180,
}

describe('the default path is the path it always was', () => {
  it('returns METRIC_BANDS itself when there is no band-time', () => {
    expect(datingMetricBands()).toBe(METRIC_BANDS)
    expect(datingMetricBands(null)).toBe(METRIC_BANDS)
    expect(datingMetricBands({})).toBe(METRIC_BANDS)
    expect(talkRatioBandFor(undefined)).toBe(DEFAULT_TALK)
  })

  it('leaves the pinned band untouched in value, too', () => {
    // The same assertion `dating-arm.test.ts` makes, restated here so a change
    // to this file that mutated the shared table would fail in both places.
    expect([DEFAULT_TALK.min, DEFAULT_TALK.max, DEFAULT_TALK.tolerance]).toEqual([0.4, 0.55, 0.12])
  })

  it('scores and composes byte-identically when nothing is supplied', () => {
    expect(scoreMetrics(METRICS, datingMetricBands(null))).toEqual(scoreMetrics(METRICS))
    const transcript: TranscriptTurn[] = [
      { speaker: 'user', text: 'Hey, is this seat taken?', t_start: 0, t_end: 2 },
      { speaker: 'agent', text: 'No, go ahead.', t_start: 2.5, t_end: 3.5 },
      { speaker: 'user', text: 'What are you reading?', t_start: 4, t_end: 5.5 },
      { speaker: 'agent', text: 'Poetry, mostly.', t_start: 6, t_end: 7 },
    ]
    const judgement = {
      scores: { opening: 70, curiosity: 60, listening: 55, signalReading: 50, composure: 65, close: 60 },
      evidence: {},
      wentWell: 'You asked what she was reading.',
      memoryLine: null,
    }
    const plain = composeScorecard({ transcript, sessionSeconds: 60, judgement, outcome: 'neutral', model: 'm' })
    const threaded = composeScorecard({
      transcript, sessionSeconds: 60, judgement, outcome: 'neutral', model: 'm', bands: datingMetricBands(null),
    })
    expect({ ...threaded, gradedAt: '' }).toEqual({ ...plain, gradedAt: '' })
  })

  it('never touches what the grader is shown', () => {
    // `renderMetrics` is Tier 0 and pinned; this module has no hand on it.
    // The target the model reads stays §07's, whatever band was scored.
    expect(renderMetrics(METRICS)).toContain('talk ratio 60% (target 40-55%)')
  })
})

describe('her expected reply length', () => {
  it('is the reference at OPEN', () => {
    expect(expectedReplyWords({ OPEN: 180 })).toBe(REFERENCE_WORDS)
    expect(REFERENCE_WORDS).toBe(7)
  })

  it('is weighted by time in band', () => {
    // Two minutes guarded (6), one minute closed (4).
    expect(expectedReplyWords({ GUARDED: 120, CLOSED: 60 })).toBeCloseTo((6 * 120 + 4 * 60) / 180, 10)
  })

  it('says nothing from too little telemetry', () => {
    expect(expectedReplyWords({ GUARDED: MIN_BAND_SECONDS - 1 })).toBeNull()
    expect(expectedReplyWords({ GUARDED: 0, OPEN: -4 })).toBeNull()
  })
})

describe('the normalised band', () => {
  it('does not move for a rep spent at OPEN', () => {
    expect(talkRatioBandFor({ OPEN: 175 })).toBe(DEFAULT_TALK)
    expect(datingMetricBands({ OPEN: 175 })).toBe(METRIC_BANDS)
  })

  it('absorbs the first point of movement', () => {
    // A little time in ENGAGED is not a different target on the screen.
    expect(datingMetricBands({ OPEN: 150, ENGAGED: 30 })).toBe(METRIC_BANDS)
  })

  it('rises when she was asked to say less — the Robin case', () => {
    const band = talkRatioBandFor({ GUARDED: 120, CLOSED: 40, OPEN: 20 })
    expect(band).not.toBe(DEFAULT_TALK)
    expect(band.min).toBe(0.44)
    expect(band.max).toBe(0.59)
    // The tolerance is how bad a miss is, not where the target is, and it
    // does not move with her.
    expect(band.tolerance).toBe(DEFAULT_TALK.tolerance)
  })

  it('falls when she was asked to say more', () => {
    const band = talkRatioBandFor({ INVESTED: 150, ENGAGED: 30 })
    expect(band.min!).toBeLessThan(0.4)
    expect(band.max!).toBeLessThan(0.55)
  })

  it('never moves either edge more than eight points', () => {
    const cold = talkRatioBandFor({ HOSTILE: 60, CLOSED: 120 })
    expect(cold.min).toBeCloseTo(0.4 + MAX_TALK_SHIFT, 10)
    expect(cold.max).toBeCloseTo(0.55 + MAX_TALK_SHIFT, 10)
  })

  it('replaces only the talk band, and only the talk row scores differently', () => {
    const bands = datingMetricBands({ GUARDED: 180 })
    expect(bands).not.toBe(METRIC_BANDS)
    for (const [index, band] of bands.entries()) {
      if (band.key === 'talkRatio') continue
      expect(band, band.key).toBe(METRIC_BANDS[index])
    }
    const plain = scoreMetrics(METRICS)
    const normalised = scoreMetrics(METRICS, bands)
    for (const [index, row] of normalised.entries()) {
      if (row.key === 'talkRatio') {
        // 60% against a guarded character is closer to her target than to §07's.
        expect(row.points!).toBeGreaterThan(plain[index]!.points!)
        expect(row.band).toBe('43%–58%')
      } else {
        expect(row, row.key).toEqual(plain[index])
      }
    }
  })
})

describe('band-time, rebuilt from the stored row', () => {
  /** Twelve exchanges, his line then hers, fifteen seconds each. */
  function rep(): TranscriptTurn[] {
    const turns: TranscriptTurn[] = []
    for (let exchange = 0; exchange < 12; exchange += 1) {
      const at = exchange * 15
      turns.push({ speaker: 'user', text: `His line ${exchange + 1}.`, t_start: at, t_end: at + 5 })
      turns.push({ speaker: 'agent', text: `Her line ${exchange + 1}.`, t_start: at + 6, t_end: at + 9 })
    }
    return turns
  }

  const holding = (band: string): BandEvent[] =>
    Array.from({ length: 12 }, (_, index) => ({ turnIndex: index + 1, band }))

  it('adds up to the rep, starting in her starting band', () => {
    const time = bandTimeFromEvents({
      transcript: rep(),
      events: [{ turnIndex: 1, band: 'GUARDED' }, { turnIndex: 4, band: 'OPEN' }],
      startWarmth: 20,
      sessionSeconds: 180,
    })
    // GUARDED from 0 to the end of his first line (5s) and on to his fourth
    // (50s); OPEN from there to 180.
    expect(time).toEqual({ GUARDED: 50, OPEN: 130 })
  })

  it('reads the last event on a turn, which is where she was left', () => {
    const time = bandTimeFromEvents({
      transcript: rep(),
      events: [{ turnIndex: 1, band: 'OPEN' }, { turnIndex: 1, band: 'GUARDED' }],
      startWarmth: 45,
      sessionSeconds: 180,
    })
    expect(time).toEqual({ OPEN: 5, GUARDED: 175 })
  })

  it('refuses to guess from nothing', () => {
    expect(bandTimeFromEvents({ transcript: rep(), events: [], startWarmth: 20, sessionSeconds: 180 })).toBeNull()
    expect(bandTimeFromEvents({ transcript: rep(), events: holding('OPEN'), startWarmth: null, sessionSeconds: 180 })).toBeNull()
    expect(bandTimeFromEvents({ transcript: rep(), events: holding('SIMMERING'), startWarmth: 20, sessionSeconds: 180 })).toBeNull()
  })

  it('moves the band for Robin held where she starts, and not for Cass held where she starts', () => {
    // The authored roster, not a fixture: Robin opens GUARDED and Cass opens
    // OPEN. A rep that never moves either of them is the cleanest statement
    // of "the character was told to say this much".
    const robin = getPersona('robin')!
    const cass = getPersona('tess')!
    const robinBand = bandFor(robin.trajectory.start)
    const cassBand = bandFor(cass.trajectory.start)
    expect([robinBand, cassBand]).toEqual(['GUARDED', 'OPEN'])

    const robinTime = bandTimeFromEvents({
      transcript: rep(), events: holding(robinBand), startWarmth: robin.trajectory.start, sessionSeconds: 180,
    })
    const cassTime = bandTimeFromEvents({
      transcript: rep(), events: holding(cassBand), startWarmth: cass.trajectory.start, sessionSeconds: 180,
    })
    expect(datingMetricBands(robinTime)).not.toBe(METRIC_BANDS)
    expect(datingMetricBands(cassTime)).toBe(METRIC_BANDS)
  })

  it('carries a real rep end to end: same transcript, two characters, one talk row apart', () => {
    const transcript = rep()
    const metrics = computeDeterministicMetrics(transcript, 180)
    const robinBands = datingMetricBands(bandTimeFromEvents({
      transcript, events: holding('GUARDED'), startWarmth: 20, sessionSeconds: 180,
    }))
    const plain = scoreMetrics(metrics)
    const normalised = scoreMetrics(metrics, robinBands)
    const moved = normalised.filter((row, index) => JSON.stringify(row) !== JSON.stringify(plain[index]))
    expect(moved.map((row) => row.key)).toEqual(['talkRatio'])
  })
})
