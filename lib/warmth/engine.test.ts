/**
 * Warmth engine tests.
 *
 * Entirely scripted — no network, no model, no clock. The mechanic that decides
 * whether a rep feels real has to be provable at a desk, or every change to it
 * becomes a guess that costs a live session to evaluate.
 */

import { describe, expect, it } from 'vitest'

import { fastAuthority, FAST_AUTHORITY_FLOOR, FAST_AUTHORITY_SPAN, WarmthEngine } from './engine'
import { bandFor, bandDirective, BANDS, WARMTH_MIN, WARMTH_MAX } from './bands'
import { levelTrajectory } from './levels'
import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import { nadia } from '@/lib/personas/nadia'
import { alex } from '@/lib/personas/alex'
import { PERSONAS } from '@/lib/personas'
import type { Personality, Trajectory } from '@/lib/voice/types'
import { scoreFast, isOpenQuestion, referencesAgent } from './fast'
import { classifyOverreach, clampSlowScore } from './slow'
import type { TranscriptTurn } from '@/lib/voice/types'

/** Layer 1 now lives on the persona, so these read from the roster. */
const L1 = nadia.trajectory
const L8 = alex.trajectory

/** No jitter, so a test asserts the mechanic rather than a dice roll. */
const fixed = (config: Trajectory, start = config.start): Trajectory => ({
  ...config,
  start,
  startJitter: 0,
})

function turn(text: string, tStart = 0, tEnd = 3): TranscriptTurn {
  return { speaker: 'user', text, t_start: tStart, t_end: tEnd }
}

function agentSaid(text: string): TranscriptTurn {
  return { speaker: 'agent', text, t_start: 0, t_end: 2 }
}

/** A turn that earns everything the fast scorer can give: +3 +2 +2 = +7. */
const GOOD_TURN = 'What made you pick that particular bookshop on a Saturday afternoon'

describe('bands', () => {
  it('covers the whole range with no gaps and no overlaps', () => {
    for (let warmth = WARMTH_MIN; warmth <= WARMTH_MAX; warmth += 1) {
      expect(bandFor(warmth)).toBeTruthy()
    }
    for (let i = 1; i < BANDS.length; i += 1) {
      expect(BANDS[i]?.min).toBe((BANDS[i - 1]?.max ?? 0) + 1)
    }
  })

  it('gives her an instruction, never a number and never a label', () => {
    const directive = bandDirective(25)
    expect(directive).not.toMatch(/\b25\b/)
    // The band name is withheld too. Told "you are GUARDED" a model will
    // eventually say so out loud; a pure imperative gives it nothing to narrate.
    for (const name of ['CLOSED', 'GUARDED', 'OPEN', 'ENGAGED', 'INVESTED', 'HOSTILE']) {
      expect(directive).not.toContain(name)
    }
    // Bracketed so it reads as stage direction, not as dialogue.
    expect(directive.startsWith('[')).toBe(true)
    expect(directive.endsWith(']')).toBe(true)
    expect(directive.toLowerCase()).toContain('twelve words at most')
  })

  it('forbids questions outright at low warmth rather than rationing them', () => {
    // "Occasionally" is not something a model reliably counts, which is how
    // round 6 produced a question on 83% of turns.
    expect(bandDirective(5).toLowerCase()).toContain('do not ask')
    expect(bandDirective(25).toLowerCase()).toContain('do not ask')
    expect(bandDirective(-10).toLowerCase()).toContain('do not ask')
    // Once earned, she may.
    expect(bandDirective(70).toLowerCase()).toContain('ask about him')
  })

  it('has a hostile band below zero', () => {
    expect(bandFor(-1)).toBe('HOSTILE')
    expect(bandFor(-20)).toBe('HOSTILE')
    expect(bandFor(0)).toBe('CLOSED')
    expect(bandDirective(-10).toLowerCase()).toContain('want this over')
  })

  it('keeps the directive short — it is re-charged as context every turn', () => {
    for (const spec of BANDS) {
      expect(bandDirective(spec.min).length, spec.band).toBeLessThan(150)
      // Even with the question-suppression clause appended.
      expect(bandDirective(spec.min, { suppressQuestion: true }).length, spec.band)
        .toBeLessThan(190)
    }
  })

  it('constrains the warm bands as hard as the cold ones (§4e)', () => {
    // Round 6's warm directives read as permission, so the model reverted to
    // assistant default the moment warmth rose.
    for (const warmth of [65, 85]) {
      const directive = bandDirective(warmth).toLowerCase()
      expect(directive).toContain('under fifteen words')
      expect(directive).toContain('take your time')
      expect(directive).toContain('no filler')
    }
  })

  it('can gag a question in the bands that otherwise allow one', () => {
    expect(bandDirective(70, { suppressQuestion: true })).toContain('Do not ask him anything this turn')
    expect(bandDirective(45, { suppressQuestion: true })).toContain('Do not ask him anything this turn')
    // The cold bands already forbid it; saying it twice emphasises the wrong thing.
    expect(bandDirective(10, { suppressQuestion: true })).not.toContain('this turn')
  })
})

