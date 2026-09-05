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
const MAX_PENDING_COMMITS = 64
const TRANSCRIPTION_TIMEOUT_MS = 15_000

/** A snapshot at commit time; subsequent speech must never overwrite it. */
export interface TranscriptionTiming {
  startedAtMs: number
  stoppedAtMs: number
  committedAtMs: number
}

interface PendingCommit {
  timing: TranscriptionTiming
  itemId: string | null
  partial: string
  final: string | null
  latencyMs: number
  cancelled: boolean
  timer: ReturnType<typeof setTimeout> | null
}

export interface TranscriberEvents {
  /** Accumulated text for the oldest unfinished commit. */
  onDelta: (text: string, timing: TranscriptionTiming) => void
  onFinal: (text: string, timing: TranscriptionTiming, latencyMs: number) => void
  /** Called after ordered finals, including empty or failed commits, drain. */
  onSettled?: () => void
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
  clock?: () => number
}

export class RealtimeTranscriber {
  private readonly options: TranscriberOptions
  private socket: WebSocket | null = null
  private readonly preroll: Float32Array[] = []
  private sending = false
  private closed = false
  private readonly pending: PendingCommit[] = []
  private readonly awaitingAck: PendingCommit[] = []
  private readonly items = new Map<string, PendingCommit>()
  private readonly seenItems = new Set<string>()
  private readonly usageReported = new Set<string>()

  get pendingCount(): number { return this.pending.length }

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
  commit(timing: TranscriptionTiming): boolean {
    if (this.closed || !this.sending || this.socket?.readyState !== 1) return false
    this.sending = false
    this.preroll.length = 0
    if (this.pending.length >= MAX_PENDING_COMMITS || this.awaitingAck.length >= MAX_PENDING_COMMITS) {
      this.options.onError(new VoiceError('transport_failed', 'elevenlabs', 'The transcription connection stopped acknowledging speech.'))
      return false
    }
    const commit: PendingCommit = {
      timing: { ...timing }, itemId: null, partial: '', final: null,
      latencyMs: 0, cancelled: false, timer: null,
    }
    commit.timer = setTimeout(() => {
      if (commit.cancelled || commit.final !== null || this.closed) return
      this.finish(commit, '')
      this.options.onError(new VoiceError('provider_error', 'elevenlabs', 'Transcription timed out for one speech segment.', { fatal: false }))
    }, TRANSCRIPTION_TIMEOUT_MS)
    this.pending.push(commit)
    this.awaitingAck.push(commit)
    this.send({ type: 'input_audio_buffer.commit' })
    return true
  }

  /** Throw away audio that should never become a turn — a false onset, or a
   *  rep that ended mid-sentence. */
  clear(): void {
    this.sending = false
    this.preroll.length = 0
    this.discardPending()
    this.send({ type: 'input_audio_buffer.clear' })
  }

  close(): void {
    this.closed = true
    this.discardPending()
    this.awaitingAck.length = 0
    this.seenItems.clear()
    this.usageReported.clear()
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
    if (this.closed) return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }

    const type = typeof event['type'] === 'string' ? (event['type'] as string) : ''

    if (type === 'input_audio_buffer.committed') {
      const itemId = event['item_id']
      if (typeof itemId !== 'string' || !itemId || this.seenItems.has(itemId)) return
      this.seenItems.add(itemId)
      if (this.seenItems.size > MAX_PENDING_COMMITS * 2) {
        const oldest = this.seenItems.values().next().value!
        this.seenItems.delete(oldest)
        this.usageReported.delete(oldest)
      }
      // Commit acknowledgements follow the requests on this socket. ASR
      // completion does not: its item_id is the only safe association.
      const commit = this.awaitingAck.shift()
      if (!commit || commit.cancelled || commit.final !== null) return
      commit.itemId = itemId
      this.items.set(itemId, commit)
      return
    }

    if (type.endsWith('input_audio_transcription.delta')) {
      const commit = this.commitFor(event)
      const delta = event['delta']
      if (commit && typeof delta === 'string' && delta) {
        commit.partial = (commit.partial + delta).slice(0, 32_768)
        if (this.pending[0] === commit) this.options.onDelta(commit.partial, commit.timing)
      }
      return
    }

    if (type.endsWith('input_audio_transcription.completed')) {
      const itemId = event['item_id']
      // Pausing discards the transcript, not an already-incurred STT charge.
      if (typeof itemId === 'string' && this.seenItems.has(itemId) && !this.usageReported.has(itemId)) {
        this.usageReported.add(itemId)
        this.reportUsage(event['usage'])
      }
      const commit = this.commitFor(event)
      if (!commit) return
      const transcript = event['transcript']
      this.finish(commit, typeof transcript === 'string' ? transcript : commit.partial)
      return
    }

    if (type.endsWith('input_audio_transcription.failed')) {
      const commit = this.commitFor(event)
      if (!commit) return
      this.finish(commit, '')
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

  private commitFor(event: Record<string, unknown>): PendingCommit | null {
    const commit = typeof event['item_id'] === 'string' ? this.items.get(event['item_id']) : null
    return commit && !commit.cancelled && commit.final === null ? commit : null
  }

  private finish(commit: PendingCommit, text: string): void {
    if (commit.timer) clearTimeout(commit.timer)
    commit.timer = null
    commit.final = text
    commit.latencyMs = Math.max(0, (this.options.clock?.() ?? performance.now()) - commit.timing.committedAtMs)
    if (commit.itemId) this.items.delete(commit.itemId)
    // A later clause can finish first. Hold it until every earlier clause is
    // final (or explicitly skipped), then notify the adapter just once.
    while (this.pending.length > 0 && this.pending[0]?.final !== null) {
      const ready = this.pending.shift()!
      if (!ready.cancelled) this.options.onFinal(ready.final!, ready.timing, ready.latencyMs)
    }
    this.options.onSettled?.()
  }

  private discardPending(): void {
    for (const commit of this.pending) {
      commit.cancelled = true
      if (commit.timer) clearTimeout(commit.timer)
      commit.timer = null
    }
    this.pending.length = 0
    this.items.clear()
    // Retain unacknowledged tombstones: a late acknowledgement after unmute
    // must consume its old slot, never bind itself to new microphone audio.
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
