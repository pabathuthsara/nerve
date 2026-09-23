import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScribeTranscriber, scribeUrl } from './scribe'
import { transcriberFor } from './transcriber'
import { RealtimeTranscriber, type TranscriberOptions, type TranscriptionTiming } from './stt'
import { SCRIBE_REALTIME_MODEL } from './config'
import { fromBase64 } from './capture'
import { priceTokens, SCRIBE_REALTIME_USD_PER_MINUTE } from '../rates'

/**
 * RECEIVED, NOT WRITTEN (rule 14). Every message below was read off the live
 * Scribe v2 Realtime socket on 24 September 2026, from Sri Lanka, with a token
 * minted exactly as `mintScribeToken` mints one (`npm run scribe:probe -- --raw`
 * and a scratch driver for the failure cases), and is pasted verbatim. The
 * documentation describes the shapes; it does not describe `auth_error`
 * arriving on a socket that has already OPENED, which is why `connect` waits
 * for `session_started` rather than `open`, and it does not describe `echo` at
 * all.
 */
const REAL = {
  sessionStarted: '{"message_type":"session_started","session_id":"f2e6b382ecc54124be77ba8dbd17084a","config":{"sample_rate":24000,"audio_format":"pcm_24000","language_code":"en","secondary_languages":[],"timestamps_granularity":"word","vad_commit_strategy":false,"vad_silence_threshold_secs":1.5,"vad_threshold":0.4,"min_speech_duration_ms":100,"min_silence_duration_ms":100,"max_tokens_to_recompute":5,"model_id":"scribe_v2_realtime","disable_logging":false,"include_timestamps":false,"include_language_detection":false,"filter_background_audio":false,"keyterms":[],"no_verbatim":false,"entity_detection":null}}',
  // The first partial of a session, 2.1 s into his speech (the vendor reads
  // nothing until two seconds of audio have gone up), and the last one before
  // the commit, 4.9 s in. A partial REPLACES the last: "Hi." becomes "Hi, I'm".
  partialFirst: '{"message_type":"partial_transcript","text":"Hi."}',
  partialLater: '{"message_type":"partial_transcript","text":"Hi, I\'m Alex. I just moved here from Chicago, and I\'m still finding my"}',
  committed: '{"message_type":"committed_transcript","text":"Hi, I\'m Alex. I just moved here from Chicago, and I\'m still finding my way around."}',
  // Fact 5: 5 ms after `committed` on one run and 49 ms after it on another.
  echo: '{"message_type":"partial_transcript","text":"Hi, I\'m Alex. I just moved here from Chicago, and I\'m still finding my way around."}',
  // The first partial of the next sentence, 1.2 s into it.
  partialSecond: '{"message_type":"partial_transcript","text":"What brings"}',
  committedSecond: '{"message_type":"committed_transcript","text":"What brings you to this bookshop on a Tuesday afternoon?"}',
  // One second of a tone after ninety seconds of keep-alive, committed: an
  // answer, and an empty one. (The vendor's own commit of 35.8 s of the same
  // tone read identically.)
  committedSilence: '{"message_type":"committed_transcript","text":""}',
  // A commit on 0.2 s of audio. Followed by close 1000 "commit_throttled".
  commitThrottled: '{"message_type":"commit_throttled","error":"Commit request ignored: only 0.20s of uncommitted audio. You need at least 0.3s of uncommitted audio before committing."}',
  // A real token on its second use. The socket had already fired `open`.
  // Followed by close 1000 with no reason.
  authError: '{"message_type":"auth_error","error":"You must be authenticated to use this endpoint."}',
} as const

const first: TranscriptionTiming = { startedAtMs: 1000, stoppedAtMs: 2000, committedAtMs: 2600 }
const second: TranscriptionTiming = { startedAtMs: 2700, stoppedAtMs: 3700, committedAtMs: 4300 }

const FRAME = 480 // 20 ms at 24 kHz
const loud = () => new Float32Array(FRAME).fill(0.2)
const quiet = () => new Float32Array(FRAME)