describe('fast scoring', () => {
  it('separates open questions from yes/no questions', () => {
    expect(isOpenQuestion('What are you reading?')).toBe(true)
    expect(isOpenQuestion('How did you end up here?')).toBe(true)
    // §07: "yes/no questions are where conversations go to die"
    expect(isOpenQuestion('Do you like it?')).toBe(false)
    expect(isOpenQuestion('Is that any good?')).toBe(false)
    // A closed lead-in wins even when an open word appears later.
    expect(isOpenQuestion('Do you know what time it is?')).toBe(false)
    expect(isOpenQuestion('Mm.')).toBe(false)
  })

  it('detects a genuine callback, not incidental shared words', () => {
    const her = [agentSaid('Re-reading a Tana French. Third time.')]
    expect(referencesAgent('Which French is it?', her)).toEqual({
      word: 'french',
      distance: 1,
    })
    // "the" and "it" are shared but carry nothing.
    expect(referencesAgent('Is it the one?', her)).toBeNull()
  })

  it('reaches back past the last few turns, and pays more when it does', () => {
    // The window used to be her last three turns, so coming back to something
    // she said two minutes ago — the thing that actually makes a person feel
    // listened to — scored exactly nothing.
    const her = [
      agentSaid('Re-reading a Tana French. Third time.'),
      agentSaid('Mostly at the weekend.'),
      agentSaid('It is quiet in here.'),
      agentSaid('Not really.'),
      agentSaid('Sometimes.'),
    ]
    const found = referencesAgent('Did you finish the French one', her)
    expect(found?.word).toBe('french')
    expect(found?.distance).toBe(5)

    const longRange = scoreFast(turn('Did you finish the French one in the end'), {
      level: 1, agentTurns: her, precedingDeadEnds: 0, gapSeconds: null,
    })
    const immediate = scoreFast(turn('Did you finish the French one in the end'), {
      level: 1, agentTurns: [her[0]!], precedingDeadEnds: 0, gapSeconds: null,
    })
    expect(longRange.raw).toBeGreaterThan(immediate.raw)
  })

  it('rewards an engaged turn and punishes a dead end', () => {
    const good = scoreFast(turn(GOOD_TURN), {
      level: 1,
      agentTurns: [],
      precedingDeadEnds: 0,
      gapSeconds: null,
    })
    expect(good.raw).toBe(5) // open question +3, length +2

    const dead = scoreFast(turn('Yeah.'), {
      level: 1,
      agentTurns: [],
      precedingDeadEnds: 0,
      gapSeconds: null,
    })
    expect(dead.raw).toBe(-3)
    expect(dead.deadEnd).toBe(true)
  })

  it('charges the third consecutive dead end twice over', () => {
    const third = scoreFast(turn('Sure.'), {
      level: 1,
      agentTurns: [],
      precedingDeadEnds: 2,
      gapSeconds: null,
    })
    expect(third.raw).toBe(-7) // -3 for the reply, -4 for the streak
  })

  it('never charges an anxious beginner for hesitating', () => {
    const context = { agentTurns: [], precedingDeadEnds: 0, gapSeconds: 9 }
    // The pause penalty exists...
    expect(scoreFast(turn('Yeah.'), { ...context, level: 4 }).reasons
      .some((r) => r.code === 'hesitation')).toBe(true)
    // ...and is dead at levels 1-3, where the user is by definition hesitant.
    for (const level of [1, 2, 3]) {
      expect(scoreFast(turn('Yeah.'), { ...context, level }).reasons
        .some((r) => r.code === 'hesitation')).toBe(false)
    }
  })

  it('penalises filler only above five per minute', () => {
    // 4 fillers across 60s is under the line.
    const calm = scoreFast(turn('um so I was uh looking at this book you know', 0, 60), {
      level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
    })
    expect(calm.reasons.some((r) => r.code === 'filler-rate')).toBe(false)

    // The same words in 4s is a nervous spiral.
    const nervous = scoreFast(turn('um so I was uh looking at this book you know', 0, 4), {
      level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
    })
    expect(nervous.reasons.some((r) => r.code === 'filler-rate')).toBe(true)
  })
})

describe('the creepiness rule', () => {
  it('judges the same sentence differently depending on what was earned', () => {
    // This is the entire point. The sentence is constant; the verdict is not.
    const intimacy = 70
    expect(classifyOverreach(intimacy, 10).verdict).toBe('boundary-violation')
    expect(classifyOverreach(intimacy, 50).verdict).toBe('too-much-too-soon')
    expect(classifyOverreach(intimacy, 70).verdict).toBe('none')
  })

  it('sets the thresholds where the brief says', () => {
    expect(classifyOverreach(46, 15).delta).toBe(-15) // overreach 31
    expect(classifyOverreach(31, 15).delta).toBe(-6)  // overreach 16
    expect(classifyOverreach(30, 15).delta).toBeNull() // overreach 15, exactly on
  })

  it('never rewards intimacy that lags behind warmth', () => {
    expect(classifyOverreach(0, 90).verdict).toBe('none')
    expect(classifyOverreach(0, 90).delta).toBeNull()
  })

  it('rejects a malformed model response rather than trusting it', () => {
    expect(clampSlowScore(null)).toBeNull()
    expect(clampSlowScore({ intimacyLevel: 50 })).toBeNull()
    expect(clampSlowScore({ warmthDelta: 'lots', intimacyLevel: 50 })).toBeNull()
    // Out-of-range values are clamped, not discarded.
    expect(clampSlowScore({ intent: 999, intimacy: -5, quote: '', reason: 'x' }))
      .toEqual({ intent: 10, intimacy: 0, quote: '', reason: 'x' })
  })
})

