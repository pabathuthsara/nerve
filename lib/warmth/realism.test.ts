/**
 * PERSONA-REALISM-REPORT, the parts that live in the warmth session and the
 * pure rules beside it: R3 (laughter), R4 (particles), R7 (dead ends), R8
 * (mishearings), W4a (no number after contempt), W4b (the boundary exit), and
 * the persona v2 steering (styles, the disclosure ladder, the agenda yielding).
 *
 * Each block is one behaviour a listener would notice, asserted end to end
 * through `WarmthSession` where it can be, because the rules compose there.
 */

import { describe, expect, it } from 'vitest'
import { maya, nadia, robin, tess } from '@/lib/personas'
import type { Persona, TranscriptTurn } from '@/lib/voice/types'
import type { SlowScore, SlowScorer } from './slow'
import { LAUGH_SPACING, WarmthSession } from './session'
import { PARTICLE_SPACING, PARTICLES_BY_BAND, particleFor, type ParticleContext } from './particles'
import { classifyUserTurn, isMisheard } from './turn-kind'
import { mayStaySilentFor, SECOND_DEAD_END } from './reciprocity'
import { composeSteering, disclosureFor, wantClauses } from './steering'
import { scoreFast } from './fast'
import { CONTEMPT_WINDOW_MS, beatsForRep, givesNumber } from '@/lib/data/rep-rules'
import { compileInstructions } from '@/lib/voice/openai/persona'
import { seededRandom } from '@/lib/voice/seed'

const user = (text: string, at: number): TranscriptTurn => ({ speaker: 'user', text, t_start: at, t_end: at + 1 })
const agent = (text: string, at: number): TranscriptTurn => ({ speaker: 'agent', text, t_start: at + 1.5, t_end: at + 3 })

/** A session held at a fixed warmth by a flat trajectory, so gates are exact. */
function heldAt(persona: Persona, warmth: number, options: { scorer?: SlowScorer | null; clock?: () => number } = {}) {
  const trajectory = { ...persona.trajectory, start: warmth, startJitter: 0, gain: 0, decay: 0, decayPerTurn: 0 }
  return new WarmthSession({
    persona: { ...persona, trajectory },
    trajectory,
    scorer: options.scorer ?? null,
    nowSeconds: options.clock ?? (() => 0),
    rng: () => 0.1,
  })
}

describe('R3 — she laughs, rarely, and only where she may', () => {
  it('opens the laugh at her own threshold and never on his opener', () => {
    const session = heldAt(nadia, 70)
    session.onUserTurn(user('Hey there.', 1))
    expect(session.decideExpression().laughAllowed).toBe(false)
    session.onAgentTurn(agent('Hey.', 1))
    session.onUserTurn(user('I only read the last page of a book first, so I know who did it.', 5))
    expect(session.decideExpression().laughAllowed).toBe(true)
    expect(session.directive()).toContain('you may open with [laughs]')
    session.dispose()
  })

  it('never offers it twice running, and spaces actual laughs one in four', () => {
    const session = heldAt(nadia, 70)
    const decisions: boolean[] = []
    let at = 0
    for (let i = 0; i < 12; i += 1) {
      at += 5
      session.onUserTurn(user('Honestly I only buy books for the covers, it is a problem.', at))
      const { laughAllowed } = session.decideExpression()
      decisions.push(laughAllowed)
      // She takes every offer. The spacing must hold anyway.
      if (laughAllowed) session.noteExpression({ laughed: true })
      session.onAgentTurn(agent('Ha. Same.', at))
    }
    for (let i = 1; i < decisions.length; i += 1) {
      expect(decisions[i] && decisions[i - 1], `turn ${i}`).toBe(false)
    }
    const laughs = decisions.map((d, i) => (d ? i : -1)).filter((i) => i >= 0)
    for (let i = 1; i < laughs.length; i += 1) expect(laughs[i]! - laughs[i - 1]!).toBeGreaterThanOrEqual(LAUGH_SPACING)
    session.dispose()
  })

  it('never offers it cold, on a dead end, or to an interviewer', () => {
    const cold = heldAt(nadia, 30)
    cold.onUserTurn(user('Hey.', 1)); cold.onAgentTurn(agent('Hey.', 1))
    cold.onUserTurn(user('That cat is judging both of us, I think.', 5))
    expect(cold.decideExpression().laughAllowed).toBe(false)
    const grunt = heldAt(nadia, 70)
    grunt.onUserTurn(user('Hey.', 1)); grunt.onAgentTurn(agent('Hey.', 1))
    grunt.onUserTurn(user('Ok.', 5))
    expect(grunt.decideExpression().laughAllowed).toBe(false)
    // Robin's laugh is hers to earn: 64, not 50.
    const robinAt = heldAt(robin, 60)
    robinAt.onUserTurn(user('Hey.', 1)); robinAt.onAgentTurn(agent('Hello.', 1))
    robinAt.onUserTurn(user('I think the lobby piano only knows one song and it is proud of it.', 5))
    expect(robinAt.decideExpression().laughAllowed).toBe(false)
  })
})

