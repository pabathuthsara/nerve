/**
 * OpenAI Realtime adapter — WebRTC transport.
 *
 * The browser holds a peer connection directly with the model using a
 * short-lived token minted server-side. No media server, no WebSocket proxy, no
 * audio touching a machine we pay for (§04).
 *
 * Transport and lifecycle only. Event translation lives in ./translate.ts so it
 * can be tested without a network.
 */

import { VoiceEmitter } from '../emitter'
import { priceUsageSample, summarizeUsage } from '../rates'
import { sortTurns } from '../transcript'
import type { VoiceProvider } from '../provider'
import {
  SESSION_CAP_SECONDS,
  VoiceError,
  type Analysers,
  type Calibration,
  type Persona,
  type ProviderId,
  type Rate,
  type SessionSummary,
  type TranscriptTurn,
  type TransportStats,
  type UsageSample,
  type VoiceEventHandler,
  type VoiceEventName,
} from '../types'
import type { OpenAISessionConfig } from './persona'
import { compileReinforcement } from '../reinforcement'
import { OpenAIEventTranslator } from './translate'
import { OpenAIResponseGate } from './response-gate'
import { buildSteeringItem } from './messages'
import { Room } from '@/lib/audio/engine'
import { sceneFor } from '@/lib/audio/scenes'
import type { RoomControls } from '@/lib/audio/types'

const CALLS_ENDPOINT = 'https://api.openai.com/v1/realtime/calls'
const PROVIDER: ProviderId = 'openai'

/** What the token route hands back. Instructions ride along so re-injection
 *  does not need a second round trip mid-rep. */
export interface MintedSession {
  clientSecret: string
  model: string
  rate: Rate
  session: OpenAISessionConfig
}

export interface OpenAIAdapterOptions {
  /** Where to mint the ephemeral token. */
  tokenEndpoint?: string
  /** Injected for tests; defaults to the global. */
  fetchImpl?: typeof fetch
  /** Monotonic milliseconds. Injected for tests. */
  clock?: () => number
  /** M0 model arm. The token route applies the server-side allowlist. */
  model?: string
}

export class OpenAIVoiceProvider implements VoiceProvider {
  readonly id: ProviderId = PROVIDER

  private readonly emitter = new VoiceEmitter()
  private readonly turns: TranscriptTurn[] = []
  private readonly tokenEndpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly clock: () => number
  private readonly requestedModel: string | undefined
  private readonly translator: OpenAIEventTranslator
  private readonly responseGate: OpenAIResponseGate
  private readonly usageSamples: UsageSample[] = []

  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private micStream: MediaStream | null = null
  private audioEl: HTMLAudioElement | null = null
  private room: Room | null = null
  private audioCtx: AudioContext | null = null
  private userAnalyser: AnalyserNode | null = null
  private agentAnalyser: AnalyserNode | null = null
  private capTimer: ReturnType<typeof setTimeout> | null = null

  private t0: number | null = null
  private minted: MintedSession | null = null
  private config: OpenAISessionConfig | null = null
  private persona: Persona | null = null
  private ended = false

  constructor(options: OpenAIAdapterOptions = {}) {
    this.tokenEndpoint = options.tokenEndpoint ?? '/api/voice/token'
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.clock = options.clock ?? (() => performance.now())
    this.requestedModel = options.model
    this.responseGate = new OpenAIResponseGate(() => this.send({ type: 'response.create' }))
    this.translator = new OpenAIEventTranslator(
      this.emitter,
      () => this.now(),
      (turn) => this.turns.push(turn),
      {
        onOverlap: (responseId) => this.cancelOverlappingResponse(responseId),
        onUsage: (usage) => this.usageSamples.push(priceUsageSample(this.model, usage)),
        onUserTurnCommitted: () => this.responseGate.userTurnCommitted(),
        onResponseSettled: () => this.responseGate.responseSettled(),
        onCharacterExit: (at) => this.emitter.emit('character.exit', { at }),
        onToolSyntaxLeak: (at) => this.emitter.emit('agent.tool-leak', { at }),
      },
    )
  }

  get model(): string {
    return this.minted?.model ?? this.requestedModel ?? 'gpt-realtime-mini'
  }

  get rate(): Rate {
    return this.minted?.rate ?? { currency: 'USD', perMinute: 0 }
  }

  /** Seconds since connect, monotonic. The clock behind every timestamp we emit. */
  private now(): number {
    return this.t0 === null ? 0 : (this.clock() - this.t0) / 1000
  }

