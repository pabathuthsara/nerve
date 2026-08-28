/**
 * The sequence §16.3 describes in one sentence, asserted case by case.
 *
 * *"A user steering explicit gets an in-frame decline first, then the rep
 * ends."* Everything below is that sentence and the cases it does not mention:
 * a strike arriving from her stream instead of his, an unrecoverable verdict
 * on a rep that already had a strike against it, and every turn that keeps
 * arriving after the rep has already been ended.
 *
 * The last one is the reason this is a state machine at all. She is usually
 * mid-sentence when a rep is closed, and without `closed` every one of those
 * trailing turns would be a fresh event on the record and a second attempt to
 * end a rep that had already ended.
 */

import { describe, expect, it } from 'vitest'
import {
  emptySafetyState,
  nextSafetyAction,
  stateFromEvents,
  CLOSE_DIRECTIVE,
  DECLINE_DIRECTIVE,
  CORRECT_DIRECTIVE,
  type SafetyState,
} from './escalation'

const fresh = emptySafetyState()

describe('a clean turn', () => {
  it('does nothing and records nothing', () => {
    const decision = nextSafetyAction(fresh, { verdict: 'ok', speaker: 'user' })
    expect(decision.action).toBe('none')
    expect(decision.kind).toBeNull()
    expect(decision.state).toEqual(fresh)
  })
})

describe('the user crosses the line', () => {
  it('is declined in frame the first time', () => {
    const decision = nextSafetyAction(fresh, { verdict: 'boundary', speaker: 'user' })
    expect(decision.action).toBe('decline')
    expect(decision.kind).toBe('boundary')
    expect(decision.state.userStrikes).toBe(1)
    // The rep continues. This is the half people forget.
    expect(decision.state.closed).toBe(false)
  })

  it('ends the rep the second time', () => {
    const once = nextSafetyAction(fresh, { verdict: 'boundary', speaker: 'user' }).state
    const decision = nextSafetyAction(once, { verdict: 'boundary', speaker: 'user' })
    expect(decision.action).toBe('end')
    expect(decision.kind).toBe('ended')
    expect(decision.state.closed).toBe(true)
  })

  it('does not spend her strikes on his behalf', () => {
    // A rep where she drifted once must not end on his FIRST crossing.
    const hers = nextSafetyAction(fresh, { verdict: 'boundary', speaker: 'agent' }).state
    const decision = nextSafetyAction(hers, { verdict: 'boundary', speaker: 'user' })
    expect(decision.action).toBe('decline')
  })
})

describe('the character crosses the line', () => {
  it('is corrected silently the first time', () => {
    const decision = nextSafetyAction(fresh, { verdict: 'boundary', speaker: 'agent' })
    expect(decision.action).toBe('correct')
    expect(decision.kind).toBe('boundary')
    expect(decision.state.agentStrikes).toBe(1)
    expect(decision.state.closed).toBe(false)
  })

  it('ends the rep the second time', () => {
    const once = nextSafetyAction(fresh, { verdict: 'boundary', speaker: 'agent' }).state
    const decision = nextSafetyAction(once, { verdict: 'boundary', speaker: 'agent' })
    expect(decision.action).toBe('end')
    expect(decision.state.closed).toBe(true)
  })
})

describe('the verdict that never gets a first chance', () => {
  it('ends the rep with no strike and no decline', () => {
    const decision = nextSafetyAction(fresh, { verdict: 'stop', speaker: 'user' })
    expect(decision.action).toBe('end')
    expect(decision.kind).toBe('ended')
    expect(decision.state.userStrikes).toBe(0)
    expect(decision.state.closed).toBe(true)
  })

  it('ends it from her stream too', () => {
    const decision = nextSafetyAction(fresh, { verdict: 'stop', speaker: 'agent' })
    expect(decision.action).toBe('end')
  })
})

describe('distress', () => {
  it('drops the frame and closes the rep at once', () => {
    const decision = nextSafetyAction(fresh, { verdict: 'distress', speaker: 'user' })
    expect(decision.action).toBe('distress')
    expect(decision.kind).toBe('distress')
    expect(decision.state.closed).toBe(true)
  })

  it('does not need a strike to have been spent first', () => {
    expect(nextSafetyAction(fresh, { verdict: 'distress', speaker: 'user' }).action).toBe('distress')
  })
})

describe('after the rep has been closed', () => {
  const closed: SafetyState = { userStrikes: 1, agentStrikes: 0, closed: true }

  it('ignores every further turn, whatever it says', () => {
    for (const verdict of ['boundary', 'stop', 'distress'] as const) {
      const decision = nextSafetyAction(closed, { verdict, speaker: 'user' })
      expect(decision.action).toBe('none')
      expect(decision.kind).toBeNull()
    }
  })

  it('collects no further strikes on the way out', () => {
    // She is usually still talking when a rep is closed. Without this, every
    // trailing turn is another row on the record for one incident.
    const decision = nextSafetyAction(closed, { verdict: 'boundary', speaker: 'agent' })
    expect(decision.state).toEqual(closed)
  })
})

describe('stateFromEvents', () => {
  it('starts empty', () => {
    expect(stateFromEvents([])).toEqual(fresh)
  })

  it('counts strikes by the stream they came from', () => {
    const state = stateFromEvents([
      { kind: 'boundary', speaker: 'user' },
      { kind: 'boundary', speaker: 'agent' },
      { kind: 'boundary', speaker: 'user' },
    ])
    expect(state.userStrikes).toBe(2)
    expect(state.agentStrikes).toBe(1)
  })

  it('reads a closed rep back as closed', () => {
    expect(stateFromEvents([{ kind: 'ended', speaker: 'user' }]).closed).toBe(true)
    expect(stateFromEvents([{ kind: 'distress', speaker: 'user' }]).closed).toBe(true)
  })

  it('ignores kinds that are not strikes', () => {
    // A report the user filed, and a flag under our floors, are both on the
    // record and neither is a strike against them.
    const state = stateFromEvents([
      { kind: 'report', speaker: null },
      { kind: 'moderation', speaker: 'user' },
    ])
    expect(state).toEqual(fresh)
  })

  it('reads an event with no speaker as the user', () => {
    // Rows written before the stream was stamped. His is the conservative
    // reading: it is the count that can end a rep.
    expect(stateFromEvents([{ kind: 'boundary', speaker: null }]).userStrikes).toBe(1)
  })

  it('rebuilds a state the machine then ends from', () => {
    const state = stateFromEvents([{ kind: 'boundary', speaker: 'user' }])
    expect(nextSafetyAction(state, { verdict: 'boundary', speaker: 'user' }).action).toBe('end')
  })
})

describe('the directives', () => {
  it('are directions rather than scripts', () => {
    // The rule from `lib/voice/reinforcement.ts`: she is handed an intention
    // and finds her own words. A quoted sentence here would be the one line in
    // a three-minute rep that sounds like an app.
    for (const directive of [DECLINE_DIRECTIVE, CORRECT_DIRECTIVE, CLOSE_DIRECTIVE]) {
      expect(directive.startsWith('(')).toBe(true)
      expect(directive.endsWith(')')).toBe(true)
      expect(directive).not.toContain('"')
    }
  })

  it('never tells her to explain herself', () => {
    // §16.6's register. A character delivering a paragraph about respect is
    // the product telling its user off.
    expect(DECLINE_DIRECTIVE).toContain('not a lecture')
    expect(CLOSE_DIRECTIVE).toContain('Do not explain')
  })
})
