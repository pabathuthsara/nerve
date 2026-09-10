/**
 * Session wiring tests.
 *
 * The property that matters most here is negative: the slow scorer must never
 * be able to delay a turn. That is asserted structurally — onUserTurn returns
 * with a scorer that never resolves at all.
 */

import { describe, expect, it, vi } from 'vitest'

import { WarmthSession } from './session'
import { nadia as nadiaPersona } from '@/lib/personas/nadia'
import type { SlowScore, SlowScorer } from './slow'
import { nadia } from '@/lib/personas/nadia'
import { alex } from '@/lib/personas/alex'
import type { TranscriptTurn } from '@/lib/voice/types'
import { wordCapFor } from './bands'
import { temperamentOf } from './temperament'

const L1 = { ...nadiaPersona.trajectory, startJitter: 0 }

function userTurn(text: string, tStart = 0, tEnd = 4): TranscriptTurn {
  return { speaker: 'user', text, t_start: tStart, t_end: tEnd }
}
function agentTurn(text: string, tStart = 0, tEnd = 2): TranscriptTurn {
  return { speaker: 'agent', text, t_start: tStart, t_end: tEnd }
}

/** A scorer whose resolution the test controls. */
function deferredScorer() {
  let resolve: (score: SlowScore | null) => void = () => {}
  const calls: number[] = []
  const scorer: SlowScorer = {
    score: vi.fn((_request, signal: AbortSignal) => {
      calls.push(Date.now())
      return new Promise<SlowScore | null>((res) => {
        resolve = res
        signal.addEventListener('abort', () => res(null))
      })
    }),
  }
  return { scorer, resolve: (s: SlowScore | null) => resolve(s), calls }
}