describe('R4 — a particle in front of some of her replies', () => {
  const eligible: ParticleContext = {
    warmth: 45, turnsSinceParticle: Number.POSITIVE_INFINITY, firstExchange: false, closing: false,
    deadEnd: false, unclear: false, mayAsk: false, silent: false,
  }

  it('picks the sound the band makes', () => {
    expect(particleFor({ ...eligible, warmth: 70 }, () => 0)?.id).toBe(PARTICLES_BY_BAND.ENGAGED[0])
    expect(particleFor({ ...eligible, warmth: 25 }, () => 0)?.text).toMatch(/Hm|Well/)
    expect(particleFor({ ...eligible, warmth: -5 }, () => 0)).toBeNull()
  })

  it('refuses every turn the rules name', () => {
    for (const refusal of [
      { firstExchange: true }, { closing: true }, { deadEnd: true }, { unclear: true },
      { mayAsk: true }, { silent: true }, { turnsSinceParticle: PARTICLE_SPACING - 1 },
    ]) {
      expect(particleFor({ ...eligible, ...refusal }, () => 0), JSON.stringify(refusal)).toBeNull()
    }
  })

  it('fills only some eligible turns, so it is never a metronome', () => {
    expect(particleFor(eligible, () => 0.9)).toBeNull()
    expect(particleFor(eligible, () => 0.2)).not.toBeNull()
  })

  it('never lands on two replies running, through the session', () => {
    const session = heldAt(nadia, 45)
    let at = 0
    const got: boolean[] = []
    for (let i = 0; i < 10; i += 1) {
      at += 5
      session.onUserTurn(user(i === 0 ? 'Hey.' : 'I read mostly on the train, it is the only quiet part of my day.', at))
      got.push(session.decideExpression().particle !== null)
      session.onAgentTurn(agent('Mm, I get that.', at))
    }
    for (let i = 1; i < got.length; i += 1) expect(got[i] && got[i - 1], `turn ${i}`).toBe(false)
    expect(got.some(Boolean)).toBe(true)
    session.dispose()
  })
})