type Sent = { message_type?: string; audio_base_64?: string; commit?: boolean; sample_rate?: number }

const open: ScribeTranscriber[] = []

function fakeSocket() {
  return {
    readyState: 1, binaryType: '',
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null as ((event: { code: number; reason: string }) => void) | null,
    onerror: null as (() => void) | null,
    sent: [] as Sent[],
    send(raw: string) { this.sent.push(JSON.parse(raw) as Sent) },
    close: vi.fn(),
  }
}

async function harness(extra: Partial<TranscriberOptions> = {}) {
  const socket = fakeSocket()
  const dialled: { url: string; protocols: string[] }[] = []
  let now = 4400
  const onDelta = vi.fn(), onFinal = vi.fn(), onError = vi.fn(), onUsage = vi.fn(), onSettled = vi.fn()
  const stt = new ScribeTranscriber({
    clientSecret: 'sutkn_fixture', model: SCRIBE_REALTIME_MODEL, sampleRate: 24_000,
    socketFactory: (url, protocols) => {
      dialled.push({ url, protocols })
      return socket as unknown as WebSocket
    },
    clock: () => now, onDelta, onFinal, onError, onUsage, onSettled,
    ...extra,
  })
  open.push(stt)
  const connecting = stt.connect()
  socket.onmessage!({ data: REAL.sessionStarted })
  await connecting

  const receive = (raw: string) => socket.onmessage!({ data: raw })
  const speak = (frames: number, frame = loud) => { for (let i = 0; i < frames; i += 1) stt.pushFrame(frame(), true) }
  const hush = (frames: number) => { for (let i = 0; i < frames; i += 1) stt.pushFrame(quiet(), false) }
  /** Samples in each audio chunk sent, in order. */
  const chunks = () => socket.sent
    .filter((message) => message.commit === false)
    .map((message) => fromBase64(message.audio_base_64 ?? '').length / 2)
  const commits = () => socket.sent.filter((message) => message.commit === true)
  const commit = (timing: TranscriptionTiming) => {
    speak(1)
    expect(stt.commit(timing)).toBe(true)
  }
  return {
    stt, socket, dialled, receive, speak, hush, chunks, commits, commit,
    onDelta, onFinal, onError, onUsage, onSettled, at: (at: number) => { now = at },
  }
}

afterEach(() => {
  for (const stt of open.splice(0)) stt.close()
  vi.useRealTimers()
})

describe('opening the socket', () => {
  it('names the model, the token, 24 kHz PCM, English and our own commits in the URL', async () => {
    const h = await harness()
    const url = new URL(h.dialled[0]!.url)
    expect(`${url.origin}${url.pathname}`).toBe('wss://api.elevenlabs.io/v1/speech-to-text/realtime')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model_id: 'scribe_v2_realtime', token: 'sutkn_fixture', audio_format: 'pcm_24000',
      language_code: 'en', commit_strategy: 'manual',
    })
    // Not a subprotocol, unlike OpenAI's secret: the token is the query string.
    expect(h.dialled[0]!.protocols).toEqual([])
  })

  it('still takes an explicit language, and refuses a rate the socket cannot read', () => {
    expect(new URL(scribeUrl({ token: 't', sampleRate: 24_000, language: 'es' })).searchParams.get('language_code')).toBe('es')
    expect(() => scribeUrl({ token: 't', sampleRate: 32_000 })).toThrow(/does not accept 32000 Hz/)
  })

  it('is not connected until the session has started, because a refused token opens first', async () => {
    const socket = fakeSocket()
    const stt = new ScribeTranscriber({
      clientSecret: 'sutkn_spent', model: SCRIBE_REALTIME_MODEL, sampleRate: 24_000,
      socketFactory: () => socket as unknown as WebSocket,
      onDelta: vi.fn(), onFinal: vi.fn(), onError: vi.fn(),
    })
    open.push(stt)
    const connecting = stt.connect()
    socket.onmessage!({ data: REAL.authError })
    socket.onclose!({ code: 1000, reason: '' })
    await expect(connecting).rejects.toMatchObject({
      code: 'provider_error', message: expect.stringContaining('You must be authenticated'),
    })
  })

  it('reports a session that closes before it starts as a transport failure', async () => {
    const socket = fakeSocket()
    const stt = new ScribeTranscriber({
      clientSecret: 'sutkn_fixture', model: SCRIBE_REALTIME_MODEL, sampleRate: 24_000,
      socketFactory: () => socket as unknown as WebSocket,
      onDelta: vi.fn(), onFinal: vi.fn(), onError: vi.fn(),
    })
    open.push(stt)
    const connecting = stt.connect()
    socket.onclose!({ code: 1006, reason: '' })
    await expect(connecting).rejects.toMatchObject({ code: 'transport_failed', message: expect.stringContaining('1006') })
  })
})

