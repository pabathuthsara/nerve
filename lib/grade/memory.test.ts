import { describe, expect, it } from 'vitest'

import { checkMemoryLine, memoryLineFrom, MAX_MEMORY_WORDS } from './memory'

describe('the memory filter', () => {
  it('keeps the plan\'s own example of a good line', () => {
    // Ten words, two sentences, about her and her situation. If this stops
    // passing the filter has been tightened past the thing it exists to allow.
    const verdict = checkMemoryLine('Still looking for the blue one. Sister\'s birthday is Thursday.')
    expect(verdict).toEqual({
      ok: true,
      line: 'Still looking for the blue one. Sister\'s birthday is Thursday.',
    })
  })

  it('keeps other lines that are about her and the scene', () => {
    for (const line of [
      'The train was twenty minutes late again.',
      'She never did find a copy of the French one.',
      'Waiting on a friend who was running late.',
      'Someone spilled coffee on the table by the window.',
    ]) {
      expect(memoryLineFrom(line), line).toBe(line)
    }
  })

  /* --- the two the plan names ------------------------------------------- */

  it('rejects a line about how he did', () => {
    expect(checkMemoryLine('You were doing well until you asked about work.')).toEqual({
      ok: false,
      reason: 'second-person',
    })
  })

  it('rejects a line about wanting to see him again', () => {
    expect(checkMemoryLine('I\'ve been hoping you\'d come back.')).toEqual({
      ok: false,
      reason: 'second-person',
    })
  })

  /* --- the categories, past the two named examples ----------------------- */

  it('rejects every form of addressing him', () => {
    // The bluntest rule and the most valuable one: a memory that talks to him
    // is a memory about him.
    for (const line of [
      'You asked about the book twice.',
      'Your questions were mostly about work.',
      'She remembered what you said about your brother.',
      'You\'re the one who recommended the French novel.',
      'You\'ve been in before, she thinks.',
    ]) {
      expect(checkMemoryLine(line), line).toMatchObject({ ok: false, reason: 'second-person' })
    }
  })

  it('rejects affection and anticipation, including the quiet kind', () => {
    // §14: every merchant of record on the shortlist bans relationship
    // products by name. Anticipation hides in mild words far more often than
    // in obvious ones, which is why "next time" is on the list.
    for (const line of [
      'She was glad of the company that afternoon.',
      'A lovely conversation about crime novels.',
      'She enjoyed the chat about Tana French.',
      'Perhaps they will talk again next time.',
      'She was rather charmed by the whole thing.',
      'She is looking forward to the weekend market.',
    ]) {
      expect(checkMemoryLine(line), line).toMatchObject({ ok: false, reason: 'affection' })
    }
  })

  it('rejects a second scorecard delivered in her voice', () => {
    // §07 keeps outcome out of the score; this keeps the grade out of her mouth.
    for (const line of [
      'He was nervous at the start but recovered.',
      'A confident opener about the shelf display.',
      'He rambled somewhat about his own reading.',
      'She was impressed by the recommendation.',
      'He handled the refusal without any fuss.',
    ]) {
      expect(checkMemoryLine(line), line).toMatchObject({ ok: false, reason: 'performance' })
    }
  })

  /* --- shape ------------------------------------------------------------- */

  it('rejects a line longer than the cap', () => {
    const long = Array.from({ length: MAX_MEMORY_WORDS + 1 }, () => 'shelf').join(' ')
    expect(checkMemoryLine(long)).toEqual({ ok: false, reason: 'too-long' })
    const atCap = Array.from({ length: MAX_MEMORY_WORDS }, () => 'shelf').join(' ')
    expect(checkMemoryLine(atCap).ok).toBe(true)
  })

  it('rejects a fragment', () => {
    expect(checkMemoryLine('Thursday.')).toEqual({ ok: false, reason: 'too-short' })
    expect(checkMemoryLine('Blue book')).toEqual({ ok: false, reason: 'too-short' })
  })

  it('rejects a paragraph pretending to be a line', () => {
    expect(checkMemoryLine('She was late. The train stopped. A long day.')).toEqual({
      ok: false,
      reason: 'too-many-sentences',
    })
  })

  it('does not mistake an apostrophe for the end of a sentence', () => {
    // "Sister's" would otherwise read as a sentence break and cost the good
    // line its place.
    expect(checkMemoryLine('Sister\'s birthday is Thursday.').ok).toBe(true)
  })

  it('rejects markup, stage directions and lists', () => {
    for (const line of [
      '*She looked at the shelf again.*',
      '- Still looking for the blue one',
      'She was late.\nHe was earlier.',
      '# Memory',
      'Still looking for the [blue] one.',
    ]) {
      expect(checkMemoryLine(line), line).toMatchObject({ ok: false })
    }
  })

  it('strips the quotes a model wraps around a line it was told to return bare', () => {
    expect(memoryLineFrom('"The train was twenty minutes late again."'))
      .toBe('The train was twenty minutes late again.')
    expect(memoryLineFrom('“The train was twenty minutes late again.”'))
      .toBe('The train was twenty minutes late again.')
  })

  it('treats every way a model declines as nothing to say', () => {
    for (const raw of ['', '   ', 'none', 'N/A', 'null', 'nothing', '-', undefined, null, 42, {}]) {
      expect(memoryLineFrom(raw), String(raw)).toBeNull()
    }
  })

  it('collapses whitespace rather than rejecting on it', () => {
    expect(memoryLineFrom('The  train   was late again.')).toBe('The train was late again.')
  })
})
