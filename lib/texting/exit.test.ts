import { describe, expect, it } from 'vitest'
import { isDismissal } from '@/lib/warmth/leaving'
import {
  COLD_FLOOR,
  DEAD_END_EXIT,
  isTextingDismissal,
  nextExit,
  repliesAtAll,
  warmExitBudget,
  type ExitInput,
} from './exit'

function input(overrides: Partial<ExitInput> = {}): ExitInput {
  return {
    current: 'present',
    warmth: 45,
    deadEndStreak: 0,
    completedExchanges: 4,
    lastUserText: 'that sounds like a nightmare, what did you end up doing',
    budget: 18,
    ...overrides,
  }
}

describe('monotonicity', () => {
  it('never moves backwards, however warm it gets', () => {
    expect(nextExit(input({ current: 'wrapping', warmth: 58 })).exit).toBe('wrapping')
    expect(nextExit(input({ current: 'leaving', warmth: 58 })).exit).toBe('leaving')
  })

  it('a finished thread stays finished', () => {
    const verdict = nextExit(input({ current: 'leaving', lastUserText: 'please come back' }))
    expect(verdict.exit).toBe('leaving')
  })
})

describe('the cold endings are silent', () => {
  it('a dismissal commits on the turn it arrives', () => {
    const verdict = nextExit(input({ lastUserText: 'just fuck off' }))
    expect(verdict.exit).toBe('leaving')
    expect(verdict.ending).toBe('dismissed')
    expect(repliesAtAll(verdict.exit, verdict.ending)).toBe(false)
  })

  it('three dead ends wind down first, then fade', () => {
    const first = nextExit(input({ deadEndStreak: DEAD_END_EXIT, warmth: 30 }))
    expect(first.exit).toBe('wrapping')
    expect(first.ending).toBeNull()
    // She still answers while wrapping — the withdrawal has to be visible
    // while there is still time to read it.
    expect(repliesAtAll(first.exit, first.ending)).toBe(true)

    const second = nextExit(input({ current: 'wrapping', deadEndStreak: DEAD_END_EXIT, warmth: 30 }))
    expect(second.exit).toBe('leaving')
    expect(second.ending).toBe('faded')
    expect(repliesAtAll(second.exit, second.ending)).toBe(false)
  })

  it('falling through the cold floor winds down on its own', () => {
    expect(nextExit(input({ warmth: COLD_FLOOR })).exit).toBe('wrapping')
    expect(nextExit(input({ warmth: COLD_FLOOR + 1, completedExchanges: 2 })).exit).toBe('present')
  })
})

describe('the warm ending', () => {
  it('his own farewell is answered, never ignored', () => {
    const verdict = nextExit(input({ lastUserText: 'right, i should get going' }))
    expect(verdict.ending).toBe('warm')
    expect(repliesAtAll(verdict.exit, verdict.ending)).toBe(true)
  })

  it('a farewell is answered even when the meter is cold', () => {
    const verdict = nextExit(input({ warmth: 5, lastUserText: 'anyway, i have to go' }))
    expect(verdict.ending).toBe('warm')
  })

  it('the budget only applies once she is warm enough', () => {
    // GUARDED and out of budget is a conversation that never got going, and
    // dressing that up as a warm goodbye would be scoring an outcome she did
    // not have.
    expect(nextExit(input({ warmth: 30, completedExchanges: 40 })).exit).toBe('present')
    expect(nextExit(input({ warmth: 45, completedExchanges: 40 })).exit).toBe('wrapping')
  })

  it('winds down before it leaves', () => {
    const first = nextExit(input({ warmth: 50, completedExchanges: 20 }))
    expect(first.exit).toBe('wrapping')
    const second = nextExit(input({ current: 'wrapping', warmth: 50, completedExchanges: 21 }))
    expect(second.ending).toBe('warm')
  })

  it('the model may bring a warm ending forward, never a cold one', () => {
    expect(nextExit(input({ warmth: 50, modelSignalled: true })).ending).toBe('warm')
    // Cold: the state owns it, and a sentinel cannot manufacture a goodbye
    // from a character who is being ignored.
    expect(nextExit(input({ warmth: 30, modelSignalled: true })).exit).toBe('present')
  })
})

describe('the budget is a budget, not a coin flip', () => {
  it('is deterministic for a thread', () => {
    expect(warmExitBudget('thread:a')).toBe(warmExitBudget('thread:a'))
  })

  it('stays inside its authored bounds for every seed', () => {
    for (let i = 0; i < 500; i += 1) {
      const budget = warmExitBudget(`thread:${i}`)
      expect(budget).toBeGreaterThanOrEqual(12)
      expect(budget).toBeLessThanOrEqual(24)
    }
  })

  it('actually varies across threads', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i += 1) seen.add(warmExitBudget(`thread:${i}`))
    expect(seen.size).toBeGreaterThan(3)
  })

  it('is independent of the opening jitter draw', () => {
    // Rolled off a suffix rather than the raw seed, so "she opened warm" and
    // "she leaves late" are not the same coin.
    expect(warmExitBudget('x')).not.toBe(warmExitBudget('x:exit'))
  })
})

describe('the dismissal narrowing (found by the audition harness)', () => {
  /**
   * A false positive here costs somebody a whole conversation, because a
   * dismissal is the one exit that commits on the turn it fires. Both
   * directions are pinned.
   */
  const benign = [
    'did you end up dancing at all or just trying not to get lost in the noise?',
    'i always get lost in that part of town',
    'she went away for the weekend apparently',
    'don’t get lost on the way over',
    'we got lost twice trying to find it',
    'are you going away for christmas',
  ]
  for (const text of benign) {
    it(`does not end a thread on ${JSON.stringify(text.slice(0, 34))}`, () => {
      expect(isTextingDismissal(text)).toBe(false)
      expect(nextExit(input({ lastUserText: text })).ending).not.toBe('dismissed')
    })
  }

  const real = [
    'just fuck off',
    'go away',
    'get lost',
    'leave me alone',
    'piss off',
    'get out of my face',
  ]
  for (const text of real) {
    it(`still ends a thread on ${JSON.stringify(text)}`, () => {
      expect(isTextingDismissal(text)).toBe(true)
      expect(nextExit(input({ lastUserText: text })).ending).toBe('dismissed')
    })
  }

  it('never widens what the shared predicate refuses', () => {
    // A narrowing, never a replacement. Anything `isDismissal` says no to, this
    // says no to as well.
    for (const text of [...benign, 'how was your day', 'that sounds good']) {
      if (!isDismissal(text)) expect(isTextingDismissal(text)).toBe(false)
    }
  })
})