/** Drains pending microtasks so a resolved score has actually been applied. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function makeSession(scorer: SlowScorer | null, nowSeconds = () => 100) {
  return new WarmthSession({ persona: nadia, trajectory: L1, scorer, nowSeconds })
}

describe('WarmthSession', () => {
  it('never waits for the slow scorer', () => {
    // A scorer that resolves never. If onUserTurn awaited it, this test hangs.
    const scorer: SlowScorer = { score: () => new Promise(() => {}) }
    const session = makeSession(scorer)

    for (let i = 1; i <= 3; i += 1) {
      const score = session.onUserTurn(userTurn('What are you reading there', i * 10, i * 10 + 4))
      expect(score.raw).toBeGreaterThan(0)
    }
    // Fast layer has already moved the meter while the model is still thinking.
    expect(session.engine.warmth).toBeGreaterThan(L1.start)
  })

  it('waits for her reply before scoring, because it judges the pair (§2b)', () => {
    const { scorer } = deferredScorer()
    const session = makeSession(scorer)
    session.onUserTurn(userTurn('Can I get your number and take you for a drink', 10, 14))
    // Triggered, but nothing sent — her answer is half the evidence.
    expect(scorer.score).not.toHaveBeenCalled()

    session.onAgentTurn(agentTurn('Ha. No.', 15, 17))
    expect(scorer.score).toHaveBeenCalledTimes(1)
    const request = (scorer.score as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(request.userText).toContain('your number')
    expect(request.agentReply).toBe('Ha. No.')
  })

  it('scores a boundary turn immediately, not on the sampling schedule (§2a)', () => {
    // Round 6 missed "get down my number and we could arrange a date" entirely
    // because it fell between third turns.
    const { scorer } = deferredScorer()
    const session = makeSession(scorer)
    session.onUserTurn(userTurn('maybe you should get down my number and we could arrange a date sometime', 10, 16))
    session.onAgentTurn(agentTurn('Mm. No thanks.', 17, 19))
    expect(scorer.score).toHaveBeenCalledTimes(1)
  })

  it('still samples a flat conversation on the baseline floor', () => {
    const { scorer } = deferredScorer()
    const session = makeSession(scorer)
    for (let i = 1; i <= 3; i += 1) {
      session.onUserTurn(userTurn('Yeah okay sure then', i * 10, i * 10 + 3))
      session.onAgentTurn(agentTurn('Mm.', i * 10 + 4, i * 10 + 5))
    }
    expect(scorer.score).toHaveBeenCalledTimes(1) // turn 3, baseline
  })

  it('never loses a triggered turn she did not answer', () => {
    const { scorer } = deferredScorer()
    const session = makeSession(scorer)
    session.onUserTurn(userTurn('Are you single by any chance', 10, 13))
    // He talks over her; she never replies.
    session.onUserTurn(userTurn('Sorry, I mean, are you here alone', 14, 18))
    expect(scorer.score).toHaveBeenCalledTimes(1)
    const request = (scorer.score as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(request.agentReply).toBeNull()
  })

  it('judges a turn against warmth as it stood when the turn was spoken', async () => {
    const { scorer, resolve } = deferredScorer()
    const session = makeSession(scorer)

    // Three turns to trigger a slow score. Warmth at that moment is the snapshot.
    for (let i = 1; i <= 3; i += 1) {
      session.onUserTurn(userTurn('Yeah.', i * 10, i * 10 + 1))
      session.onAgentTurn(agentTurn('Mm.', i * 10 + 2, i * 10 + 3))
    }
    const warmthAtTurn = session.engine.warmth
    expect(warmthAtTurn).toBeLessThan(L1.start)

    // Meanwhile the meter moves on.
    for (let i = 4; i <= 5; i += 1) {
      session.onUserTurn(userTurn('What made you pick that one then', i * 10, i * 10 + 4))
      session.onAgentTurn(agentTurn('Long story.', i * 10 + 5, i * 10 + 6))
    }
    expect(session.engine.warmth).toBeGreaterThan(warmthAtTurn)

    // Intimacy 70 against the *snapshot* is a boundary violation; against
    // current warmth it might not have been.
    resolve({ intent: 0, intimacy: warmthAtTurn + 40, quote: '', reason: 'forward' })
    await flush()

    const overreach = session.engine.events.find((e) => e.source === 'overreach')
    expect(overreach).toBeDefined()
    expect(overreach?.intimacy).toBe(warmthAtTurn + 40)
  })

  it('drops a slow score that has not landed by the time the next is due', async () => {
    const { scorer } = deferredScorer()
    const session = makeSession(scorer)
    for (let i = 1; i <= 6; i += 1) {
      session.onUserTurn(userTurn('Can I get your number for a coffee sometime', i * 10, i * 10 + 4))
      session.onAgentTurn(agentTurn('No.', i * 10 + 5, i * 10 + 6))
    }
    await flush()
    expect(session.telemetry(60).asyncScoreLatencyMs.skipped).toBeGreaterThanOrEqual(1)
  })

  it('counts an unusable model response as skipped, not as a zero', async () => {
    const { scorer, resolve } = deferredScorer()
    const session = makeSession(scorer)
    session.onUserTurn(userTurn('Can I get your number for a coffee sometime', 10, 14))
    session.onAgentTurn(agentTurn('No.', 15, 16))
    const before = session.engine.warmth
    resolve(null)
    await flush()
    expect(session.engine.warmth).toBe(before)
    expect(session.telemetry(60).asyncScoreLatencyMs.skipped).toBe(1)
  })

  it('runs the fast layer with no scorer at all', () => {
    const session = makeSession(null)
    session.onUserTurn(userTurn('What are you reading there', 10, 14))
    expect(session.engine.warmth).toBeGreaterThan(L1.start)
    expect(session.telemetry(30).asyncScoreLatencyMs.skipped).toBe(0)
  })

  it('detects a callback only once she has actually said something', () => {
    const session = makeSession(null)
    const before = session.engine.warmth
    session.onAgentTurn(agentTurn('Re-reading a Tana French. Third time.', 0, 3))
    session.onUserTurn(userTurn('Which French is that then', 10, 13))
    const gained = session.engine.warmth - before
    // open question +3, callback +2, scaled by gain and falloff, less decay.
    expect(gained).toBeGreaterThan(0)
    expect(gained).toBeLessThan(L1.maxGainPerTurn)
  })

  it('tracks dead-end streaks across turns, at what this character charges', () => {
    const session = makeSession(null)
    // A real opener first: his FIRST turn is never a dead end however short it
    // is, because nothing has been asked yet (`scoreFast`). Three grunts after
    // it is the streak this asserts.
    session.onUserTurn(userTurn('I have been meaning to read that one for a year', 5, 9))
    for (let i = 1; i <= 3; i += 1) session.onUserTurn(userTurn('Yeah.', i * 10, i * 10 + 1))
    // The streak penalty rides on top of the reply's own: -6 and -8. It starts
    // on the SECOND consecutive dead end rather than the third, because three
    // in a row is already her exit condition — a penalty that waited for it
    // arrived on the turn she was leaving anyway.
    //
    // Charged at HER patience, which is the point of the temperament layer and
    // not a softening of the rule — our user is nervous by definition and short
    // replies are the symptom the product exists to treat, so whether the
    // character gets colder or gentler when he stalls has to be a property of
    // the character. Read off the dial rather than written out, because a
    // retune of `patience` must not be able to make this test a liar; the
    // companion test below is the one that asserts the ordering.
    const last = session.engine.events[session.engine.events.length - 1]
    // One decimal: `WarmthEvent` rounds what it reports, and this is an
    // assertion about the multiplier, not about the rounding.
    expect(last?.rawDelta).toBeCloseTo(-14 * temperamentOf(nadia.personality).penalty, 1)
  })

  it('charges an impatient character more for the same three dead ends', () => {
    const patient = makeSession(null)
    const impatient = new WarmthSession({
      persona: alex,
      trajectory: alex.trajectory,
      scorer: null,
      nowSeconds: () => 0,
      rng: () => 0.5,
    })
    for (let i = 1; i <= 3; i += 1) {
      patient.onUserTurn(userTurn('Yeah.', i * 10, i * 10 + 1))
      impatient.onUserTurn(userTurn('Yeah.', i * 10, i * 10 + 1))
    }
    const softer = patient.engine.events[patient.engine.events.length - 1]?.rawDelta ?? 0
    const harder = impatient.engine.events[impatient.engine.events.length - 1]?.rawDelta ?? 0
    expect(harder).toBeLessThan(softer)
  })

  it('hands out a directive that names a band and no number', () => {
    const session = makeSession(null)
    const directive = session.directive()
    expect(directive.startsWith('[')).toBe(true)
    expect(directive.endsWith(']')).toBe(true)
    expect(directive).not.toMatch(/\d/)
  })

  it('aborts anything in flight when disposed', async () => {
    const { scorer } = deferredScorer()
    const session = makeSession(scorer)
    session.onUserTurn(userTurn('Can I get your number for a coffee sometime', 10, 14))
    session.onAgentTurn(agentTurn('No.', 15, 16))
    const before = session.engine.warmth
    session.dispose()
    await flush()
    expect(session.engine.warmth).toBe(before)
  })
})

describe('reciprocity, at the seams', () => {
  const grunt = (at: number) => userTurn('Mhm.', at, at + 1)
  const opener = (at: number) => userTurn('Sorry, is that the Tana French one', at, at + 4)

  it('never answers his opening line with nothing, however short it is', () => {
    // "Hey there." is two words. It used to score -6 and open the silence gate,
    // so the product's reply to the first sentence a nervous user had ever
    // spoken to a stranger was to dock him and then ignore him.
    const session = makeSession(null)
    const score = session.onUserTurn(userTurn('Hey there.', 4, 5))
    expect(score.deadEnd).toBe(false)
    expect(score.reasons.some((reason) => reason.code === 'dead-end')).toBe(false)
    expect(session.staysSilent).toBe(false)
  })

  it('still calls a two-word ANSWER a dead end, one turn later', () => {
    // The exemption is one turn wide. A grunt in reply to her is the signal the
    // user is here to learn to read, and it keeps costing what it costs.
    const session = makeSession(null)
    session.onUserTurn(opener(5))
    expect(session.onUserTurn(grunt(10)).deadEnd).toBe(true)
  })

  it('gives a real short turn a sentence, and a question the whole band', () => {
    // Two floors, because "I am hungry" and "Mhm." are not the same event, and
    // one two-word floor served both. A question is never mirrored at all: it
    // is short by construction and asking for an answer.
    const session = makeSession(null)
    session.onUserTurn(opener(5))
    session.onUserTurn(userTurn('I am hungry', 10, 12))
    const real = session.replyWordCap
    session.onUserTurn(userTurn('So, how old are you?', 15, 17))
    expect(session.replyWordCap).toBe(wordCapFor(session.engine.warmth))
    expect(real).toBeGreaterThan(Math.ceil(3 * 1.3))
  })

  it('answers a grunt with a two-word ceiling instead of nine', () => {
    // The rep that produced the rule: at warmth 41 she answered three
    // consecutive one-word turns with eight, ten and nine words.
    const session = makeSession(null)
    session.onUserTurn(userTurn('I have been meaning to read that one for a year', 10, 14))
    expect(session.replyWordCap).toBeGreaterThan(8)
    session.onUserTurn(grunt(20))
    expect(session.replyWordCap).toBe(2)
  })

  it('lets her say nothing, but never twice running', () => {
    const session = makeSession(null)
    session.onUserTurn(opener(5))
    expect(session.staysSilent).toBe(false)
    session.onUserTurn(grunt(10))
    expect(session.staysSilent).toBe(true)
    session.noteSilence(true)
    session.onUserTurn(grunt(20))
    expect(session.staysSilent).toBe(false)
  })

  it('never swallows the closing decision', () => {
    // Thirty seconds out she is told one thing and it has to be spoken, even
    // if he has just grunted at her.
    const session = makeSession(null)
    session.onUserTurn(opener(5))
    session.onUserTurn(grunt(10))
    expect(session.staysSilent).toBe(true)
    session.handOverToClosing()
    expect(session.staysSilent).toBe(false)
  })

  it('shuts the question gate on turn one, at every band', () => {
    // A stranger at 28 does not solicit. She opened that rep with "Hey.
    // What's up?" before he had said a word worth answering.
    //
    // Asserted as the property rather than as one sentence: the cold bands
    // forbid questions in their own directive ("Do not ask him anything back")
    // and the warm ones get the explicit clause, because saying it twice reads
    // as emphasis on the wrong thing.
    for (const start of [10, 30, 50, 70, 90]) {
      const session = new WarmthSession({
        persona: nadia, trajectory: { ...L1, start }, scorer: null, nowSeconds: () => 0,
      })
      expect(session.statelessDirective(), `@${start}`).toMatch(/[Dd]o not ask him anything/)
      session.dispose()
    }
  })

  it('opens it again once he has actually given her something', () => {
    const session = new WarmthSession({
      persona: nadia, trajectory: { ...L1, start: 70 }, scorer: null, nowSeconds: () => 0,
    })
    session.onUserTurn(userTurn('I came in for something for my brother, he only reads crime', 10, 15))
    expect(session.statelessDirective()).not.toContain('Do not ask him anything this turn.')
    session.dispose()
  })
})

/**
 * The terminal exchange, and the scene state.
 *
 * `dispose()` is a hard teardown and used to be the only one: it dropped the
 * awaiting turn and aborted the score in flight, so the last turn of every rep
 * went unjudged — the turn where the goodbye, the number and the boundary all
 * live. In the 9 September hostility rep, "Go away." has no stored slow event
 * for exactly that reason.
 */
