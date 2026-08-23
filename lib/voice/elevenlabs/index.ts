/**
 * ElevenLabs adapter — assembled pipeline.
 *
 *     mic -> VAD (ours) -> STT -> LLM -> ElevenLabs TTS -> playback
 *
 * §04 documented this shape as the rejected option and named its two costs
 * honestly: sequential handoffs add latency, and barge-in becomes ours to
 * build. This branch takes both on deliberately, because the thing being bought
 * is the voice — ElevenAPI, raw text-to-speech, billed per character — without
 * ElevenAgents taking over turn-taking. Turn-taking is a calibrated per-user
 * number (§05, problem one) and it is not for sale.
 *
 * Same VoiceProvider interface, same normalised turns, same events. Switching
 * arms is one environment variable, and nothing in `app/` knows the difference.
 *
 * Barge-in, which is the hard part, is four things happening at once:
 *
 *   1. playback stops and the scheduled buffer is thrown away
 *   2. the in-flight synthesis request is aborted
 *   3. the in-flight character-model stream is aborted
 *   4. her turn is truncated to the words that actually reached the ear
 *
 * Four is the one that matters. Without it she remembers saying things the user
 * never heard, and every later turn answers a conversation that did not happen.
 */

import { VoiceEmitter } from '../emitter'
import { makeTurn, sortTurns } from '../transcript'
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
  type VoiceEventHandler,
  type VoiceEventName,
} from '../types'
import { compileReinforcement } from '../reinforcement'
import { Room } from '@/lib/audio/engine'
import { sceneForRoom } from '@/lib/audio/scenes'
import { applyRoomConfig, type RoomControls } from '@/lib/audio/types'

import { PCM_RATES } from './config'
import { MicCapture } from './capture'
import { VadDetector, frameRms } from './vad'
import { RealtimeTranscriber } from './stt'
import { LlmClient, historyFrom, stripSentinel, type LlmMessage } from './llm'
import { TtsClient, shouldFlush } from './tts'
import { PcmPlayer } from './player'
import { SpokenTurn } from './truncate'
import { PipelineMeter } from './telemetry'
import { PIPELINE_MODEL_ID, type MintedPipelineSession } from './mint'

const PROVIDER: ProviderId = 'elevenlabs'

export interface ElevenLabsAdapterOptions {
  tokenEndpoint?: string
  llmEndpoint?: string
  ttsEndpoint?: string
  creditsEndpoint?: string
  fetchImpl?: typeof fetch
  /** Monotonic milliseconds. Injected for tests. */
  clock?: () => number
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id: ProviderId = PROVIDER

  private readonly emitter = new VoiceEmitter()
  private readonly turns: TranscriptTurn[] = []
  private readonly options: ElevenLabsAdapterOptions
  private readonly fetchImpl: typeof fetch
  private readonly clock: () => number
  private readonly llmClient: LlmClient
  private readonly ttsClient: TtsClient

  private minted: MintedPipelineSession | null = null
  private meter: PipelineMeter | null = null
  private persona: Persona | null = null

  private context: AudioContext | null = null
  private micStream: MediaStream | null = null
  private capture: MicCapture | null = null
  private vad: VadDetector | null = null
  private stt: RealtimeTranscriber | null = null
  private room: Room | null = null
  private userAnalyser: AnalyserNode | null = null
  private agentAnalyser: AnalyserNode | null = null
  private agentBus: GainNode | null = null
  private capTimer: ReturnType<typeof setTimeout> | null = null

  /** The current agent turn, if she is mid-reply. */
  private player: PcmPlayer | null = null
  private spoken: SpokenTurn | null = null
  private agentStartedAt: number | null = null
  private llmAbort: AbortController | null = null
  private ttsAbort: AbortController | null = null
  private ttsChain: Promise<void> = Promise.resolve()
  private responding = false

  /** Warmth-band directives waiting for the next reply. */
  private pendingSteering: string[] = []
  private interruptible = false

  private t0: number | null = null
  private userStartedAtMs: number | null = null
  private userStoppedAtMs: number | null = null
  private sttStartedMs: number | null = null
  private userPartial = ''
  private ended = false

