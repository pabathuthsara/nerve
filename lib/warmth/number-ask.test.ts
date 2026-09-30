import { describe, expect, it } from 'vitest'
import { asksForHerNumber } from './number-ask'

describe('asksForHerNumber', () => {
  it('hears the ask in the rep that found the defect', () => {
    expect(asksForHerNumber('So Cass, I have to go. Can I get your number before I go, though?')).toBe(true)
  })

  it('hears the ordinary ways of asking', () => {
    for (const line of [
      'Can I get your number?',
      'could I have your phone number',
      'May I grab your digits?',
      "What's your number?",
      'Give me your number and I will text you.',
      'Want to swap numbers?',
      'Can I text you sometime?',
      'can i get your insta',
      'Would you give me your number?',
    ]) expect(asksForHerNumber(line), line).toBe(true)
  })

  it('does not hear numbers that are not hers', () => {
    for (const line of [
      "What's your favourite number?",
      'I lost my phone number last week.',
      'That is a big number of paintings.',
      'My number is on the card.',
      'Do you text a lot?',
      'I have to go.',
    ]) expect(asksForHerNumber(line), line).toBe(false)
  })
})
