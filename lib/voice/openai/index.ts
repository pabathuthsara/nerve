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
  mayInterrupt,
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
import { interruptsAt, replyDelayMs } from '../../warmth/timing'
import { OpenAIEventTranslator } from './translate'
import {
  analyserRms,
  SAMPLE_INTERVAL_MS,
  TurnAudibility,
} from '../audibility'
import { OpenAIResponseGate } from './response-gate'
import { buildSteeringItem } from './messages'
import { Room } from '@/lib/audio/engine'
import { sceneForRoom } from '@/lib/audio/scenes'
import { applyRoomConfig, type RoomControls } from '@/lib/audio/types'

const CALLS_ENDPOINT = 'https://api.openai.com/v1/realtime/calls'
const PROVIDER: ProviderId = 'openai'

/**
 * Read the inbound packet counter every Nth audibility sample.
 *
 * At the adapter's 50ms sample interval this is roughly five reads a second
 * while she is speaking, and none while she is not. Cheap enough to ignore,
 * frequent enough that the count is never more than one interval stale.
 */
const PACKET_SAMPLE_EVERY = 4

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
  private muted = false
  private audioEl: HTMLAudioElement | null = null
  /**
   * The element her remote track is attached to.
   *
   * With a room it is a muted keep-alive and WebAudio does the playing. With no
   * room — which is every rep today — it IS the playback path, unmuted, so the
   * browser's echo canceller can see what is coming out of the speakers. See
   * `attachRemote`.
   */
  private keepAliveEl: HTMLAudioElement | null = null
  private room: Room | null = null
  private audioCtx: AudioContext | null = null
  /**
   * Everything audible, gathered onto one stream before it reaches a speaker.
   *
   * See `armAudio` for why this exists rather than the graph talking to
   * `ctx.destination` directly.
   */
  private playbackSink: MediaStreamAudioDestinationNode | null = null
  private userAnalyser: AnalyserNode | null = null
  private agentAnalyser: AnalyserNode | null = null
  /**
   * Her remote track, inside the graph. Held so it can be rebound once the
   * track carries media — see `attachRemote`.
   */
  private remoteSource: MediaStreamAudioSourceNode | null = null
  /** Did that line actually come out of the speakers? See ../audibility.ts. */
  private readonly audibility = new TurnAudibility()
  private audibilityTimer: ReturnType<typeof setInterval> | null = null
  private readonly audibilityBuffer = new Float32Array(2048)
  /** `inbound-rtp.packetsReceived` when she started speaking. */
  private packetsAtTurnStart: number | null = null
  /** The same counter, refreshed while she speaks. See `watchHerVoice`. */
  private packetsLatest: number | null = null
  /** Bumped per turn, so a late `getStats()` cannot land on the wrong one. */
  private turnSeq = 0
  /** A repeat has been requested; the next turn she starts is that repeat. */
  private recoveryPending = false
  /** The turn currently speaking is a repeat, and may not request another. */
  private currentTurnIsRepeat = false
  private capTimer: ReturnType<typeof setTimeout> | null = null

  private t0: number | null = null
  private minted: MintedSession | null = null
  private config: OpenAISessionConfig | null = null
  private persona: Persona | null = null
  private ended = false
  /**
   * The meter, as last reported by the application.
   *
   * NOT a second warmth engine — the adapter never computes this and never
   * shows it to the character. It is here because two transport-level
   * behaviours depend on it and cannot be expressed anywhere else: the pause
   * before she answers, and whether she may take the turn.
   */
  private warmth = 0

  constructor(options: OpenAIAdapterOptions = {}) {
    this.tokenEndpoint = options.tokenEndpoint ?? '/api/voice/token'
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.clock = options.clock ?? (() => performance.now())
    this.requestedModel = options.model
    this.responseGate = new OpenAIResponseGate(
      () => this.send({ type: 'response.create' }),
      {
        // She looks up before she answers, and looks up faster as she warms.
        // Read live so the pause shortens across the rep (§H6).
        delayMs: () => replyDelayMs(this.warmth),
        onStall: () => {
          // Clear the translator's side too, or the recovery response is
          // cancelled as an overlap the moment it is created.
          this.translator.abandonActiveResponse()
          // A repeat that stalled never spoke, so the turn it was meant to
          // replace goes back into the transcript, and the next reply she
          // manages is eligible for a recovery of its own.
          this.recoveryPending = false
          this.translator.releaseHeldAgentTurn()
          this.emitter.emit('error', {
            error: new VoiceError(
              'transport_failed',
              PROVIDER,
              'A reply never settled and the turn gate was released to recover.',
              { fatal: false },
            ),
          })
        },
      },
    )
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
        onPhantomTurn: (at, reason, id) => this.cancelPhantomResponse(at, reason, id),
        onDoubleTurn: (at) => this.emitter.emit('agent.double-turn', { at }),
        onUnheardReply: (at) => this.emitter.emit('agent.unheard', { at }),
        onTruncatedTurn: ({ playedMs }) => this.truncateHerMemory(playedMs),
        onEchoRejected: (at, overlap) =>
          this.emitter.emit('user.echo-rejected', { at, overlap }),
      },
      { paceOf: () => this.persona?.voice.pace ?? 1 },
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
    for (const track of mic.getAudioTracks()) track.enabled = !this.muted

    // The bed arms HERE — with the session, not with her first word. It plays
    // through the WebRTC handshake, through every silence, and through the end
    // of the rep. Nothing below is allowed to start or stop it (§1).
    this.armAudio()

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

    // The bed ducks under her voice and swells back afterwards. Subscribed
    // rather than called from the translator, so the ambient chain has exactly
    // one point of contact with agent speech and it is a gain ramp.
    this.emitter.on('agent.speech.start', () => this.room?.duck(true))
    this.emitter.on('agent.speech.stop', () => this.room?.duck(false))

    // And the same boundary, used to check the provider's word against what
    // the speakers actually did. See `settleHerVoice`.
    this.emitter.on('agent.speech.start', () => this.watchHerVoice())
    this.emitter.on('agent.speech.stop', ({ at }) => this.settleHerVoice(at))

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
        body: JSON.stringify({ personaId: persona.slug, calibration, model: this.requestedModel }),
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

  /**
   * Build the playback path, then the room on top of it.
   *
   * ROUND 12 — THE ECHO FIX. The graph no longer reaches `ctx.destination`. It
   * ends at a `MediaStreamAudioDestinationNode`, and one unmuted `<audio>`
   * element plays that stream.
   *
   * The old wiring muted the media element whenever a room existed and played
   * her through WebAudio instead. **The browser's echo canceller only cancels
   * against audio the media pipeline rendered**, so `echoCancellation: true` on
   * the microphone had nothing to match and was blind to her. Her voice went
   * speakers -> microphone -> server VAD -> committed as a user turn, and she
   * answered herself. `docs/M0.md`'s fifth finding measured six of those in one
   * 42.3s rep; the 160s rep that prompted this round showed 24 VAD triggers
   * against 19 real user turns.
   *
   * Routing back through a media element puts the mix where the canceller can
   * see it, and keeps the room: reverb, bed and one-shots all render into the
   * same sink. It also removes a quieter fault — with no room, the OLD code
   * left the element unmuted AND connected the source to `ctx.destination`, so
   * her voice played twice.
   *
   * This is a browser behaviour we do not own, so it is a mitigation and not a
   * guarantee. `isAgentEcho` in ./noise.ts is the transcript-level backstop for
   * the hardware and platforms where it is not enough.
   */
  private armAudio(): void {
    const ctx = this.ensureAudioContext()
    const sink = ctx.createMediaStreamDestination()
    this.playbackSink = sink

    const el = new Audio()
    el.autoplay = true
    // NOT muted. That is the entire point of this indirection.
    el.muted = false
    el.srcObject = sink.stream
    void el.play().catch(() => {
      /* Autoplay is fine here — connect() is downstream of a user gesture. */
    })
    this.audioEl = el

    // Null while procedural acoustics are off — see `roomAcousticsEnabled`.
    // Her voice then reaches the sink dry, through `attachRemote`.
    const scene = this.persona ? sceneForRoom(this.persona.room.reverbIr) : null
    if (!scene) return

    const room = new Room(ctx, {
      scene,
      destination: sink,
      ambient: this.persona?.room.bed !== null,
    })
    if (this.persona) applyRoomConfig(room, this.persona.room)
    room.arm()
    this.room = room
  }

  /**
   * Her voice, into the speakers and into the analyser.
   *
   * **The media element is the playback path whenever there is no room, and
   * that is the whole point.** Routing her through WebAudio hides her from the
   * browser's echo canceller: the canceller cancels what it is playing, and it
   * does not know about audio rendered by a graph. So her voice came back in
   * on the microphone, server VAD committed it as a user turn, the gate created
   * a second response on top of the one still speaking, and the overlap guard
   * cancelled it — leaving a line in the transcript she had barely started
   * saying. M0's sixth finding measured this: 24 VAD triggers for 19 real
   * turns, five of them her own voice.
   *
   * Procedural acoustics are currently off for every character (`AUDIO.md`), so
   * until they come back this path is the only one that runs, and it was paying
   * the echo cost for a room that was not there.
   *
   * When a room IS built, she has to go through WebAudio — convolution cannot
   * happen anywhere else — and the echo risk returns with it. That is one more
   * argument for recorded beds over convolution on her voice.
   */
  private attachRemote(stream: MediaStream): void {
    const ctx = this.ensureAudioContext()
    const throughRoom = this.room !== null

    // Chrome will not pump a remote WebRTC track into WebAudio unless the
    // stream is also attached to a media element. With a room that element is
    // a muted keep-alive; without one it is the speaker path, unmuted, which
    // is what gives the echo canceller something to match against.
    const el = new Audio()
    el.autoplay = true
    el.muted = throughRoom
    el.srcObject = stream
    void el.play().catch(() => {
      /* Silent by design; failing to start it is not an error worth surfacing. */
    })
    this.keepAliveEl = el

    // The analyser taps her DRY voice. The waveform should track what she said,
    // not what the room did to it.
    //
    // Built ONCE and kept for the life of the session. `getAnalyser()` is read
    // at connect by the recorder and by the visualiser, and both hold the node
    // they were given — replacing it below would leave the recording tapping a
    // node nothing feeds any more, which is the quietest possible way to lose
    // her voice from a rep.
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.7
    this.agentAnalyser = analyser

    if (!throughRoom) {
      // She is already audible through the element. This branch exists only to
      // keep the analyser inside a graph that reaches a destination — a silent
      // tap, at zero gain, so the waveform cannot quietly stop moving on a
      // browser that declines to pull an unterminated branch.
      const silent = ctx.createGain()
      silent.gain.value = 0
      analyser.connect(silent)
      silent.connect(ctx.destination)
    }

    const bind = () => {
      this.remoteSource?.disconnect()
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      if (throughRoom && this.room) source.connect(this.room.handles.input)
      this.remoteSource = source
    }
    bind()

    // THE COLD-TRACK REBIND.
    //
    // `ontrack` fires inside `setRemoteDescription`, which is before a single
    // RTP packet has arrived: the remote track is still `muted` and its
    // renderer does not exist yet. A `MediaStreamAudioSourceNode` built against
    // a track in that state, and a `play()` issued on an element with nothing
    // to play, are both bets that the browser will wire them up retroactively
    // when media starts. It usually does. When it does not, her opening lines
    // are generated, streamed, transcribed and never heard — and nothing
    // upstream can tell, because the data channel is perfect throughout.
    //
    // Rebinding on the FIRST `unmute` costs one node and removes the bet. Only
    // the first: the track re-mutes between talkspurts on some builds, and
    // rebuilding the source on every turn would trade this fault for a glitch
    // at the head of each reply.
    const track = stream.getAudioTracks()[0]
    let boundWhileMuted = track?.muted !== false
    track?.addEventListener('unmute', () => {
      void el.play().catch(() => {
        /* Same reasoning as above. */
      })
      if (!boundWhileMuted) return
      boundWhileMuted = false
      bind()
    })
  }

  /* -------------------------------------------------------------- *
   * Was that line audible?
   * -------------------------------------------------------------- */

  /**
   * Start watching her analyser for the turn that just opened.
   *
   * The server's `output_audio_buffer.started` is the trigger, and the server's
   * account is exactly what needs checking — see ../audibility.ts for the
   * measurement that showed the two disagreeing.
   */
  private watchHerVoice(): void {
    this.audibility.reset()
    this.packetsAtTurnStart = null
    this.packetsLatest = null
    // The turn now starting IS the repeat we asked for, if we asked for one.
    // Consumed here so a repeat can never itself trigger another repeat: one
    // recovery per line, and a chain of them is a rep that never advances.
    this.currentTurnIsRepeat = this.recoveryPending
    this.recoveryPending = false

    const seq = ++this.turnSeq
    const readPackets = () => {
      void this.inboundAudioPackets().then((packets) => {
        // A `getStats()` from the previous turn must never land on this one.
        if (seq !== this.turnSeq || packets === null) return
        if (this.packetsAtTurnStart === null) this.packetsAtTurnStart = packets
        this.packetsLatest = packets
      })
    }
    readPackets()

    this.stopWatchingHerVoice()
    let tick = 0
    this.audibilityTimer = setInterval(() => {
      this.audibility.observe(analyserRms(this.agentAnalyser, this.audibilityBuffer))
      // Polled rather than read once at the end, so the delta is available the
      // instant the turn closes. `settleHerVoice` runs inside the same event
      // handler that seals the turn, and awaiting `getStats()` there would put
      // the incident after the rep had already been saved on a final turn.
      // At most one sample interval of packets is missed, which cannot change
      // the only thing this number is asked: zero, or not zero.
      if (++tick % PACKET_SAMPLE_EVERY === 0) readPackets()
    }, SAMPLE_INTERVAL_MS)
  }

  /**
   * The turn closed. Report it if nothing came out.
   *
   * `agent.unheard` rather than a new event: the incident already exists, is
   * already counted into `pipeline_incidents`, and already feeds
   * `incidentsAreAlarming`. What changes is that it can now fire for a reply
   * whose buffer opened normally, which is the case that was invisible.
   *
   * The turn is never dropped on this evidence alone. `sealAgentTurn` drops
   * the replies it knows never started, on the provider's own event stream;
   * this is a local measurement, and a browser whose WebAudio graph is
   * behaving oddly must not be able to quietly delete a whole rep. So the line
   * is HELD rather than dropped, and only released from the hold once a repeat
   * has actually arrived to stand in its place — see `attemptUnheardRecovery`
   * and the translator's `holdNextAgentTurn`. Every path that does not end in
   * a replacement puts the line back into the transcript.
   *
   * What is measured here is also, finally, recorded. The packet delta says
   * whether her audio ever left the model, and it used to reach a console
   * string and nothing else; it now rides the incident into
   * `pipeline_incidents`, which is the column B11 has been waiting on.
   */
  private settleHerVoice(at: number): void {
    this.stopWatchingHerVoice()
    const verdict = this.audibility.verdict()
    if (!verdict.silent) return

    const delta =
      this.packetsAtTurnStart === null || this.packetsLatest === null
        ? null
        : this.packetsLatest - this.packetsAtTurnStart

    // Captured now, synchronously: this is the item she believes she said, and
    // the translator moves `audioItemId` on to the next response as soon as
    // its transcript starts arriving.
    const itemId = this.translator.currentAudioItemId
    // The gate is still holding the response that just ended — it settles
    // later in this same handler — so what decides whether a repeat is
    // possible is whether a real user turn is already queued behind it.
    // `attemptUnheardRecovery` re-checks before sending anything.
    const recovering =
      !this.currentTurnIsRepeat &&
      !this.ended &&
      itemId !== null &&
      !this.responseGate.hasPending

    // Held BEFORE the emit, because `sealAgentTurn` runs later in this same
    // handler and the hold has to be in place by then.
    if (recovering) this.translator.holdNextAgentTurn()

    this.emitter.emit('agent.unheard', {
      at,
      peak: verdict.peak,
      samples: verdict.samples,
      packetDelta: delta,
      recovered: recovering,
    })
    this.emitter.emit('error', {
      error: new VoiceError(
        'provider_error',
        PROVIDER,
        `A reply played to silence: her audio buffer opened and closed with nothing audible` +
          ` (peak ${verdict.peak.toFixed(4)} over ${verdict.samples} samples` +
          `${delta === null ? '' : `, inbound audio packets +${delta}`})` +
          `${recovering ? '. Asking her to say it again.' : '.'}`,
        { fatal: false },
      ),
    })

    if (recovering && itemId !== null) this.attemptUnheardRecovery(itemId)
  }

  /**
   * Ask her to say the line the user never heard.
   *
   * Deferred by a zero timeout on purpose. The whole
   * `output_audio_buffer.stopped` handler is still on the stack when this is
   * called: the turn has not been sealed, and the gate still holds the
   * response that just ended. Both have finished by the time a macrotask runs,
   * and nothing else can reach the gate in between — the only other writer is
   * the data channel, which cannot deliver a message mid-task.
   *
   * The conversation item goes first. Her history still contains the line as
   * something she said out loud, so without the delete she would answer the
   * repeat with "like I said" against a silence the user never heard the first
   * half of. Deleting it makes her answer the user's question again, in her own
   * words — which reads better than a verbatim re-read anyway.
   *
   * Nothing here is fatal. If the gate declines, or the rep ended underneath
   * us, the held turn is released and the transcript is exactly what it would
   * have been before any of this existed.
   */
  private attemptUnheardRecovery(itemId: string): void {
    setTimeout(() => {
      if (this.ended || this.dc?.readyState !== 'open') {
        this.translator.releaseHeldAgentTurn()
        return
      }
      if (this.responseGate.busy || this.responseGate.hasPending) {
        this.translator.releaseHeldAgentTurn()
        return
      }

      this.send({ type: 'conversation.item.delete', item_id: itemId })

      if (!this.responseGate.requestRepeat()) {
        this.translator.releaseHeldAgentTurn()
        return
      }
      this.recoveryPending = true
      this.translator.markHeldTurnReplaced()
    }, 0)
  }

  private stopWatchingHerVoice(): void {
    if (this.audibilityTimer === null) return
    clearInterval(this.audibilityTimer)
    this.audibilityTimer = null
  }

  /**
   * Packets received on the inbound audio track, or null.
   *
   * The one number that separates "the audio never arrived" from "it arrived
   * and was not rendered", and therefore the difference between a vendor fault
   * and a graph fault. Read only while she is speaking — see
   * `PACKET_SAMPLE_EVERY` — so it never becomes a background polling loop.
   */
  private async inboundAudioPackets(): Promise<number | null> {
    if (!this.pc) return null
    try {
      const stats = await this.pc.getStats()
      let packets: number | null = null
      stats.forEach((report) => {
        if (report.type !== 'inbound-rtp') return
        const inbound = report as RTCInboundRtpStreamStats
        if (inbound.kind !== 'audio') return
        if (typeof inbound.packetsReceived === 'number') packets = inbound.packetsReceived
      })
      return packets
    } catch {
      return null
    }
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

  /**
   * A second response appeared while the first was still generating or playing.
   *
   * Cancels the NEWCOMER, by id, and never bare. A `response.cancel` with no
   * `response_id` cancels whatever the server happens to be generating — which
   * in this path is the reply the user is currently listening to. That is a
   * cure strictly worse than the disease, so a cancel with no id is not sent
   * at all: the overlap guard in the translator has already stopped the second
   * response reaching the transcript, and the incident is still reported.
   *
   * The output audio buffer is deliberately NOT cleared here. It holds the
   * FIRST response's audio — the legitimate one — and clearing it would cut
   * off the very reply this guard exists to protect.
   */
  private cancelOverlappingResponse(responseId: string | null): void {
    if (responseId) this.send({ type: 'response.cancel', response_id: responseId })
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

  /**
   * The transcriber invented words from noise, and a reply to them is already
   * in flight.
   *
   * The response is created on `input_audio_buffer.committed`, which fires
   * before transcription completes, so by the time the text can be inspected
   * she may already be answering. Cancel it if she has not started speaking —
   * transcription typically lands a few hundred milliseconds ahead of audio, so
   * this usually wins. If it does not, she says one odd thing and the turn is
   * still kept out of the transcript, the warmth engine and the scorecard.
   */
  private cancelPhantomResponse(
    at: number,
    reason: string,
    responseId: string | null,
  ): void {
    if (responseId) {
      // This phantom created that response. Cancel it, clear the audio it has
      // already buffered, and clear the translator's side too — otherwise the
      // next legitimate `response.create` arrives as an unrecognised id, is
      // reported as an overlap and is cancelled on the spot.
      this.send({ type: 'response.cancel', response_id: responseId })
      this.send({ type: 'output_audio_buffer.clear' })
      this.translator.abandonActiveResponse()
      this.responseGate.reset()
    } else {
      // ROUND 12. The commit was coalesced into the gate's pending slot, so
      // this phantom owns NOTHING that is generating. The old code cancelled
      // `activeResponseId` here, which in exactly this case is the reply to a
      // REAL user turn, mid-playback. That single line produced both live
      // symptoms: she stopped mid-word, and the recovery response that landed
      // afterwards read as her switching to a different sentence. It also wiped
      // the queue with `reset()`, so the real turn behind it went unanswered.
      //
      // The correct undo is narrow: drop the queue entry, touch nothing else.
      this.responseGate.cancelPending()
    }

    this.emitter.emit('agent.overlap', { at })
    this.emitter.emit('error', {
      error: new VoiceError(
        'provider_error',
        PROVIDER,
        responseId
          ? `Dropped a phantom user turn (${reason}) and the reply it triggered.`
          : `Dropped a phantom user turn (${reason}) before it was answered.`,
        { fatal: false },
      ),
    })
  }

  /**
   * Cut her own history back to the audio the user actually received.
   *
   * The other half of the barge-in fix, and the half that changes what she
   * SAYS NEXT. Clipping our transcript stops the debrief and the grader reading
   * words nobody heard; this stops *her* reading them. Without it the model's
   * conversation still contains the whole sentence, so her next line continues
   * from a thought the user only got the first word of — which is exactly the
   * live symptom of "she started saying something and then it became something
   * else".
   *
   * Server VAD does truncate on its own, but on the send side: it knows what
   * left the server, not what left the speaker, and the difference is the
   * jitter buffer. Our playhead is measured from her first audible frame to the
   * moment the buffer was cleared, so it is never LATER than the server's — and
   * truncating to an earlier point is always legal. A refinement, not a fight.
   *
   * Best-effort by construction: a stale item id means the server has already
   * moved on, and a rejected truncate is reported as a non-fatal provider error
   * rather than being allowed to disturb a live conversation.
   */
  private truncateHerMemory(playedMs: number): void {
    const itemId = this.translator.currentAudioItemId
    if (!itemId) return
    this.send({
      type: 'conversation.item.truncate',
      item_id: itemId,
      content_index: 0,
      audio_end_ms: Math.max(0, Math.round(playedMs)),
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
    if (td.interrupt_response === interruptible) return
    td.interrupt_response = interruptible
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: { input: { turn_detection: { ...td } } },
      },
    })
  }

  /**
   * Tell the adapter where the meter stands.
   *
   * The adapter deliberately owns no meter — warmth is the application's and
   * the character never sees a number. What it needs is the ONE consequence
   * that has to happen down here at transport level: how long she sits on a
   * reply, and whether she takes the turn when he talks over her.
   *
   * Idempotent and cheap. `setInterruptible` no-ops when nothing changed, so
   * this can be called on every turn without spending a session update.
   */
  setWarmth(warmth: number): void {
    this.warmth = warmth
    if (!this.persona) return
    // §05 is the ceiling and this cannot raise it: levels 1-4 never interrupt,
    // whatever the meter says. Above that, interruption becomes a sign of
    // interest instead of a property of the rung.
    this.setInterruptible(interruptsAt(warmth, mayInterrupt(this.persona)))
  }

  getAnalyser(): Analysers {
    return { user: this.userAnalyser, agent: this.agentAnalyser }
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return
    this.muted = muted
    for (const track of this.micStream?.getAudioTracks() ?? []) track.enabled = !muted
    if (muted) this.send({ type: 'input_audio_buffer.clear' })
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
    this.stopWatchingHerVoice()

    try {
      this.room?.stop()
      this.dc?.close()
      this.pc?.close()
      this.micStream?.getTracks().forEach((t) => t.stop())
      for (const el of [this.audioEl, this.keepAliveEl]) {
        if (!el) continue
        el.pause()
        el.srcObject = null
      }
      this.audioEl = null
      this.keepAliveEl = null
      this.playbackSink = null
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
    this.remoteSource = null
    this.room = null
    this.responseGate.reset()

    this.emitter.emit('session.end', { summary })
    this.emitter.clear()
    return summary
  }
}

export { OpenAIEventTranslator } from './translate'