describe('R7 — the second dead end at OPEN may be answered with nothing', () => {
  const grunt = { words: 1, askedQuestion: false, disclosed: false, deadEnd: true }

  it('allows silence at OPEN on the second in a row and not the first', () => {
    expect(mayStaySilentFor(45, grunt, { consecutiveDeadEnds: 1 })).toBe(false)
    expect(mayStaySilentFor(45, grunt, { consecutiveDeadEnds: SECOND_DEAD_END })).toBe(true)
    // Never twice running, whatever the count.
    expect(mayStaySilentFor(45, grunt, { consecutiveDeadEnds: 3, silentLastTurn: true })).toBe(false)
    // ENGAGED and up are untouched.
    expect(mayStaySilentFor(65, grunt, { consecutiveDeadEnds: 3 })).toBe(false)
  })

  it('reaches Cass at OPEN through the session, which is where she lives', () => {
    const session = heldAt(tess, 50)
    session.onUserTurn(user('Hey.', 1)); session.noteSilence(session.staysSilent); session.onAgentTurn(agent('Hey.', 1))
    session.onUserTurn(user('Okay.', 5))
    expect(session.staysSilent).toBe(false)
    session.noteSilence(false); session.onAgentTurn(agent('Mm.', 5))
    session.onUserTurn(user('Ok.', 9))
    expect(session.staysSilent).toBe(true)
    session.dispose()
  })

  it('turns her attention back to her own afternoon instead of voicing her agenda', () => {
    const line = composeSteering({ persona: tess, warmth: 50, his: grunt })
    expect(line).toContain('Your attention goes back to the painting in front of you.')
    expect(line).not.toContain('You would still rather be')
  })
})

describe('R8 — a mishearing is asked about, never answered in kind', () => {
  it('reads other scripts and short foreign function words as misheard', () => {
    expect(isMisheard('Hej der.')).toBe(true)
    expect(isMisheard('음.')).toBe(true)
    expect(isMisheard('อืม')).toBe(true)
    expect(isMisheard('Hey there.')).toBe(false)
    expect(isMisheard('Ja, why, you don\'t like Dexter?')).toBe(false)
    expect(isMisheard('I had a croissant.')).toBe(false)
  })

  it('only for spoken turns — a typed message is what was typed', () => {
    expect(classifyUserTurn('Hej der.', { spoken: true })).toBe('unclear')
    expect(classifyUserTurn('Hej der.')).not.toBe('unclear')
  })

  it('scores nothing and asks him to say it again', () => {
    const score = scoreFast(user('Hej der.', 5), { level: 2, agentTurns: [], precedingDeadEnds: 0, gapSeconds: 1, spoken: true })
    expect(score).toMatchObject({ raw: 0, reasons: [], deadEnd: false, kind: 'unclear' })
    const session = heldAt(nadia, 45)
    session.onUserTurn(user('Hey.', 1)); session.onAgentTurn(agent('Hey.', 1))
    session.onUserTurn(user('Hej der.', 5))
    expect(session.directive()).toContain('You did not catch what he said.')
    expect(session.replyWordCap).toBeLessThanOrEqual(4)
    expect(session.engine.warmth).toBe(45)
    session.dispose()
  })
})

describe('W4a — no number after contempt', () => {
  it('takes the number away inside the window and gives it back after', () => {
    expect(givesNumber({ armed: true, warmth: 70, interview: false, contemptRecently: true })).toBe(false)
    expect(givesNumber({ armed: true, warmth: 70, interview: false, contemptRecently: false })).toBe(true)
    expect(CONTEMPT_WINDOW_MS).toBe(45_000)
  })

  it('remembers contempt on the session clock', () => {
    let now = 100
    const session = heldAt(tess, 70, { clock: () => now })
    session.onUserTurn(user('Hey.', 1)); session.onAgentTurn(agent('Hey.', 1))
    session.onUserTurn(user('You are so boring, honestly.', 5))
    expect(session.contemptWithin(CONTEMPT_WINDOW_MS)).toBe(true)
    now = 150
    expect(session.contemptWithin(CONTEMPT_WINDOW_MS)).toBe(false)
    session.dispose()
  })
})

describe('W4b — a boundary is where she goes', () => {
  it('commits her exit and takes the number off the table', async () => {
    const judge: SlowScorer = {
      score: async (): Promise<SlowScore> => ({ intimacy: 95, intent: -2, quote: 'your place', reason: 'invasive' }),
    }
    const session = heldAt(nadia, 30, { scorer: judge })
    session.onUserTurn(user('Hey.', 1)); session.onAgentTurn(agent('Hey.', 1))
    session.onUserTurn(user('Want to come back to my place tonight and see my bed?', 5))
    session.onAgentTurn(agent('No.', 5))
    await session.finalise(500)
    expect(session.boundaryCrossed).toBe(true)
    expect(session.sceneExit).toBe('wrapping')
    expect(session.directive()).toContain('You are done with this.')
    session.onUserTurn(user('Come on.', 9))
    session.onAgentTurn(agent('Bye.', 9))
    expect(session.shouldEndScene).toBe(true)
    session.dispose()
  })
})

