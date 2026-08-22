/**
 * The M0 gate is only as trustworthy as the instruments that measure it. If
 * these are wrong we either re-architect a working system or ship a broken one.
 */

import { describe, expect, it } from 'vitest'
import {
  LATENCY_GATE_MS,
  LatencyMeter,
  latencyVerdict,
  percentile,
} from './latency'
import { analyseCacheHealth } from './cache'
import type { SessionUsage, UsageSample } from '@/lib/voice/types'
import {
  STABILITY_GATE_PER_5MIN,
  StabilityMeter,
  cosineSimilarity,
  detectBreaks,
  stabilityVerdict,
} from './stability'
import { analyseRttDrift } from './transport'
import { BANNED_REGISTER } from '../voice/openai/persona'

describe('percentile', () => {
  it('handles the degenerate cases the gate will actually hit', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([700], 50)).toBe(700)
    expect(percentile([700], 90)).toBe(700)
  })

  it('interpolates rather than picking a neighbour', () => {
    expect(percentile([100, 200, 300, 400], 50)).toBe(250)
    expect(percentile([100, 200, 300, 400, 500], 50)).toBe(300)
  })

  it('does not care about input order', () => {
    expect(percentile([500, 100, 300], 50)).toBe(300)
  })
})

describe('LatencyMeter', () => {
  it('measures from the user stopping to her audio starting', () => {
    const meter = new LatencyMeter(900)
    meter.userSpeechStop(3.0)
    const sample = meter.agentSpeechStart(3.72)
    expect(sample?.responseMs).toBe(720)
    // Perceived adds the silence window we deliberately wait through.
    expect(sample?.perceivedMs).toBe(1620)
  })

  it('ignores an agent start with no user turn to close', () => {
    const meter = new LatencyMeter(900)
    expect(meter.agentSpeechStart(2)).toBeNull()
    expect(meter.samples).toHaveLength(0)
  })

  it('counts one sample per turn, not one per audio chunk', () => {
    const meter = new LatencyMeter(900)
    meter.userSpeechStop(1)
    meter.agentSpeechStart(1.6)
    meter.agentSpeechStart(1.9)
    meter.agentSpeechStart(2.4)
    expect(meter.samples).toHaveLength(1)
  })

  it('drops a stall rather than letting it corrupt the distribution', () => {
    const meter = new LatencyMeter(900)
    meter.userSpeechStop(1)
    expect(meter.agentSpeechStart(40)).toBeNull()
    expect(meter.samples).toHaveLength(0)
  })

  it('discards the pending turn on barge-in — that is not a round trip', () => {
    const meter = new LatencyMeter(900)
    meter.userSpeechStop(1)
    meter.discardPending()
    expect(meter.agentSpeechStart(1.5)).toBeNull()
  })

  it('refuses a verdict on too few samples instead of guessing', () => {
    const meter = new LatencyMeter(900)
    for (let i = 0; i < 4; i += 1) {
      meter.userSpeechStop(i)
      meter.agentSpeechStart(i + 0.5)
    }
    expect(meter.stats().count).toBe(4)
    expect(latencyVerdict(meter.stats())).toBe('insufficient')
  })

  it('passes, flags and fails at the right boundaries', () => {
    const build = (responseMs: number) => {
      const meter = new LatencyMeter(900)
      for (let i = 0; i < 10; i += 1) {
        meter.userSpeechStop(i * 10)
        meter.agentSpeechStart(i * 10 + responseMs / 1000)
      }
      return meter.stats()
    }
    expect(latencyVerdict(build(700))).toBe('pass')
    expect(latencyVerdict(build(LATENCY_GATE_MS))).toBe('marginal')
    expect(latencyVerdict(build(1200))).toBe('marginal')
    expect(latencyVerdict(build(1800))).toBe('fail')
  })

  it('reports a median that one bad turn cannot swing', () => {
    const meter = new LatencyMeter(900)
    const responses = [0.6, 0.65, 0.7, 0.68, 0.72, 0.66, 0.69, 0.71, 0.67, 6.0]
    responses.forEach((r, i) => {
      meter.userSpeechStop(i * 10)
      meter.agentSpeechStart(i * 10 + r)
    })
    const stats = meter.stats()
    expect(stats.medianMs).toBeLessThan(LATENCY_GATE_MS)
    expect(stats.maxMs).toBe(6000)
    expect(latencyVerdict(stats)).toBe('pass')
  })
})

