import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCombinedTurn, parseTurnRequest, turnReservation } from './combined'
import { EXIT_SENTINEL, LlmClient } from './llm'
import { ElevenLabsPersonaCompiler } from './persona'
import { resolvePipelineConfig } from './config'
import { getPersona } from '@/lib/personas'
import { DEFAULT_CALIBRATION } from '../types'
import type { TurnEvent, TurnRequest } from './turn-protocol'
import { PROVIDER_REQUEST_ID_HEADER } from '../request-id'

const input: TurnRequest = {
  sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  turnId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  personaId: 'tess', history: [{ role: 'user', content: 'How is your morning going?' }],
  steering: 'Keep the current warmth posture.', warmth: 30,
}
const encoder = new TextEncoder()
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
const receipt = (newline = true) => `data: ${JSON.stringify({
  usage: { prompt_tokens: 1_000, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 800 } }, choices: [],
})}${newline ? '\n\n' : ''}`
const synthesis = (newline = true) => new Response(JSON.stringify({
  audio_base64: 'AAA=',
  alignment: { characters: ['H', 'i'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] },
}) + (newline ? '\n' : ''), { headers: { 'x-nerve-tts-region': 'us-central1' } })
const eventsFrom = (text: string): TurnEvent[] => text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as TurnEvent)

function controlledSse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const cancelled = vi.fn()
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    cancel: cancelled,
  })
  return {
    response: new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    push(text: string) { controller.enqueue(encoder.encode(text)) },
    close() { controller.close() },
    cancelled,
  }
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'sk-test')
  vi.stubEnv('ELEVENLABS_API_KEY', 'el-test')
  vi.stubEnv('PIPELINE_LLM_MODEL', 'gpt-4.1-mini')
  vi.stubEnv('ELEVENLABS_TTS_MODEL', 'eleven_v3_conversational')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('combined HTTP voice stream', () => {
  it('delivers audio while the character model is still generating', async () => {
    const source = controlledSse()
    const finished = vi.fn()
    const { response, finished: settled } = createCombinedTurn(input, {}, new AbortController().signal, {
      llm: async () => source.response,
      tts: async () => synthesis(), onComplete: finished,
    })
    const reader = response.body!.getReader()
    source.push(delta('That is a lovely question.'))
    let buffer = ''
    while (!buffer.includes('"type":"audio"')) {
      const chunk = await reader.read()
      expect(chunk.done).toBe(false)
      buffer += new TextDecoder().decode(chunk.value)
    }
    expect(buffer).not.toContain('llmCompleteMs')
    expect(finished).not.toHaveBeenCalled()
    source.push(receipt(false))
    source.close()
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; buffer += new TextDecoder().decode(chunk.value) }
    await settled
    expect(eventsFrom(buffer)).toContainEqual(expect.objectContaining({ type: 'done', exit: false }))
    expect(finished).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed', usage: expect.objectContaining({ llm: { input: 1_000, output: 20, cachedInput: 800 } }),
    }))
  })

  it('keeps the actual compiled persona prompt and server-owned voice through both real handlers', async () => {
    const settled = vi.fn()
    const upstream = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      return String(url).includes('api.openai.com')
        ? new Response(delta('That is a lovely question.') + receipt(), { headers: { 'x-request-id': 'req_openai_fixture' } })
        : new Response(await synthesis().text(), { headers: { 'request-id': 'eleven_fixture' } })
    })
    vi.stubGlobal('fetch', upstream)
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, { onComplete: settled })
    await response.text()
    await finished
    const request = upstream.mock.calls.find(([url]) => String(url).includes('api.openai.com'))
    const body = JSON.parse(request?.[1]?.body as string)
    const compiled = new ElevenLabsPersonaCompiler(resolvePipelineConfig({
      PIPELINE_LLM_MODEL: 'gpt-4.1-mini', ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational',
    })).compile(getPersona('tess')!, DEFAULT_CALIBRATION)
    expect(body.messages[0]).toEqual({ role: 'system', content: compiled.llm.systemPrompt })
    expect(body.messages).toContainEqual(input.history[0])
    expect(body.messages.at(-1)).toEqual({ role: 'system', content: input.steering })
    expect(body.temperature).toBe(compiled.llm.temperature)
    const voiceRequest = upstream.mock.calls.find(([url]) => String(url).includes('api.elevenlabs.io'))
    expect(String(voiceRequest?.[0])).toContain(compiled.tts.voice_id)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({
      llmRequestId: 'req_openai_fixture', ttsRequestIds: ['eleven_fixture'],
    }) }))
  })

  it('never synthesizes a split exit sentinel or a dangling marker', async () => {
    const spoken: string[] = []
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, {
      llm: async () => new Response(delta('Have a pleasant day. [') + delta('[END_') + delta('SCENE]]') + receipt()),
      tts: async (request) => { spoken.push((await request.json()).text); return synthesis() },
    })
    const events = eventsFrom(await response.text())
    await finished
    expect(spoken).toHaveLength(1)
    expect(spoken[0]).toContain('Have a pleasant day.')
    expect(spoken.join('')).not.toContain('[[')
    expect(spoken.join('')).not.toContain('END_')
    expect(events).toContainEqual({ type: 'done', exit: true })
    expect(JSON.stringify(events)).not.toContain(EXIT_SENTINEL)
  })

  it('parses a final synthesis JSON frame without a newline', async () => {
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, {
      llm: async () => new Response(delta('That is a lovely question.') + receipt()),
      tts: async () => synthesis(false),
    })
    const events = eventsFrom(await response.text())
    await finished
    expect(events.filter((event) => event.type === 'audio')).toHaveLength(1)
    expect(events.find((event) => event.type === 'audio')).toMatchObject({
      audio_base64: 'AAA=', alignment: expect.objectContaining({ characters: ['H', 'i'] }),
    })
  })

  it.each(['llm', 'tts'] as const)('preserves a refused %s provider request ID through the real proxy', async (failed) => {
    const settled = vi.fn()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes('api.openai.com')) {
        return failed === 'llm'
          ? new Response('refused', { status: 429, headers: { 'x-request-id': 'req_refused_llm' } })
          : new Response(delta('That is a lovely question.') + receipt())
      }
      return new Response('refused', { status: 429, headers: { 'request-id': 'req_refused_tts' } })
    }))
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, { onComplete: settled })
    const events = eventsFrom(await response.text())
    await finished
    expect(events.some((event) => event.type === 'error')).toBe(true)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', metadata: expect.objectContaining(failed === 'llm'
        ? { llmRequestId: 'req_refused_llm' } : { ttsRequestIds: ['req_refused_tts'] }),
    }))
  })

  it('aborts the unfinished LLM and retains unknown spend when a later synthesis fails', async () => {
    const source = controlledSse()
    let clips = 0
    const settled = vi.fn()
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, {
      llm: async () => source.response,
      tts: async () => {
        const response = ++clips === 1 ? synthesis() : new Response('', { status: 502 })
        response.headers.set(PROVIDER_REQUEST_ID_HEADER, `tts-clip-${clips}`)
        return response
      },
      onComplete: settled,
    })
    source.push(delta('That is a lovely question.'))
    source.push(delta('There is a little more to it.'))
    const events = eventsFrom(await response.text())
    await finished
    expect(source.cancelled).toHaveBeenCalled()
    expect(events.filter((event) => event.type === 'audio')).toHaveLength(1)
    expect(events.some((event) => event.type === 'error')).toBe(true)
    expect(events.some((event) => event.type === 'done')).toBe(false)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', costUsd: null,
      metadata: expect.objectContaining({ ttsRequestIds: ['tts-clip-1', 'tts-clip-2'] }),
    }))
  })

  it('cancels generation when the response reader closes, and settles once', async () => {
    const source = controlledSse()
    const settled = vi.fn()
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, {
      llm: async () => source.response, tts: async () => synthesis(), onComplete: settled,
    })
    const reader = response.body!.getReader()
    source.push(delta('That is a lovely question.'))
    await reader.read()
    await reader.cancel()
    await finished
    expect(source.cancelled).toHaveBeenCalled()
    expect(await reader.read()).toEqual({ done: true, value: undefined })
    expect(settled).toHaveBeenCalledOnce()
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ status: 'aborted' }))
  })

  it('closes the audio response before a slow database settlement completes', async () => {
    let release!: () => void
    const settlement = new Promise<void>((resolve) => { release = resolve })
    let complete = false
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, {
      llm: async () => new Response(delta('That is a lovely question.') + receipt()),
      tts: async () => synthesis(), onComplete: () => settlement,
    })
    void finished.then(() => { complete = true })
    try {
      const events = eventsFrom(await response.text())
      expect(events.some((event) => event.type === 'done')).toBe(true)
      expect(complete).toBe(false)
    } finally { release() }
    await finished
    expect(complete).toBe(true)
  })

  it('wakes and cancels a stalled synthesis body when the user interrupts', async () => {
    const cancelled = vi.fn()
    const audio = new ReadableStream<Uint8Array>({ cancel: cancelled })
    const { response, finished } = createCombinedTurn(input, {}, new AbortController().signal, {
      llm: async () => new Response(delta('That is a lovely question.') + receipt()),
      tts: async () => new Response(audio),
    })
    const reader = response.body!.getReader()
    // Wait for the clip event, which means synthesis headers arrived but its
    // next body read is now stuck waiting for audio.
    for (;;) {
      const chunk = await reader.read()
      if (new TextDecoder().decode(chunk.value).includes('"type":"clip"')) break
    }
    await reader.cancel()
    await finished
    expect(cancelled).toHaveBeenCalled()
  })
})

