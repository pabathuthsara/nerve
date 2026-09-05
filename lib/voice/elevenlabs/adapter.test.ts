import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriberOptions, TranscriptionTiming } from './stt'
import type { MicCaptureOptions } from './capture'
import type { PcmPlayerOptions } from './player'
import type { TurnEvent } from './turn-protocol'
import { ElevenLabsVoiceProvider } from './index'
import { ElevenLabsPersonaCompiler } from './persona'
import { DEFAULT_CALIBRATION } from '../types'
import type { SessionSummary } from '../types'
import { tess } from '@/lib/personas/tess'

const hardware = vi.hoisted(() => ({
  stt: null as TranscriberOptions | null,
  stopMic: vi.fn(), closeContext: vi.fn(), stopCapture: vi.fn(), closeStt: vi.fn(),
  clearStt: vi.fn(), connectStt: vi.fn(async () => undefined),
  capture: null as MicCaptureOptions | null,
  commits: [] as TranscriptionTiming[],
  track: { enabled: true, stop: vi.fn() },
  players: [] as { playedSeconds: number; scheduledSeconds: number; stopped: boolean }[],
}))

vi.mock('./stt', () => ({
  RealtimeTranscriber: class {
    constructor(options: TranscriberOptions) { hardware.stt = options }
    async connect() { await hardware.connectStt() }
    pushFrame() {}
    get pendingCount() { return hardware.commits.length }
    commit(timing: TranscriptionTiming) { hardware.commits.push(timing); return true }
    clear() { hardware.commits.length = 0; hardware.clearStt() }
    close() { hardware.closeStt() }
  },
}))
vi.mock('./capture', async (importOriginal) => ({
  ...await importOriginal<typeof import('./capture')>(),
  MicCapture: class {
    constructor(options: MicCaptureOptions) { hardware.capture = options }
    async start() {}
    stop() { hardware.stopCapture() }
  },
}))
vi.mock('./player', () => ({
  PcmPlayer: class {
    playedSeconds = 0
    scheduledSeconds = 0
    stopped = false
    constructor(private options: PcmPlayerOptions) { hardware.players.push(this) }
    get isPlaying() { return !this.stopped && this.scheduledSeconds > 0 }
    enqueue(samples: Float32Array) {
      if (this.stopped) return
      if (this.scheduledSeconds === 0) this.options.onFirstAudio?.(0)
      this.scheduledSeconds += samples.length / this.options.sampleRate
    }
    async waitForDrain() { this.playedSeconds = this.scheduledSeconds }
    stopNow() { this.stopped = true; return this.playedSeconds }
  },
}))
vi.mock('@/lib/audio/scenes', () => ({ sceneForRoom: () => null }))

