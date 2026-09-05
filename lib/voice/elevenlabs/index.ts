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
import { deliveryFor, stripDeliveryTags } from './persona'
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
import { interruptsAt, remainingReplyDelayMs } from '../../warmth/timing'
import { Room } from '@/lib/audio/engine'
import { sceneForRoom } from '@/lib/audio/scenes'
import { applyRoomConfig, type RoomControls } from '@/lib/audio/types'

import { PCM_RATES } from './config'
import { MicCapture } from './capture'
import { VadDetector, frameRms } from './vad'
import { RealtimeTranscriber, type TranscriptionTiming } from './stt'
import { composeSteering } from '@/lib/warmth/steering'
import { LlmClient, historyFrom, stripSentinel, type LlmMessage } from './llm'
import { TtsClient, shouldFlush } from './tts'
import { TurnClient } from './turn'
import { PcmPlayer } from './player'
import { SpokenTurn } from './truncate'
import { PipelineMeter } from './telemetry'
import { PIPELINE_MODEL_ID, type MintedPipelineSession } from './mint'

const PROVIDER: ProviderId = 'elevenlabs'

export interface ElevenLabsAdapterOptions {
  tokenEndpoint?: string
  llmEndpoint?: string
  ttsEndpoint?: string
  turnEndpoint?: string
  creditsEndpoint?: string
  fetchImpl?: typeof fetch
  /** Monotonic milliseconds. Injected for tests. */
  clock?: () => number
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id: ProviderId = PROVIDER

  private readonly emitter = new VoiceEmitter()
  private readonly turns: TranscriptTurn[] = []
  private readonly committedTurns = new WeakSet<SpokenTurn>()
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
  private connectAbort: AbortController | null = null
  private ttsChain: Promise<void> = Promise.resolve()
  private responding = false

  /** Warmth-band directives waiting for the next reply. */
  private pendingSteering: string[] = []
  private readReplyState: (() => { steering: string; warmth: number }) | null = null
  private interruptible = false
  /** Reported by the application. Never computed here. See `setWarmth`. */
  private warmth = 0

  private t0: number | null = null
  private userStartedAtMs: number | null = null
  private userStoppedAtMs: number | null = null
  private userSpeaking = false
  private replyPending = false
  private ended = false
  private muted = false

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
    if (this.ended) throw new VoiceError('session_failed', PROVIDER, 'This voice session has ended.')