describe('persona v2 — what she has to give', () => {
  it('climbs the disclosure ladder with the band, and never early', () => {
    expect(disclosureFor(nadia, 35)).toBeNull()
    expect(disclosureFor(nadia, 45)).toContain('grocery chain')
    expect(disclosureFor(nadia, 65)).toContain('sister')
    expect(disclosureFor(nadia, 85)).toContain('mystery')
    // The deepest thing she has is not in her prompt until she is there.
    const opened = composeSteering({ persona: nadia, warmth: 45 })
    expect(opened).not.toContain('mystery')
  })

  it('gives each gate her author\'s style', () => {
    expect(composeSteering({ persona: nadia, warmth: 56 })).toContain('the way you do:')
    expect(composeSteering({ persona: maya, warmth: 70 })).toContain('the way you do:')
  })

  it('lets her agenda yield once she is invested, and only then', () => {
    expect(wantClauses(robin, 85)).toEqual(['The car can wait a minute.'])
    expect(wantClauses(robin, 70)[0]).toContain('You would rather be in the car on your way to the airport.')
    expect(wantClauses(robin, 30)[0]).toContain('You would still rather be')
  })
})

describe('R9 — two beats a rep, one of them an opener', () => {
  it('draws one opener and one other, in time order', () => {
    const beats = beatsForRep(tess.sceneBeats, () => 0)!
    expect(beats).toHaveLength(2)
    expect(beats.filter((beat) => beat.opener)).toHaveLength(1)
    expect(beats[0]!.at).toBeLessThanOrEqual(beats[1]!.at)
    const other = beatsForRep(tess.sceneBeats, () => 0.99)!
    expect(other).not.toEqual(beats)
  })

  it('leaves a character with two beats exactly as authored', () => {
    const two = [{ at: 0.3, direction: '(a)' }, { at: 0.6, direction: '(b)' }]
    expect(beatsForRep(two, () => 0.5)).toEqual(two)
    expect(beatsForRep(undefined, () => 0.5)).toBeUndefined()
  })
})

describe('what the first auditions of 23 September found', () => {
  it('answers an opener with something in it as an opener, not as a hello', () => {
    const session = heldAt(tess, 50)
    session.onUserTurn(user('This stuff, um, looks complicated.', 1))
    expect(session.directive()).not.toContain('He has only said hello.')
    const hello = heldAt(tess, 50)
    hello.onUserTurn(user('Hey there.', 1))
    expect(hello.directive()).toContain('He has only said hello.')
  })

  it('withholds the name gate until he has actually said his name', () => {
    // A character whose name gate is the newest open, so it would rank first.
    const named: Persona = { ...nadia, gated: { ...nadia.gated, usesYourName: { unlocksAt: 60 } }, expressiveGates: {} }
    const session = heldAt(named, 70)
    session.onUserTurn(user('Hey.', 1)); session.onAgentTurn(agent('Hey.', 1))
    session.onUserTurn(user('I think the second one was better, honestly, for what it is worth.', 5))
    expect(session.directive()).not.toContain('his name')
    session.onAgentTurn(agent('Hm. Maybe.', 5))
    session.onUserTurn(user('I am Alex, by the way, and I stand by that opinion.', 9))
    expect(session.directive()).toContain('You may use his name')
  })

  it('labels the few-shot lines as somebody else, so nothing in them happened with him', () => {
    const prompt = compileInstructions(nadia, { canEndScene: false, rng: seededRandom('x') })
    expect(prompt).toContain('SOMEONE ELSE: ')
    expect(prompt).not.toContain('\nHIM: ')
    expect(prompt).toContain('Nothing in them happened with him')
  })
})
