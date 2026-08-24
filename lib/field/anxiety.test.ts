import { describe, expect, it } from 'vitest'

import { anxietySeries, anxietyVerdict, POINTS_FOR_A_LINE } from './anxiety'
import { milestoneFor, milestoneRef, milestonesCrossed, REJECTION_MILESTONES } from './milestones'

/** As `fetchFieldLog` returns them: newest first. */
function log(entries: [pre: number | null, post: number | null, on: string][]) {
  return entries.map(([anxietyPre, anxietyPost, loggedOn]) => ({ anxietyPre, anxietyPost, loggedOn }))
}

describe('anxietySeries', () => {
  it('turns a newest-first log into an oldest-first series', () => {
    // The log reads newest first; a chart read right-to-left is a chart nobody
    // can read.
    const series = anxietySeries(log([[8, 3, '2026-08-23'], [7, 4, '2026-08-22'], [9, 2, '2026-08-21']]))
    expect(series.points.map((point) => point.on)).toEqual(['2026-08-21', '2026-08-22', '2026-08-23'])
  })

  it('sorts by the day rather than trusting the order it was handed', () => {
    // FOUND IN THE BROWSER. The read sorts on `logged_at`, which ties for rows
    // written in the same instant, and Postgres is under no obligation to
    // break the tie the same way twice. The chart came back left-to-right
    // newest-first and read as a fear that was climbing.
    const scrambled = anxietySeries(log([[4, 2, '2026-08-21'], [9, 3, '2026-08-23'], [6, 1, '2026-08-22']]))
    expect(scrambled.points.map((point) => point.on)).toEqual(['2026-08-21', '2026-08-22', '2026-08-23'])
    expect(scrambled.points.map((point) => point.predicted)).toEqual([4, 6, 9])
  })

  it('keeps two asks on the same day in the order they were logged', () => {
    // Newest first in, so the earlier of the two must come out first.
    const sameDay = anxietySeries(log([[9, 4, '2026-08-23'], [3, 1, '2026-08-23']]))
    expect(sameDay.points.map((point) => point.predicted)).toEqual([3, 9])
  })

  it('drops an ask that was never made', () => {
    // Logging honestly that you could not do it carries a prediction and no
    // actual. Plotting it against zero would read as "it turned out to be
    // nothing", which is the opposite of what happened.
    const series = anxietySeries(log([[8, null, '2026-08-23'], [7, 4, '2026-08-22']]))
    expect(series.points).toHaveLength(1)
    expect(series.points[0]?.predicted).toBe(7)
  })

  it('averages by hand-checkable arithmetic', () => {
    const series = anxietySeries(log([[8, 3, 'c'], [7, 4, 'b'], [9, 2, 'a']]))
    expect(series.meanPredicted).toBe(8)   // (8 + 7 + 9) / 3
    expect(series.meanActual).toBe(3)      // (3 + 4 + 2) / 3
    expect(series.meanGap).toBe(5)
    expect(series.easierThanFeared).toBe(3)
  })

  it('reports a fear that was accurate rather than flattering it', () => {
    const series = anxietySeries(log([[5, 5, 'c'], [5, 5, 'b'], [5, 5, 'a']]))
    expect(series.meanGap).toBe(0)
    expect(series.easierThanFeared).toBe(0)
    expect(anxietyVerdict(series)).toContain('accurate')
  })

  it('says so when it was worse than they expected', () => {
    // The case that would be tempting to hide. A user being sensitised rather
    // than habituated is the failure mode §09 names, and the copy sends them
    // down a tier instead of telling them to push on.
    const series = anxietySeries(log([[3, 8, 'c'], [2, 7, 'b'], [4, 9, 'a']]))
    expect(series.meanGap).toBeLessThan(0)
    expect(anxietyVerdict(series)).toContain('easing back')
  })

  it('holds its tongue until there are enough points to mean anything', () => {
    const two = anxietySeries(log([[8, 3, 'b'], [7, 4, 'a']]))
    expect(two.points).toHaveLength(2)
    expect(two.points.length).toBeLessThan(POINTS_FOR_A_LINE)
    expect(anxietyVerdict(two)).toBeNull()
    expect(anxietyVerdict(anxietySeries([]))).toBeNull()
  })

  it('survives an empty log without dividing by zero', () => {
    const series = anxietySeries([])
    expect(series).toEqual({
      points: [], meanPredicted: null, meanActual: null, meanGap: null, easierThanFeared: 0,
    })
  })
})

describe('rejection milestones', () => {
  it('fires exactly once, on the ask that crosses it', () => {
    expect(milestonesCrossed(9, 10).map((m) => m.at)).toEqual([10])
    // The eleventh must not fire the tenth again — this is the whole acceptance
    // criterion for the milestone sheet.
    expect(milestonesCrossed(10, 11)).toEqual([])
    expect(milestonesCrossed(24, 25).map((m) => m.at)).toEqual([25])
    expect(milestonesCrossed(0, 0)).toEqual([])
  })

  it('does not swallow a milestone when the count jumps', () => {
    expect(milestonesCrossed(8, 26).map((m) => m.at)).toEqual([10, 25])
  })

  it('round-trips its ref', () => {
    for (const milestone of REJECTION_MILESTONES) {
      expect(milestoneFor(milestoneRef(milestone.at))).toEqual(milestone)
    }
    expect(milestoneFor('rejections:11')).toBeNull()
  })

  it('is the four §09 names, hand-written, and never mentions a yes', () => {
    expect(REJECTION_MILESTONES.map((m) => m.at)).toEqual([10, 25, 50, 100])
    for (const milestone of REJECTION_MILESTONES) {
      expect(milestone.body.length).toBeGreaterThan(40)
      // §09 counts refusals, not wins. Copy that congratulates a yes here would
      // quietly turn the headline counter into a success counter.
      expect(`${milestone.title} ${milestone.body} ${milestone.note}`.toLowerCase())
        .not.toMatch(/\b(success|won|winner|score)\b/)
    }
  })
})