    try {
      // Ask while the user is starting the rep, before reserving paid work.
      // A denied microphone must never consume a rep allowance.
      const mic = await this.openMicrophone()
      this.micStream = mic
      for (const track of mic.getAudioTracks()) track.enabled = !this.muted
      if (this.ended) throw new VoiceError('session_failed', PROVIDER, 'This voice session has ended.')

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

      if (this.ended) throw new VoiceError('session_failed', PROVIDER, 'This voice session has ended.')

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
        clock: this.clock,
        onDelta: (text, timing) => this.onSttDelta(text, timing),
        onFinal: (text, timing, latencyMs) => this.onSttFinal(text, timing, latencyMs),
        onSettled: () => this.respondWhenReady(),
        onError: (error) => this.emitter.emit('error', { error }),
        onUsage: (usage) => this.meter?.addSttTokens(usage),
      })
      this.stt = stt
      await stt.connect()
      if (this.ended) throw new VoiceError('session_failed', PROVIDER, 'This voice session has ended.')

      const capture = new MicCapture({
        context,
        stream: mic,
        onFrame: (frame) => this.onFrame(frame),
      })
      this.capture = capture
      await capture.start()
      if (this.ended) throw new VoiceError('session_failed', PROVIDER, 'This voice session has ended.')

      // The clock starts when audio is flowing, not when setup began.
      this.t0 = this.clock()

      this.capTimer = setTimeout(() => {
        void this.end('cap')
      }, SESSION_CAP_SECONDS * 1000)
    } catch (cause) {
      await this.releaseResources()
      throw cause
    }
  }

  private async mint(
    persona: Persona,
    calibration: Calibration,
  ): Promise<MintedPipelineSession> {
    const endpoint = this.options.tokenEndpoint ?? '/api/voice/token'
    const abort = new AbortController()
    this.connectAbort = abort
    const timer = setTimeout(() => abort.abort(), 20_000)
    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personaId: persona.slug, calibration }),
        signal: abort.signal,
      })
      if (!response.ok) {
        throw new VoiceError('token_mint_failed', PROVIDER, `Token mint failed (${response.status}).`)
      }
      return (await response.json()) as MintedPipelineSession
    } catch (cause) {
      if (cause instanceof VoiceError) throw cause
      throw new VoiceError('token_mint_failed', PROVIDER, 'Could not reach the token endpoint.', {
        cause,
      })
    } finally {
      clearTimeout(timer)
      if (this.connectAbort === abort) this.connectAbort = null
    }
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
    if (!vad || this.ended || this.muted) return

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
    this.userSpeaking = true
    const at = this.secondsAt(atMs)
    this.emitter.emit('user.speech.start', { at })
    // Beat the round-8 overlap count by cutting on onset rather than on a
    // committed transcript. Nothing downstream is waited for.
    if (this.player?.isPlaying || this.responding) this.bargeIn(at)
  }

  private onUserSpeechStop(atMs: number, silenceMs: number): void {
    const timing: TranscriptionTiming = {
      startedAtMs: this.userStartedAtMs ?? atMs,
      stoppedAtMs: atMs,
      committedAtMs: this.clock(),
    }
    this.userSpeaking = false
    this.userStartedAtMs = null
    this.userStoppedAtMs = atMs
    this.meter?.record('vadSilenceMs', silenceMs)
    this.emitter.emit('user.speech.stop', { at: this.secondsAt(atMs) })
    if (this.ended || this.muted) return
    this.stt?.commit(timing)
    this.respondWhenReady()
  }

  private onSttDelta(text: string, timing: TranscriptionTiming): void {
    if (this.ended || this.muted) return
    this.emitter.emit('user.transcript', {
      turn: makeTurn('user', text, this.secondsAt(timing.startedAtMs), this.secondsAt(timing.stoppedAtMs)),
      final: false,
    })
  }

  private onSttFinal(text: string, timing: TranscriptionTiming, latencyMs: number): void {
    if (this.ended || this.muted) return
    this.meter?.record('sttMs', latencyMs)
    const body = text.trim()
    if (!body) return

    const stopAt = this.secondsAt(timing.stoppedAtMs)
    const startAt = this.secondsAt(timing.startedAtMs)
    const turn = makeTurn('user', body, startAt, stopAt)
    this.turns.push(turn)
    this.replyPending = true
    this.emitter.emit('user.transcript', { turn, final: true })
  }

  private respondWhenReady(): void {
    // ASR can finish an earlier clause after the user has resumed speaking.
    // Keep its transcript, but do not buy a reply that the next final would
    // immediately cancel. The transcriber releases finals in commit order.
    if (!this.replyPending || this.ended || this.muted || this.userSpeaking || this.stt?.pendingCount) return
    this.replyPending = false
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
      this.bargeIn(this.now())
      // A speech-stop listener can end the rep at its deadline during the
      // interruption. Do not start new paid work after that synchronous end.
      if (this.ended) return
    }

    this.responding = true
    const llmAbort = new AbortController()
    this.llmAbort = llmAbort
    this.ttsChain = Promise.resolve()

    const spoken = new SpokenTurn()
    this.spoken = spoken
    this.agentStartedAt = null

    // Each HTTP request needs one current direction. Read only now, after all
    // pending clauses have been scored; never accumulate previous band rules.
    const state = this.readReplyState?.()
    if (state) this.setWarmth(state.warmth)
    const direction = state?.steering ?? composeSteering({ persona, warmth: this.warmth })
    // Scene, safety and closing instructions remain one-shot and take priority.
    const steering = [direction, ...this.pendingSteering].filter(Boolean).join(' ')
    this.pendingSteering = []

    try {
      const result = minted.turn && minted.sessionId
        ? await this.streamTurn(spoken, llmAbort, steering)
        : await this.streamLegacyTurn(spoken, llmAbort, steering)
      if (result.aborted || !this.isCurrentResponse(spoken, llmAbort)) return

      await this.ttsChain
      const player = this.player
      await player?.waitForDrain()
      if (!this.isCurrentResponse(spoken, llmAbort)) return
      this.commitAgentTurn(spoken, player?.playedSeconds ?? 0, false)
      if (result.exit) this.emitter.emit('character.exit', { at: this.now() })
    } catch (cause) {
      if (!this.isCurrentResponse(spoken, llmAbort)) return
      // Keep only words that reached the ear when a provider stream fails.
      // Unplayed queued audio and a half-generated turn must not survive it.
      const played = this.player?.stopNow() ?? 0
      const wasSpeaking = this.agentStartedAt !== null
      this.commitAgentTurn(spoken, played, true)
      if (wasSpeaking) this.emitter.emit('agent.speech.stop', { at: this.now() })
      this.emitter.emit('error', {
        error: cause instanceof VoiceError
          ? cause
          : new VoiceError('provider_error', PROVIDER, String(cause), { fatal: false }),
      })
    } finally {
      // An aborted old request may finish after the user has started a new
      // reply. It must never clear that new reply's state or emit its exit.
      if (this.llmAbort === llmAbort) {
        this.responding = false
        this.llmAbort = null
        this.ttsAbort?.abort()
        this.ttsAbort = null
      }
    }
  }

  private isCurrentResponse(spoken: SpokenTurn, abort: AbortController): boolean {
    return !this.ended && !abort.signal.aborted && this.llmAbort === abort && this.spoken === spoken
  }

  private async streamTurn(
    spoken: SpokenTurn,
    abort: AbortController,
    steering: string | null,
  ): Promise<{ exit: boolean; aborted: boolean }> {
    const minted = this.minted!
    const clips = new Map<string, { text: string; appended: boolean }>()
    let audibleClipCount = 0
    const client = new TurnClient({
      endpoint: this.options.turnEndpoint ?? minted.turn!.endpoint,
      fetchImpl: this.fetchImpl,
    })
    let counted = { input: 0, output: 0, cachedInput: 0, characters: 0 }
    return client.stream({
      sessionId: minted.sessionId!,
      turnId: crypto.randomUUID(),
      personaId: this.persona!.slug,
      history: this.historyForModel(),
      steering,
      warmth: this.warmth,
    }, {
      onClip: (id, text) => {
        if (!this.isCurrentResponse(spoken, abort)) return
        if (clips.has(id)) throw new Error('Duplicate synthesis clip.')
        clips.set(id, { text, appended: false })
      },
      onAudio: (clipId, samples, alignment) => {
        if (!this.isCurrentResponse(spoken, abort)) return
        const clip = clips.get(clipId)
        if (!clip) throw new Error('Audio arrived without its transcript clip.')
        const continuation = !clip.appended && audibleClipCount > 0
        if (!clip.appended) audibleClipCount += 1
        const seconds = samples.length / PCM_RATES[minted.pipeline.tts.outputFormat]
        if (alignment) {
          // The vendor can trim request whitespace. Keep sentence boundaries
          // in the transcript without adding sound or shifting its timing.
          if (continuation && !/^\s/.test(alignment.characters[0] ?? '')) {
            alignment = {
              characters: [' ', ...alignment.characters],
              characterStartTimesSeconds: [0, ...alignment.characterStartTimesSeconds],
              characterEndTimesSeconds: [0, ...alignment.characterEndTimesSeconds],
            }
          }
          spoken.appendAligned(alignment, seconds)
          clip.appended = true
        } else {
          spoken.appendUnaligned(clip.appended ? '' : `${continuation ? ' ' : ''}${clip.text.trim()}`, seconds)
          clip.appended = true
        }
        this.ensurePlayer().enqueue(samples)
      },
      onTiming: (stage, ms) => {
        if (this.isCurrentResponse(spoken, abort)) this.meter?.record(stage, ms)
      },
      onUsage: (usage) => {
        if (!this.isCurrentResponse(spoken, abort)) return
        this.meter?.addLlmTokens({
          input: Math.max(0, usage.llm.input - counted.input),
          output: Math.max(0, usage.llm.output - counted.output),
          cachedInput: Math.max(0, usage.llm.cachedInput - counted.cachedInput),
        })
        this.meter?.addTtsCharacters(Math.max(0, usage.tts.characters - counted.characters))
        counted = { ...usage.llm, characters: usage.tts.characters }
      },
    }, abort.signal)
  }

  /** Compatibility with already-minted sessions. Errors never switch paths:
   *  doing so could generate and bill the same reply twice. */
  private async streamLegacyTurn(
    spoken: SpokenTurn,
    abort: AbortController,
    steering: string | null,
  ): Promise<{ exit: boolean; aborted: boolean }> {
    const startedMs = this.clock()
    let pending = ''
    let firstTokenSeen = false
    const result = await this.llmClient.stream(
      { personaId: this.persona!.slug, history: this.historyForModel(), steering },
      {
        onFirstToken: () => {
          if (!this.isCurrentResponse(spoken, abort)) return
          firstTokenSeen = true
          this.meter?.record('llmFirstTokenMs', this.clock() - startedMs)
        },
        onDelta: (delta) => {
          if (!this.isCurrentResponse(spoken, abort)) return
          pending += delta
          const speakable = stripSentinel(pending)
          if (shouldFlush(speakable, false)) {
            pending = ''
            this.enqueueSynthesis(speakable, spoken)
          }
        },
        onUsage: (usage) => this.meter?.addLlmTokens(usage),
      },
      abort.signal,
    )
    if (result.aborted || !this.isCurrentResponse(spoken, abort)) return { exit: false, aborted: true }
    if (firstTokenSeen) this.meter?.record('llmCompleteMs', this.clock() - startedMs)
    const tail = stripSentinel(pending)
    if (tail) this.enqueueSynthesis(tail, spoken)
    return result
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
              ...deliveryFor(persona, minted.pipeline, this.warmth).settings,
            },
            timestamps: minted.pipeline.tts.timestamps,
          },
          {
            onFirstByte: () => meter?.record('ttsFirstByteMs', this.clock() - startedMs),
            onChunk: (samples, alignment) => {
              if (this.spoken !== spoken) return
              if (alignment) {
                spoken.appendAligned(alignment, samples.length / sampleRate)
                // SET HERE TOO, and this is the whole bug. A v3 stream is not
                // all-aligned or all-unaligned: it sends six aligned chunks and
                // then a trailing audio-only one. That last chunk fell to the
                // branch below with `textAppended` still false, so it appended
                // the ENTIRE clip a second time on top of the per-character text
                // alignment had already accumulated — `fullText` is
                // `alignedText() + unaligned` (../elevenlabs/truncate.ts).
                //
                // Every reply was therefore spoken and logged twice, and a turn
                // that flushed two sentences as two clips came out four times.
                // `config.ts` guessed `supportsTimestamps: true` for v3 and said
                // a wrong guess "costs precision on a barge-in, not
                // correctness". It was right that the flag was a guess and wrong
                // about the blast radius: the guess was correct and the MIXED
                // stream it produces is what nothing handled.
                textAppended = true
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
    const tags = this.minted && this.persona
      ? deliveryFor(this.persona, this.minted.pipeline, this.warmth).deliveryTags
      : []
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
      // The VAD, transcription and generation have already spent some (usually
      // all) of the personality pause. Only genuinely early audio waits.
      notBefore: context.currentTime + remainingReplyDelayMs(this.warmth,
        this.userStoppedAtMs === null ? 0 : this.clock() - this.userStoppedAtMs) / 1000,
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
    const wasSpeaking = this.agentStartedAt !== null

    this.cancelResponse()
    this.meter?.bargeIn()

    this.responding = false
    if (spoken) this.commitAgentTurn(spoken, played, true)
    else {
      this.player = null
      this.spoken = null
      this.agentStartedAt = null
    }
    if (wasSpeaking) this.emitter.emit('agent.speech.stop', { at })
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
    if (this.committedTurns.has(spoken)) return
    this.committedTurns.add(spoken)
    const text = stripDeliveryTags(
      truncated ? spoken.playedText(playedSeconds) : spoken.fullText,
    )
    const startedAt = this.agentStartedAt ?? this.now()
    const stopped = this.player !== null && !truncated

    if (truncated && spoken.wasTruncated(playedSeconds)) this.meter?.truncated()

    // Commit before notifying application listeners: a deadline listener can
    // synchronously call end() from speech.stop or agent.transcript. Re-entry
    // must see this turn already sealed, not append it twice or omit it from
    // the final session summary.
    if (this.spoken === spoken) {
      this.player = null
      this.spoken = null
      this.agentStartedAt = null
    }

    if (text) {
      const turn = makeTurn('agent', text, startedAt, startedAt + playedSeconds)
      this.turns.push(turn)
      this.emitter.emit('agent.transcript', { turn, final: true })
    }
    if (stopped) this.emitter.emit('agent.speech.stop', { at: this.now() })
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
  setReplyState(read: () => { steering: string; warmth: number }): void {
    this.readReplyState = read
  }

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

  /**
   * Where the meter stands, for the transport-level consequences of interest.
   *
   * Generation starts immediately. Any remaining personality pause applies
   * only before the first audio, after counting time already elapsed.
   * Interruption still obeys §05 as a ceiling: the
   * level decides whether she MAY, and warmth decides whether she DOES.
   */
  setWarmth(warmth: number): void {
    this.warmth = warmth
    const allowed = this.minted?.pipeline.turn.interrupts ?? false
    this.setInterruptible(interruptsAt(warmth, allowed))
  }

  getSessionId(): string | null {
    return this.minted?.sessionId ?? null
  }

  getStartupAttemptId(): string | null {
    return this.minted?.startupAttemptId ?? null
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return
    this.muted = muted
    for (const track of this.micStream?.getAudioTracks() ?? []) track.enabled = !muted
    if (muted) {
      this.vad?.reset()
      this.stt?.clear()
      this.userSpeaking = false
      this.replyPending = false
      this.userStartedAtMs = null
      this.userStoppedAtMs = null
    }
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
      this.connectAbort?.abort()
      this.cancelResponse()
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

    await this.releaseResources()

    this.emitter.emit('session.end', { summary })
    this.emitter.clear()
    return summary
  }

  private async releaseResources(): Promise<void> {
    // One failed cleanup must not keep the microphone or a provider alive.
    for (const stop of [
      () => this.capture?.stop(),
      () => this.stt?.close(),
      () => this.room?.stop(),
      () => this.player?.stopNow(),
      () => this.micStream?.getTracks().forEach((track) => track.stop()),
    ]) {
      try { stop() } catch { /* Best effort; attempt every resource. */ }
    }
    try { await this.context?.close() } catch { /* Already closed. */ }
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
