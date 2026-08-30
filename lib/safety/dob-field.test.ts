/**
 * The typing in the date-of-birth field (§16.4).
 *
 * None of this is reachable from a test that has no DOM, which is precisely
 * why it is not in the component. What is asserted here is the behaviour that
 * makes the field feel like it is helping rather than fighting: the caret
 * leaving a box exactly when a second digit could no longer change the answer,
 * a digit that cannot follow starting over instead of being swallowed, and a
 * pasted date landing in the right three boxes whichever way round it was
 * written.
 */

import { describe, expect, it } from 'vitest'
import {
  clampDay,
  EMPTY_PARTS,
  composeDob,
  daysInMonth,
  emptyEntry,
  describeDob,
  monthLabel,
  parsePastedDate,
  segmentOptions,
  splitDob,
  stepSegment,
  nextSegment,
  previousSegment,
  typeDigit,
  typeInto,
  typeLetter,
  yearBounds,
} from './dob-field'

const today = new Date(Date.UTC(2026, 7, 30))
const bounds = yearBounds(today)

describe('typeDigit — day', () => {
  it('finishes the box when a second digit could not change the answer', () => {
    // Nothing follows a 4 in a day. Waiting for a keystroke that cannot come
    // is the whole reason the native field feels slow.
    expect(typeDigit('day', '', '4')).toEqual({ value: '04', advance: true })
  })

  it('waits when a second digit is still possible', () => {
    expect(typeDigit('day', '', '1')).toEqual({ value: '1', advance: false })
    expect(typeDigit('day', '', '3')).toEqual({ value: '3', advance: false })
    expect(typeDigit('day', '', '0')).toEqual({ value: '0', advance: false })
  })

  it('completes a pair', () => {
    expect(typeDigit('day', '1', '7')).toEqual({ value: '17', advance: true })
    expect(typeDigit('day', '3', '1')).toEqual({ value: '31', advance: true })
    expect(typeDigit('day', '0', '9')).toEqual({ value: '09', advance: true })
  })

  it('starts over rather than dropping a digit that cannot follow', () => {
    // Somebody who typed 3 then 5 means the fifth. Refusing the keystroke
    // would leave them clearing a 3 they never wanted.
    expect(typeDigit('day', '3', '5')).toEqual({ value: '05', advance: true })
  })

  it('refuses to make a zeroth day', () => {
    expect(typeDigit('day', '0', '0')).toEqual({ value: '0', advance: false })
  })
})

describe('typeDigit — month', () => {
  it('finishes on anything above one', () => {
    expect(typeDigit('month', '', '2')).toEqual({ value: '02', advance: true })
  })

  it('waits on a one, which could be any of three months', () => {
    expect(typeDigit('month', '', '1')).toEqual({ value: '1', advance: false })
    expect(typeDigit('month', '1', '2')).toEqual({ value: '12', advance: true })
  })

  it('starts over past December', () => {
    expect(typeDigit('month', '1', '3')).toEqual({ value: '03', advance: true })
  })
})

describe('typeDigit — year', () => {
  it('accumulates four and never moves on, being the last box', () => {
    expect(typeDigit('year', '199', '6')).toEqual({ value: '1996', advance: false })
  })

  it('treats a fifth digit as a fresh year', () => {
    expect(typeDigit('year', '1996', '2')).toEqual({ value: '2', advance: false })
  })

  it('ignores anything that is not a digit', () => {
    expect(typeDigit('year', '19', 'x')).toEqual({ value: '19', advance: false })
  })
})

describe('typeLetter', () => {
  it('holds while more than one month is standing', () => {
    expect(typeLetter('', 'j')).toEqual({ value: '', prefix: 'j', advance: false })
    expect(typeLetter('j', 'u')).toEqual({ value: '', prefix: 'ju', advance: false })
  })

  it('resolves the moment one month is left', () => {
    expect(typeLetter('ju', 'n')).toEqual({ value: '06', prefix: '', advance: true })
    expect(typeLetter('a', 'p')).toEqual({ value: '04', prefix: '', advance: true })
    expect(typeLetter('', 's')).toEqual({ value: '09', prefix: '', advance: true })
  })

  it('treats a letter that follows nothing as the start of a new attempt', () => {
    expect(typeLetter('ju', 'a')).toEqual({ value: '', prefix: 'a', advance: false })
  })

  it('ignores a letter no month begins with', () => {
    expect(typeLetter('', 'z')).toEqual({ value: '', prefix: '', advance: false })
  })
})