describe('finalise', () => {
  const turn = (speaker: 'user' | 'agent', text: string, at: number): TranscriptTurn =>
    ({ speaker, text, t_start: at, t_end: at + 1 })

  it('flushes a turn that never got a reply, instead of dropping it', async () => {
    const scored: string[] = []
    const session = new WarmthSession({
      persona: nadia,
      trajectory: { ...nadia.trajectory, startJitter: 0 },
      nowSeconds: () => 0,
      scorer: {
        score: async (request) => {
          scored.push(request.userText)
          return { intimacy: 5, intent: -6, quote: '', reason: '' }
        },
      },
    })
    // A turn that triggers scoring and is never answered — the rep ended.
    session.onUserTurn(turn('user', 'Go away.', 10))
    await session.finalise(50)
    expect(scored).toContain('Go away.')
  })

  it('returns promptly when there is nothing in flight', async () => {
    const session = new WarmthSession({
      persona: nadia,
      trajectory: { ...nadia.trajectory, startJitter: 0 },
      nowSeconds: () => 0,
      scorer: null,
    })
    await session.finalise(50)
    expect(session.sceneExit).toBe('present')
  })
})

describe('the scene state', () => {
  const make = () => new WarmthSession({
    persona: nadia,
    trajectory: { ...nadia.trajectory, startJitter: 0 },
    nowSeconds: () => 0,
    scorer: null,
  })
  const t = (speaker: 'user' | 'agent', text: string, at: number): TranscriptTurn =>
    ({ speaker, text, t_start: at, t_end: at + 1 })

  it('runs on to leaving once she has said her line, when HE ended it', () => {
    const session = make()
    session.onUserTurn(t('user', 'I should get going.', 10))
    expect(session.sceneExit).toBe('wrapping')
    expect(session.shouldEndScene).toBe(false)
    // She gets one line. A character who vanishes mid-conversation is a
    // dropped connection; one who says a last thing and goes is a person.
    session.onAgentTurn(t('agent', 'See you.', 12))
    expect(session.sceneExit).toBe('leaving')
    expect(session.shouldEndScene).toBe(true)
  })

  it('holds the number decision for the rest of the rep, not for one turn', () => {
    // MEASURED, 10 September. She offered her number, he asked for it, and on
    // the very next turn ordinary steering had resumed and the contract's own
    // standing refusal took over: "Not while this is still going... Never
    // promise it for later." She offered and then refused, consecutively, in
    // the one ending the product is built around.
    //
    // `NUMBER_DIRECTIVE` is reinforced once and `closingHandover` stands the
    // band down for that single turn. The DECISION has to outlive both.
    const session = make()
    session.handOverToClosing('number')
    // The hand-over turn itself: the band stands down entirely so the decision
    // arrives on its own. Unchanged.
    expect(session.statelessDirective()).toBe('')
    // Every turn after it still carries the decision.
    for (let turn = 0; turn < 3; turn += 1) {
      const line = session.statelessDirective()
      expect(line, `turn ${turn}`).toContain('offered him your number')
      expect(line, `turn ${turn}`).toContain('Never say the digits out loud')
      expect(line, `turn ${turn}`).not.toContain('not going yet')
    }
  })

  it('does not tell a character who is leaving that she offered anything', () => {
    const session = make()
    session.handOverToClosing('leave')
    session.statelessDirective()
    const line = session.statelessDirective()
    expect(line).toContain('Wind it up and go')
    expect(line).not.toContain('number')
  })

  it('does NOT run on when the CLOCK started the wind-down', () => {
    // The thirty-second hand-over is the moment the product is built around —
    // she offers her number and the rep ends on the timer. Auto-advancing it
    // would cut the rep short at 2:31.
    const session = make()
    session.handOverToClosing()
    expect(session.sceneExit).toBe('wrapping')
    session.onAgentTurn(t('agent', 'Here, take my number.', 12))
    expect(session.sceneExit).toBe('wrapping')
    expect(session.shouldEndScene).toBe(false)
  })

  it('never moves backwards', () => {
    const session = make()
    session.commitExit('leaving')
    session.commitExit('present')
    session.commitExit('wrapping')
    expect(session.sceneExit).toBe('leaving')
  })
})