describe('WarmthEngine', () => {
  it('climbs steadily on a good conversation, but slowly (§4a-4c)', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 15) })
    expect(engine.band).toBe('CLOSED')

    const her = [agentSaid('Re-reading a Tana French. Third time.')]
    const line = 'What made you pick that French one to read again'
    let at = 0
    const climb = (turns: number) => {
      for (let i = 0; i < turns; i += 1) {
        at += 12
        engine.applyFast(
          scoreFast(turn(line, at, at + 4), {
            level: 1, agentTurns: her, precedingDeadEnds: 0, gapSeconds: null,
          }),
          at,
          line,
        )
      }
    }

    // A maximum-quality turn is +7 raw. Ten of them — roughly a three-minute
    // rep — clear CLOSED and GUARDED and land in OPEN.
    climb(10)
    expect(engine.band).toBe('OPEN')

    // Still short of ENGAGED on a single good stretch. Round 6 walked 41 -> 58
    // in under a minute, which is what gain 1.5 buys you; the retune raised the
    // gain but kept the per-turn cap, so the climb is fast without being free.
    expect(engine.warmth).toBeLessThan(60)

    // Twenty-five turns is past the eight-minute cap, so this is the shape of
    // the curve rather than a reachable session. It keeps climbing and does not
    // stall the way the pre-retune config did at 47.
    climb(15)
    expect(engine.warmth).toBeGreaterThan(70)
    expect(engine.band).toBe('ENGAGED')

    // And it does NOT walk into INVESTED, which is the anti-farming taper
    // doing its job. Every turn in this climb is the same sentence — an open
    // question, the right length, echoing one of her words — which is exactly
    // the pattern a user works out and then repeats. Form is worth full price
    // early, when a stranger really is judging you on how you open, and less
    // as the conversation goes on. Reaching the top band has to take more than
    // knowing the shape of a good sentence.
    expect(engine.warmth).toBeLessThan(80)

    // Monotonic: no band is ever revisited on a conversation that only improves.
    const visited = engine.telemetry(at).bandsVisited
    expect(visited).toEqual(['CLOSED', 'GUARDED', 'OPEN', 'ENGAGED'])
  })

  it('applies diminishing returns — the same turn is worth less when warm', () => {
    const cold = new WarmthEngine({ trajectory: fixed(L1, 10) })
    const warm = new WarmthEngine({ trajectory: fixed(L1, 80) })
    const score = { raw: 7, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 }

    const coldGain = cold.applyFast(score, 10, 'x').delta
    const warmGain = warm.applyFast(score, 10, 'x').delta
    expect(coldGain).toBeGreaterThan(warmGain)
  })

  it('caps any single turn at the configured maximum gain (§4b)', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 0) })
    // An absurd raw score cannot buy more than one turn's worth of ground.
    const event = engine.applyFast(
      { raw: 500, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 },
      10,
      'x',
    )
    // The cap, less the natural decay charged on the same turn. Derived rather
    // than frozen: round 9's retune moved both of these and the literal was
    // asserting the old tuning rather than the mechanic.
    expect(event.delta).toBeCloseTo(L1.maxGainPerTurn - L1.decayPerTurn, 5)
  })

  it('cannot exceed the session ceiling however good the rep is (§4c)', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 80) })
    for (let i = 0; i < 500; i += 1) {
      engine.applyFast(
        { raw: 50, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 },
        i,
        'x',
      )
    }
    expect(engine.warmth).toBe(L1.sessionCeiling)
    expect(engine.warmth).toBeLessThan(L1.hardCeiling)
  })

  it('charges natural decay on every turn, scored or not (§4d)', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 50) })
    const event = engine.applyFast(
      { raw: 0, reasons: [], wordCount: 5, deadEnd: false, fillerPerMinute: 0 },
      10,
      'Yeah, a lot of stuff.',
    )
    expect(event.naturalDecay).toBe(L1.decayPerTurn)
    expect(engine.warmth).toBeCloseTo(50 - L1.decayPerTurn, 5)
  })

  it('drops a full band on one boundary violation at low warmth', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 45) })
    expect(engine.band).toBe('OPEN')

    const event = engine.applySlow(
      { intent: 0, intimacy: 80, quote: '', reason: 'asked if she has a boyfriend' },
      engine.warmth,
      20,
      'Do you have a boyfriend?',
      340,
      1,
    )

    expect(event.source).toBe('overreach')
    expect(event.reason).toBe('boundary-violation')
    expect(engine.band).toBe('GUARDED')
  })

  it('lets the same question pass once it has been earned', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 75) })
    const event = engine.applySlow(
      { intent: 2, intimacy: 80, quote: '', reason: 'flirting' },
      engine.warmth,
      20,
      'Do you have a boyfriend?',
      340,
      1,
    )
    expect(event.source).toBe('slow')
    expect(engine.band).toBe('ENGAGED')
  })

  it('Alex cannot be taken past her ceiling no matter what the input', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L8) })
    for (let i = 0; i < 200; i += 1) {
      engine.applyFast(
        { raw: 7, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 },
        i * 5,
        GOOD_TURN,
      )
    }
    expect(engine.warmth).toBeLessThanOrEqual(45)
    expect(engine.warmth).toBe(45)
    // Being told no and exiting well is the skill (§06). Winning is not on offer.
    expect(engine.band).toBe('OPEN')
  })

  it('decays warmth on dead-end replies', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 45) })
    const before = engine.warmth
    let at = 0
    for (let i = 0; i < 3; i += 1) {
      at += 8
      const score = scoreFast(turn('Yeah.', at, at + 1), {
        level: 1, agentTurns: [], precedingDeadEnds: i, gapSeconds: null,
      })
      engine.applyFast(score, at, 'Yeah.')
    }
    expect(engine.warmth).toBeLessThan(before)
    // -3, -3, -7 raw => -6.5 after decay 0.5, plus three turns of natural decay.
    expect(engine.warmth).toBeCloseTo(before - 6.5 - 3 * L1.decayPerTurn, 5)
  })

  it('rises slowly and falls fast', () => {
    const up = new WarmthEngine({ trajectory: fixed(L1, 45) })
    up.applyFast({ raw: 10, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 }, 5, 'x')
    const gained = up.warmth - 45

    const down = new WarmthEngine({ trajectory: fixed(L1, 45) })
    down.applyFast({ raw: -10, reasons: [], wordCount: 1, deadEnd: true, fillerPerMinute: 0 }, 5, 'x')
    const lost = 45 - down.warmth

    // After the round-9 retune the cap is what holds a rise down, not the gain:
    // 10 raw * 1.1 * falloff still exceeds maxGainPerTurn, so the turn is
    // clipped to 4. A fall is neither capped nor damped by falloff.
    expect(gained).toBeCloseTo(L1.maxGainPerTurn - L1.decayPerTurn, 5)
    expect(lost).toBeCloseTo(10 * L1.decay + L1.decayPerTurn, 5)
    // The asymmetry is the point, and it survived the retune.
    expect(lost).toBeGreaterThan(gained)

    // Alex is the mirror image: effort barely counts, missteps cost quadruple.
    const alexUp = new WarmthEngine({ trajectory: fixed(L8) })
    alexUp.applyFast({ raw: 10, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 }, 5, 'x')
    // Even an excellent turn is clipped to her per-turn cap, then charged the
    // same natural decay as any other turn. Derived, not frozen: the retune
    // moved both numbers.
    expect(alexUp.warmth - L8.start).toBeCloseTo(L8.maxGainPerTurn - L8.decayPerTurn, 5)

    const alexDown = new WarmthEngine({ trajectory: fixed(L8) })
    alexDown.applyFast({ raw: -10, reasons: [], wordCount: 1, deadEnd: true, fillerPerMinute: 0 }, 5, 'x')
    // A misstep costs her far more than a good turn earns. That ratio is what
    // makes level 8 level 8.
    expect(L8.start - alexDown.warmth).toBeGreaterThan((alexUp.warmth - L8.start) * 4)
  })

  it('rolls a different opener each session, within the jitter band', () => {
    const lowest = new WarmthEngine({ trajectory: L1, rng: () => 0 })
    const highest = new WarmthEngine({ trajectory: L1, rng: () => 1 })
    const middle = new WarmthEngine({ trajectory: L1, rng: () => 0.5 })

    expect(lowest.warmth).toBe(L1.start - L1.startJitter)
    expect(highest.warmth).toBe(L1.start + L1.startJitter)
    expect(middle.warmth).toBe(L1.start)
  })

  it('never leaves the floor-ceiling range', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1) })
    for (let i = 0; i < 100; i += 1) {
      engine.applyFast({ raw: -20, reasons: [], wordCount: 1, deadEnd: true, fillerPerMinute: 0 }, i, 'x')
    }
    // Bottoms out hostile, not merely closed.
    expect(engine.warmth).toBe(-20)
    expect(engine.band).toBe('HOSTILE')
  })

  it('attributes time to the band that was actually occupied', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 45) })
    // 30s in OPEN, then a crash into GUARDED for the remaining 30s.
    engine.applyFast({ raw: -20, reasons: [], wordCount: 1, deadEnd: true, fillerPerMinute: 0 }, 30, 'x')
    const telemetry = engine.telemetry(60)
    expect(telemetry.timeInBand.OPEN).toBe(30)
    expect(telemetry.timeInBand.GUARDED).toBe(30)
    expect(telemetry.timeInBand.INVESTED).toBe(0)
  })

  it('reports async score latency and how many were dropped', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1) })
    engine.applySlow({ intent: 1, intimacy: 10, quote: '', reason: '' }, 45, 10, 'a', 200, 1)
    engine.applySlow({ intent: 1, intimacy: 10, quote: '', reason: '' }, 45, 20, 'b', 400, 2)
    engine.recordSkippedSlow()

    const telemetry = engine.telemetry(60)
    expect(telemetry.asyncScoreLatencyMs.median).toBe(300)
    expect(telemetry.asyncScoreLatencyMs.skipped).toBe(1)
  })

  it('records peak and trough, not just where it ended', () => {
    const engine = new WarmthEngine({ trajectory: fixed(L1, 45) })
    engine.applyFast({ raw: 10, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 }, 10, 'up')
    engine.applyFast({ raw: -30, reasons: [], wordCount: 1, deadEnd: true, fillerPerMinute: 0 }, 20, 'down')
    engine.applyFast({ raw: 4, reasons: [], wordCount: 12, deadEnd: false, fillerPerMinute: 0 }, 30, 'up')

    const telemetry = engine.telemetry(40)
    expect(telemetry.peak).toBeGreaterThan(45)
    expect(telemetry.trough).toBeLessThan(45)
    expect(telemetry.end).toBeGreaterThan(telemetry.trough)
    expect(telemetry.end).toBeLessThan(telemetry.peak)
  })
})

