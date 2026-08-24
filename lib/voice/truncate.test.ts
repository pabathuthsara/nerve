/**
 * Barge-in truncation, and the calibration that was never written.
 *
 * Both of these exist because of the same class of failure: something the user
 * experienced that no number anywhere in the product recorded. She was cut off
 * mid-word and the transcript claimed the whole sentence; everybody ran at a
 * turn-taking threshold measured from nobody.
 */

import { describe, expect, it } from 'vitest'

import {
  clipToPlayed,
  estimateSpokenSeconds,
  proportionalPrefix,
  snapToWordBoundary,
  WORDS_PER_SECOND,
} from './truncate'
import { PauseMeter, offsetFromPause, OFFSET_MAX_MS, OFFSET_MIN_MS } from './calibration'
import { emptyIncidents, incidentsAreAlarming } from './incidents'

describe('clipToPlayed', () => {
  const LINE = 'The board says four minutes and the platform is freezing'

  it('leaves a line she finished exactly as it was', () => {
    const full = estimateSpokenSeconds(LINE)
    const clip = clipToPlayed(LINE, full + 1)
    expect(clip.truncated).toBe(false)
    expect(clip.text).toBe(LINE)
  })

  it('cuts a line she was interrupted through, at a word boundary', () => {
    // Roughly a third of the way in. THE defect this exists for: before it,
    // the whole sentence was committed and then graded, so the debrief showed
    // words the user never heard.
    const clip = clipToPlayed(LINE, estimateSpokenSeconds(LINE) / 3)
    expect(clip.truncated).toBe(true)
    expect(clip.text.length).toBeGreaterThan(0)
    expect(clip.text.length).toBeLessThan(LINE.length)
    expect(LINE.startsWith(clip.text)).toBe(true)
    // Never mid-word. A cut mid-sentence is honest; a cut mid-word is a bug.
    expect(LINE[clip.text.length] ?? ' ').toMatch(/\s|$/)
  })

  it('reports the played milliseconds, which is what item.truncate wants', () => {
    expect(clipToPlayed(LINE, 1.234).playedMs).toBe(1234)
  })

  it('keeps nothing when she was cut before a single word landed', () => {
    const clip = clipToPlayed(LINE, 0.01)
    expect(clip.truncated).toBe(true)
    expect(clip.text).toBe('')
  })

  it('treats an empty transcript as nothing to cut', () => {
    expect(clipToPlayed('   ', 0.5)).toEqual({ text: '', truncated: false, playedMs: 500 })
  })

  it('scales the estimate with her authored pace', () => {
    expect(estimateSpokenSeconds('one two three four five', 1)).toBeCloseTo(5 / WORDS_PER_SECOND, 5)
    // A faster voice says the same line in less time, so the same played
    // duration keeps MORE of it.
    const fast = clipToPlayed(LINE, 1.5, 1.3)
    const slow = clipToPlayed(LINE, 1.5, 0.8)
    expect(fast.text.length).toBeGreaterThan(slow.text.length)
  })

  it('errs towards keeping a word she did say', () => {
    // The rate is deliberately a little slow, so the estimate of a full line is
    // a little long, so the cut keeps slightly more rather than slightly less.
    // Deleting a word the user heard is the expensive direction.
    expect(WORDS_PER_SECOND).toBeLessThan(3)
  })
})

describe('snapToWordBoundary', () => {
  it('walks back out of a word', () => {
    expect(snapToWordBoundary('Depends, a lot of it is just sad peo', 'p')).toBe(
      'Depends, a lot of it is just sad',
    )
  })

  it('leaves a completed word where it fell', () => {
    expect(snapToWordBoundary('Depends, a lot', ' ')).toBe('Depends, a lot')
  })

  it('keeps an apostrophe intact', () => {
    expect(snapToWordBoundary("a lot'", 's')).toBe('a')
  })

  it('returns nothing rather than half a first word', () => {
    expect(snapToWordBoundary('Depen', 'd')).toBe('')
  })
})