describe('stepSegment', () => {
  it('wraps the day and the month', () => {
    expect(stepSegment('month', '01', -1, bounds)).toBe('12')
    expect(stepSegment('month', '12', 1, bounds)).toBe('01')
    expect(stepSegment('day', '31', 1, bounds)).toBe('01')
  })

  it('opens an empty box at the end the arrow points from', () => {
    expect(stepSegment('day', '', 1, bounds)).toBe('01')
    expect(stepSegment('day', '', -1, bounds)).toBe('31')
  })

  it('clamps the year rather than wrapping it', () => {
    // A year that rolls from 1906 round to this one is a year somebody then
    // has to chase all the way back.
    expect(stepSegment('year', String(bounds.min), -1, bounds)).toBe(String(bounds.min))
    expect(stepSegment('year', String(bounds.max), 1, bounds)).toBe(String(bounds.max))
  })

  it('opens an empty year on a neutral anchor, not on the threshold', () => {
    // Thirty, not eighteen. The first arrow press must not be a wink at the
    // answer the gate is about to check.
    expect(stepSegment('year', '', 1, bounds)).toBe('1996')
    expect(bounds.max - Number(stepSegment('year', '', 1, bounds))).toBe(30)
  })
})

describe('composeDob and splitDob', () => {
  it('composes only once every box is full', () => {
    expect(composeDob({ day: '23', month: '04', year: '1996' })).toBe('1996-04-23')
    expect(composeDob({ day: '2', month: '04', year: '1996' })).toBe('')
    expect(composeDob({ day: '23', month: '04', year: '96' })).toBe('')
  })

  it('round-trips', () => {
    expect(splitDob('1996-04-23')).toEqual({ day: '23', month: '04', year: '1996' })
    expect(composeDob(splitDob('1996-04-23'))).toBe('1996-04-23')
  })

  it('gives back empty boxes for anything that is not a date', () => {
    expect(splitDob('')).toEqual({ day: '', month: '', year: '' })
    expect(splitDob('23/04/1996')).toEqual({ day: '', month: '', year: '' })
  })
})

describe('describeDob', () => {
  it('says the month out loud, which is the point of the line', () => {
    expect(describeDob({ day: '23', month: '04', year: '1996' })).toBe('23 April 1996')
  })

  it('says nothing while a box is unfinished', () => {
    expect(describeDob({ day: '23', month: '04', year: '19' })).toBeNull()
  })

  it('refuses a date that does not exist', () => {
    // The browser would call this the third of March.
    expect(describeDob({ day: '31', month: '02', year: '2007' })).toBeNull()
  })

  it('keeps the leap day that is real and drops the one that is not', () => {
    expect(describeDob({ day: '29', month: '02', year: '1996' })).toBe('29 February 1996')
    expect(describeDob({ day: '29', month: '02', year: '1997' })).toBeNull()
  })

  it('never mentions the age', () => {
    // The gate refuses once and offers no second attempt. A line counting the
    // age back while you type is a dial you can turn until it says yes.
    expect(describeDob({ day: '23', month: '04', year: '2015' })).toBe('23 April 2015')
  })
})

describe('parsePastedDate', () => {
  it('reads ISO', () => {
    expect(parsePastedDate('1996-04-23')).toEqual({ day: '23', month: '04', year: '1996' })
  })

  it('reads day-first, which is what most of the world writes', () => {
    expect(parsePastedDate('23/04/1996')).toEqual({ day: '23', month: '04', year: '1996' })
    expect(parsePastedDate('23.4.1996')).toEqual({ day: '23', month: '04', year: '1996' })
  })

  it('lets an impossible month overrule the preference', () => {
    // There is no twenty-third month, so this can only be April.
    expect(parsePastedDate('04/23/1996')).toEqual({ day: '23', month: '04', year: '1996' })
  })

  it('refuses what it cannot read', () => {
    expect(parsePastedDate('23 April 1996')).toBeNull()
    expect(parsePastedDate('1996')).toBeNull()
    expect(parsePastedDate('31/02/2007')).toBeNull()
  })
})

describe('monthLabel', () => {
  it('abbreviates for the box', () => {
    expect(monthLabel('04')).toBe('APR')
    expect(monthLabel('12')).toBe('DEC')
  })
})