describe('level config', () => {
  it('reads the authored trajectory for every rung the roster holds', () => {
    // A level's difficulty curve IS the trajectory of the character who holds
    // that rung. The roster holds three of them — 1, 2 and 4 — so those three
    // are the ladder, and each has to read back exactly what its character was
    // authored with.
    for (const persona of Object.values(PERSONAS)) {
      expect(levelTrajectory(persona.level)).toEqual(persona.trajectory)
    }
    expect(levelTrajectory(1)).toEqual(L1)
  })

  it('falls an unheld rung back to a neighbour rather than inventing one', () => {
    // Rungs 3 and 5-8 have nobody standing on them since the roster went to
    // three. Interpolating would manufacture a difficulty curve no one designed
    // and no one has run a rep against, so the nearest authored rung is used.
    // Nothing routes a user here — it exists so a stored level from an older
    // session, or an interview rung, still resolves to something real.
    const authored = Object.values(PERSONAS).map((persona) => persona.trajectory)
    for (const level of [3, 5, 6, 7, 8]) {
      expect(authored).toContainEqual(levelTrajectory(level))
    }
  })

  it('keeps Alex authored and off the ladder', () => {
    // She is retired, not deleted: her hard ceiling of 45 is what exercises
    // every clamp in this engine and the tests below still drive her directly.
    // What must NOT happen is her curve leaking back onto a rung a user can be
    // routed to, which is what would silently reintroduce an unwinnable level.
    expect(Object.values(PERSONAS)).not.toContain(alex)
    for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(levelTrajectory(level)).not.toEqual(L8)
    }
  })

  it('gets harder monotonically from rung to rung', () => {
    // Not a stylistic preference: a ladder where level 5 is easier than level
    // 4 makes every unlock meaningless and the progression a lie.
    const rungs = [1, 2, 3, 4, 5, 6, 7, 8].map(levelTrajectory)
    for (let i = 1; i < rungs.length; i += 1) {
      const previous = rungs[i - 1]!
      const current = rungs[i]!
      expect(current.start).toBeLessThanOrEqual(previous.start)
      expect(current.gain).toBeLessThanOrEqual(previous.gain)
      expect(current.decay).toBeGreaterThanOrEqual(previous.decay)
      expect(current.decayPerTurn).toBeGreaterThanOrEqual(previous.decayPerTurn)
      // The cap belongs in this list. It clips every strong turn for most of a
      // rep, so a rung whose cap sits above the one below it is a rung that is
      // easier for a good player however the other four dials read.
      expect(current.maxGainPerTurn).toBeLessThanOrEqual(previous.maxGainPerTurn)
    }
  })

  it('leaves every level except the last one winnable', () => {
    // The number is given at 65 (§07). A rung whose ceiling sits below that is
    // a rung nobody can pass, and only Level 8 is meant to be that.
    for (const level of [1, 2, 3, 4, 5, 6, 7]) {
      const trajectory = levelTrajectory(level)
      expect(Math.min(trajectory.hardCeiling, trajectory.sessionCeiling)).toBeGreaterThan(65)
    }
    expect(Math.min(L8.hardCeiling, L8.sessionCeiling)).toBeLessThan(65)
  })

  it('makes Alex unwinnable and Nadia forgiving, by construction', () => {
    expect(L8.hardCeiling).toBeLessThan(60)   // cannot reach ENGAGED
    expect(L8.decay).toBeGreaterThan(L8.gain)
    expect(L1.gain).toBeGreaterThan(L1.decay)
  })
})