describe('speech gating, identical to stt.ts', () => {
  it('sends nothing while he is silent, then the 300 ms lead-in with the first frame of speech', async () => {
    const h = await harness()
    h.hush(40)
    expect(h.chunks()).toEqual([])
    h.speak(1)
    // Fifteen frames of pre-roll plus the onset frame, in one message.
    expect(h.chunks()).toEqual([16 * FRAME])
    h.speak(10)
    // Then 100 ms chunks rather than fifty messages a second.
    expect(h.chunks()).toEqual([16 * FRAME, 5 * FRAME, 5 * FRAME])
  })

  it('flushes the last syllable before the commit, and commits with an empty chunk', async () => {
    const h = await harness()
    h.speak(20)
    h.speak(3)
    expect(h.stt.commit(first)).toBe(true)
    expect(h.chunks().reduce((sum, n) => sum + n, 0)).toBe(23 * FRAME)
    expect(h.commits()).toEqual([{ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: 24_000 }])
  })

  it('pads a short segment past the vendor floor, because a commit under 0.3 s closes the socket', async () => {
    const h = await harness()
    h.speak(5) // 100 ms
    expect(h.stt.commit(first)).toBe(true)
    // 350 ms is 8,400 samples; 2,400 went up as speech, the rest as silence.
    expect(h.chunks()).toEqual([FRAME, 4 * FRAME, 8_400 - 5 * FRAME])
    expect(h.onUsage).toHaveBeenLastCalledWith({ audio: 350, text: 0 })
  })

  it('does not commit an empty buffer', async () => {
    const h = await harness()
    expect(h.stt.commit(first)).toBe(false)
    h.hush(20)
    expect(h.stt.commit(first)).toBe(false)
    expect(h.commits()).toEqual([])
  })
})

describe('committed speech identity, by queue position', () => {
  it('releases real answers to their own commits in spoken order, with their own timing', async () => {
    const h = await harness()
    const mutable = { ...first }
    h.commit(mutable)
    mutable.startedAtMs = 9000
    h.commit(second)
    expect(h.stt.pendingCount).toBe(2)
    h.at(4700)
    h.receive(REAL.committed)
    h.at(4750)
    h.receive(REAL.committedSecond)
    expect(h.onFinal.mock.calls).toEqual([
      ["Hi, I'm Alex. I just moved here from Chicago, and I'm still finding my way around.", first, 2100],
      ['What brings you to this bookshop on a Tuesday afternoon?', second, 450],
    ])
    expect(h.onSettled).toHaveBeenCalledTimes(2)
    expect(h.stt.pendingCount).toBe(0)
  })

  it('advances past a segment of silence with an empty final rather than a blank turn', async () => {
    const h = await harness()
    h.commit(first); h.commit(second)
    h.receive(REAL.committedSilence)
    h.receive(REAL.committedSecond)
    expect(h.onFinal.mock.calls.map(([text, timing]) => [text, timing])).toEqual([
      ['', first], ['What brings you to this bookshop on a Tuesday afternoon?', second],
    ])
  })

  it('bounds a stalled answer and makes the late one consume its own slot', async () => {
    vi.useFakeTimers()
    const h = await harness()
    h.commit(first)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(h.onFinal.mock.calls[0]![0]).toBe('')
    expect(h.onError).toHaveBeenCalledOnce()
    expect(h.onError.mock.calls[0]![0]).toMatchObject({ fatal: false })
    expect(h.stt.pendingCount).toBe(0)
    h.commit(second)
    h.receive(REAL.committed) // The timed-out segment's answer, arriving late.
    h.receive(REAL.committedSecond)
    expect(h.onFinal.mock.calls.map(([text]) => text)).toEqual(['', 'What brings you to this bookshop on a Tuesday afternoon?'])
  })

  it('ignores an answer after close', async () => {
    const h = await harness()
    h.commit(first)
    h.stt.close()
    h.receive(REAL.committed)
    expect(h.onFinal).not.toHaveBeenCalled()
  })
})