describe('proportionalPrefix', () => {
  it('handles both ends without arithmetic', () => {
    expect(proportionalPrefix('abcdef', 0)).toBe('')
    expect(proportionalPrefix('abcdef', 1)).toBe('abcdef')
    expect(proportionalPrefix('abcdef', 0.5)).toBe('abc')
  })
})

/* ------------------------------------------------------------------ */

describe('PauseMeter', () => {
  /** Drive the meter with a script of [ms, speaking] frames. */
  const play = (frames: [number, boolean][]) => {
    const meter = new PauseMeter()
    for (const [at, speaking] of frames) meter.sample(at, speaking)
    return meter
  }

  it('measures the gaps between clauses, not the silence before speech', () => {
    // "testing" ... 300ms ... "one two" ... 300ms ... "three"
    const meter = play([
      [0, false], [100, false],
      [200, true], [400, true],
      [500, false], [700, false],
      [800, true], [1000, true],
      [1100, false], [1300, false],
      [1400, true], [1600, true],
    ])
    expect(meter.sampleCount).toBe(2)
    expect(meter.measuredPauseMs()).toBe(300)
  })

  it('will not guess from too little', () => {
    const meter = play([[0, true], [100, false], [400, true]])
    expect(meter.measuredPauseMs()).toBeNull()
  })

  it('ignores a breath and ignores a full stop', () => {
    // 40ms is inside a word; 3s is somebody who finished talking. Neither is
    // the inter-clause pause the turn detector has to sit through.
    const meter = play([
      [0, true], [100, false], [140, true],
      [200, false], [3200, true],
      [3300, false], [3600, true],
      [3700, false], [4000, true],
    ])
    expect(meter.measuredPauseMs()).toBe(300)
  })

  it('takes a median so one long think does not widen the whole rep', () => {
    const meter = play([
      [0, true], [100, false], [400, true],
      [500, false], [800, true],
      [900, false], [2200, true],
    ])
    expect(meter.measuredPauseMs()).toBe(300)
  })
})

describe('offsetFromPause', () => {
  it('is zero when nothing was measured, so the default stands', () => {
    expect(offsetFromPause(null, 600)).toBe(0)
  })

  it('widens the window for a hesitant speaker, with headroom', () => {
    // A 600ms pause needs more than a 600ms window: sitting through a pause of
    // exactly its own length means cutting them off half the time.
    expect(offsetFromPause(600, 600)).toBe(250)
  })

  it('narrows it for a fluent one', () => {
    // The half of the range that was unreachable while the resolver floored the
    // offset at zero. A confident speaker should not wait out a hesitant
    // speaker's silence after every sentence.
    expect(offsetFromPause(150, 600)).toBe(-200)
  })

  it('stays inside the column constraint', () => {
    expect(offsetFromPause(0, 600)).toBeGreaterThanOrEqual(OFFSET_MIN_MS)
    expect(offsetFromPause(9_999, 600)).toBeLessThanOrEqual(OFFSET_MAX_MS)
  })
})

/* ------------------------------------------------------------------ */

describe('incidentsAreAlarming', () => {
  it('says nothing about a short rep', () => {
    const incidents = { ...emptyIncidents(), unheard: 5 }
    expect(incidentsAreAlarming(incidents, 2)).toBe(false)
  })

  it('fires when replies are not reaching the ear', () => {
    expect(incidentsAreAlarming({ ...emptyIncidents(), unheard: 3 }, 10)).toBe(true)
  })

  it('fires when real user turns are being deleted', () => {
    expect(incidentsAreAlarming({ ...emptyIncidents(), echoRejected: 3 }, 10)).toBe(true)
  })

  it('fires when she is cut off on most replies', () => {
    expect(incidentsAreAlarming({ ...emptyIncidents(), truncated: 6 }, 10)).toBe(true)
    // A conversation with some barge-in in it is a conversation, not a fault.
    expect(incidentsAreAlarming({ ...emptyIncidents(), truncated: 3 }, 10)).toBe(false)
  })

  it('is quiet on a clean rep', () => {
    expect(incidentsAreAlarming(emptyIncidents(), 20)).toBe(false)
  })
})