describe('standing still', () => {
  it('loses ground on a turn that gives her nothing (§4d)', () => {
    // Round 6's middle stretch: not dead ends, but going nowhere. These scored
    // exactly zero, so the meter froze at 21.0 while the conversation died.
    const engine = new WarmthEngine({ trajectory: fixed(L1, 40) })
    const line = 'Yeah, a lot of stuff.'
    for (let i = 1; i <= 4; i += 1) {
      engine.applyFast(
        scoreFast(turn(line, i * 10, i * 10 + 3), {
          level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
        }),
        i * 10 + 3,
        line,
      )
    }
    expect(engine.warmth).toBeCloseTo(40 - 4 * L1.decayPerTurn, 5)
  })

  it('lets a going-nowhere conversation cool, without punishing tedium as hostility', () => {
    // The retune softened natural decay from 0.5 to 0.2 a turn, so tedium alone
    // no longer walks a character into HOSTILE. That is deliberate: HOSTILE is
    // for someone who has actually done something, and eighty turns of nothing
    // is thirteen minutes — past the eight-minute cap in any case.
    const engine = new WarmthEngine({ trajectory: fixed(L1, 15) })
    const line = 'Yeah, a lot of stuff.'
    for (let i = 1; i <= 80; i += 1) {
      engine.applyFast(
        scoreFast(turn(line, i * 10, i * 10 + 3), {
          level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
        }),
        i * 10 + 3,
        line,
      )
    }
    expect(engine.warmth).toBeLessThan(15)
    // Eighty turns of nothing is thirteen minutes, well past the eight-minute
    // cap, and it drains her to the floor.
    expect(engine.band).toBe('HOSTILE')
  })

  it('still reaches hostility when he is actually giving her nothing', () => {
    // Dead ends score negative, which is a different thing from scoring zero.
    const engine = new WarmthEngine({ trajectory: fixed(L1, 15) })
    for (let i = 1; i <= 12; i += 1) {
      engine.applyFast(
        scoreFast(turn('Yeah.', i * 10, i * 10 + 1), {
          level: 1, agentTurns: [], precedingDeadEnds: i, gapSeconds: null,
        }),
        i * 10 + 1,
        'Yeah.',
      )
    }
    expect(engine.band).toBe('HOSTILE')
  })
})

/* ------------------------------------------------------------------ *
 * The trajectory, asserted end to end against the three-minute rep
 * ------------------------------------------------------------------ */