describe('partials while he is still speaking', () => {
  it('captions the live segment from onset, before any commit exists', async () => {
    const h = await harness()
    h.at(1000)
    h.speak(10)
    h.at(3300)
    h.receive(REAL.partialFirst)
    h.at(5200)
    h.receive(REAL.partialLater)
    expect(h.onDelta.mock.calls).toEqual([
      ['Hi.', { startedAtMs: 1000, stoppedAtMs: 3300, committedAtMs: 3300 }],
      ["Hi, I'm Alex. I just moved here from Chicago, and I'm still finding my", { startedAtMs: 1000, stoppedAtMs: 5200, committedAtMs: 5200 }],
    ])
    // A partial is a caption. It is never a final and never a turn.
    expect(h.onFinal).not.toHaveBeenCalled()
  })

  it('binds a partial that lands between a commit and its answer to that commit', async () => {
    // Read off the live socket: the last partial of a segment can arrive after
    // our commit and a millisecond before its committed_transcript.
    const h = await harness()
    h.commit(first)
    h.receive(REAL.partialLater)
    expect(h.onDelta).toHaveBeenLastCalledWith(
      "Hi, I'm Alex. I just moved here from Chicago, and I'm still finding my", first,
    )
  })

  it('never runs two turns together in one caption', async () => {
    const h = await harness()
    h.commit(first)
    h.receive(REAL.committed)
    h.commit(second)
    h.receive(REAL.partialSecond) // Belongs to `second`, which is pending[0].
    expect(h.onDelta).toHaveBeenLastCalledWith('What brings', second)
    h.stt.pushFrame(loud(), true) // A third segment starts while `second` waits.
    h.onDelta.mockClear()
    h.receive(REAL.partialSecond) // Still the vendor reading `second`.
    expect(h.onDelta).toHaveBeenLastCalledWith('What brings', second)
  })
})

describe('the repeat after every answer (fact 5)', () => {
  it('does not caption his next sentence with the one he just finished', async () => {
    // The live ordering: committed, then the same words as a partial, with
    // him already a syllable into the next turn.
    const h = await harness()
    h.commit(first)
    h.receive(REAL.committed)
    h.speak(1)
    h.onDelta.mockClear()
    h.receive(REAL.echo)
    expect(h.onDelta).not.toHaveBeenCalled()
    h.receive(REAL.partialSecond)
    expect(h.onDelta.mock.calls.map(([text]) => text)).toEqual(['What brings'])
  })

  it('does not hand the repeat to a commit still waiting for its own answer', async () => {
    const h = await harness()
    h.commit(first)
    h.commit(second)
    h.receive(REAL.committed)
    h.onDelta.mockClear()
    h.receive(REAL.echo)
    expect(h.onDelta).not.toHaveBeenCalled()
    h.receive(REAL.committedSecond)
    expect(h.onFinal.mock.calls.map(([text, timing]) => [text, timing])).toEqual([
      ["Hi, I'm Alex. I just moved here from Chicago, and I'm still finding my way around.", first],
      ['What brings you to this bookshop on a Tuesday afternoon?', second],
    ])
  })

  it('does not double a split into its own caption', async () => {
    const h = await harness()
    h.speak(1000)
    h.speak(1, quiet) // The split.
    const piece = 'So the thing about moving to a new city is that nobody tells you.'
    h.receive(`{"message_type":"committed_transcript","text":"${piece}"}`)
    h.onDelta.mockClear()
    h.receive(`{"message_type":"partial_transcript","text":"${piece}"}`)
    expect(h.onDelta).not.toHaveBeenCalled()
  })

  it('watches for exactly one partial, so the same words said again are still heard', async () => {
    const h = await harness()
    h.commit(first)
    h.receive(REAL.committed)
    h.speak(1)
    h.receive(REAL.partialSecond) // New speech ends the watch...
    h.onDelta.mockClear()
    h.receive(REAL.echo) // ...so identical words later are his, and captioned.
    expect(h.onDelta).toHaveBeenCalledOnce()
  })
})

