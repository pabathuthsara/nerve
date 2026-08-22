/**
 * Speech to text — OpenAI realtime transcription, driven by our VAD.
 *
 * The important word is *driven*. The transcription session supports its own
 * server-side turn detection and we switch it off: `turn_detection: null`, and
 * the buffer is committed only when our detector concedes the turn. That is the
 * whole reason this branch exists rather than using ElevenAgents — the
 * calibrated silence threshold is ours and nothing else may own it.
 *
 * Audio only flows while someone is speaking, plus a short pre-roll. STT is
 * billed per audio token, so streaming an open microphone through eight minutes
 * of a mostly-silent bookshop would cost more than the voice does.
 *
 * Browser only. The ephemeral client secret is minted server-side; the standing
 * key never reaches this file.
 */

import { VoiceError } from '../types'
import { floatToPcm16, toBase64 } from './capture'

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription'

/** Frames of speech kept behind the playhead and flushed on onset, so the
 *  first syllable is not clipped off the front of every turn. */
const PREROLL_FRAMES = 15 // 300 ms at 20 ms frames

export interface TranscriberEvents {
  onDelta: (text: string) => void
  onFinal: (text: string) => void
  onError: (error: VoiceError) => void
  /** Provider-reported token usage for the turn, when it supplies any. */
  onUsage?: (usage: { audio: number; text: number }) => void
}

export interface TranscriberOptions extends TranscriberEvents {
  clientSecret: string
  model: string
  sampleRate: number
  /** Injected in tests. */
  socketFactory?: (url: string, protocols: string[]) => WebSocket
  url?: string
}

export class RealtimeTranscriber {
  private readonly options: TranscriberOptions
  private socket: WebSocket | null = null
  private readonly preroll: Float32Array[] = []
  private sending = false
  private closed = false

  constructor(options: TranscriberOptions) {
    this.options = options
  }

  async connect(): Promise<void> {
    const factory =
      this.options.socketFactory
      ?? ((url: string, protocols: string[]) => new WebSocket(url, protocols))

    // Browsers cannot set an Authorization header on a WebSocket, so the
    // ephemeral secret rides in the subprotocol list. This is the documented
    // browser path and the reason the secret is short-lived.
    //
    // Two subprotocols, never three. Adding `openai-beta.realtime-v1` opts the
    // connection into the beta shape, which is now switched off server-side:
    // the socket opens, then immediately closes 4000 with
    // `beta_api_shape_disabled`. It looks exactly like a dead microphone.
    const socket = factory(this.options.url ?? REALTIME_URL, [
      'realtime',
      `openai-insecure-api-key.${this.options.clientSecret}`,
    ])
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new VoiceError('transport_failed', 'elevenlabs', 'Timed out opening the transcription socket.')),
        15_000,
      )
      socket.onopen = () => {
        clearTimeout(timer)
        this.configure()
        resolve()
      }
      socket.onerror = () => {
        clearTimeout(timer)
        reject(
          new VoiceError('transport_failed', 'elevenlabs', 'The transcription socket refused to open.'),
        )
      }
    })

    socket.onmessage = (event: MessageEvent<string>) => this.ingest(event.data)
    socket.onclose = (event: CloseEvent) => {
      if (this.closed) return
      // Fatal, not a note. Once this socket is gone no user turn can ever be
      // transcribed again, so the rep is over whether or not it looks live —
      // and a rep that looks live but hears nothing is the worst way to find
      // out something is broken.
      this.options.onError(
        new VoiceError(
          'transport_failed',
          'elevenlabs',
          `The transcription socket closed mid-session (${event.code}${event.reason ? `: ${event.reason}` : ''}).`,
        ),
      )
    }
  }

  private configure(): void {
    this.send({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: this.options.sampleRate },
            transcription: { model: this.options.model },
            // Ours, not theirs. See the header.
            turn_detection: null,
            noise_reduction: { type: 'near_field' },
          },
        },
      },
    })
  }

  /**
   * One 20 ms frame from the microphone.
   *
   * `speaking` comes from our VAD. While it is false the frame goes into the
   * pre-roll ring and no further; the ring is flushed the moment onset fires.
   */
  pushFrame(frame: Float32Array, speaking: boolean): void {
    if (this.closed) return

    if (!speaking && !this.sending) {
      this.preroll.push(frame)
      if (this.preroll.length > PREROLL_FRAMES) this.preroll.shift()
      return
    }

    if (speaking && !this.sending) {
      this.sending = true
      for (const buffered of this.preroll) this.appendPcm(buffered)
      this.preroll.length = 0
    }

    this.appendPcm(frame)
  }

  /** Our VAD conceded the turn: close the buffer and ask for the transcript. */
  commit(): void {
    if (!this.sending) return
    this.sending = false
    this.preroll.length = 0
    this.send({ type: 'input_audio_buffer.commit' })
  }

  /** Throw away audio that should never become a turn — a false onset, or a
   *  rep that ended mid-sentence. */
  clear(): void {
    this.sending = false
    this.preroll.length = 0
    this.send({ type: 'input_audio_buffer.clear' })
  }

  close(): void {
    this.closed = true
    try {
      this.socket?.close()
    } catch {
      /* Already gone. */
    }
    this.socket = null
  }

  private appendPcm(frame: Float32Array): void {
    const pcm = floatToPcm16(frame)
    this.send({ type: 'input_audio_buffer.append', audio: toBase64(pcm.buffer) })
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== 1) return
    this.socket.send(JSON.stringify(payload))
  }

  /** Exported shape so the translation is testable without a socket. */
  ingest(raw: string): void {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }

    const type = typeof event['type'] === 'string' ? (event['type'] as string) : ''

    if (type.endsWith('input_audio_transcription.delta')) {
      const delta = event['delta']
      if (typeof delta === 'string' && delta) this.options.onDelta(delta)
      return
    }

    if (type.endsWith('input_audio_transcription.completed')) {
      const transcript = event['transcript']
      this.reportUsage(event['usage'])
      this.options.onFinal(typeof transcript === 'string' ? transcript : '')
      return
    }

    if (type.endsWith('input_audio_transcription.failed')) {
      // One turn the transcriber could not read. The rep continues.
      this.options.onError(
        new VoiceError('provider_error', 'elevenlabs', `STT: ${messageOf(event)}`, { fatal: false }),
      )
      return
    }

    if (type === 'error') {
      // Session-level: a rejected configuration, an expired secret, a retired
      // API shape. None of those recover, and all of them are silent from the
      // user's seat unless we say so.
      this.options.onError(
        new VoiceError('provider_error', 'elevenlabs', `Transcription session: ${messageOf(event)}`),
      )
    }
  }

  private reportUsage(raw: unknown): void {
    if (!this.options.onUsage || !raw || typeof raw !== 'object') return
    const usage = raw as Record<string, unknown>
    const details = usage['input_token_details'] as Record<string, unknown> | undefined
    const audio = numberOf(details?.['audio_tokens']) ?? numberOf(usage['input_tokens']) ?? 0
    const text = numberOf(usage['output_tokens']) ?? 0
    this.options.onUsage({ audio, text })
  }
}

function messageOf(event: Record<string, unknown>): string {
  const error = event['error'] as { message?: unknown; code?: unknown } | undefined
  const message = typeof error?.message === 'string' ? error.message : 'no detail given'
  return typeof error?.code === 'string' ? `${message} (${error.code})` : message
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
