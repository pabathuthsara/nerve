/**
 * The mapping from a classifier's categories onto what this product does.
 *
 * The classifier is somebody else's and is not under test. What is under test
 * is every judgement we layered on top of it — which categories end a rep,
 * which cost a strike, which are read differently depending on who was
 * talking, and how sure the classifier has to be before any of it happens.
 *
 * These are the decisions that will be argued about later. They are written
 * down here so the argument is with a test rather than with a rep somebody
 * lost.
 */

import { describe, expect, it } from 'vitest'
import {
  classifyModeration,
  firedCategories,
  THRESHOLDS,
  type ModerationResult,
} from './moderation'

function flagged(name: string, score: number): ModerationResult {
  return { flagged: true, categories: { [name]: true }, scores: { [name]: score } }
}

const clean: ModerationResult = { flagged: false, categories: {}, scores: {} }

describe('classifyModeration', () => {
  it('passes an unflagged turn on either stream', () => {
    expect(classifyModeration(clean, 'user')).toBe('ok')
    expect(classifyModeration(clean, 'agent')).toBe('ok')
  })

  it('ends the rep on the one category that never gets a second chance', () => {
    expect(classifyModeration(flagged('sexual/minors', 0.9), 'user')).toBe('stop')
  })

  it('ends it from her stream too', () => {
    // A character who produced this is not a strike to be counted. The rep is
    // over whichever side of the conversation it came from.
    expect(classifyModeration(flagged('sexual/minors', 0.9), 'agent')).toBe('stop')
  })

  it('stops on a weak signal, because a miss here is unthinkable', () => {
    const weak = flagged('sexual/minors', THRESHOLDS.stop)
    expect(classifyModeration(weak, 'user')).toBe('stop')
  })

  it('treats explicit content from the user as a boundary', () => {
    expect(classifyModeration(flagged('sexual', 0.9), 'user')).toBe('boundary')
  })

  it('treats threats and hate as the same class of thing', () => {
    for (const name of ['harassment/threatening', 'hate', 'violence']) {
      expect(classifyModeration(flagged(name, 0.9), 'user')).toBe('boundary')
    }
  })

  it('reads self-harm on the user stream as distress', () => {
    expect(classifyModeration(flagged('self-harm/intent', 0.9), 'user')).toBe('distress')
  })

  it('never reads distress off HER stream', () => {
    // The failure this prevents: a model says something bleak, and the product
    // offers a helpline to a user who is perfectly fine — diagnosing the user
    // for the character's mistake. Her line is a boundary she crossed.
    expect(classifyModeration(flagged('self-harm', 0.9), 'agent')).toBe('boundary')
  })

  it('puts the unrecoverable category ahead of distress', () => {
    const both: ModerationResult = {
      flagged: true,
      categories: { 'sexual/minors': true, 'self-harm': true },
      scores: { 'sexual/minors': 0.8, 'self-harm': 0.9 },
    }
    // Softening that input into a resource sheet is the one outcome this
    // ordering exists to make impossible.
    expect(classifyModeration(both, 'user')).toBe('stop')
  })

  it('puts distress ahead of a boundary', () => {
    const both: ModerationResult = {
      flagged: true,
      categories: { sexual: true, 'self-harm/intent': true },
      scores: { sexual: 0.9, 'self-harm/intent': 0.9 },
    }
    expect(classifyModeration(both, 'user')).toBe('distress')
  })

  it('ignores a boundary flag the classifier is not confident about', () => {
    // The whole reason our floors sit above the provider's: a rep is somebody's
    // one attempt of the day, and a false positive tells them they did
    // something wrong when they did not.
    const unsure = flagged('sexual', THRESHOLDS.boundary - 0.01)
    expect(classifyModeration(unsure, 'user')).toBe('ok')
  })

  it('acts on a boundary flag exactly at the floor', () => {
    expect(classifyModeration(flagged('sexual', THRESHOLDS.boundary), 'user')).toBe('boundary')
  })

  it('trusts a flag that arrives with no score at all', () => {
    // The scores are a thing the provider happens to publish, not a thing we
    // are entitled to require. A flag without one still counts.
    const scoreless: ModerationResult = { flagged: true, categories: { sexual: true }, scores: {} }
    expect(classifyModeration(scoreless, 'user')).toBe('boundary')
  })

  it('ignores a category it has never heard of', () => {
    const unknown = flagged('politics', 0.99)
    expect(classifyModeration(unknown, 'user')).toBe('ok')
  })

  it('ignores a high score on a category that was not flagged', () => {
    const contradictory: ModerationResult = {
      flagged: true,
      categories: { sexual: false },
      scores: { sexual: 0.99 },
    }
    expect(classifyModeration(contradictory, 'user')).toBe('ok')
  })
})

describe('firedCategories', () => {
  it('lists only what was flagged, in a stable order', () => {
    const result: ModerationResult = {
      flagged: true,
      categories: { violence: true, sexual: true, hate: false },
      scores: {},
    }
    expect(firedCategories(result)).toEqual(['sexual', 'violence'])
  })

  it('is empty on a clean turn', () => {
    expect(firedCategories(clean)).toEqual([])
  })
})
