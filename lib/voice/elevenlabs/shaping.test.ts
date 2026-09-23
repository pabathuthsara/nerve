/**
 * What the pipeline holds her line to between the writer and the synthesiser
 * (PERSONA-REALISM-REPORT R3, R4, R7). Each rule is one the writer is TOLD and
 * this enforces, so each test is a case where the writer ignored it.
 */

import { describe, expect, it } from 'vitest'
import { DEAD_END_OVERRUN, deadEndReply, enforceDeliveryTags, withoutParticle } from './shaping'
import { capToBudget } from './truncate'

describe('enforceDeliveryTags — R3', () => {
  it('lets a laugh through only on a turn the session permitted, and only warm', () => {
    expect(enforceDeliveryTags('[laughs] A terrible one.', { warmth: 60, laughAllowed: true }))
      .toEqual({ text: '[laughs] A terrible one.', laughed: true })
    // Not permitted: the laugh goes, the line stays.
    expect(enforceDeliveryTags('[laughs] A terrible one.', { warmth: 60 }))
      .toEqual({ text: 'A terrible one.', laughed: false })
    // Permitted but cold: a stranger who wants you gone does not laugh.
    expect(enforceDeliveryTags('[laughs] Right.', { warmth: 15, laughAllowed: true }))
      .toEqual({ text: 'Right.', laughed: false })
  })

  it('normalises every spelling of a laugh the writer might produce', () => {
    for (const tag of ['[chuckles]', '[Laughing]', '[laughs softly]', '[giggles]']) {
      expect(enforceDeliveryTags(`${tag} Okay.`, { warmth: 70, laughAllowed: true }).text).toBe('[laughs] Okay.')
    }
  })

  it('allows the breath and the lean-in when warm and only a sigh when cold', () => {
    expect(enforceDeliveryTags('[exhales] Long day.', { warmth: 70 }).text).toBe('[exhales] Long day.')
    expect(enforceDeliveryTags('[curious] Which one?', { warmth: 70 }).text).toBe('[curious] Which one?')
    expect(enforceDeliveryTags('[exhales] Long day.', { warmth: 25 }).text).toBe('Long day.')
    expect(enforceDeliveryTags('[sighs] Fine.', { warmth: 25 }).text).toBe('[sighs] Fine.')
  })

  it('keeps her own delivery vocabulary and drops anything theatrical', () => {
    expect(enforceDeliveryTags('[dry] Sure.', { warmth: 30 }).text).toBe('[dry] Sure.')
    expect(enforceDeliveryTags('[whispers seductively] Hi.', { warmth: 90 }).text).toBe('Hi.')
  })

  it('never ships a tag in the middle of a line', () => {
    expect(enforceDeliveryTags('Oh. [laughs] That is good.', { warmth: 70, laughAllowed: true }))
      .toEqual({ text: 'Oh. That is good.', laughed: false })
  })
})

describe('deadEndReply — R7', () => {
  const replies = ['Mm.', 'Yeah.', 'Huh.']
  const pick = () => 0.5

  it('replaces the three rescues measured on 18 September', () => {
    for (const rescue of [
      "I'm just trying to find one painting I like here.",
      "There's a lot of stuff here I don't get.",
      "Sometimes I think art's just stuff people hang up.",
    ]) {
      expect(deadEndReply(rescue, { wordCap: 2, microReplies: replies, pick })).toBe('Yeah.')
    }
  })

  it('leaves a grunt with a word of colour alone', () => {
    expect(deadEndReply('Mm, maybe not.', { wordCap: 2, microReplies: replies, pick })).toBeNull()
    expect(deadEndReply('Not really.', { wordCap: 2, microReplies: replies, pick })).toBeNull()
    expect(2 * DEAD_END_OVERRUN).toBe(4)
  })

  it('does nothing for a character with no micro-replies authored', () => {
    expect(deadEndReply('A long rescuing sentence about the room.', { wordCap: 2, microReplies: undefined, pick })).toBeNull()
  })

  it('picks deterministically from the seed', () => {
    const line = 'A long rescuing sentence about the room here.'
    expect(deadEndReply(line, { wordCap: 2, microReplies: replies, pick: () => 0 })).toBe('Mm.')
    expect(deadEndReply(line, { wordCap: 2, microReplies: replies, pick: () => 0.99 })).toBe('Huh.')
  })
})

describe('withoutParticle — R4', () => {
  it('takes the writer\'s own copy of the particle off the front', () => {
    expect(withoutParticle('Mm, maybe. Not sure.', 'Mm.')).toBe('Maybe. Not sure.')
    expect(withoutParticle('Mmm. Twice, actually.', 'Mm.')).toBe('Twice, actually.')
    expect(withoutParticle('Well, no.', 'Well…')).toBe('No.')
    expect(withoutParticle('[sighs] Hm, fine.', 'Hm.')).toBe('[sighs] Fine.')
  })

  it('never deletes the whole line, and never eats a word that merely starts the same', () => {
    expect(withoutParticle('Mm.', 'Mm.')).toBe('Mm.')
    expect(withoutParticle('Ohio, originally.', 'Oh.')).toBe('Ohio, originally.')
    expect(withoutParticle('Yeah, twice.', 'Mm.')).toBe('Yeah, twice.')
    expect(withoutParticle('Anything at all.', null)).toBe('Anything at all.')
  })
})

describe('capToBudget — R1, the leading unit', () => {
  it('ships a name and the sentence after it at a one-sentence band', () => {
    expect(capToBudget('Nadia. Nice to meet you.', 10, { sentences: 1, freeLead: true })).toBe('Nadia. Nice to meet you.')
    expect(capToBudget('Thanks. I read a lot of these.', 10, { sentences: 1, freeLead: true })).toBe('Thanks. I read a lot of these.')
  })

  it('still stops at two units, because only the first is ever free', () => {
    expect(capToBudget('Yeah. Crime, mostly. Some non-fiction.', 10, { sentences: 1, freeLead: true }))
      .toBe('Yeah. Crime, mostly.')
  })

  it('still spends the word ceiling, which is the real bound', () => {
    expect(capToBudget('Yeah. I only really come in here on Saturdays after lunch.', 6, { sentences: 1, freeLead: true }))
      .toBe('Yeah.')
  })

  it('is exactly the old rule without the option, which the texting arm relies on', () => {
    expect(capToBudget('Nadia. Nice to meet you.', 10, { sentences: 1 })).toBe('Nadia.')
    expect(capToBudget('Marketing. Sounds busy, yeah.', 20, { sentences: 1 })).toBe('Marketing.')
  })

  it('does not free a real first clause', () => {
    expect(capToBudget('Nice to meet you. I am Nadia.', 12, { sentences: 1, freeLead: true })).toBe('Nice to meet you.')
  })
})
