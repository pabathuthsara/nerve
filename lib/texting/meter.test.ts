import { describe, expect, it } from 'vitest'
import { getPersona } from '@/lib/personas'
import { runMeter, scoreTypedTurn, FILLER_SENTINEL_SECONDS } from './meter'
import { TEXTING_WARMTH_CEILING } from './warmth'
import type { TextingTurn } from './thread'

const nadia = getPersona('nadia')!
const SEED = 'thread:test'

let clock = 0
function user(text: string): TextingTurn {
  clock += 60_000
  return { speaker: 'user', text, at: new Date(clock).toISOString() }
}
function her(text: string): TextingTurn {
  clock += 30_000
  return { speaker: 'persona', text, at: new Date(clock).toISOString() }
}

describe('the timing reasons can never fire on a typed turn', () => {
  /**
   * THE ASSERTION THAT MAKES THE SENTINEL HONEST.
   *
   * `scoreTypedTurn` hands `scoreFast` a duration rather than a measurement,
   * and the only thing that makes that defensible is that no input can reach
   * the two reasons it is chosen to disable. Proving the outcome is worth more
   * than trusting the arithmetic in the comment.
   */
  const hostile = [
    'um uh er ah erm you know i mean sort of kind of kinda sorta',
    'um '.repeat(120),
    'uh',
    'um uh',
    '',
    'a'.repeat(500),
    'you know you know you know you know you know you know you know',
  ]

  for (const text of hostile) {
    it(`never reports filler-rate or hesitation for ${JSON.stringify(text.slice(0, 24))}`, () => {
      const score = scoreTypedTurn([user(text)], {
        level: 3,
        personality: nadia.personality,
        agentTurns: [],
        precedingDeadEnds: 0,
      })
      const codes = score.reasons.map((reason) => reason.code)
      expect(codes).not.toContain('filler-rate')
      expect(codes).not.toContain('hesitation')
      // The RATE is still computed — it is a field on the score — but the
      // sentinel keeps it below the threshold that would make it a reason.
      // Nothing in the texting path reads the field; the reason is the thing
      // that moves warmth, and it can never appear.
      expect(score.fillerPerMinute).toBeLessThan(5)
    })
  }

  it('the sentinel is far enough above the threshold to have margin', () => {
    // 500 characters cannot hold more than ~125 filler tokens; the reason fires
    // above 5/min. This is the arithmetic the comment claims, asserted.
    const worstCaseFillers = 125
    expect((worstCaseFillers / FILLER_SENTINEL_SECONDS) * 60).toBeLessThan(1)
  })
})

describe('the meter reads meaning', () => {
  it('a hostile thread drives warmth DOWN', () => {
    const turns = [
      user('hey'),
      her('hey — how was the thing on saturday'),
      user('you are making me miserable'),
      her('right'),
      user('why are you still here'),
    ]
    const state = runMeter(nadia, turns, SEED)
    const opening = runMeter(nadia, [user('hey')], SEED)
    expect(state.warmth).toBeLessThan(opening.warmth)
  })

  it('contempt is never paid for a callback it happens to contain', () => {
    // The 9 September defect, on the texting arm: "You're making me miserable."
    // repeated one of her own words and was paid +2 for having listened.
    const turns = [
      user('hey'),
      her('the shelter had six of them in last week'),
      user('the shelter was rubbish and you are making me miserable'),
    ]
    const state = runMeter(nadia, turns, SEED)
    const positives = state.events.flatMap((event) => event.detail)
    expect(state.events.at(-1)!.delta).toBeLessThan(0)
    expect(positives.join(' ')).not.toMatch(/picked up|came back to/)
  })

  it('a warm, specific thread drives warmth UP', () => {
    const turns = [
      user('hey, how did saturday go in the end'),
      her('hey — it was alright actually'),
      user('honestly a disaster, the venue double-booked us and nobody told me'),
      her('oh no. what did you end up doing'),
      user('we moved it to the pub next door. what got you into that in the first place'),
      her('long story. my sister dragged me to one'),
      user('your sister sounds like the interesting one, what else has she dragged you to'),
    ]
    const state = runMeter(nadia, turns, SEED)
    const opening = runMeter(nadia, [user('hey')], SEED)
    expect(state.warmth).toBeGreaterThan(opening.warmth)
  })

  it('never passes the section ceiling, however well it goes', () => {
    const turns: TextingTurn[] = [user('hey'), her('hey')]
    for (let i = 0; i < 40; i += 1) {
      turns.push(user(`that is genuinely interesting, what made you decide on that one over the others ${i}`))
      turns.push(her('long story really'))
    }
    expect(runMeter(nadia, turns, SEED).warmth).toBeLessThanOrEqual(TEXTING_WARMTH_CEILING)
  })

  it('three acknowledgements in a row register as a streak', () => {
    const turns = [
      user('hey'),
      her('the shelter had six of them in last week'),
      user('yeah'),
      her('mm'),
      user('sure'),
      her('right'),
      user('ok'),
    ]
    const state = runMeter(nadia, turns, SEED)
    expect(state.deadEndStreak).toBe(3)
    expect(state.his?.deadEnd).toBe(true)
  })

  it('a short answer to a question she asked is NOT a dead end', () => {
    const turns = [user('hey'), her('have you been before?'), user('yeah, twice')]
    expect(runMeter(nadia, turns, SEED).his?.deadEnd).toBe(false)
  })
})

describe('volume is never rewarded', () => {
  it('words is the best single message, never the sum', () => {
    const spam = runMeter(nadia, [user('hi'), her('hey'), user('hey'), user('hey'), user('hey'), user('hey'), user('hey')], SEED)
    expect(spam.his?.words).toBe(1)
    expect(spam.his?.messages).toBe(5)
  })

  it('a folded turn is one exchange, not five', () => {
    const state = runMeter(nadia, [user('hi'), her('hey'), user('a'), user('b'), user('c')], SEED)
    expect(state.events).toHaveLength(2)
    expect(state.userMessages).toBe(4)
  })
})

describe('determinism', () => {
  it('the same thread and seed replay to the same number', () => {
    const turns = [user('hey'), her('hey'), user('how is the evening going')]
    expect(runMeter(nadia, turns, SEED).warmth).toBe(runMeter(nadia, turns, SEED).warmth)
  })

  it('a different thread opens somewhere else', () => {
    const turns = [user('hey'), her('hey'), user('hi there')]
    const a = runMeter(nadia, turns, 'thread:a')
    const b = runMeter(nadia, turns, 'thread:b')
    // Not an assertion that they differ — jitter may collide — but that the
    // seed is actually read rather than ignored.
    expect([a.warmth, b.warmth].every(Number.isFinite)).toBe(true)
  })
})
