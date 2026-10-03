/**
 * The countdown warm-up (REP-FIXES-PLAN B2).
 *
 * The one property that decides whether it works at all is that the model
 * reads the SAME prefix turn one will send — a prompt cache only hits on
 * identical bytes. So that is asserted against the real `handleLlmRequest` and
 * the real `createCombinedTurn`, with only the vendor's socket stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCombinedTurn, parseVoiceRequest } from './combined'
import { WARM_MAX_TOKENS, WARM_TTS_TEXT, warmBound, warmSession } from './warm'
import type { TurnRequest, WarmRequest } from './turn-protocol'

const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const warm: WarmRequest = {
  warm: true, sessionId: SESSION, operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', personaId: 'nadia',
}
const turn: TurnRequest = {
  sessionId: SESSION, turnId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', personaId: 'nadia',
  history: [{ role: 'user', content: 'Is this seat taken?' }], steering: 'Keep it short.', warmth: 30,
}
const context = { userName: 'Sam', memorySummary: 'Met him once at the gallery.' }
const encoder = new TextEncoder()
const sse = (usage: { prompt_tokens: number; completion_tokens: number; cached?: number }) => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hm' } }] })}\n\n`
  + `data: ${JSON.stringify({ usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens,
    prompt_tokens_details: { cached_tokens: usage.cached ?? 0 } }, choices: [] })}\n\ndata: [DONE]\n\n`,
  { headers: { 'content-type': 'text/event-stream' } })
const audio = () => new Response(JSON.stringify({ audio_base64: 'AAA=', alignment: null }) + '\n',
  { headers: { 'x-nerve-tts-region': 'us-central1' } })

interface Captured { model: string; messages: { role: string; content: string }[]; max_tokens: number }
let openai: Captured[]
let elevenlabs: { url: string; body: Record<string, unknown> }[]

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'sk-test')
  vi.stubEnv('ELEVENLABS_API_KEY', 'el-test')
  vi.stubEnv('PIPELINE_LLM_MODEL', 'gpt-4.1-mini')
  vi.stubEnv('ELEVENLABS_TTS_MODEL', 'eleven_v3_conversational')
  openai = []
  elevenlabs = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (String(url).includes('openai.com')) {
      openai.push(body as unknown as Captured)
      return sse({ prompt_tokens: 2700, completion_tokens: 1 })
    }
    elevenlabs.push({ url: String(url), body })
    return audio()
  }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('the countdown warm-up', () => {
  it('sends the model the exact prefix turn one will send, and asks for one token', async () => {
    await warmSession(warm, context, new AbortController().signal)
    const { finished } = createCombinedTurn(turn, context, new AbortController().signal)
    await finished
    const [warmed, real] = openai
    expect(warmed && real).toBeTruthy()
    // The contract and the exit line: everything before history.
    expect(warmed!.messages.slice(0, 2)).toEqual(real!.messages.slice(0, 2))
    expect(warmed!.messages[0]!.content.length).toBeGreaterThan(2000)
    expect(warmed!.model).toBe(real!.model)
    expect(warmed!.max_tokens).toBe(WARM_MAX_TOKENS)
    expect(real!.max_tokens).toBeGreaterThan(WARM_MAX_TOKENS)
  })

  it('a different session would NOT share the prefix — the mood seed is in it', async () => {
    await warmSession(warm, context, new AbortController().signal)
    await warmSession({ ...warm, sessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }, context, new AbortController().signal)
    // Not a property we want, a property we must respect: warming one rep's
    // session cannot warm another's, so the warm-up must name its own.
    const [a, b] = openai
    expect(a!.messages.slice(0, 2)).not.toEqual(b!.messages.slice(0, 2))
  })

  it('warms the voice on the same model, format and endpoint a turn uses, with three characters', async () => {
    await warmSession(warm, context, new AbortController().signal)
    const { finished } = createCombinedTurn(turn, context, new AbortController().signal)
    await finished
    const [warmed, real] = elevenlabs
    expect(warmed!.url).toBe(real!.url)
    expect(warmed!.body['model_id']).toBe(real!.body['model_id'])
    expect(warmed!.body['text']).toBe(WARM_TTS_TEXT)
    expect(WARM_TTS_TEXT.length).toBeLessThanOrEqual(3)
  })

  it('prices itself from the receipts, and from its bound when a receipt is missing (rule 18)', async () => {
    const measured = await warmSession(warm, context, new AbortController().signal)
    expect(measured.measured).toBe(true)
    expect(measured.usage.llm).toEqual({ input: 2700, output: 1, cachedInput: 0 })
    expect(measured.usage.tts.characters).toBe(WARM_TTS_TEXT.length)
    const bound = warmBound(warm, context).maxCostUsd!
    expect(measured.costUsd).toBeGreaterThan(0)
    expect(measured.costUsd).toBeLessThanOrEqual(bound)
    // About a tenth of a cent measured, as the plan priced it. The bound is
    // looser because it counts UTF-8 bytes as tokens, and stays under a cent.
    expect(measured.costUsd).toBeLessThan(0.002)
    expect(bound).toBeLessThan(0.01)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const failed = await warmSession(warm, context, new AbortController().signal)
    expect(failed.measured).toBe(false)
    expect(failed.costUsd).toBe(bound)
  })

  it('never throws, whatever the vendors do', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(warmSession(warm, context, new AbortController().signal)).resolves.toMatchObject({ measured: false })
  })
})

describe('telling a warm-up from a turn', () => {
  const request = (body: unknown) => new Request('http://x/api/voice/turn', {
    method: 'POST', body: encoder.encode(JSON.stringify(body)),
  })

  it('reads a warm-up only when `warm` is literally true', async () => {
    expect(await parseVoiceRequest(request(warm))).toEqual({ kind: 'warm', input: warm })
    expect(await parseVoiceRequest(request({ ...warm, warm: 'true' }))).toBeNull()
    expect(await parseVoiceRequest(request({ ...warm, operationId: 'nope' }))).toBeNull()
    expect(await parseVoiceRequest(request({ ...warm, personaId: 'nobody' }))).toBeNull()
  })

  it('reads a turn exactly as before', async () => {
    expect(await parseVoiceRequest(request(turn))).toEqual({ kind: 'turn', input: turn })
    expect(await parseVoiceRequest(request({ ...turn, warm: false }))).toEqual({ kind: 'turn', input: turn })
  })
})