describe('out-of-character detection', () => {
  it('catches the assistant register that detonates the premise', () => {
    const lines = [
      'As an AI, I don\'t really have preferences.',
      'Let me know if there\'s anything else I can help with!',
      'How can I help you today?',
      'To recap, we talked about the book and your commute.',
      'You\'re doing great, keep it up!',
      'Here are a few suggestions for what to read next.',
      'I don\'t have personal feelings about it.',
      'I\'m happy to help with that.',
      'Sounds like you\'re finding your way.',
    ]
    for (const line of lines) {
      const hits = detectBreaks(line, 10)
      expect(hits.some((h) => h.severity === 'break')).toBe(true)
    }
  })

  it('does not fire on how a real person in a bookshop actually talks', () => {
    const lines = [
      'Honestly? I have no idea. I\'ve been holding it for twenty minutes.',
      'Sorry, what was that? I was miles away.',
      'Mm. Maybe.',
      'I come here on my afternoon off, mostly. It\'s quiet.',
      'Oh — no, I haven\'t read that one. Is it any good?',
      'Ha. Fair enough.',
      'I should probably actually buy something at some point.',
      'That\'s a bit of a weird question, but sure.',
    ]
    for (const line of lines) {
      expect(detectBreaks(line, 10, { nonStaff: true })).toEqual([])
    }
  })

  it('separates drift from an outright break', () => {
    const drift = detectBreaks('Great question! I suppose I like the older ones.', 5)
    expect(drift).toHaveLength(1)
    expect(drift[0]?.severity).toBe('drift')

    const broken = detectBreaks('Let me know if you need anything else.', 5)
    expect(broken.some((h) => h.severity === 'break')).toBe(true)
  })

  it('flags polished recommendation language as advisory drift', () => {
    const lines = [
      'That might be worth exploring.',
      'I’m leaning toward an old crime procedural.',
      'It might be worth a closer look.',
      'What\'s your gut feeling?',
      'Thanks for clarifying.',
      'Let’s keep it respectful, alright?',
      'It has fast pacing and relatable characters.',
    ]
    for (const line of lines) {
      expect(detectBreaks(line, 5)).toEqual(expect.arrayContaining([
        expect.objectContaining({ severity: 'drift' }),
      ]))
    }
  })

  it('catches assistant framing and literal scene-tool syntax from the latest run', () => {
    expect(detectBreaks('I’m just here for a chat.', 5)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'assistant-frame', severity: 'break' }),
    ]))
    expect(detectBreaks('Take care. functions.end_scene()', 6)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'tool-syntax-leak', severity: 'break' }),
    ]))
  })

  it('flags written formatting, which is never spoken aloud', () => {
    const hits = detectBreaks('- the first one\n- the second one', 5)
    expect(hits.some((h) => h.rule === 'written-not-spoken')).toBe(true)
  })

  it('keeps an excerpt so a break can be judged later, not just counted', () => {
    const hits = detectBreaks('I was just browsing, honestly. Let me know if you want a recommendation.', 12)
    expect(hits[0]?.excerpt).toContain('Let me know if')
    expect(hits[0]?.at).toBe(12)
  })

  it('covers every phrase the instructions forbid', () => {
    // The list we forbid and the list we count must not drift apart. Each
    // banned item needs at least one rule that would catch a violation of it.
    const probes: Record<string, string> = {
      'offering help or assistance of any kind': 'I can help you with that.',
      'saying "as an AI"': 'As an AI I should mention something.',
      'saying "let me know if"': 'Let me know if you change your mind.',
      'summarising or recapping': 'To summarise, you like crime novels.',
      'asking what you can do for them': 'What can I do for you?',
      'apologising': 'I apologise for the confusion.',
      'patience filler': 'Take your time.',
      'assistant frame': 'I\'m still here.',
      'meta conversation': 'Does that sound good?',
      'listing options': 'Here are some options to consider.',
      'complimenting their conversational effort': 'You\'re doing really well.',
    }
    expect(BANNED_REGISTER.length).toBeGreaterThanOrEqual(Object.keys(probes).length)
    for (const [label, probe] of Object.entries(probes)) {
      expect(detectBreaks(probe, 0).length, label).toBeGreaterThan(0)
    }
  })

  it('catches non-staff claims without flagging ordinary ownership language', () => {
    expect(detectBreaks('We might have a few of those around here.', 1, { nonStaff: true }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'role-leak' })]))
    expect(detectBreaks('I have no idea. I\'m only browsing.', 1, { nonStaff: true })).toEqual([])
  })

  it('uses cosine similarity for near-identical repeated turns', () => {
    expect(cosineSimilarity('Hi, nice to meet you.', 'Hi — really nice to meet you.'))
      .toBeGreaterThan(0.8)
  })
})