describe('the retuned trajectory', () => {
  const her = [agentSaid('Re-reading a Tana French. Third time.')]

  /**
   * Turns in a rep, at roughly twelve seconds a turn.
   *
   * A model, not a measurement — M0's one clean rep recorded 19 user turns in
   * 160s, but five of those were echo the transcript later disowned. Twelve
   * seconds for her turn, his turn and the gaps between them puts a
   * three-minute rep at fifteen. The ladder is checked either side of it in
   * `separates the rungs` below, so nothing here is fitted to exactly fifteen.
   */
  const TURNS_IN_A_REP = 15

  /** A scripted rep. `line` is what he says every turn. */
  /**
   * A scripted rep. `line` is what he says every turn.
   *
   * `personality` is passed through exactly as a live rep passes it, so this
   * measures the ladder as it actually behaves rather than a neutral version of
   * it. That matters: the temperament layer weights what each character is
   * moved by, and a separation check that skipped it would be asserting a
   * difficulty curve nobody ever plays.
   */
  function play(
    trajectory: typeof L1,
    line: string,
    turns: number,
    agentTurns = her,
    level = 1,
    personality?: Personality,
  ) {
    const engine = new WarmthEngine({
      trajectory: { ...trajectory, startJitter: 0 },
      ...(personality ? { personality } : {}),
    })
    let at = 0
    for (let i = 0; i < turns; i += 1) {
      at += 12
      engine.applyFast(
        scoreFast(turn(line, at, at + 4), {
          level, agentTurns, precedingDeadEnds: 0, gapSeconds: null,
          ...(personality ? { personality } : {}),
        }),
        at,
        line,
      )
    }
    return engine
  }

  /** The roster, by rung, so a ladder check uses the real characters. */
  const RUNG = Object.fromEntries(
    Object.values(PERSONAS)
      .filter((persona) => persona.track === 'dating')
      .map((persona) => [persona.level, persona]),
  ) as Record<number, (typeof nadia)>

  const rungPersonality = (level: number) => RUNG[level]?.personality

  const GOOD = 'What made you pick that French one to read again'
  const FLAT = 'Yeah, a lot of stuff.'

  it('gets a good player into the warm bands inside a real rep', () => {
    // Under the old config — gain 0.6, decayPerTurn 0.5, start 15 — five
    // minutes of this reached 47, which taught a user doing everything right
    // that nothing they did mattered.
    const engine = play(nadia.trajectory, GOOD, TURNS_IN_A_REP)
    expect(engine.warmth).toBeGreaterThanOrEqual(70)
    expect(engine.warmth).toBeLessThanOrEqual(80)
    expect(engine.band).toBe('ENGAGED')
  })

  it('separates the rungs at the 65 line, at any plausible rep length', () => {
    // THE FORMAT-CHANGE REGRESSION. Three minutes is five more turns than two,
    // the cap clips every strong turn for most of a rep, and the extra turns
    // were therefore worth a flat +10 on every rung at once — which moved the
    // fixed 65 line from just above Level 1 to below Level 3. The dials stayed
    // monotonic the whole time; what stopped being true is that clearing a
    // rung meant anything. Re-check this after any change to rep length.
    // The shipped rungs, and only those. An unheld rung resolves to a
    // neighbour's curve, so including 3 or 5-8 here would assert against a
    // duplicate rather than against a character anybody can be matched with.
    const SHIPPED = Object.values(PERSONAS).map((persona) => persona.level).sort((a, b) => a - b)
    const armedRungs = (turns: number) =>
      SHIPPED.filter((level) =>
        play(levelTrajectory(level), GOOD, turns, her, level, rungPersonality(level))
          .warmth >= ARM_THRESHOLD)

    // A terse rep, the model rep, and a talkative one. More conversation earns
    // more ground — that is honest — but never the whole ladder at once.
    expect(armedRungs(12)).toEqual([1])
    expect(armedRungs(TURNS_IN_A_REP)).toEqual([1, 2])
    expect(armedRungs(18)).toEqual([1, 2])
  })

  it('leaves the top rung hard and not sealed', () => {
    // Robin is the ladder's ceiling now, and the line between "hard" and
    // "impossible" is the whole reason she took rung 4 rather than keeping the
    // rung-7 curve. A merely competent rep never arms her — 18 turns of good
    // play lands short. Sustained perfect play does, eventually, which is what
    // makes her a rung rather than a wall. Alex was the wall, on purpose, and
    // she is not on the roster any more.
    const robinWarmth = (turns: number) =>
      play(levelTrajectory(4), GOOD, turns, her, 4, rungPersonality(4)).warmth

    expect(robinWarmth(18)).toBeLessThan(ARM_THRESHOLD)
    expect(robinWarmth(24)).toBeGreaterThanOrEqual(ARM_THRESHOLD)
  })

  it('leaves a flat player cold', () => {
    // Turns that give her nothing score zero, and zero still loses ground.
    const engine = play(nadia.trajectory, FLAT, 12, [])
    expect(engine.warmth).toBeLessThan(30)
  })

  it('never lets Alex past her hard ceiling, however well the rep goes', () => {
    // The whole point of level 8. ENGAGED starts at 60 and she stops at 45.
    for (const turns of [10, 30, 80, 200]) {
      const engine = play(alex.trajectory, GOOD, turns)
      expect(engine.warmth).toBeLessThanOrEqual(alex.trajectory.hardCeiling)
    }
    expect(play(alex.trajectory, GOOD, 200).band).toBe('OPEN')
  })

  it('does not let a perfect score buy past the ceiling either', () => {
    const engine = new WarmthEngine({ trajectory: { ...alex.trajectory, startJitter: 0 } })
    for (let i = 0; i < 500; i += 1) {
      engine.applyFast(
        { raw: 100, reasons: [], wordCount: 20, deadEnd: false, fillerPerMinute: 0 },
        i,
        'x',
      )
    }
    expect(engine.warmth).toBe(alex.trajectory.hardCeiling)
  })
})