  async connect(persona: Persona, calibration: Calibration): Promise<void> {
    this.persona = persona
    this.responseGate.reset()

    const minted = await this.mint(persona, calibration)
    this.minted = minted
    this.config = minted.session

    const mic = await this.openMicrophone()
    this.micStream = mic

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    this.pc = pc

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this.emitter.emit('error', {
          error: new VoiceError('transport_failed', PROVIDER, 'The connection to the character dropped.'),
        })
      }
    }

    const track = mic.getAudioTracks()[0]
    if (!track) {
      throw new VoiceError('mic_denied', PROVIDER, 'No audio track on the microphone stream.')
    }
    pc.addTrack(track, mic)

    // Her voice arrives on this track.
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) this.attachRemote(stream)
    }

    const dc = pc.createDataChannel('oai-events')
    this.dc = dc
    dc.onmessage = (event: MessageEvent<string>) => this.translator.ingest(event.data)
    dc.onerror = () => {
      this.emitter.emit('error', {
        error: new VoiceError('transport_failed', PROVIDER, 'The event channel errored.', { fatal: false }),
      })
    }

    const opened = new Promise<void>((resolve, reject) => {
      dc.onopen = () => resolve()
      setTimeout(
        () => reject(new VoiceError('transport_failed', PROVIDER, 'Timed out opening the event channel.')),
        15_000,
      )
    })

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const answerSdp = await this.exchangeSdp(offer.sdp ?? '', minted)
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    await opened

    // The clock starts when media is flowing, not when setup began. Timestamps
    // that included connection setup would not be comparable across sessions.
    this.t0 = this.clock()
    this.buildUserAnalyser(mic)

    // Backstop for the 8-minute hard cap (§05), enforced here as well as in the
    // UI so no code path can run a session past it.
    this.capTimer = setTimeout(() => {
      void this.end('cap')
    }, SESSION_CAP_SECONDS * 1000)
  }

  private async mint(persona: Persona, calibration: Calibration): Promise<MintedSession> {
    let response: Response
    try {
      response = await this.fetchImpl(this.tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personaId: persona.id, calibration, model: this.requestedModel }),
      })
    } catch (cause) {
      throw new VoiceError('token_mint_failed', PROVIDER, 'Could not reach the token endpoint.', { cause })
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new VoiceError(
        'token_mint_failed',
        PROVIDER,
        `Token mint failed (${response.status}). ${detail.slice(0, 300)}`,
      )
    }
    return (await response.json()) as MintedSession
  }

  private async openMicrophone(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (cause) {
      throw new VoiceError('mic_denied', PROVIDER, 'Microphone access was refused.', { cause })
    }
  }

  private async exchangeSdp(offerSdp: string, minted: MintedSession): Promise<string> {
    const url = `${CALLS_ENDPOINT}?model=${encodeURIComponent(minted.model)}`
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${minted.clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offerSdp,
      })
    } catch (cause) {
      throw new VoiceError('transport_failed', PROVIDER, 'SDP exchange could not reach the provider.', { cause })
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new VoiceError(
        'transport_failed',
        PROVIDER,
        `SDP exchange failed (${response.status}). ${detail.slice(0, 300)}`,
      )
    }
    return await response.text()
  }

  private attachRemote(stream: MediaStream): void {
    const scene = this.persona?.acoustics ? sceneFor(this.persona.acoustics) : null

    // Chrome will not deliver a remote WebRTC track to WebAudio unless the
    // stream is also attached to a media element. Muted, because playback goes
    // through the graph when there is a room; unmuted when there is not.
    const el = new Audio()
    el.autoplay = true
    el.srcObject = stream
    el.muted = scene !== null
    void el.play().catch(() => {
      /* Autoplay is fine here — connect() is downstream of a user gesture. */
    })
    this.audioEl = el

    const ctx = this.ensureAudioContext()
    const source = ctx.createMediaStreamSource(stream)

    // The analyser taps her DRY voice. The waveform should track what she said,
    // not what the room did to it.
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    this.agentAnalyser = analyser

    if (!scene) return

    // Put her in the room. In a quiet scene there is no background masking a
    // dry voice, so this matters more here than it would in a loud one.
    const room = new Room(ctx, { scene })
    source.connect(room.handles.input)
    room.handles.output.connect(ctx.destination)
    room.start()
    this.room = room
  }

  private buildUserAnalyser(stream: MediaStream): void {
    this.userAnalyser = this.makeAnalyser(stream)
  }

  private makeAnalyser(stream: MediaStream): AnalyserNode {
    const ctx = this.ensureAudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    return analyser
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext()
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume()
    return this.audioCtx
  }

  private send(payload: Record<string, unknown>): void {
    if (this.dc?.readyState !== 'open') return
    this.dc.send(JSON.stringify(payload))
  }

  private cancelOverlappingResponse(responseId: string | null): void {
    this.send({
      type: 'response.cancel',
      ...(responseId ? { response_id: responseId } : {}),
    })
    this.emitter.emit('agent.overlap', { at: this.now() })
    this.emitter.emit('error', {
      error: new VoiceError(
        'provider_error',
        PROVIDER,
        `Dropped an overlapping response${responseId ? ` (${responseId})` : ''}.`,
        { fatal: false },
      ),
    })
  }

  /* -------------------------------------------------------------- *
   * VoiceProvider surface
   * -------------------------------------------------------------- */

  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): () => void {
    return this.emitter.on(event, handler)
  }

  /** Session update carrying a compressed character reminder (§05). */
  reinforce(text: string): void {
    const reminder = text.trim() || (this.persona ? compileReinforcement(this.persona) : '')
    if (!reminder) return

    // Appended as a conversation item — never written back into session
    // instructions.
    //
    // Realtime caches on the conversation prefix, and the character contract is
    // that prefix. Rewriting instructions mid-session invalidates it and
    // re-charges the whole contract at full price on the very next turn; round 5
    // measured one such turn at 2.9x the cost of a normal one. Appending leaves
    // the prefix byte-identical, so the contract stays cached for the life of
    // the session and steering costs one short item instead.
    this.send(buildSteeringItem(reminder))
  }

  setInterruptible(interruptible: boolean): void {
    const td = this.config?.audio.input.turn_detection
    if (!td) return
    td.interrupt_response = interruptible
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: { input: { turn_detection: { ...td } } },
      },
    })
  }

  getAnalyser(): Analysers {
    return { user: this.userAnalyser, agent: this.agentAnalyser }
  }

  getRoom(): RoomControls | null {
    return this.room
  }

  async getTransportStats(): Promise<TransportStats> {
    const out: TransportStats = { rttMs: null, jitterMs: null, packetsLost: null }
    if (!this.pc) return out

    const stats = await this.pc.getStats()
    stats.forEach((report) => {
      if (report.type === 'candidate-pair') {
        const pair = report as RTCIceCandidatePairStats
        if (pair.state === 'succeeded' && typeof pair.currentRoundTripTime === 'number') {
          out.rttMs = Math.round(pair.currentRoundTripTime * 1000)
        }
      }
      if (report.type === 'inbound-rtp') {
        const inbound = report as RTCInboundRtpStreamStats
        if (inbound.kind === 'audio') {
          if (typeof inbound.jitter === 'number') out.jitterMs = Math.round(inbound.jitter * 1000)
          if (typeof inbound.packetsLost === 'number') out.packetsLost = inbound.packetsLost
        }
      }
    })
    return out
  }

  async end(reason: SessionSummary['reason'] = 'user'): Promise<SessionSummary> {
    const seconds = this.now()

    if (!this.ended) {
      this.ended = true
      // Seal anything still open so a rep that ends mid-sentence still scores.
      this.turns.push(...this.translator.flush(seconds))
    }

    const summary: SessionSummary = {
      seconds: Math.round(seconds * 1000) / 1000,
      provider: PROVIDER,
      model: this.model,
      rate: this.rate,
      turns: sortTurns(this.turns),
      usage: summarizeUsage(this.usageSamples, seconds),
      reason,
    }

    if (this.capTimer) clearTimeout(this.capTimer)
    this.capTimer = null

    try {
      this.room?.stop()
      this.dc?.close()
      this.pc?.close()
      this.micStream?.getTracks().forEach((t) => t.stop())
      if (this.audioEl) {
        this.audioEl.srcObject = null
        this.audioEl = null
      }
      await this.audioCtx?.close()
    } catch {
      /* Teardown is best-effort. The summary is what matters. */
    }

    this.dc = null
    this.pc = null
    this.micStream = null
    this.audioCtx = null
    this.userAnalyser = null
    this.agentAnalyser = null
    this.room = null
    this.responseGate.reset()

    this.emitter.emit('session.end', { summary })
    this.emitter.clear()
    return summary
  }
}

export { OpenAIEventTranslator } from './translate'
