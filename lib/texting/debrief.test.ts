import { describe, expect, it } from 'vitest'
import { getTextingPersona } from '@/lib/personas/texting'
import { runMeter } from './meter'
import { buildDebrief, endingSentence, moversFrom, MAX_MOVERS } from './debrief'
import type { TextingTurn } from './thread'

const noor = getTextingPersona('noor')!
let clock = 0
const user = (text: string): TextingTurn => ({ speaker: 'user', text, at: new Date((clock += 60_000)).toISOString() })
const her = (text: string): TextingTurn => ({ speaker: 'persona', text, at: new Date((clock += 30_000)).toISOString() })

const THREAD: TextingTurn[] = [
  user('hey, how was the puzzle in the end'),
  her('still missing a piece'),
  user('yeah'),
  her('mm'),
  user('sure'),
  her('right'),
  user('sorry, that was rubbish of me. what was the picture even meant to be'),
  her('a lighthouse, allegedly'),
]

describe('the ending is a fact, never a verdict', () => {
  it('says what happened and nothing about how he did', () => {
    for (const ending of ['warm', 'faded', 'dismissed', null] as const) {
      const sentence = endingSentence(ending)
      expect(sentence).not.toMatch(/\b(?:win|won|lost|fail|failed|well done|good job|score)\b/i)
    }
  })

  it('names left-on-read without explaining it', () => {
    expect(endingSentence('faded')).toMatch(/did not answer/i)
  })
})

describe('the movers', () => {
  it('names at most three', () => {
    const meter = runMeter(noor, THREAD, 'seed')
    expect(moversFrom(meter.events).length).toBeLessThanOrEqual(MAX_MOVERS)
  })

  it('reports falls as well as rises', () => {
    // A faded thread must not be a blank page at the one moment somebody wants
    // to know what happened.
    const meter = runMeter(noor, THREAD, 'seed')
    const movers = moversFrom(meter.events)
    expect(movers.some((m) => m.delta < 0)).toBe(true)
  })

  it('carries the scorer’s own words rather than new ones', () => {
    const meter = runMeter(noor, THREAD, 'seed')
    const reasons = moversFrom(meter.events).flatMap((m) => m.reasons)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.join(' ')).toMatch(/dead end|word reply|question|words/i)
  })

  it('is ordered by how much it moved, not by when', () => {
    const meter = runMeter(noor, THREAD, 'seed')
    const movers = moversFrom(meter.events)
    for (let i = 1; i < movers.length; i += 1) {
      expect(Math.abs(movers[i]!.delta)).toBeLessThanOrEqual(Math.abs(movers[i - 1]!.delta))
    }
  })
})

describe('the debrief', () => {
  it('charts one point per exchange', () => {
    const meter = runMeter(noor, THREAD, 'seed')
    const debrief = buildDebrief(meter, 'faded')
    expect(debrief.curve).toHaveLength(meter.events.length)
    expect(debrief.curve[0]!.exchange).toBe(1)
  })

  it('reports a peak that is not necessarily the end', () => {
    const meter = runMeter(noor, THREAD, 'seed')
    const debrief = buildDebrief(meter, 'faded')
    expect(debrief.peak).toBeGreaterThanOrEqual(debrief.closed)
  })

  it('knows when there is nothing worth charting', () => {
    const meter = runMeter(noor, [user('hey'), her('hey')], 'seed')
    expect(buildDebrief(meter, null).thin).toBe(true)
  })

  it('produces the same shape for a warm ending and a cold one', () => {
    const meter = runMeter(noor, THREAD, 'seed')
    const warm = buildDebrief(meter, 'warm')
    const cold = buildDebrief(meter, 'faded')
    expect(Object.keys(warm)).toEqual(Object.keys(cold))
    expect(warm.movers).toEqual(cold.movers)
  })
})
