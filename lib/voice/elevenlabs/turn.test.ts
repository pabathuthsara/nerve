import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnClient, type TurnEvents } from './turn'
import type { TurnEvent, TurnRequest } from './turn-protocol'

const request: TurnRequest = {
  sessionId: 'owned-session', turnId: 'unique-turn', personaId: 'tess',
  history: [{ role: 'user', content: 'How is your day?' }], steering: null, warmth: 40,
}
const audio: TurnEvent = { type: 'audio', clipId: 'one', audio_base64: 'AAA=', alignment: null }
function callbacks(): TurnEvents {
  return { onClip: vi.fn(), onAudio: vi.fn(), onTiming: vi.fn(), onUsage: vi.fn() }
}
function line(event: TurnEvent): string { return JSON.stringify(event) + '\n' }
function response(body: string): Response { return new Response(body) }

afterEach(() => vi.useRealTimers())

describe('combined HTTP turn transport', () => {
  it('delivers fragmented audio before the response is complete', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const events = callbacks()
    const client = new TurnClient({ fetchImpl: vi.fn(async () => new Response(new ReadableStream({
      start(controller) { stream = controller },
    }))) })
    const result = client.stream(request, events, new AbortController().signal)
    await vi.waitFor(() => expect(stream).toBeDefined())
    const body = line({ type: 'clip', id: 'one', text: 'That sounds nice.' }) + line(audio)
    stream.enqueue(new TextEncoder().encode(body.slice(0, 37)))
    stream.enqueue(new TextEncoder().encode(body.slice(37)))
    await vi.waitFor(() => expect(events.onAudio).toHaveBeenCalledOnce())
    expect(events.onClip).toHaveBeenCalledWith('one', 'That sounds nice.')
    stream.enqueue(new TextEncoder().encode(line({ type: 'done', exit: true })))
    await expect(result).resolves.toEqual({ exit: true, aborted: false })
  })

  it('stops consuming buffered events as soon as a barge-in aborts', async () => {
    const abort = new AbortController()
    const events = callbacks()
    events.onClip = () => abort.abort()
    const client = new TurnClient({ fetchImpl: vi.fn(async () => response(
      line({ type: 'clip', id: 'one', text: 'An unheard reply.' }) + line(audio)
      + line({ type: 'done', exit: true }),
    )) })
    await expect(client.stream(request, events, abort.signal)).resolves.toEqual({ exit: false, aborted: true })
    expect(events.onAudio).not.toHaveBeenCalled()
  })

  it('reports a prematurely closed reply and never retries paid work', async () => {
    const fetchImpl = vi.fn(async () => response(line({ type: 'clip', id: 'one', text: 'Cut short.' })))
    const client = new TurnClient({ fetchImpl })
    await expect(client.stream(request, callbacks(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'provider_error', fatal: false })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('rejects malformed alignment instead of silently losing transcript precision', async () => {
    const client = new TurnClient({ fetchImpl: vi.fn(async () => response(JSON.stringify({
      ...audio, alignment: { characters: ['h'], characterStartTimesSeconds: [], characterEndTimesSeconds: [1] },
    }) + '\n')) })
    await expect(client.stream(request, callbacks(), new AbortController().signal)).rejects.toMatchObject({
      code: 'provider_error',
    })
  })

  it('bounds a stalled response body and cancels the reader', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const client = new TurnClient({ timeoutMs: 100, fetchImpl: vi.fn(async () => new Response(new ReadableStream({ cancel }))) })
    const result = client.stream(request, callbacks(), new AbortController().signal)
    const assertion = expect(result).rejects.toMatchObject({ message: 'The voice reply took too long.', fatal: false })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('preserves cumulative usage and server timing with an unterminated final line', async () => {
    const events = callbacks()
    const usage: TurnEvent = {
      type: 'usage', llm: { input: 2100, output: 22, cachedInput: 2048 },
      tts: { characters: 20, costUsd: 0.001 },
    }
    const client = new TurnClient({ fetchImpl: vi.fn(async () => response(
      line(usage) + line({ type: 'timing', stage: 'ttsFirstByteMs', ms: 291 })
      + JSON.stringify({ type: 'done', exit: false }),
    )) })
    await expect(client.stream(request, events, new AbortController().signal)).resolves.toEqual({ exit: false, aborted: false })
    expect(events.onUsage).toHaveBeenCalledWith(usage)
    expect(events.onTiming).toHaveBeenCalledWith('ttsFirstByteMs', 291)
  })

  it('ends a rep when its reserved budget has been exhausted', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ reason: 'budget', error: 'This rep reached its limit.' }, { status: 429 }))
    const client = new TurnClient({ fetchImpl })
    await expect(client.stream(request, callbacks(), new AbortController().signal)).rejects.toMatchObject({
      code: 'provider_error', fatal: true,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('keeps an interruption-related busy refusal recoverable', async () => {
    const client = new TurnClient({ fetchImpl: vi.fn(async () => Response.json({ reason: 'busy' }, { status: 409 })) })
    await expect(client.stream(request, callbacks(), new AbortController().signal)).rejects.toMatchObject({
      code: 'provider_error', fatal: false,
    })
  })
})