describe('pause and clear', () => {
  it('commits speech already sent into a discarded slot, so it cannot lead his next turn', async () => {
    // Scribe has no clear message. Left uncommitted, the words before a pause
    // would be transcribed at the front of the sentence after it.
    const h = await harness()
    h.speak(20)
    h.stt.clear()
    expect(h.commits()).toHaveLength(1)
    h.commit(second)
    h.receive('{"message_type":"committed_transcript","text":"Private words before the pause."}')
    h.receive(REAL.committedSecond)
    expect(h.onFinal.mock.calls).toEqual([['What brings you to this bookshop on a Tuesday afternoon?', second, 100]])
  })

  it('discards pending finals and sends nothing when no speech went up since the last commit', async () => {
    vi.useFakeTimers()
    const h = await harness()
    h.commit(first)
    h.stt.clear()
    expect(h.commits()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(20_000)
    h.receive(REAL.committed)
    expect(h.onFinal).not.toHaveBeenCalled()
    expect(h.onError).not.toHaveBeenCalled()
  })
})

describe('a monologue longer than the vendor will hold', () => {
  it('splits at the first quiet frame after twenty seconds and carries the text as a prefix', async () => {
    const h = await harness()
    h.speak(1000) // 20 s of speech, no pause yet.
    expect(h.commits()).toHaveLength(0)
    h.speak(1, quiet) // A breath.
    expect(h.commits()).toHaveLength(1)
    // A split is not a turn: nothing is pending and nothing is final.
    expect(h.stt.pendingCount).toBe(0)
    h.receive('{"message_type":"committed_transcript","text":"So the thing about moving to a new city is that nobody tells you."}')
    expect(h.onFinal).not.toHaveBeenCalled()
    h.receive('{"message_type":"partial_transcript","text":"I thought it would"}')
    expect(h.onDelta).toHaveBeenLastCalledWith(
      'So the thing about moving to a new city is that nobody tells you. I thought it would', expect.any(Object),
    )
    h.speak(5)
    expect(h.stt.commit(first)).toBe(true)
    h.receive('{"message_type":"committed_transcript","text":"I thought it would be a couple of weeks."}')
    expect(h.onFinal.mock.calls).toEqual([[
      'So the thing about moving to a new city is that nobody tells you. I thought it would be a couple of weeks.',
      first, 1800,
    ]])
  })

  it('splits at thirty seconds regardless, six short of the commit the vendor would make itself', async () => {
    const h = await harness()
    h.speak(1499)
    expect(h.commits()).toHaveLength(0)
    h.speak(1)
    expect(h.commits()).toHaveLength(1)
    h.speak(5)
    h.stt.commit(first)
    // The piece after a split starts from nothing, so it is padded like any other.
    expect(h.chunks().at(-1)).toBe(8_400 - 5 * FRAME)
  })

  it('still holds an unsolicited vendor commit as the live prefix', async () => {
    const h = await harness()
    h.speak(10)
    h.receive('{"message_type":"committed_transcript","text":"Nobody asked for this half."}')
    h.speak(5)
    h.stt.commit(first)
    h.receive('{"message_type":"committed_transcript","text":"But here is the rest."}')
    expect(h.onFinal.mock.calls[0]![0]).toBe('Nobody asked for this half. But here is the rest.')
  })
})

describe('keeping the socket alive through her lines', () => {
  it('feeds twenty milliseconds of digital silence once five seconds pass with nothing sent', async () => {
    // Measured: with no audio for 15.8 s the server closes the socket.
    vi.useFakeTimers()
    const h = await harness()
    await vi.advanceTimersByTimeAsync(2_500)
    expect(h.chunks()).toEqual([])
    await vi.advanceTimersByTimeAsync(2_500)
    expect(h.chunks()).toEqual([FRAME])
    const sent = fromBase64(h.socket.sent[0]!.audio_base_64!)
    expect(sent.every((byte) => byte === 0)).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.chunks()).toEqual([FRAME, FRAME, FRAME])
  })

  it('sends no keep-alive while speech is flowing, and stops every timer on close', async () => {
    vi.useFakeTimers()
    const h = await harness()
    for (let i = 0; i < 400; i += 1) {
      h.speak(1)
      await vi.advanceTimersByTimeAsync(20)
    }
    // One onset chunk, then nothing but 100 ms chunks of his speech. A
    // keep-alive would be a lone 20 ms chunk.
    expect(h.chunks().slice(1).every((samples) => samples === 5 * FRAME)).toBe(true)
    h.stt.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports what went up since the last commit when it closes, because it was billed', async () => {
    vi.useFakeTimers()
    const h = await harness()
    await vi.advanceTimersByTimeAsync(10_000)
    h.stt.close()
    expect(h.onUsage).toHaveBeenCalledWith({ audio: 40, text: 0 })
  })
})

