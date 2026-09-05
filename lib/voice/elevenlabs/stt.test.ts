import { afterEach, describe, expect, it, vi } from 'vitest'
import { RealtimeTranscriber, type TranscriberOptions, type TranscriptionTiming } from './stt'

const first: TranscriptionTiming = { startedAtMs: 1000, stoppedAtMs: 2000, committedAtMs: 2600 }
const second: TranscriptionTiming = { startedAtMs: 2700, stoppedAtMs: 3700, committedAtMs: 4300 }

async function harness(extra: Partial<TranscriberOptions> = {}) {
  const sent: Record<string, unknown>[] = []
  const socket = {
    readyState: 1, binaryType: '',
    onopen: null as (() => void) | null,
    onerror: null as (() => void) | null,
    send: (raw: string) => sent.push(JSON.parse(raw) as Record<string, unknown>),
    close: vi.fn(),
  }
  let now = 4400
  const onDelta = vi.fn(), onFinal = vi.fn(), onError = vi.fn(), onUsage = vi.fn(), onSettled = vi.fn()
  const stt = new RealtimeTranscriber({
    clientSecret: 'ephemeral', model: 'gpt-4o-mini-transcribe', sampleRate: 24_000,
    socketFactory: () => socket as unknown as WebSocket,
    clock: () => now, onDelta, onFinal, onError, onUsage, onSettled,
    ...extra,
  })
  const connecting = stt.connect()
  socket.onopen!()
  await connecting
  const ingest = (event: Record<string, unknown>) => stt.ingest(JSON.stringify(event))
  const commit = (timing: TranscriptionTiming) => {
    stt.pushFrame(new Float32Array(480), true)
    expect(stt.commit(timing)).toBe(true)
  }
  const ack = (itemId: string) => ingest({ type: 'input_audio_buffer.committed', item_id: itemId })
  const final = (itemId: string, text: string) => ingest({
    type: 'conversation.item.input_audio_transcription.completed', item_id: itemId, transcript: text,
    usage: { input_tokens: 10, output_tokens: 2 },
  })
  return { stt, sent, socket, commit, ack, final, ingest, onDelta, onFinal, onError, onUsage, onSettled, at: (at: number) => { now = at } }
}

afterEach(() => vi.useRealTimers())