describe('filler detection', () => {
  it('does not charge ordinary English as nervous filler', () => {
    // Both of these lost their engagement bonus to a false filler hit.
    for (const line of [
      'I mostly read non-fiction, so crime feels like a stretch for me',
      'That makes sense. I might actually give it a go',
      'It was basically the only one left on the shelf there',
    ]) {
      const score = scoreFast(turn(line, 0, 4), {
        level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
      })
      expect(score.reasons.some((r) => r.code === 'filler-rate'), line).toBe(false)
      expect(score.raw, line).toBeGreaterThan(0)
    }
  })

  it('ignores a single hesitation', () => {
    const one = scoreFast(turn('um I was looking for something for my brother', 0, 4), {
      level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
    })
    expect(one.reasons.some((r) => r.code === 'filler-rate')).toBe(false)
  })

  it('still catches a genuine nervous spiral', () => {
    const spiral = scoreFast(turn('um so uh I mean I was you know just sort of looking', 0, 4), {
      level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
    })
    expect(spiral.reasons.some((r) => r.code === 'filler-rate')).toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 * Band selection
 * ------------------------------------------------------------------ */

describe('bandFor', () => {
  it('covers the whole continuous range with no gaps', () => {
    // THE ROUND-10 BUG. Selection used to test `value >= min && value <= max`
    // against integer bounds and fall back to OPEN when nothing matched, so
    // every fractional value in a seam — 19.5, 39.5, 59.5, 79.5, -0.5 — was
    // reported as OPEN. Warmth is continuous, so this fired constantly, and
    // `bandDirective` reads it: a character at 19.5 is CLOSED and was being
    // handed the OPEN directive.
    for (let value = WARMTH_MIN; value <= WARMTH_MAX; value += 0.25) {
      const band = bandFor(value)
      expect(BANDS.some((spec) => spec.band === band), `warmth ${value}`).toBe(true)
    }
  })

  it('puts every seam value in the band below, not in OPEN', () => {
    expect(bandFor(-0.5)).toBe('HOSTILE')
    expect(bandFor(19.5)).toBe('CLOSED')
    expect(bandFor(39.5)).toBe('GUARDED')
    expect(bandFor(59.5)).toBe('OPEN')
    expect(bandFor(79.5)).toBe('ENGAGED')
  })

  it('never reports a cold character as mid-warm', () => {
    // The specific failure: -0.9999… is as cold as the meter goes and used to
    // come back OPEN, which would have told her to volunteer something.
    for (const value of [-20, -12.5, -1.0000001, -0.9999999999999982, -0.0001]) {
      expect(bandFor(value), `warmth ${value}`).toBe('HOSTILE')
    }
  })

  it('is monotonic — warmer input never yields a colder band', () => {
    const order = BANDS.map((spec) => spec.band)
    let previous = -1
    for (let value = WARMTH_MIN; value <= WARMTH_MAX; value += 0.5) {
      const index = order.indexOf(bandFor(value))
      expect(index, `warmth ${value}`).toBeGreaterThanOrEqual(previous)
      previous = index
    }
  })

  it('hands a cold character a cold directive', () => {
    // The consequence that made the bug worth finding. 19.5 is CLOSED, and the
    // discriminator is the PERMISSION the OPEN directive grants — "You may
    // volunteer one small thing". CLOSED now names volunteering too, in order
    // to forbid it, so the bare word no longer separates the two bands.
    expect(bandDirective(19.5)).toContain('Four to ten words')
    expect(bandDirective(19.5)).not.toContain('You may volunteer')
    expect(bandDirective(19.5)).toContain('do not volunteer anything')
  })
})

/* ------------------------------------------------------------------ *
 * Three axes, repair, and the moment allowed past the cap
 * ------------------------------------------------------------------ */

describe('the second and third axes', () => {
  const L1 = nadia.trajectory
  const fixed = (t: Trajectory, start: number) => ({ ...t, start, startJitter: 0 })
  const mkTurn = (text: string, start: number, end: number): TranscriptTurn => ({
    speaker: 'user', text, t_start: start, t_end: end,
  })

  const engineAt = (start: number) =>
    new WarmthEngine({ trajectory: fixed(L1, start), personality: nadia.personality })

  it('opens with comfort ahead of a cold interest', () => {
    const engine = engineAt(10)
    expect(engine.comfort).toBeGreaterThan(engine.warmth)
    expect(engine.liking).toBeLessThan(engine.warmth)
  })

  it('charges an overreach mostly to comfort, not to interest', () => {
    // Somebody who misjudges the distance does not make you LESS CURIOUS about
    // them. They make you less at ease. Splitting those is what lets a rep
    // recover from one clumsy line without pretending it did not happen.
    const engine = engineAt(40)
    const comfortBefore = engine.comfort
    const warmthBefore = engine.warmth
    engine.applySlow(
      { intimacy: 90, intent: 2, quote: 'get down my number', reason: 'boundary' },
      40, 30, 'maybe you should get down my number', 800, 1,
    )
    const comfortDrop = comfortBefore - engine.comfort
    const warmthDrop = warmthBefore - engine.warmth
    expect(comfortDrop).toBeGreaterThan(warmthDrop)
  })

  it('lets a callback move liking further than it moves interest', () => {
    const engine = engineAt(40)
    const her = [{ speaker: 'agent' as const, text: 'Re-reading a Tana French.', t_start: 0, t_end: 3 }]
    const before = { warmth: engine.warmth, liking: engine.liking }
    const line = 'Which French did you pick this time then'
    engine.applyFast(
      scoreFast(mkTurn(line, 10, 14), {
        level: 1, personality: nadia.personality, agentTurns: her,
        precedingDeadEnds: 0, gapSeconds: null,
      }),
      14, line,
    )
    const likingGain = engine.liking - before.liking
    expect(likingGain).toBeGreaterThan(0)
    expect(engine.liking).toBeGreaterThan(before.liking)
  })

  it('reports a posture in every event, so telemetry shows the shape', () => {
    const engine = engineAt(30)
    const line = 'Yeah.'
    engine.applyFast(
      scoreFast(mkTurn(line, 10, 11), {
        level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
      }),
      11, line,
    )
    const event = engine.events[engine.events.length - 1]
    expect(event?.posture).toBeDefined()
    expect(typeof event?.comfortAfter).toBe('number')
    expect(typeof event?.likingAfter).toBe('number')
  })

  it('never lets a session ceiling cap how at ease she can be', () => {
    // Alex is capped at 45 interest for the whole rep and can still be
    // perfectly comfortable. That is exactly what level 8 should feel like:
    // pleasant, relaxed, and going nowhere.
    const engine = new WarmthEngine({
      trajectory: { ...alex.trajectory, startJitter: 0 },
      personality: alex.personality,
    })
    expect(engine.comfort).toBeGreaterThan(alex.trajectory.hardCeiling - 10)
  })
})

describe('the repair window', () => {
  const fixed = (t: Trajectory, start: number) => ({ ...t, start, startJitter: 0 })
  const mkTurn = (text: string, start: number, end: number): TranscriptTurn => ({
    speaker: 'user', text, t_start: start, t_end: end,
  })
  const GOOD = 'What made you pick that one to read again'

  const scored = (line: string) =>
    scoreFast(mkTurn(line, 10, 14), {
      level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
    })

  it('is shut until she actually cools', () => {
    const engine = new WarmthEngine({ trajectory: fixed(nadia.trajectory, 40) })
    expect(engine.repairOpen).toBe(false)
    engine.applyFast(scored(GOOD), 14, GOOD)
    expect(engine.repairOpen).toBe(false)
  })

  it('opens on a real fall and pays a recovering turn more', () => {
    // A misstep handled well leaves you better off than never having missed.
    // It was worth nothing before this: a bad turn cost its points and the
    // conversation carried on as though it had not happened, which teaches
    // avoidance rather than recovery.
    const repairing = new WarmthEngine({ trajectory: fixed(nadia.trajectory, 40) })
    repairing.applySlow(
      { intimacy: 95, intent: 0, quote: 'q', reason: 'boundary' },
      40, 20, 'clumsy', 500, 1,
    )
    expect(repairing.repairOpen).toBe(true)
    const beforeRepair = repairing.warmth
    repairing.applyFast(scored(GOOD), 30, GOOD)
    const repaired = repairing.warmth - beforeRepair

    const plain = new WarmthEngine({ trajectory: fixed(nadia.trajectory, repairing.warmth) })
    const beforePlain = plain.warmth
    plain.applyFast(scored(GOOD), 30, GOOD)
    const ordinary = plain.warmth - beforePlain

    expect(repaired).toBeGreaterThan(ordinary)
    expect(repairing.events[repairing.events.length - 1]?.repaired).toBe(true)
  })

  it('closes once he has used it, and does not stay open forever', () => {
    const engine = new WarmthEngine({ trajectory: fixed(nadia.trajectory, 40) })
    engine.applySlow(
      { intimacy: 95, intent: 0, quote: 'q', reason: 'boundary' },
      40, 20, 'clumsy', 500, 1,
    )
    engine.applyFast(scored(GOOD), 30, GOOD)
    expect(engine.repairOpen).toBe(false)
  })

  it('is not opened by ordinary per-turn decay', () => {
    // Tedium is not a misstep and must not arm a bonus.
    const engine = new WarmthEngine({ trajectory: fixed(nadia.trajectory, 40) })
    const flat = 'Yeah, a lot of stuff.'
    engine.applyFast(scored(flat), 14, flat)
    expect(engine.repairOpen).toBe(false)
  })
})

describe('breakthrough turns', () => {
  const fixed = (t: Trajectory, start: number) => ({ ...t, start, startJitter: 0 })

  it('lets the best moment in a rep exceed the per-turn cap', () => {
    // Real liking is not a curve, it is an instant. Capping the one turn that
    // should feel like a change is what made the meter read as arithmetic.
    const engine = new WarmthEngine({ trajectory: fixed(nadia.trajectory, 40) })
    const before = engine.warmth
    engine.applySlow(
      { intimacy: 40, intent: 10, quote: 'that landed', reason: 'genuinely funny' },
      40, 30, 'a good line', 700, 1,
    )
    expect(engine.warmth - before).toBeGreaterThan(nadia.trajectory.maxGainPerTurn)
    expect(engine.events[engine.events.length - 1]?.breakthrough).toBe(true)
  })

  it('is rationed, so it stays a moment rather than a slot machine', () => {
    const engine = new WarmthEngine({ trajectory: fixed(nadia.trajectory, 40) })
    for (let i = 1; i <= 4; i += 1) {
      // Intimacy kept level with earned warmth: this is about the cap, not
      // about overreach, and an overreach verdict replaces the model's delta.
      engine.applySlow(
        { intimacy: 40, intent: 10, quote: 'q', reason: 'landed' },
        40, i * 10, 'good', 700, i,
      )
    }
    const used = engine.events.filter((event) => event.breakthrough).length
    expect(used).toBe(2)
    expect(engine.telemetry(60).breakthroughs).toBe(2)
  })

  it('does not fire on an ordinary good judgement', () => {
    const engine = new WarmthEngine({ trajectory: fixed(nadia.trajectory, 40) })
    engine.applySlow(
      { intimacy: 40, intent: 5, quote: 'q', reason: 'fine' },
      40, 30, 'ok', 700, 1,
    )
    expect(engine.events[engine.events.length - 1]?.breakthrough).toBe(false)
  })
})

describe('the anti-farming taper', () => {
  it('pays full price for form early and less for it later', () => {
    expect(fastAuthority(1)).toBe(1)
    expect(fastAuthority(FAST_AUTHORITY_SPAN)).toBeCloseTo(FAST_AUTHORITY_FLOOR, 5)
    expect(fastAuthority(8)).toBeLessThan(fastAuthority(2))
  })

  it('never falls below its floor, however long the rep runs', () => {
    expect(fastAuthority(200)).toBeCloseTo(FAST_AUTHORITY_FLOOR, 5)
  })

  it('does not make a late dead end cheaper than an early one', () => {
    // Tapering penalties would make the last minute of a bad rep free.
    const early = new WarmthEngine({ trajectory: fixed(L1, 40) })
    const late = new WarmthEngine({ trajectory: fixed(L1, 40) })
    const flat = 'Yeah.'
    const score = () => scoreFast(turn(flat, 0, 1), {
      level: 1, agentTurns: [], precedingDeadEnds: 0, gapSeconds: null,
    })
    early.applyFast(score(), 1, flat)
    for (let i = 0; i < 14; i += 1) late.applyFast(score(), i, flat)
    const earlyCost = early.events[0]?.rawDelta ?? 0
    const lateCost = late.events[late.events.length - 1]?.rawDelta ?? 0
    expect(lateCost).toBeLessThanOrEqual(earlyCost)
  })
})
