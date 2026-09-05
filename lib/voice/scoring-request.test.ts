import { afterEach, describe, expect, it, vi } from 'vitest'
import { CALIBRATION_TRANSCRIPTS } from '@/lib/grade/calibration/transcripts'
import { PipelineMeter } from './elevenlabs/telemetry'
import { priceChatUsage, priceTokens } from './rates'
import {
  parseChatTokenUsage, parseGradeTranscript, readScoringBody,
  reserveChatCost, scoringDeadline, SCORING_LIMITS,
} from './scoring-request'

afterEach(() => vi.useRealTimers())

describe('scoring input boundaries', () => {
  it('accepts every collected real calibration transcript without editing it', () => {
    expect(CALIBRATION_TRANSCRIPTS.length).toBeGreaterThan(0)
    for (const fixture of CALIBRATION_TRANSCRIPTS) {
      expect(parseGradeTranscript(fixture.transcript), fixture.id).toEqual(fixture.transcript)
      expect(fixture.sessionSeconds).toBeLessThanOrEqual(SCORING_LIMITS.sessionSeconds)
    }
  })

  it('rejects oversized transcripts instead of scoring an invisible truncation', () => {
    const turn = { speaker: 'user', text: 'hello', t_start: 0, t_end: 1 }
    expect(parseGradeTranscript(Array(161).fill(turn))).toBeNull()
    expect(parseGradeTranscript([{ ...turn, text: 'x'.repeat(4_001) }])).toBeNull()
    expect(parseGradeTranscript(Array(9).fill({ ...turn, text: 'x'.repeat(4_000) }))).toBeNull()
  })

  it('rejects invalid clocks while preserving actual overlapping speech', () => {
    const turn = { speaker: 'user', text: 'hello', t_start: 0, t_end: 1 }
    for (const clocks of [{ t_start: -1 }, { t_end: Number.NaN }, { t_start: 2 }, { t_end: 601 }]) {
      expect(parseGradeTranscript([{ ...turn, ...clocks }])).toBeNull()
    }
    expect(parseGradeTranscript([turn, { ...turn, speaker: 'agent', t_start: 0.5 }])).toHaveLength(2)
  })

  it('bounds bytes even if a client omits Content-Length', async () => {
    const request = new Request('https://nerve.test/api/grade', {
      method: 'POST', body: JSON.stringify({ transcript: 'x'.repeat(SCORING_LIMITS.jsonBytes) }),
    })
    await expect(readScoringBody(request)).rejects.toMatchObject({ status: 413 })
  })

  it('rejects null and array JSON roots without throwing an unhandled route error', async () => {
    for (const raw of ['null', '[]', '{']) {
      await expect(readScoringBody(new Request('https://nerve.test', { method: 'POST', body: raw })))
        .rejects.toMatchObject({ status: 400 })
    }
  })
})

describe('provider usage and tariffs', () => {
  it('reads provider cached input and bills it once at its actual tariff', () => {
    const usage = parseChatTokenUsage({
      prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100,
      prompt_tokens_details: { cached_tokens: 800 },
    })
    expect(usage).toEqual({ input: 1_000, cachedInput: 800, output: 100, total: 1_100 })
    expect(priceChatUsage('gpt-4.1-mini-2025-04-14', usage!)).toBeCloseTo(0.00032, 8)
  })

  it('leaves absent or malformed usage unpriced and never converts unknown models to free', () => {
    expect(parseChatTokenUsage(undefined)).toBeNull()
    expect(parseChatTokenUsage({ prompt_tokens: 3, completion_tokens: -1 })).toBeNull()
    expect(parseChatTokenUsage({ prompt_tokens: 3, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 4 } })).toBeNull()
    expect(priceChatUsage('gpt-4.1-not-a-known-model', { input: 1_000, output: 100 })).toBeNull()
    expect(priceTokens('gpt-4.1', { textInput: Number.NaN })).toBeNull()
  })

  it('reserves conservatively for multibyte text and output before sending it', () => {
    const reservation = reserveChatCost('gpt-4.1', [{ role: 'user', content: '你好' }], 100)
    expect(reservation?.inputTokens).toBeGreaterThan('你好'.length)
    expect(reservation?.maxCostUsd).toBeGreaterThan(priceChatUsage('gpt-4.1', { input: 2, output: 100 })!)
  })

  it('includes cached tokens in the pipeline meter and retains unpriced totals', () => {
    const create = (llmModel: string) => new PipelineMeter({
      models: { llmModel, sttModel: 'gpt-4o-mini-transcribe', ttsModel: 'eleven_v3_conversational' },
      credits: { budget: 10_000, warnAt: 8_000 },
    })
    const meter = create('gpt-4.1-mini')
    meter.addLlmTokens({ input: 1_000, cachedInput: 800, output: 100 })
    expect(meter.usage(60).openai.costUsd).toBeCloseTo(0.00032, 8)
    expect(meter.usage(60).openai.llmCachedInputTokens).toBe(800)
    expect(create('unpriced').usage(60).totalCostUsd).toBeNull()
  })
})

describe('scoring deadlines', () => {
  it('forwards a disconnect and can dispose its timer', () => {
    const client = new AbortController()
    const deadline = scoringDeadline(new Request('https://nerve.test', { signal: client.signal }), 100)
    client.abort()
    expect(deadline.signal.aborted).toBe(true)
    deadline.dispose()
  })

  it('expires even if response headers arrived while the body stalled', () => {
    vi.useFakeTimers()
    const deadline = scoringDeadline(new Request('https://nerve.test'), 100)
    vi.advanceTimersByTime(100)
    expect(deadline.signal.reason.name).toBe('TimeoutError')
    deadline.dispose()
  })
})