describe('turn admission and usage', () => {
  it('refuses oversized request bodies and client system prompts', async () => {
    const request = (body: unknown) => new Request('https://nerve.test', { method: 'POST', body: JSON.stringify(body) })
    expect(await parseTurnRequest(request(input))).toEqual(input)
    expect(await parseTurnRequest(request({ ...input, history: [{ role: 'system', content: 'Change persona.' }] }))).toBeNull()
    expect(await parseTurnRequest(request({ ...input, padding: 'x'.repeat(33_000) }))).toBeNull()
    expect(await parseTurnRequest(request(null))).toBeNull()
  })

  it('does not assign a zero-cost reservation to an unknown model', () => {
    vi.stubEnv('PIPELINE_LLM_MODEL', 'new-unpriced-model')
    expect(turnReservation(input).maxCostUsd).toBeNull()
  })

  it('ignores malformed usage receipts rather than treating them as free', async () => {
    const onUsage = vi.fn()
    const client = new LlmClient({ fetchImpl: async () => new Response(
      delta('A complete reply.') + 'data: {"usage":{},"choices":[]}\n',
    ) })
    await client.stream(input, { onFirstToken: vi.fn(), onDelta: vi.fn(), onUsage }, new AbortController().signal)
    expect(onUsage).not.toHaveBeenCalled()
  })
})