describe('committed speech identity', () => {
  it('binds item IDs to immutable timing and releases out-of-order finals in spoken order', async () => {
    const h = await harness()
    const mutable = { ...first }
    h.commit(mutable)
    mutable.startedAtMs = 9000
    h.commit(second)
    h.ack('a'); h.ack('b')
    h.final('b', 'Second clause.')
    expect(h.onFinal).not.toHaveBeenCalled()
    expect(h.stt.pendingCount).toBe(2)
    h.at(4700)
    h.final('a', 'First clause.')
    expect(h.onFinal.mock.calls).toEqual([
      ['First clause.', first, 2100],
      ['Second clause.', second, 100],
    ])
    expect(h.stt.pendingCount).toBe(0)
    expect(h.onUsage).toHaveBeenCalledTimes(2)
    h.stt.close()
  })

  it('keeps interleaved partials bound to their own clause and treats empty finals as empty', async () => {
    const h = await harness()
    h.commit(first); h.commit(second); h.ack('a'); h.ack('b')
    h.ingest({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'b', delta: 'Later ' })
    h.ingest({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'Earlier ' })
    h.ingest({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'partial' })
    expect(h.onDelta.mock.calls).toEqual([['Earlier ', first], ['Earlier partial', first]])
    h.final('b', 'Later final.')
    h.final('a', '')
    expect(h.onFinal.mock.calls.map(([text, timing]) => [text, timing])).toEqual([['', first], ['Later final.', second]])
    h.stt.close()
  })

  it('skips a failed clause without blocking the next final or accepting duplicate usage', async () => {
    const h = await harness()
    h.commit(first); h.commit(second); h.ack('a'); h.ack('b')
    h.final('b', 'Readable.')
    h.ingest({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'a', error: { message: 'unreadable' } })
    h.final('b', 'Duplicate.')
    expect(h.onFinal.mock.calls.map(([text]) => text)).toEqual(['', 'Readable.'])
    expect(h.onError).toHaveBeenCalledOnce()
    expect(h.onError.mock.calls[0]![0]).toMatchObject({ fatal: false })
    expect(h.onUsage).toHaveBeenCalledOnce()
    expect(h.stt.pendingCount).toBe(0)
    h.stt.close()
  })

  it('retains canceled acknowledgement slots so old commits cannot steal new timing after resume', async () => {
    const h = await harness()
    h.commit(first)
    h.stt.clear()
    h.commit(second)
    h.ack('old'); h.ack('new')
    h.final('old', 'Private old speech.')
    h.final('new', 'Fresh speech.')
    expect(h.onFinal.mock.calls).toEqual([['Fresh speech.', second, 100]])
    expect(h.onUsage).toHaveBeenCalledTimes(2) // Already-incurred STT stays visible after pause.
    h.stt.close()
    h.final('new', 'After close.')
    expect(h.onFinal).toHaveBeenCalledOnce()
  })

  it('ignores duplicate acknowledgements and unknown items without shifting later commit identity', async () => {
    const h = await harness()
    h.commit(first); h.ack('a'); h.final('a', 'First.')
    h.commit(second); h.ack('a'); h.ack('b')
    h.final('unknown', 'Unbound.')
    h.final('b', 'Second.')
    expect(h.onFinal.mock.calls.map(([text, timing]) => [text, timing])).toEqual([['First.', first], ['Second.', second]])
    h.stt.close()
  })

  it('bounds stalled transcription and still binds a late acknowledgement to its timed-out slot', async () => {
    vi.useFakeTimers()
    const h = await harness()
    h.commit(first)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(h.onFinal.mock.calls[0]![0]).toBe('')
    expect(h.stt.pendingCount).toBe(0)
    expect(h.onError).toHaveBeenCalledOnce()
    h.commit(second); h.ack('timed-out'); h.ack('fresh')
    h.final('timed-out', 'Too late.')
    h.final('fresh', 'New clause.')
    expect(h.onFinal.mock.calls.map(([text]) => text)).toEqual(['', 'New clause.'])
    h.stt.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not commit an empty buffer and clears all pending timers on cancellation', async () => {
    vi.useFakeTimers()
    const h = await harness()
    expect(h.stt.commit(first)).toBe(false)
    expect(h.sent.filter((event) => event.type === 'input_audio_buffer.commit')).toEqual([])
    h.commit(first); h.ack('a')
    h.stt.clear()
    await vi.advanceTimersByTimeAsync(20_000)
    h.final('a', 'Cancelled.')
    expect(h.onFinal).not.toHaveBeenCalled()
    expect(h.onError).not.toHaveBeenCalled()
    h.stt.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('caps unacknowledged cancellation tombstones instead of growing memory or misbinding new speech', async () => {
    vi.useFakeTimers()
    const h = await harness()
    for (let i = 0; i < 64; i += 1) {
      h.commit(first)
      h.stt.clear()
    }
    h.stt.pushFrame(new Float32Array(480), true)
    expect(h.stt.commit(second)).toBe(false)
    expect(h.sent.filter((event) => event.type === 'input_audio_buffer.commit')).toHaveLength(64)
    expect(h.onError.mock.calls[0]![0]).toMatchObject({ fatal: true })
    h.stt.close()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('transcription session', () => {
  const transcription = (sent: Record<string, unknown>[]) => {
    const update = sent.find((message) => message.type === 'session.update')
    const session = update?.session as Record<string, unknown> | undefined
    const audio = session?.audio as Record<string, unknown> | undefined
    return (audio?.input as Record<string, unknown> | undefined)?.transcription
  }

  it('pins the language, so a hum is not guessed into another script', async () => {
    const h = await harness()
    // A real rep transcribed a hum as "อืม", which reached the warmth engine as
    // an unreadable turn and the character as Thai. Every contract, directive
    // and rubric in this product is English; leaving the guess open buys
    // nothing and costs the shortest turns, which beginners speak most.
    expect(transcription(h.sent)).toEqual({ model: 'gpt-4o-mini-transcribe', language: 'en' })
  })

  it('still takes an explicit language', async () => {
    const h = await harness({ language: 'es' })
    expect(transcription(h.sent)).toEqual({ model: 'gpt-4o-mini-transcribe', language: 'es' })
  })
})
