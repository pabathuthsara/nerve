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
    for (let i = 1; i <= 3; i += 1) session.onUserTurn(userTurn('Yeah.', i * 10, i * 10 + 1))
    // Third dead end carries the streak penalty on top of its own: -3 and -4.
    //
    // Charged at 0.7x, because this is Nadia and her patience is 80. That is
    // the point of the temperament layer and not a softening of the rule — our
    // user is nervous by definition and short replies are the symptom the
    // product exists to treat, so whether the character gets colder or gentler
    // when he stalls has to be a property of the character. Alex charges 1.25x
    // for the same three turns; see the companion test below.
    const last = session.engine.events[session.engine.events.length - 1]
    expect(last?.rawDelta).toBeCloseTo(-7 * 0.7, 5)
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