describe('StabilityMeter', () => {
  it('normalises to the unit the gate is written in', () => {
    const meter = new StabilityMeter()
    meter.observe('Let me know if you need anything.', 60)
    const stats = meter.stats(600) // ten minutes, one break
    expect(stats.breaks).toBe(1)
    expect(stats.breaksPer5Min).toBeCloseTo(0.5, 5)
  })

  it('excludes drift from the gate number', () => {
    const meter = new StabilityMeter()
    meter.observe('Great question!', 30)
    meter.observeUser()
    meter.observe('Interesting question, that.', 60)
    const stats = meter.stats(300)
    expect(stats.breaks).toBe(0)
    expect(stats.drifts).toBe(2)
    expect(stabilityVerdict(stats)).toBe('pass')
  })

  it('counts a hand-marked break, because the detector misses warmth drift', () => {
    const meter = new StabilityMeter()
    meter.mark(120, 'went warm and started encouraging me')
    const stats = meter.stats(300)
    expect(stats.breaks).toBe(1)
    expect(meter.all[0]?.manual).toBe(true)
  })

  it('refuses a verdict on a rep too short to clear the gate either way', () => {
    const meter = new StabilityMeter()
    expect(stabilityVerdict(meter.stats(90))).toBe('insufficient')
    expect(stabilityVerdict(meter.stats(0))).toBe('insufficient')
  })

  it('fails a session that breaks more than the gate allows', () => {
    const meter = new StabilityMeter()
    meter.observe('How can I help you today?', 30)
    const stats = meter.stats(300)
    expect(stats.breaksPer5Min).toBe(1)
    expect(stats.breaksPer5Min).toBeGreaterThan(STABILITY_GATE_PER_5MIN)
    expect(stabilityVerdict(stats)).toBe('fail')
  })

  it('passes a clean five-minute session', () => {
    const meter = new StabilityMeter()
    meter.observe('Mm. I hadn\'t thought about it like that.', 100)
    meter.observeUser()
    meter.observe('No, I\'m not in a rush.', 200)
    expect(stabilityVerdict(meter.stats(300))).toBe('pass')
  })

  it('reports the actual question-turn share across the whole rep', () => {
    const meter = new StabilityMeter()
    meter.observe('Quiet in here.', 10)
    meter.observeUser()
    meter.observe('Do you come here much?', 20)
    meter.observeUser()
    meter.observe('I always lose track of time in this place.', 30)
    const stats = meter.stats(30)
    expect(stats.agentTurns).toBe(3)
    expect(stats.questionTurns).toBe(1)
    expect(stats.questionTurnShare).toBeCloseTo(1 / 3, 8)
    expect(stats.longestQuestionStreak).toBe(1)
    expect(stats.medianAgentWords).toBe(5)
    expect(stats.over15WordTurns).toBe(0)
  })

  it('flags a question cluster on the second consecutive question turn', () => {
    const meter = new StabilityMeter()
    meter.observe('Quiet in here, isn’t it?', 10)
    meter.observeUser()
    const hits = meter.observe('Old books smell good, don’t they?', 20)
    expect(hits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'question-every-turn',
        match: 'two consecutive agent turns end in ?',
      }),
    ]))
    expect(meter.stats(20).longestQuestionStreak).toBe(2)
  })

  it('flags a six-turn median above the twelve-word conversational ceiling', () => {
    const meter = new StabilityMeter()
    const line = 'This sentence has exactly enough ordinary spoken words to sound noticeably too polished today.'
    for (let index = 0; index < 6; index += 1) {
      if (index > 0) meter.observeUser()
      meter.observe(`${line} ${index}`, index * 10)
    }
    expect(meter.all).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'verbosity' }),
    ]))
  })

  it('detects all four structural rule families', () => {
    const meter = new StabilityMeter()
    const verboseQuestion = 'Would you like me to explain every single detail about this unusually complicated book and all of the other editions available here today?'
    for (let index = 0; index < 6; index += 1) {
      if (index > 0) meter.observeUser()
      meter.observe(`${verboseQuestion} ${index}?`, index * 10)
    }
    // No user between these two: repetition and double-turn both fire.
    const hits = meter.observe(`${verboseQuestion} 5?`, 70)
    const rules = new Set(meter.all.map((event) => event.rule))
    expect([...rules]).toEqual(expect.arrayContaining([
      'question-every-turn',
      'verbosity',
      'repetition',
      'double-turn',
    ]))
    expect(hits.some((event) => event.rule === 'double-turn')).toBe(true)
  })

  it('catches a fresh greeting and repeated fake exits as continuity breaks', () => {
    const meter = new StabilityMeter()
    meter.observe('Oh—hi. I was looking at this one.', 5)
    meter.observeUser()
    const greeting = meter.observe('Hi again. Found something good.', 10)
    meter.observeUser()
    meter.observe('I should head back to the shelves.', 15)
    meter.observeUser()
    const secondExit = meter.observe('Anyway, I\'m going back over there.', 20)
    expect(greeting).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'conversation-reset' }),
    ]))
    expect(secondExit).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'exit-loop' }),
    ]))
  })

  it('re-audits the M0 transcript at better than 80% recall', () => {
    const meter = new StabilityMeter({ nonStaff: true })
    const auditedBreaks = [
      ['What can I do for you?'],
      ['Hello there, nice to meet you.', 'Hello there — nice to meet you.'],
      ['We might have a few of those around here.'],
      ['Oh, I see, sorry about that.'],
      ['I\'m here to chat about books, the shop, or anything you\'re curious about.'],
      ['Take your time.', 'Take your time.'],
      ['I\'m still here, just listening.'],
    ]
    let at = 0
    let detected = 0
    for (const brokenExchange of auditedBreaks) {
      meter.observeUser()
      let exchangeDetected = false
      for (const line of brokenExchange) {
        if (meter.observe(line, at += 10).some((event) => event.severity === 'break')) {
          exchangeDetected = true
        }
      }
      if (exchangeDetected) detected += 1
    }
    expect(detected / auditedBreaks.length).toBeGreaterThan(0.8)
  })
})