  constructor(options: ElevenLabsAdapterOptions = {}) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.clock = options.clock ?? (() => performance.now())
    this.llmClient = new LlmClient({
      ...(options.llmEndpoint ? { endpoint: options.llmEndpoint } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    })
    this.ttsClient = new TtsClient({
      ...(options.ttsEndpoint ? { endpoint: options.ttsEndpoint } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    })
  }

  /** The voice model is what the A/B is about, so that is what gets stamped. */
  get model(): string {
    return this.minted?.pipeline.tts.model ?? PIPELINE_MODEL_ID
  }

  get rate(): Rate {
    return this.minted?.rate ?? { currency: 'USD', perMinute: 0.033 }
  }

  /** Seconds since connect, monotonic. Behind every timestamp we emit. */
  private now(): number {
    return this.t0 === null ? 0 : (this.clock() - this.t0) / 1000
  }

  /* -------------------------------------------------------------- *
   * Lifecycle
   * -------------------------------------------------------------- */

  async connect(persona: Persona, calibration: Calibration): Promise<void> {
    this.persona = persona

    const minted = await this.mint(persona, calibration)
    this.minted = minted

    this.meter = new PipelineMeter({
      models: {
        ttsModel: minted.pipeline.tts.model,
        sttModel: minted.pipeline.stt.model,
        llmModel: minted.pipeline.llm.model,
      },
      credits: { budget: minted.credits.budget, warnAt: minted.credits.warnAt },
      creditsPerChar: minted.pipeline.tts.creditsPerChar,
    })
    this.meter.setVendorCredits(minted.credits.used, minted.credits.limit)

    const mic = await this.openMicrophone()
    this.micStream = mic

    // One rate end to end: capture, transcription and synthesis all at 24 kHz,
    // so nothing in the path resamples.
    const sampleRate = PCM_RATES[minted.pipeline.tts.outputFormat]
    const context = new AudioContext({ sampleRate })
    this.context = context
    if (context.state === 'suspended') await context.resume()

    this.buildOutputGraph(persona, context)
    this.userAnalyser = this.makeAnalyser(context, context.createMediaStreamSource(mic))

    this.vad = new VadDetector({ silenceMs: minted.pipeline.turn.silenceMs })
    this.setInterruptible(minted.pipeline.turn.interrupts)

    const stt = new RealtimeTranscriber({
      clientSecret: minted.clientSecret,
      model: minted.pipeline.stt.model,
      sampleRate: minted.pipeline.stt.sampleRate,
      onDelta: (text) => this.onSttDelta(text),
      onFinal: (text) => this.onSttFinal(text),
      onError: (error) => this.emitter.emit('error', { error }),
      onUsage: (usage) => this.meter?.addSttTokens(usage),
    })
    await stt.connect()
    this.stt = stt

    const capture = new MicCapture({
      context,
      stream: mic,
      onFrame: (frame) => this.onFrame(frame),
    })
    await capture.start()
    this.capture = capture

    // The clock starts when audio is flowing, not when setup began.
    this.t0 = this.clock()

    this.capTimer = setTimeout(() => {
      void this.end('cap')
    }, SESSION_CAP_SECONDS * 1000)
  }

  private async mint(
    persona: Persona,
    calibration: Calibration,
  ): Promise<MintedPipelineSession> {
    const endpoint = this.options.tokenEndpoint ?? '/api/voice/token'
    let response: Response
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personaId: persona.slug, calibration }),
      })
    } catch (cause) {
      throw new VoiceError('token_mint_failed', PROVIDER, 'Could not reach the token endpoint.', {
        cause,
      })
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new VoiceError(
        'token_mint_failed',
        PROVIDER,
        `Token mint failed (${response.status}). ${detail.slice(0, 300)}`,
      )
    }
    return (await response.json()) as MintedPipelineSession
  }

  private async openMicrophone(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        // Echo cancellation is not optional here. Her voice comes out of the
        // same speakers the VAD is listening through, and without it every
        // reply of hers triggers a barge-in against itself.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (cause) {
      throw new VoiceError('mic_denied', PROVIDER, 'Microphone access was refused.', { cause })
    }
  }

  /**
   * Her voice, the analyser and the room.
   *
   * The analyser taps the dry signal for the same reason the OpenAI arm does:
   * the waveform should track what she said, not what the room did to it.
   */
  private buildOutputGraph(persona: Persona, context: AudioContext): void {
    const bus = context.createGain()
    this.agentBus = bus
    this.agentAnalyser = this.makeAnalyser(context, bus)

    // Null while procedural acoustics are off — see `roomAcousticsEnabled`.
    const scene = sceneForRoom(persona.room.reverbIr)
    if (!scene) {
      bus.connect(context.destination)
      return
    }

    // The bed arms with the session and runs until it ends. Her voice goes into
    // the room's input; the ambient chain reaches the speakers on its own path
    // and is never gated by whether she is talking (§1).
    const room = new Room(context, { scene })
    applyRoomConfig(room, persona.room)
    bus.connect(room.handles.input)
    room.arm()
    this.room = room

    this.emitter.on('agent.speech.start', () => this.room?.duck(true))
    this.emitter.on('agent.speech.stop', () => this.room?.duck(false))
  }

  private makeAnalyser(context: AudioContext, source: AudioNode): AnalyserNode {
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)
    return analyser
  }

  /* -------------------------------------------------------------- *
   * Turn-taking
   * -------------------------------------------------------------- */

  private onFrame(frame: Float32Array): void {
    const vad = this.vad
    if (!vad || this.ended) return

    // The bar for barge-in is raised while she is audible: echo cancellation
    // removes most of her from the mic, never all of it, and a false barge-in
    // truncates a turn the user was happily listening to.
    vad.setDucked(this.player?.isPlaying ?? false)

    const nowMs = this.clock()
    const event = vad.push(frameRms(frame), nowMs)
    this.stt?.pushFrame(frame, vad.isSpeaking)

    if (!event) return
    if (event.type === 'speech.start') this.onUserSpeechStart(event.atMs)
    else this.onUserSpeechStop(event.atMs, event.silenceMs ?? 0)
  }

  private onUserSpeechStart(atMs: number): void {
    this.userStartedAtMs = atMs
    const at = this.secondsAt(atMs)
    this.emitter.emit('user.speech.start', { at })
    // Beat the round-8 overlap count by cutting on onset rather than on a
    // committed transcript. Nothing downstream is waited for.
    if (this.player?.isPlaying || this.responding) this.bargeIn(at)
  }

  private onUserSpeechStop(atMs: number, silenceMs: number): void {
    this.userStoppedAtMs = atMs
    this.meter?.record('vadSilenceMs', silenceMs)
    this.emitter.emit('user.speech.stop', { at: this.secondsAt(atMs) })
    this.sttStartedMs = this.clock()
    this.stt?.commit()
  }

  private onSttDelta(text: string): void {
    this.userPartial += text
    this.emitter.emit('user.transcript', {
      turn: makeTurn('user', this.userPartial, this.secondsAt(this.userStoppedAtMs ?? 0), this.now()),
      final: false,
    })
  }

  private onSttFinal(text: string): void {
    if (this.sttStartedMs !== null) {
      this.meter?.record('sttMs', this.clock() - this.sttStartedMs)
      this.sttStartedMs = null
    }
    const body = (text || this.userPartial).trim()
    this.userPartial = ''
    if (!body) return

    const stopAt = this.secondsAt(this.userStoppedAtMs ?? this.clock())
    const startAt = this.userStartedAtMs === null ? stopAt : this.secondsAt(this.userStartedAtMs)
    const turn = makeTurn('user', body, startAt, stopAt)
    this.turns.push(turn)
    this.emitter.emit('user.transcript', { turn, final: true })

    void this.respond()
  }

  /* -------------------------------------------------------------- *
   * The reply
   * -------------------------------------------------------------- */

  private async respond(): Promise<void> {
    const persona = this.persona
    const minted = this.minted
    if (!persona || !minted || this.ended) return

    if (this.responding) {
      // A second reply cannot be allowed to start on top of the first. Same
      // guard as the OpenAI response gate, same reason.
      this.emitter.emit('agent.overlap', { at: this.now() })
      this.cancelResponse()
    }

    this.responding = true
    const llmAbort = new AbortController()
    this.llmAbort = llmAbort

    const spoken = new SpokenTurn()
    this.spoken = spoken
    this.agentStartedAt = null

    const steering = this.pendingSteering.join(' ') || null
    this.pendingSteering = []

    const startedMs = this.clock()
    let pending = ''
    let firstTokenSeen = false
    let exit = false

    try {
      const result = await this.llmClient.stream(
        {
          personaId: persona.slug,
          history: this.historyForModel(),
          steering,
        },
        {
          onFirstToken: () => {
            firstTokenSeen = true
            this.meter?.record('llmFirstTokenMs', this.clock() - startedMs)
          },
          onDelta: (delta) => {
            pending += delta
            // The exit sentinel is stripped before the flush decision, so a
            // half-arrived one can never be mistaken for a sentence ending and
            // can never reach synthesis.
            const speakable = stripSentinel(pending)
            if (shouldFlush(speakable, false)) {
              pending = ''
              this.enqueueSynthesis(speakable, spoken)
            }
          },
          onUsage: (usage) => this.meter?.addLlmTokens(usage),
        },
        llmAbort.signal,
      )

      if (result.aborted) {
        this.responding = false
        return
      }
      if (firstTokenSeen) this.meter?.record('llmCompleteMs', this.clock() - startedMs)
      exit = result.exit

      const tail = stripSentinel(pending)
      pending = ''
      if (tail) this.enqueueSynthesis(tail, spoken)
    } catch (cause) {
      this.responding = false
      this.emitter.emit('error', {
        error:
          cause instanceof VoiceError
            ? cause
            : new VoiceError('provider_error', PROVIDER, String(cause), { fatal: false }),
      })
      return
    }

    await this.ttsChain
    await this.player?.waitForDrain()

    if (this.spoken === spoken) this.commitAgentTurn(spoken, this.player?.playedSeconds ?? 0, false)
    this.responding = false

    if (exit) this.emitter.emit('character.exit', { at: this.now() })
  }

  /**
   * Synthesis is serialised.
   *
   * Two clips of the same reply must not race each other onto the audio clock,
   * and the alignment offsets in `SpokenTurn` assume they arrive in order.
   */
  private enqueueSynthesis(text: string, spoken: SpokenTurn): void {
    const minted = this.minted
    const persona = this.persona
    const meter = this.meter
    if (!minted || !persona || !text) return

    this.ttsChain = this.ttsChain.then(async () => {
      if (this.ended || this.spoken !== spoken) return
      const abort = new AbortController()
      this.ttsAbort = abort
      const startedMs = this.clock()
      const player = this.ensurePlayer()
      const sampleRate = PCM_RATES[minted.pipeline.tts.outputFormat]

      // A continuation clip carries the space that joins it to what came
      // before, so the alignment coming back stitches into one line instead of
      // running two sentences together. The chain guarantees the previous
      // clip's chunks have all landed by now.
      const clip = spoken.audioSeconds > 0 ? ` ${text}` : this.withDeliveryTags(text)

      // Characters *sent*, which is what the invoice says — including the ones
      // a barge-in throws away.
      meter?.addTtsCharacters(clip.length)
      let textAppended = false

      try {
        await this.ttsClient.stream(
          {
            personaId: persona.slug,
            text: clip,
            model: minted.pipeline.tts.model,
            outputFormat: minted.pipeline.tts.outputFormat,
            settings: {
              stability: minted.pipeline.tts.stability,
              similarity_boost: minted.pipeline.tts.similarity_boost,
              speed: minted.pipeline.tts.speed,
            },
            timestamps: minted.pipeline.tts.timestamps,
          },
          {
            onFirstByte: () => meter?.record('ttsFirstByteMs', this.clock() - startedMs),
            onChunk: (samples, alignment) => {
              if (this.spoken !== spoken) return
              if (alignment) {
                spoken.appendAligned(alignment)
              } else {
                // Without alignment the whole clip's text belongs to the first
                // chunk; later chunks only add duration. Appending the text
                // again per chunk would multiply her reply.
                spoken.appendUnaligned(textAppended ? '' : clip, samples.length / sampleRate)
                textAppended = true
              }
              player.enqueue(samples)
            },
            onCreditsRemaining: (remaining) =>
              meter?.setVendorCredits(
                minted.credits.limit !== null ? minted.credits.limit - remaining : null,
                minted.credits.limit,
              ),
          },
          abort.signal,
        )
      } catch (cause) {
        if (abort.signal.aborted) return
        this.emitter.emit('error', {
          error:
            cause instanceof VoiceError
              ? cause
              : new VoiceError('provider_error', PROVIDER, String(cause), { fatal: false }),
        })
      }
    })
  }

  /**
   * Delivery tags, on the tagged model only, and only on the first clip of a
   * turn — repeating them mid-reply makes her restart her own prosody.
   */
  private withDeliveryTags(text: string): string {
    const tags = this.minted?.pipeline.delivery_tags ?? []
    if (tags.length === 0) return text
    // The model may have opened with its own tag; two would fight.
    if (/^\s*\[/.test(text)) return text
    return `${tags[0]} ${text}`
  }

  private ensurePlayer(): PcmPlayer {
    if (this.player) return this.player
    const context = this.context
    const minted = this.minted
    if (!context || !minted) throw new VoiceError('session_failed', PROVIDER, 'No audio context.')

    const player = new PcmPlayer({
      context,
      sampleRate: PCM_RATES[minted.pipeline.tts.outputFormat],
      destination: this.agentBus ?? context.destination,
      onFirstAudio: () => {
        const at = this.now()
        this.agentStartedAt = at
        this.emitter.emit('agent.speech.start', { at })
        if (this.userStoppedAtMs !== null) {
          this.meter?.record('totalPerceivedMs', this.clock() - this.userStoppedAtMs)
        }
      },
    })
    this.player = player
    return player
  }

  /* -------------------------------------------------------------- *
   * Barge-in
   * -------------------------------------------------------------- */

  /**
   * The user started talking over her. Stop everything, keep only what played.
   *
   * Order matters: read the playhead before stopping the sources, because
   * stopping them is what makes the answer unknowable.
   */
  private bargeIn(at: number): void {
    const spoken = this.spoken
    const played = this.player?.stopNow() ?? 0

    this.cancelResponse()
    this.meter?.bargeIn()

    if (this.agentStartedAt !== null) this.emitter.emit('agent.speech.stop', { at })
    if (spoken) this.commitAgentTurn(spoken, played, true)

    this.player = null
    this.spoken = null
    this.agentStartedAt = null
    this.responding = false
  }

  private cancelResponse(): void {
    this.llmAbort?.abort()
    this.ttsAbort?.abort()
    this.llmAbort = null
    this.ttsAbort = null
  }

  /**
   * Seal her turn at the words that reached the ear.
   *
   * `truncated` distinguishes a barge-in from a reply that simply finished —
   * the counter it feeds is the one to read against round 8's two overlaps and
   * one sentence cut mid-word.
   */
  private commitAgentTurn(spoken: SpokenTurn, playedSeconds: number, truncated: boolean): void {
    const text = truncated ? spoken.playedText(playedSeconds) : spoken.fullText.trim()
    const startedAt = this.agentStartedAt ?? this.now()

    if (truncated && spoken.wasTruncated(playedSeconds)) this.meter?.truncated()

    if (this.player && !truncated) {
      this.emitter.emit('agent.speech.stop', { at: this.now() })
    }
    if (!truncated) {
      this.player = null
      this.spoken = null
      this.agentStartedAt = null
    }

    if (!text) return
    const turn = makeTurn('agent', text, startedAt, startedAt + playedSeconds)
    this.turns.push(turn)
    this.emitter.emit('agent.transcript', { turn, final: true })
  }

  /* -------------------------------------------------------------- *
   * VoiceProvider surface
   * -------------------------------------------------------------- */

  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): () => void {
    return this.emitter.on(event, handler)
  }

  /**
   * Character steering — the warmth band's directive, or a re-injected reminder.
   *
   * Held until the next reply rather than sent immediately, because there is no
   * standing session to update: on this arm every turn is a fresh request and
   * the directive rides in it as its own message. Same placement as the OpenAI
   * arm's conversation item, and the same reason — the character contract is
   * the cached prefix and must stay byte-identical.
   */
  reinforce(text: string): void {
    const reminder = text.trim() || (this.persona ? compileReinforcement(this.persona) : '')
    if (!reminder) return
    this.pendingSteering.push(reminder)
  }

  /**
   * The Level 5 dial.
   *
   * Barge-in always cuts her off — the user must never be talked over, and that
   * is the whole point of the work in this file. What this controls is the
   * other direction: whether she may *begin* a reply while the user is still
   * speaking.
   */
  setInterruptible(interruptible: boolean): void {
    this.interruptible = interruptible
    // A character entitled to cut across the user needs a higher bar before her
    // own playback yields, or she can never hold a floor she is allowed to
    // hold — a quiet "mm" should not stop her mid-sentence. A character who is
    // never allowed to talk over anyone yields at the first sign of speech.
    this.vad?.setDuckedActivationRatio(interruptible ? 6 : 4.5)
  }

  /** Exposed so the compiled config can be inspected without a live session. */
  peekConfig(): MintedPipelineSession['pipeline'] | null {
    return this.minted?.pipeline ?? null
  }

  getAnalyser(): Analysers {
    return { user: this.userAnalyser, agent: this.agentAnalyser }
  }

  getRoom(): RoomControls | null {
    return this.room
  }

  /**
   * No peer connection, so no ICE round-trip to report.
   *
   * This is a real loss against the OpenAI arm: `rttMs` is what separates
   * Colombo-to-region distance from inference time. On this arm the equivalent
   * information is in `pipeline.stages` — `ttsFirstByteMs` is dominated by the
   * network leg to the proxy and onward, and it moves when the region does.
   */
  async getTransportStats(): Promise<TransportStats> {
    return { rttMs: null, jitterMs: null, packetsLost: null }
  }

  async end(reason: SessionSummary['reason'] = 'user'): Promise<SessionSummary> {
    const seconds = this.now()

    if (!this.ended) {
      this.ended = true
      // Seal anything still open so a rep that ends mid-sentence still scores.
      const flush = this.vad?.flush()
      if (flush) this.stt?.clear()
      const spoken = this.spoken
      if (spoken) {
        this.cancelResponse()
        const played = this.player?.stopNow() ?? 0
        this.commitAgentTurn(spoken, played, true)
      }
    }

    const summary: SessionSummary = {
      seconds: Math.round(seconds * 1000) / 1000,
      provider: PROVIDER,
      model: this.model,
      rate: this.rate,
      turns: sortTurns(this.turns),
      // Token usage in the realtime sense does not exist on this arm; the
      // per-vendor breakdown lives in `pipeline.usage` instead.
      usage: null,
      reason,
      pipeline: this.meter?.telemetry(seconds) ?? null,
    }

    if (this.capTimer) clearTimeout(this.capTimer)
    this.capTimer = null

    try {
      this.capture?.stop()
      this.stt?.close()
      this.room?.stop()
      this.micStream?.getTracks().forEach((track) => track.stop())
      await this.context?.close()
    } catch {
      /* Teardown is best-effort. The summary is what matters. */
    }

    this.capture = null
    this.stt = null
    this.vad = null
    this.player = null
    this.spoken = null
    this.room = null
    this.context = null
    this.micStream = null
    this.userAnalyser = null
    this.agentAnalyser = null
    this.agentBus = null

    this.emitter.emit('session.end', { summary })
    this.emitter.clear()
    return summary
  }

  /** Only turns with text; a barge-in already shortened hers before it landed
   *  here, which is exactly why truncation happens at the transcript. */
  private historyForModel(): LlmMessage[] {
    return historyFrom(this.turns)
  }

  private secondsAt(atMs: number): number {
    return this.t0 === null ? 0 : Math.max(0, (atMs - this.t0) / 1000)
  }
}

export { ElevenLabsPersonaCompiler } from './persona'
export type { ElevenLabsPipelineConfig } from './persona'