function token() {
  const compiled = new ElevenLabsPersonaCompiler({ ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational' })
    .compile(tess, DEFAULT_CALIBRATION)
  return {
    provider: 'elevenlabs', sessionId: 'reserved-session', turn: { endpoint: '/api/voice/turn' },
    startupAttemptId: 'startup-operation',
    clientSecret: 'ephemeral', model: compiled.tts.model, rate: { currency: 'USD', perMinute: 0.033 },
    pipeline: compiled, credits: { budget: 10_000, warnAt: 8000, used: null, limit: null },
  }
}
function encoded(events: TurnEvent[]) {
  return new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join('\n') + '\n')
}
function fullReply(text: string): Response {
  return new Response(encoded([
    { type: 'clip', id: 'clip', text },
    { type: 'audio', clipId: 'clip', audio_base64: 'AAA=', alignment: null },
    { type: 'done', exit: false },
  ]))
}
function final(text: string, settle = true) {
  const timing = hardware.commits.shift() ?? { startedAtMs: 1000, stoppedAtMs: 1000, committedAtMs: 1000 }
  hardware.stt!.onFinal(text, timing, 100)
  if (settle) hardware.stt!.onSettled?.()
}

beforeEach(() => {
  hardware.stt = null
  hardware.capture = null
  hardware.commits.length = 0
  hardware.players.length = 0
  vi.clearAllMocks()
  hardware.connectStt.mockResolvedValue(undefined)
  hardware.track.enabled = true
  hardware.track.stop = hardware.stopMic
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({
    getTracks: () => [hardware.track], getAudioTracks: () => [hardware.track],
  })) } })
  vi.stubGlobal('AudioContext', class {
    state = 'running'
    currentTime = 0
    destination = {}
    createGain() { return { connect() {} } }
    createAnalyser() { return {} }
    createMediaStreamSource() { return { connect() {} } }
    async close() { hardware.closeContext() }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('ElevenLabs combined adapter', () => {
  it('sends fresh steering on every reply without retaining old directions or one-shot reminders', async () => {
    const requests: { steering: string; warmth: number; history: { role: string }[] }[] = []
    const provider = new ElevenLabsVoiceProvider({ fetchImpl: vi.fn(async (url, init) => {
      if (String(url).includes('/token')) return Response.json(token())
      requests.push(JSON.parse(String(init?.body)))
      return fullReply('A short answer.')
    }) })
    let warmth = 35
    provider.setReplyState(() => ({ steering: `[Current warmth ${warmth}]`, warmth }))
    provider.on('user.transcript', ({ final }) => { if (final) warmth += 10 })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    provider.reinforce('Close this scene.')
    final('First clause.', false)
    final('Second clause.', false)
    expect(requests).toHaveLength(0)
    hardware.stt!.onSettled?.()
    await vi.waitFor(() => expect(hardware.players).toHaveLength(1))
    expect(requests[0]).toMatchObject({ warmth: 55, steering: '[Current warmth 55] Close this scene.' })
    // Several unchanged replies must all carry the direction; none can rely on
    // the previous request remembering it. Hold the post-score value constant
    // to reproduce several replies that remain in the same band.
    for (let i = 0; i < 4; i += 1) {
      warmth = 45
      final('Another thought.')
      await vi.waitFor(() => expect(hardware.players).toHaveLength(i + 2))
      expect(requests[i + 1]).toMatchObject({ warmth: 55, steering: '[Current warmth 55]' })
      expect(requests[i + 1]!.history.every((item) => item.role !== 'system')).toBe(true)
    }
    await provider.end()
  })

  it('starts a cold reply immediately and keeps normalized transcripts', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes('/token')
      ? Response.json(token()) : fullReply('[playful] That sounds nice.'))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl, clock: () => 1000 })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    provider.setWarmth(0)
    final('How is your day?')
    // There is no 700ms sleep before the request, even for a cold character.
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('/api/voice/turn')
    await vi.waitFor(() => expect(hardware.players).toHaveLength(1))
    const summary = await provider.end()
    expect(summary.turns.filter((turn) => turn.speaker === 'agent').map((turn) => turn.text))
      .toEqual(['That sounds nice.'])
    expect(provider.getSessionId()).toBe('reserved-session')
  })

  it('never mints or consumes a rep when microphone permission is denied', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => { throw new Error('denied') }) } })
    const fetchImpl = vi.fn()
    const provider = new ElevenLabsVoiceProvider({ fetchImpl })
    await expect(provider.connect(tess, DEFAULT_CALIBRATION)).rejects.toMatchObject({ code: 'mic_denied' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(provider.getSessionId()).toBeNull()
  })

  it('releases the microphone after a failed mint', async () => {
    const provider = new ElevenLabsVoiceProvider({ fetchImpl: vi.fn(async () => new Response('', { status: 503 })) })
    await expect(provider.connect(tess, DEFAULT_CALIBRATION)).rejects.toMatchObject({ code: 'token_mint_failed' })
    expect(hardware.stopMic).toHaveBeenCalledOnce()
  })

  it('does not let an aborted old response clear a new reply or emit an old exit', async () => {
    let resolveOld!: (response: Response) => void
    let latest!: ReadableStreamDefaultController<Uint8Array>
    let turns = 0
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/token')) return Response.json(token())
      turns += 1
      if (turns === 1) return new Promise<Response>((resolve) => { resolveOld = resolve })
      return new Response(new ReadableStream({ start(controller) { latest = controller } }))
    })
    const provider = new ElevenLabsVoiceProvider({ fetchImpl, clock: () => 1000 })
    const exits = vi.fn()
    provider.on('character.exit', exits)
    await provider.connect(tess, DEFAULT_CALIBRATION)
    final('First thought.')
    final('Actually, another thought.')
    resolveOld(new Response(encoded([{ type: 'done', exit: true }])))
    await Promise.resolve()
    await Promise.resolve()
    latest.enqueue(encoded([
      { type: 'clip', id: 'new', text: 'The current answer.' },
      { type: 'audio', clipId: 'new', audio_base64: 'AAA=', alignment: null },
      { type: 'done', exit: false },
    ]))
    await vi.waitFor(() => expect(hardware.players).toHaveLength(1))
    const summary = await provider.end()
    expect(summary.turns.filter((turn) => turn.speaker === 'agent').map((turn) => turn.text)).toEqual(['The current answer.'])
    expect(exits).not.toHaveBeenCalled()
  })

  it('does not fall back to the old two-request path after a combined route error', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes('/token')
      ? Response.json(token()) : new Response('', { status: 503 }))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl })
    const errors = vi.fn()
    provider.on('error', errors)
    await provider.connect(tess, DEFAULT_CALIBRATION)
    final('Hello.')
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce())
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual(['/api/voice/token', '/api/voice/turn'])
    await provider.end()
  })

  it('actually mutes microphone ingress and resumes only new turns', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes('/token')
      ? Response.json(token()) : fullReply('A fresh reply.'))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl })
    provider.setMuted(true)
    await provider.connect(tess, DEFAULT_CALIBRATION)
    expect(hardware.track.enabled).toBe(false)
    hardware.stt!.onDelta('Private speech', { startedAtMs: 1000, stoppedAtMs: 1000, committedAtMs: 1000 })
    final('Private speech while muted.')
    expect(fetchImpl).toHaveBeenCalledOnce()
    provider.setMuted(false)
    expect(hardware.track.enabled).toBe(true)
    final('A fresh thought.')
    await vi.waitFor(() => expect(hardware.players).toHaveLength(1))
    provider.setMuted(true)
    expect(hardware.clearStt).toHaveBeenCalledOnce()
    const summary = await provider.end()
    expect(summary.turns.filter((turn) => turn.speaker === 'user').map((turn) => turn.text)).toEqual(['A fresh thought.'])
  })

  it('keeps startup identifiers for an owned refund after transport setup fails', async () => {
    hardware.connectStt.mockRejectedValueOnce(new Error('socket refused'))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl: vi.fn(async () => Response.json(token())) })
    await expect(provider.connect(tess, DEFAULT_CALIBRATION)).rejects.toThrow('socket refused')
    expect(provider.getSessionId()).toBe('reserved-session')
    expect(provider.getStartupAttemptId()).toBe('startup-operation')
    expect(hardware.stopMic).toHaveBeenCalledOnce()
    expect(hardware.closeStt).toHaveBeenCalledOnce()
    expect(hardware.closeContext).toHaveBeenCalledOnce()
  })

  it('does not restart media after an end races a successful mint', async () => {
    let resolveMint!: (response: Response) => void
    const fetchImpl = vi.fn(async () => new Promise<Response>((resolve) => { resolveMint = resolve }))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl })
    const connecting = provider.connect(tess, DEFAULT_CALIBRATION)
    const rejected = expect(connecting).rejects.toMatchObject({ code: 'session_failed' })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce())
    await provider.end()
    resolveMint(Response.json(token()))
    await rejected
    expect(hardware.connectStt).not.toHaveBeenCalled()
    expect(hardware.stopMic).toHaveBeenCalledOnce()
    expect(provider.getStartupAttemptId()).toBe('startup-operation')
  })

  it('ignores late transcription callbacks after a session ends', async () => {
    const fetchImpl = vi.fn(async () => Response.json(token()))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    await provider.end()
    final('A stale final transcription.')
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect((await provider.end()).turns).toEqual([])
  })

  it('seals a completed reply before a deadline listener synchronously ends the session', async () => {
    const provider = new ElevenLabsVoiceProvider({ fetchImpl: vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/token') ? Response.json(token()) : fullReply('A final goodbye.')) })
    let summary: SessionSummary | null = null
    const transcripts = vi.fn()
    provider.on('agent.transcript', transcripts)
    provider.on('agent.speech.stop', () => { void provider.end('cap').then((value) => { summary = value }) })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    final('See you later.')
    await vi.waitFor(() => expect(summary).not.toBeNull())
    expect(transcripts).toHaveBeenCalledOnce()
    expect(summary!.turns.filter((turn) => turn.speaker === 'agent').map((turn) => turn.text)).toEqual(['A final goodbye.'])
  })

  it('seals an interrupted reply before an end listener runs on its speech stop', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const provider = new ElevenLabsVoiceProvider({ fetchImpl: vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/token')) return Response.json(token())
      return new Response(new ReadableStream({ start(value) { controller = value } }))
    }) })
    let summary: SessionSummary | null = null
    const transcripts = vi.fn()
    provider.on('agent.transcript', transcripts)
    provider.on('agent.speech.stop', () => { void provider.end('cap').then((value) => { summary = value }) })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    final('Say something.')
    await vi.waitFor(() => expect(controller).toBeDefined())
    controller.enqueue(encoded([
      { type: 'clip', id: 'speaking', text: 'Only heard words.' },
      { type: 'audio', clipId: 'speaking', audio_base64: 'AAA=', alignment: null },
    ]))
    await vi.waitFor(() => expect(hardware.players).toHaveLength(1))
    hardware.players[0]!.playedSeconds = hardware.players[0]!.scheduledSeconds
    // A second final can race an in-progress reply; the adapter's overlap
    // gate follows the same barge-in path as microphone onset.
    final('I am taking the turn.')
    await vi.waitFor(() => expect(summary).not.toBeNull())
    expect(transcripts).toHaveBeenCalledOnce()
    expect(summary!.turns.filter((turn) => turn.speaker === 'agent').map((turn) => turn.text)).toEqual(['Only heard words.'])
  })

  it('keeps each clause’s speech timing and buys one reply after overlapping transcription settles', async () => {
    let now = 1000
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes('/token')
      ? Response.json(token()) : fullReply('I heard both thoughts.'))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl, clock: () => now })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    const frame = (at: number, amplitude: number) => {
      now = at
      hardware.capture!.onFrame(new Float32Array(480).fill(amplitude))
    }
    frame(2000, 0.1); frame(2100, 0.1)
    frame(3000, 0); frame(3600, 0)
    expect(hardware.commits[0]).toEqual({ startedAtMs: 2000, stoppedAtMs: 3000, committedAtMs: 3600 })
    frame(3660, 0.1); frame(3760, 0.1)
    final('The first clause.')
    expect(fetchImpl).toHaveBeenCalledOnce() // New speech is already active.
    frame(4400, 0); frame(5000, 0)
    expect(fetchImpl).toHaveBeenCalledOnce() // Its final is still pending.
    final('And the second clause.')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const request = JSON.parse((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
    expect(request.history).toEqual([
      { role: 'user', content: 'The first clause.' },
      { role: 'user', content: 'And the second clause.' },
    ])
    const summary = await provider.end()
    expect(summary.turns.filter((turn) => turn.speaker === 'user').map(({ text, t_start, t_end }) => ({ text, t_start, t_end })))
      .toEqual([
        { text: 'The first clause.', t_start: 1, t_end: 2 },
        { text: 'And the second clause.', t_start: 2.66, t_end: 3.4 },
      ])
  })

  it('answers the saved clause once when the newer committed clause is empty', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes('/token')
      ? Response.json(token()) : fullReply('Yes.'))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    hardware.commits.push(
      { startedAtMs: 1000, stoppedAtMs: 2000, committedAtMs: 2600 },
      { startedAtMs: 2700, stoppedAtMs: 3000, committedAtMs: 3600 },
    )
    final('An earlier complete thought.')
    expect(fetchImpl).toHaveBeenCalledOnce()
    final('')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect((await provider.end()).turns.filter((turn) => turn.speaker === 'user')).toHaveLength(1)
  })

  it('does not revive an unanswered clause when paused before the transcription drain', async () => {
    const fetchImpl = vi.fn(async () => Response.json(token()))
    const provider = new ElevenLabsVoiceProvider({ fetchImpl })
    await provider.connect(tess, DEFAULT_CALIBRATION)
    final('A thought before the pause.', false)
    provider.setMuted(true)
    provider.setMuted(false)
    hardware.stt!.onSettled?.()
    expect(fetchImpl).toHaveBeenCalledOnce()
    await provider.end()
  })
})