describe('fatal session errors', () => {
  it('reports a throttled commit once, and not again for the close that follows it', async () => {
    const h = await harness()
    h.receive(REAL.commitThrottled)
    h.socket.onclose!({ code: 1000, reason: 'commit_throttled' })
    expect(h.onError).toHaveBeenCalledOnce()
    expect(h.onError.mock.calls[0]![0]).toMatchObject({
      fatal: true, message: expect.stringContaining('commit_throttled'),
    })
  })

  it('treats an unexpected close as the end of hearing him', async () => {
    const h = await harness()
    h.socket.onclose!({ code: 1000, reason: '' })
    expect(h.onError.mock.calls[0]![0]).toMatchObject({ code: 'transport_failed', fatal: true })
  })

  it('caps unanswered commits instead of growing without bound', async () => {
    const h = await harness()
    for (let i = 0; i < 64; i += 1) {
      h.speak(20)
      h.stt.clear()
    }
    h.speak(20)
    expect(h.stt.commit(second)).toBe(false)
    expect(h.onError.mock.calls[0]![0]).toMatchObject({ fatal: true })
  })
})

describe('the drop-in', () => {
  const pipeline = { stt: { model: SCRIBE_REALTIME_MODEL, sampleRate: 24_000 } } as never
  const events = { onDelta: vi.fn(), onFinal: vi.fn(), onError: vi.fn() }

  it('opens Scribe with the minted token when the session names it', () => {
    const stt = transcriberFor({
      clientSecret: '', stt: { vendor: 'elevenlabs', model: SCRIBE_REALTIME_MODEL, token: 'sutkn_fixture' }, pipeline,
    }, events)
    expect(stt).toBeInstanceOf(ScribeTranscriber)
  })

  it('opens OpenAI exactly as before when the session names nothing', () => {
    const stt = transcriberFor({
      clientSecret: 'ephemeral', pipeline: { stt: { model: 'gpt-4o-mini-transcribe', sampleRate: 24_000 } } as never,
    }, events)
    expect(stt).toBeInstanceOf(RealtimeTranscriber)
  })
})

describe('the rate the meter prices it at', () => {
  it('prices a minute of audio sent at the list price', () => {
    // Scribe reports no usage, so the transcriber reports milliseconds sent.
    expect(priceTokens(SCRIBE_REALTIME_MODEL, { audioInput: 60_000 })).toBeCloseTo(SCRIBE_REALTIME_USD_PER_MINUTE, 12)
    expect(SCRIBE_REALTIME_USD_PER_MINUTE * 60).toBeCloseTo(0.39, 12)
  })
})