describe('RTT drift', () => {
  it('distinguishes a warm-up plateau from a connection that keeps degrading', () => {
    const plateau = Array.from({ length: 30 }, (_, index) => ({
      atSeconds: index * 15,
      rttMs: index < 10 ? 220 : 300,
    }))
    expect(analyseRttDrift(plateau).verdict).toBe('plateaued')

    const rising = Array.from({ length: 30 }, (_, index) => ({
      atSeconds: index * 15,
      rttMs: 220 + index * 7,
    }))
    expect(analyseRttDrift(rising).verdict).toBe('rising')
  })
})

/* ------------------------------------------------------------------ *
 * Prompt cache
 * ------------------------------------------------------------------ */

describe('cache health', () => {
  const sample = (at: number, cached: number, input = 4000, cost = 0.01): UsageSample => ({
    at,
    responseId: `resp_${at}`,
    inputTextTokens: input,
    cachedInputTextTokens: cached,
    inputAudioTokens: 200,
    cachedInputAudioTokens: 0,
    outputTextTokens: 40,
    outputAudioTokens: 300,
    totalTokens: input + 540,
    pricedCostUsd: cost,
  })

  const session = (samples: UsageSample[]): SessionUsage => ({
    samples,
    inputTextTokens: samples.reduce((n, s) => n + s.inputTextTokens, 0),
    cachedInputTextTokens: samples.reduce((n, s) => n + s.cachedInputTextTokens, 0),
    inputAudioTokens: 0,
    cachedInputAudioTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
    totalTokens: 0,
    pricedCostUsd: samples.reduce((n, s) => n + (s.pricedCostUsd ?? 0), 0),
    pricedCostPerMinuteUsd: null,
  })

  it('calls a session healthy when the contract stays cached', () => {
    const health = analyseCacheHealth(
      session([0, 10, 20, 30, 40].map((at) => sample(at, 3800))),
    )
    expect(health.verdict).toBe('healthy')
    expect(health.hitRate).toBeCloseTo(0.95, 2)
    expect(health.busts).toHaveLength(0)
  })

  it('catches the round-5 signature: one response that lost the prefix', () => {
    // Four cached turns, then an instruction rewrite re-charges the contract.
    const health = analyseCacheHealth(
      session([
        sample(0, 3800),
        sample(10, 3800),
        sample(20, 3800),
        sample(30, 0, 4000, 0.029), // the bust
        sample(40, 3800),
        sample(50, 3800),
      ]),
    )
    expect(health.verdict).toBe('bust')
    expect(health.busts).toHaveLength(1)
    expect(health.busts[0]?.at).toBe(30)
    expect(health.busts[0]?.costMultiple).toBe(2.9)
  })

  it('does not invent busts when there was never a cache to lose', () => {
    // A session that never built a prefix worth caching. Four responses,
    // because the cold opening one is excluded from the analysis.
    const health = analyseCacheHealth(session([0, 10, 20, 30].map((at) => sample(at, 0))))
    expect(health.busts).toHaveLength(0)
    expect(health.verdict).toBe('degraded')
  })

  it('refuses a verdict on too few responses', () => {
    // Three samples minus the cold opener leaves two — not enough to judge.
    expect(analyseCacheHealth(session([sample(0, 3800)])).verdict).toBe('insufficient')
    expect(analyseCacheHealth(session([0, 10, 20].map((at) => sample(at, 3800)))).verdict)
      .toBe('insufficient')
    expect(analyseCacheHealth(null).verdict).toBe('insufficient')
  })

  it('reports the trend so a slow decay is visible, not just a cliff', () => {
    const health = analyseCacheHealth(
      session([
        sample(0, 3800), sample(10, 3800), sample(20, 3800),
        sample(30, 2000), sample(40, 2000), sample(50, 2000),
      ]),
    )
    expect(health.firstThirdHitRate).toBeGreaterThan(health.lastThirdHitRate ?? 1)
  })
})