describe('typeInto — the caret moving by itself', () => {
  it('spreads a whole date typed into the first box across all three', () => {
    // The behaviour the field lives or dies on: nobody types a separator.
    const state = typeInto(emptyEntry(), '23041996')
    expect(state.parts).toEqual({ day: '23', month: '04', year: '1996' })
    expect(composeDob(state.parts)).toBe('1996-04-23')
    expect(state.cursor).toBe('year')
  })

  it('moves on from a single digit that finishes its box', () => {
    // 4 can only be the fourth, so the 7 after it is the month.
    const state = typeInto(emptyEntry(), '47')
    expect(state.parts.day).toBe('04')
    expect(state.parts.month).toBe('07')
    expect(state.cursor).toBe('year')
  })

  it('waits on a digit that could still take a second', () => {
    const state = typeInto(emptyEntry(), '1')
    expect(state.parts.day).toBe('1')
    expect(state.cursor).toBe('day')
  })

  it('takes the month as letters mid-sequence', () => {
    const state = typeInto({ ...emptyEntry(), cursor: 'month' }, 'sep1996')
    expect(state.parts.month).toBe('09')
    expect(state.parts.year).toBe('1996')
    expect(state.cursor).toBe('year')
  })

  it('holds an ambiguous month prefix without moving on', () => {
    const state = typeInto({ ...emptyEntry(), cursor: 'month' }, 'ju')
    expect(state.parts.month).toBe('')
    expect(state.prefix).toBe('ju')
    expect(state.cursor).toBe('month')
  })

  it('stops at the year rather than running off the end', () => {
    const state = typeInto(emptyEntry(), '2304199612345')
    expect(state.cursor).toBe('year')
    // Extra digits keep restarting the year — which is what somebody retyping
    // it is doing — and never spill back into the boxes already answered.
    expect(state.parts.day).toBe('23')
    expect(state.parts.month).toBe('04')
    expect(state.parts.year).toBe('5')
  })

  it('leaves an unfinished date composing to nothing', () => {
    expect(composeDob(typeInto(emptyEntry(), '2304').parts)).toBe('')
  })
})

describe('nextSegment and previousSegment', () => {
  it('run out at both ends', () => {
    expect(nextSegment('day')).toBe('month')
    expect(nextSegment('year')).toBeNull()
    expect(previousSegment('day')).toBeNull()
    expect(previousSegment('year')).toBe('month')
  })
})

describe('daysInMonth', () => {
  it('knows the short months', () => {
    expect(daysInMonth(4, 1996)).toBe(30)
    expect(daysInMonth(1, 1996)).toBe(31)
  })

  it('knows the leap rule, including the century exceptions', () => {
    expect(daysInMonth(2, 1996)).toBe(29)
    expect(daysInMonth(2, 1997)).toBe(28)
    expect(daysInMonth(2, 1900)).toBe(28)
    expect(daysInMonth(2, 2000)).toBe(29)
  })
})

describe('clampDay', () => {
  it('pulls the 31st back into a shorter month', () => {
    expect(clampDay({ day: '31', month: '04', year: '1996' }).day).toBe('30')
  })

  it('drops the 29th when the year stops being a leap year', () => {
    // Spin the year off a leap February and the date stops existing. Clamping
    // keeps the answer the person already gave; clearing would lose it.
    expect(clampDay({ day: '29', month: '02', year: '1997' }).day).toBe('28')
    expect(clampDay({ day: '29', month: '02', year: '1996' }).day).toBe('29')
  })

  it('leaves an unfinished date alone', () => {
    expect(clampDay({ day: '31', month: '', year: '' }).day).toBe('31')
  })

  it('never produces a date describeDob refuses', () => {
    for (const month of ['01', '02', '04', '09', '12']) {
      for (const year of ['1996', '1997', '2000', '1900']) {
        const clamped = clampDay({ day: '31', month, year })
        expect(describeDob(clamped)).not.toBeNull()
      }
    }
  })
})

describe('segmentOptions', () => {
  it('runs the year newest first, so the wheel opens near the top', () => {
    const years = segmentOptions('year', EMPTY_PARTS, bounds)
    expect(years[0]).toBe(String(bounds.max))
    expect(years[years.length - 1]).toBe(String(bounds.min))
    expect(years).toHaveLength(bounds.max - bounds.min + 1)
  })

  it('gives twelve months', () => {
    expect(segmentOptions('month', EMPTY_PARTS, bounds)).toHaveLength(12)
  })

  it('resizes the day column to the month it is in', () => {
    expect(segmentOptions('day', { day: '', month: '02', year: '1996' }, bounds)).toHaveLength(29)
    expect(segmentOptions('day', { day: '', month: '02', year: '1997' }, bounds)).toHaveLength(28)
    expect(segmentOptions('day', { day: '', month: '04', year: '1997' }, bounds)).toHaveLength(30)
  })

  it('offers all 31 before a month is chosen', () => {
    expect(segmentOptions('day', EMPTY_PARTS, bounds)).toHaveLength(31)
  })
})
