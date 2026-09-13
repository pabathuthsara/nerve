import { describe, expect, it } from 'vitest'
import { assertTextingPremise, assertTextingScene, MAX_SCENE_WORDS } from './scene'

const OK_SCENE = 'Wednesday evening at home, telly on, ignoring a basket of washing.'
const OK_PREMISE = 'You met at a friend of a friend’s birthday a couple of weeks ago and swapped numbers.'

describe('an ordinary evening passes', () => {
  for (const scene of [
    OK_SCENE,
    'Thursday night at her flat, half way through a puzzle and a cold cup of tea.',
    'Friday at her sister’s, half in the conversation in the room, phone in her hand.',
    'Sunday evening at home with a manuscript she is behind on and a glass of wine.',
    'On the sofa with a book, two chapters from the end.',
  ]) {
    it(JSON.stringify(scene.slice(0, 36)), () => {
      expect(() => assertTextingScene('x', scene)).not.toThrow()
    })
  }
})

describe('the companion-app framings are refused', () => {
  const refused: [string, string][] = [
    ['undress', 'At home in her underwear, waiting for the evening to start.'],
    ['in bed', 'Lying in her bed on a Tuesday night with the lights off.'],
    ['sexual availability', 'At home on a Friday and in a very flirty mood.'],
    ['a relationship', 'At home waiting for your girlfriend to text her back.'],
    ['waiting for him', 'On the sofa, waiting for your message all evening.'],
    ['missing him', 'At home on a Sunday and she misses you already.'],
    ['unlimited availability', 'At home and always free to talk, whenever you want.'],
    ['lonely and needing him', 'At home, lonely and hoping to hear from somebody tonight.'],
    ['settling it in advance', 'At her flat on a Thursday. She is into you already.'],
  ]
  for (const [why, scene] of refused) {
    it(`refuses ${why}`, () => {
      expect(() => assertTextingScene('x', scene)).toThrow(/Refused/)
    })
  }

  it('refuses an empty evening', () => {
    expect(() => assertTextingScene('x', '   ')).toThrow(/evening of her own/)
  })

  it('refuses a scene too long to read on a card', () => {
    expect(() => assertTextingScene('x', 'word '.repeat(MAX_SCENE_WORDS + 1))).toThrow(/longer than/)
  })
})

describe('a bed with an ordinary reason is not a bedroom scene', () => {
  it('allows reading in bed', () => {
    expect(() => assertTextingScene('x', 'Sunday night, in bed with a book she is nearly finished with.')).not.toThrow()
  })
})

describe('the premise guard refuses a relationship, not a vocabulary', () => {
  /**
   * BOTH DIRECTIONS ARE PINNED, and the false positives are the reason.
   *
   * The first version of this guard was a bare word list and it refused two of
   * the four authored premises on the day they were written — "a **couple** of
   * weeks ago" and "seated **together** at a wedding". A guard with false
   * positives is a guard somebody eventually deletes.
   */
  const allowed = [
    OK_PREMISE,
    'You were seated together at a wedding in the spring and swapped numbers.',
    'She cut your hair, you talked the whole appointment, and she wrote her number down.',
    'You met a couple of times at the same five-a-side and she gave you her number.',
    'You matched on a dating app and moved to texting almost immediately.',
  ]
  for (const premise of allowed) {
    it(`allows ${JSON.stringify(premise.slice(0, 34))}`, () => {
      expect(() => assertTextingPremise('x', premise)).not.toThrow()
    })
  }

  const refused: [string, string][] = [
    ['they are a couple', 'You have been a couple since the spring.'],
    ['they are together', 'You two have been together for about a month now.'],
    ['they are dating', 'You have been dating since you met at the wedding.'],
    ['seeing each other', 'You have been seeing each other for a few weeks.'],
    ['in a relationship', 'You are in a relationship and text every evening.'],
    ['named as his partner', 'She is your girlfriend and you text most nights.'],
  ]
  for (const [why, premise] of refused) {
    it(`refuses ${why}`, () => {
      expect(() => assertTextingPremise('x', premise)).toThrow(/Refused/)
    })
  }

  it('refuses a missing premise', () => {
    expect(() => assertTextingPremise('x', '')).toThrow(/how he has her number/)
  })
})
