/**
 * Speech to text — ElevenLabs Scribe v2 Realtime, driven by our VAD
 * (`PERSONA-REALISM-REPORT-2026-09-23.md` §3.2, L3).
 *
 * A drop-in for `RealtimeTranscriber` in ./stt.ts: the same constructor
 * options, the same five methods and `pendingCount`, the same callbacks with
 * the same meanings. The adapter picks one or the other off the minted session
 * (`transcriberFor`, ./transcriber.ts) and nothing else in it changes.
 *
 * WHY THIS EXISTS. OpenAI's transcription session starts reading at commit, so
 * every reply waits for the whole utterance to be transcribed after he has
 * stopped: 625–885 ms median in production, ~1.2 s at p90. Scribe transcribes
 * while he is still speaking — partials arrive through `onDelta` mid-sentence —
 * so commit only has to close a segment it has already mostly read. Measured
 * from Sri Lanka on 24 September 2026 with `npm run scribe:probe -- --openai`,
 * the same synthetic audio through both arms from the same machine: commit →
 * final 294–350 ms on Scribe (six segments, three runs) against 816–1,409 ms on
 * `gpt-4o-transcribe`, with three to five partials arriving before each commit
 * and none at all on OpenAI's. The report's L3 status carries the table.
 *
 * WHAT IS STILL OURS, AND STAYS OURS. `commit_strategy=manual`: Scribe has a
 * VAD of its own and we do not use it, for the reason stt.ts switches off
 * OpenAI's — the calibrated silence threshold is the user's, and nothing else
 * may decide he has finished. Audio still flows only while he is speaking, plus
 * the same 300 ms pre-roll, because Scribe bills by the second of audio SENT
 * and an open microphone through a mostly-silent rep would pay for the silence.
 *
 * FIVE THINGS THE REAL SOCKET DOES THAT THE DOCUMENTATION DOES NOT SAY (or says
 * only in passing), each read off a live session on 23 September 2026 and read
 * again on the 24th (rule 14), and each load-bearing below. The fixtures in
 * scribe.test.ts are the 24 September messages, verbatim.
 *
 *  1. It hangs up on silence. With no audio for ~15.3–15.8 s the server closes
 *     the socket, cleanly (1000) and without a message. Speech-gating means he
 *     is "silent" for the whole of every one of her replies, so a rep would die
 *     at her second long line. A 20 ms chunk of digital silence every five
 *     seconds keeps it open — verified for 90 s with nothing else sent, after
 *     which the socket still answered a commit — at a cost of 0.4% of the idle
 *     time: `KEEPALIVE_TICK_MS`.
 *  2. A commit with less than 0.3 s of uncommitted audio is not ignored, it is
 *     FATAL: `commit_throttled` ("…You need at least 0.3s of uncommitted audio
 *     before committing"), then close 1000 with that reason. A short "hi" after
 *     a short gap can be under that, so every commit is padded up to
 *     `MIN_COMMIT_MS` with silence. Trailing silence does not change a
 *     transcript.
 *  3. It commits on its own at ~35.8 s of uncommitted AUDIO (not wall clock —
 *     the vendor's guide says "accumulated audio", and ninety seconds of
 *     keep-alive never tripped it), and says so with an ordinary
 *     `committed_transcript` nobody asked for. That is worse than
 *     it sounds. Our count of uncommitted audio cannot see it happen, so a
 *     commit of ours landing in the next 0.3 s is fact 2 — the socket closes
 *     and the rep is over — and an answer nobody asked for, arriving while one
 *     of ours is queued, would be bound to the wrong turn. So the vendor never
 *     gets there: a long monologue is split by us, at a pause if one comes
 *     after `SPLIT_AFTER_MS` and unconditionally at `SPLIT_BY_MS`, and each
 *     piece's text is held as a prefix of the segment it belongs to. (The
 *     vendor itself recommends committing every 20–30 s.) An unsolicited
 *     answer is still handled, because the vendor can.
 *  4. A bad or spent token is not refused at the handshake. The socket OPENS,
 *     sends `auth_error` ("You must be authenticated to use this endpoint."),
 *     then closes 1000. So `connect()` resolves on `session_started`, never on
 *     `open`, and a spent token is the ordinary way a retried connect fails:
 *     the token is consumed by the first socket that opens with it.
 *  5. It says the last thing again. Five to fifty milliseconds AFTER a
 *     `committed_transcript`, a `partial_transcript` arrives carrying that
 *     committed text byte for byte — on every answer the socket was kept open
 *     long enough to follow (the probe hangs up straight after its last one),
 *     and never after an empty answer. Read naively it
 *     is a partial of whatever comes next, so if he has already started his
 *     next sentence it captions the new turn with the old one, and anything
 *     that ever starts work on a partial (the report's L5) would start it on
 *     words he has finished saying. `echo` drops it.
 *
 * There is no item id. Scribe answers every commit with exactly one
 * `committed_transcript` — an empty one for a segment of silence — in the order
 * the commits were sent, so the queue position IS the identity. Everything that
 * stt.ts binds by `item_id` is bound here by position in `awaiting`, and every
 * commit this class sends, including splits and the ones whose text nobody
 * wants, holds a place in that queue until its answer arrives.
 *
 * Browser only, except that it runs under Node 22's global WebSocket for
 * `scripts/scribe-probe.ts`. The single-use token is minted server-side
 * (`mintScribeToken`); the standing key never reaches this file.
 *
 * Sources, read 23 September 2026:
 *   https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 *   https://elevenlabs.io/docs/api-reference/tokens/create
 *   https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming
 *   https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies
 *   https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/event-reference
 *   https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe
 *   https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/keyterm-prompting
 *   https://elevenlabs.io/docs/overview/capabilities/speech-to-text (billing)
 *   https://elevenlabs.io/pricing/api ($0.39 an hour)
 *   @elevenlabs/client 1.25.0, dist/scribe/connection.js (the wire shape of a commit)
 */

import { VoiceError } from '../types'
import { floatToPcm16, toBase64 } from './capture'
import { SCRIBE_REALTIME_MODEL } from './config'
import type { TranscriberOptions, TranscriptionTiming } from './stt'
import type { Transcriber } from './transcriber'
import { frameRms } from './vad'

export const SCRIBE_REALTIME_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'

/** The formats the socket accepts as raw PCM16. We capture at 24 kHz, which is
 *  on the list, so nothing resamples. */
const PCM_FORMATS: Readonly<Record<number, string>> = {
  8_000: 'pcm_8000',
  16_000: 'pcm_16000',
  22_050: 'pcm_22050',
  24_000: 'pcm_24000',
  44_100: 'pcm_44100',
  48_000: 'pcm_48000',
}

/** Identical to stt.ts, so the two arms clip the same syllable. */
const PREROLL_FRAMES = 15 // 300 ms at 20 ms frames
const MAX_PENDING_COMMITS = 64
const TRANSCRIPTION_TIMEOUT_MS = 15_000
const CONNECT_TIMEOUT_MS = 15_000

/**
 * Frames per wire chunk while he speaks: 100 ms.
 *
 * The vendor asks for 0.1–1 s chunks. A 20 ms frame per message is fifty
 * messages a second of base64 overhead for no gain, and batching costs no
 * latency where it matters: a commit flushes whatever is waiting first, so the
 * last syllable is never held back.
 */
const CHUNK_FRAMES = 5

/**
 * The keep-alive (fact 1). A tick every 2.5 s sends one 20 ms frame of silence
 * once two ticks pass with nothing sent, so the longest the socket ever goes
 * unfed is five seconds — a third of the 15.8 s it tolerates.
 */
const KEEPALIVE_TICK_MS = 2_500
const KEEPALIVE_IDLE_TICKS = 2
const KEEPALIVE_FRAME_MS = 20

/** The vendor's floor is 0.3 s of uncommitted audio; under it a commit closes
 *  the socket (fact 2). Padded to here so rounding on their side can never trip it. */
const MIN_COMMIT_MS = 350

/**
 * The split (fact 3). From twenty seconds of uncommitted audio a segment is cut
 * at the first quiet frame, so the cut falls between words rather than through
 * one — a cut word comes back as "Ali-". By thirty it is cut regardless, which
 * is six seconds short of the vendor's own and outside any rounding.
 *
 * "Quiet" is the VAD's absolute noise gate: a frame under it is never speech,
 * whatever the room. A loud room may never produce one, which is what the hard
 * limit is for.
 */
const SPLIT_AFTER_MS = 20_000
const SPLIT_BY_MS = 30_000
const SPLIT_QUIET_RMS = 0.006

/** Every documented error `message_type`. Each is followed by a close, per the
 *  event reference, so each is fatal. */
const SESSION_ERRORS = new Set([
  'error', 'auth_error', 'quota_exceeded', 'commit_throttled', 'transcriber_error',
  'unaccepted_terms', 'rate_limited', 'input_error', 'invalid_request', 'queue_overflow',
  'resource_exhausted', 'session_time_limit_exceeded', 'chunk_size_exceeded',
  'insufficient_audio_activity',
])

/**
 * One stretch of his speech, from onset to our commit.
 *
 * Live (no `timing`) while he is still speaking it, and pending once committed.
 * It is the unit a split or an unsolicited vendor commit can land inside, which
 * is why the text already committed within it is carried as `prefix` rather
 * than reported on its own.
 */
interface Segment {
  /** The adapter's snapshot, taken at commit. Null while he is speaking. */
  timing: TranscriptionTiming | null
  /** Onset on our clock. Only the live caption reads it. */
  startedAtMs: number
  /** Text already committed inside this segment, by a split or by the vendor. */
  prefix: string
  final: string | null
  latencyMs: number
  cancelled: boolean
  timer: ReturnType<typeof setTimeout> | null
}

/** One commit on the wire, waiting for its one answer. */
interface Awaiting {
  segment: Segment
  /** False for a split: its answer is a prefix, not the segment's end. */
  closes: boolean
}

/**
 * The socket URL. Configuration rides in the query string because the
 * WebSocket API has no configuration message: `session_started` echoes it back
 * and nothing can change it afterwards.
 *
 * Deliberately absent: `include_timestamps` (the adapter's timing is the VAD's,
 * and word timings arrive in a SECOND message after the one we act on),
 * `keyterms` (+$0.05 an hour, unpriced here — see `SCRIBE_REALTIME_USD_PER_MINUTE`),
 * `previous_text` (accepted only on a session's first chunk, so it cannot carry
 * per-turn context), and `enable_logging=false`. Zero retention is for the
 * enterprise and trial tiers only, and on ours asking for it changes nothing
 * but the transcript of the handshake: the session opens, sends a `warning`
 * that zero-retention mode "was not applied … This session is still being
 * logged", and is logged (read 24 September 2026). Asking would only put a
 * privacy we do not get into our own code.
 */
export function scribeUrl(input: {
  token: string
  model?: string
  sampleRate: number
  language?: string
  base?: string
}): string {
  const format = PCM_FORMATS[input.sampleRate]
  if (!format) {
    throw new VoiceError(
      'not_configured',
      'elevenlabs',
      `Scribe does not accept ${input.sampleRate} Hz PCM. Capture at one of ${Object.keys(PCM_FORMATS).join(', ')}.`,
    )
  }
  const query = new URLSearchParams({
    model_id: input.model ?? SCRIBE_REALTIME_MODEL,
    token: input.token,
    audio_format: format,
    // Pinned for the reason `TranscriberOptions.language` gives: a guessed
    // language is guessed worst on a hum.
    language_code: input.language ?? 'en',
    commit_strategy: 'manual',
  })
  return `${input.base ?? SCRIBE_REALTIME_URL}?${query}`
}

export class ScribeTranscriber implements Transcriber {
  /**
   * `clientSecret` is the Scribe single-use token and `url`, when given, is the
   * endpoint the query string is appended to (a regional host, or a test
   * server) — the same names stt.ts uses, so the adapter passes one options
   * object to either class.
   */
  private readonly options: TranscriberOptions
  private readonly minCommitSamples: number
  private readonly keepaliveSamples: number
  private readonly splitAfterSamples: number
  private readonly splitBySamples: number
  private socket: WebSocket | null = null
  private readonly preroll: Float32Array[] = []
  private readonly batch: Int16Array[] = []
  /** The segment he is speaking now. Non-null is stt.ts's `sending`. */
  private live: Segment | null = null
  private closed = false
  /** A fatal error has been reported; the close that follows it is not news. */
  private failed = false
  private readonly pending: Segment[] = []
  /** Every commit sent and not yet answered, in send order, tombstones included. */
  private readonly awaiting: Awaiting[] = []
  /** Samples the vendor holds uncommitted, by our count: speech, lead-in,
   *  padding and keep-alive alike, because it counts all of them. */
  private uncommittedSamples = 0
  /** Microphone audio has gone up since the last commit (not merely silence). */
  private speechSinceCommit = false
  private unreportedSamples = 0
  /**
   * The text of the last `committed_transcript`, until the next partial (fact
   * 5). That partial is either the vendor repeating it — dropped — or the
   * first word of new speech, and in both cases the watch is over.
   */
  private echo: string | null = null
  private idleTicks = 0
  private keepalive: ReturnType<typeof setInterval> | null = null

  get pendingCount(): number { return this.pending.length }

  constructor(options: TranscriberOptions) {
    this.options = options
    const samples = (ms: number) => Math.ceil((options.sampleRate * ms) / 1000)
    this.minCommitSamples = samples(MIN_COMMIT_MS)
    this.keepaliveSamples = samples(KEEPALIVE_FRAME_MS)
    this.splitAfterSamples = samples(SPLIT_AFTER_MS)
    this.splitBySamples = samples(SPLIT_BY_MS)
  }

  async connect(): Promise<void> {
    const url = scribeUrl({
      token: this.options.clientSecret,
      model: this.options.model,
      sampleRate: this.options.sampleRate,
      ...(this.options.language ? { language: this.options.language } : {}),
      ...(this.options.url ? { base: this.options.url } : {}),
    })
    const factory =
      this.options.socketFactory
      ?? ((address: string, protocols: string[]) => new WebSocket(address, protocols))

    // The token rides in the query string: a browser cannot set a header on a
    // WebSocket, and unlike OpenAI's secret it is not passed as a subprotocol.
    const socket = factory(url, [])
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    // Resolved by `session_started` and nothing earlier. A bad or spent token
    // OPENS and is refused afterwards (fact 4), so resolving on `open` would
    // hand the adapter a live-looking transcriber that is already dead — the
    // failure stt.ts describes as looking exactly like a dead microphone.
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (error?: VoiceError) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve()
      }
      const timer = setTimeout(
        () => settle(new VoiceError('transport_failed', 'elevenlabs', 'Timed out opening the transcription socket.')),
        CONNECT_TIMEOUT_MS,
      )
      socket.onmessage = (event: MessageEvent<string>) => {
        const message = parse(event.data)
        if (!message) return
        if (message.type === 'session_started') settle()
        else if (SESSION_ERRORS.has(message.type)) {
          settle(new VoiceError('provider_error', 'elevenlabs', `Transcription session refused: ${describe(message)}`))
        }
      }
      socket.onerror = () => {
        settle(new VoiceError('transport_failed', 'elevenlabs', 'The transcription socket refused to open.'))
      }
      socket.onclose = (event: CloseEvent) => {
        settle(new VoiceError(
          'transport_failed',
          'elevenlabs',
          `The transcription service closed the session before it started (${closeDetail(event)}).`,
        ))
      }
    })

    socket.onmessage = (event: MessageEvent<string>) => this.ingest(event.data)
    socket.onclose = (event: CloseEvent) => {
      if (this.closed || this.failed) return
      this.failed = true
      // Fatal, for stt.ts's reason: once this socket is gone no user turn can
      // ever be transcribed again, and a rep that looks live but hears nothing
      // is the worst way to find out.
      this.options.onError(
        new VoiceError(
          'transport_failed',
          'elevenlabs',
          `The transcription socket closed mid-session (${closeDetail(event)}).`,
        ),
      )
    }
    this.keepalive = setInterval(() => this.tick(), KEEPALIVE_TICK_MS)
  }

  /**
   * One 20 ms frame from the microphone. Identical gating to stt.ts: while our
   * VAD says silence the frame goes into the pre-roll ring and no further, and
   * the ring is flushed the moment onset fires.
   */
  pushFrame(frame: Float32Array, speaking: boolean): void {
    if (this.closed) return

    if (!speaking && !this.live) {
      this.preroll.push(frame)
      if (this.preroll.length > PREROLL_FRAMES) this.preroll.shift()
      return
    }

    if (!this.live) {
      this.live = segment(this.now())
      for (const buffered of this.preroll) this.batch.push(floatToPcm16(buffered))
      this.preroll.length = 0
      // The lead-in goes now rather than waiting for a full chunk: the first
      // partial is the one the partials are for.
      this.batch.push(floatToPcm16(frame))
      this.flushBatch()
      return
    }

    this.batch.push(floatToPcm16(frame))
    if (this.batch.length >= CHUNK_FRAMES) this.flushBatch()

    // Fact 3. Checked per frame so the cut lands on the quiet one itself.
    const held = this.uncommittedSamples + this.batch.reduce((sum, chunk) => sum + chunk.length, 0)
    if (held >= this.splitBySamples || (held >= this.splitAfterSamples && frameRms(frame) < SPLIT_QUIET_RMS)) {
      this.split()
    }
  }

  /** Our VAD conceded the turn: close the segment and ask for its transcript. */
  commit(timing: TranscriptionTiming): boolean {
    if (this.closed || !this.live || this.socket?.readyState !== 1) return false
    const committed = this.live
    this.live = null
    this.preroll.length = 0
    if (this.pending.length >= MAX_PENDING_COMMITS || this.awaiting.length >= MAX_PENDING_COMMITS) {
      this.batch.length = 0
      this.options.onError(new VoiceError('transport_failed', 'elevenlabs', 'The transcription connection stopped acknowledging speech.'))
      return false
    }
    committed.timing = { ...timing }
    committed.timer = setTimeout(() => {
      if (committed.cancelled || committed.final !== null || this.closed) return
      // Its place in `awaiting` is kept: a late answer must consume this slot,
      // never bind itself to the next segment's timing.
      this.finish(committed, '')
      this.options.onError(new VoiceError('provider_error', 'elevenlabs', 'Transcription timed out for one speech segment.', { fatal: false }))
    }, TRANSCRIPTION_TIMEOUT_MS)
    this.pending.push(committed)
    this.awaiting.push({ segment: committed, closes: true })
    this.sendCommit()
    return true
  }

  /**
   * Throw away audio that should never become a turn — a false onset, a pause,
   * or a rep that ended mid-sentence.
   *
   * THERE IS NO CLEAR MESSAGE, AND THAT MAKES THIS A COMMIT. OpenAI's socket
   * takes `input_audio_buffer.clear`; Scribe's has nothing but audio and
   * commits. Speech already sent stays in the vendor's buffer, and left there it
   * would be transcribed at the FRONT of his next turn — so pausing mid-sentence
   * and resuming would put the words from before the pause into the sentence
   * after it. Private words, in the wrong turn, spoken to her. So any speech
   * that went up since the last commit is committed now, into a cancelled
   * segment that discards its answer; what had not yet been sent is simply
   * dropped.
   */
  clear(): void {
    const abandoned = this.live ?? segment(0)
    abandoned.cancelled = true
    this.live = null
    this.preroll.length = 0
    this.batch.length = 0
    this.discardPending()
    if (this.speechSinceCommit && !this.closed && this.socket?.readyState === 1) {
      this.awaiting.push({ segment: abandoned, closes: true })
      this.sendCommit()
    }
  }

  close(): void {
    // What went up since the last commit was sent, and will be billed.
    this.reportUsage()
    this.closed = true
    this.discardPending()
    if (this.live) this.live.cancelled = true
    this.live = null
    this.awaiting.length = 0
    this.batch.length = 0
    this.preroll.length = 0
    if (this.keepalive) clearInterval(this.keepalive)
    this.keepalive = null
    try {
      this.socket?.close()
    } catch {
      /* Already gone. */
    }
    this.socket = null
  }

  /** Public so the translation is testable without a socket, as in stt.ts. */
  ingest(raw: string): void {
    if (this.closed) return
    const message = parse(raw)
    if (!message) return

    if (message.type === 'partial_transcript') {
      if (typeof message.body['text'] === 'string') this.onPartial(message.body['text'].slice(0, 32_768))
      return
    }

    if (message.type === 'committed_transcript') {
      if (typeof message.body['text'] === 'string') this.onCommitted(message.body['text'].slice(0, 32_768))
      return
    }

    if (SESSION_ERRORS.has(message.type)) {
      // Session-level, and followed by a close: an expired token, a quota, a
      // refused configuration, a throttled commit. None of them recover.
      if (this.failed) return
      this.failed = true
      this.options.onError(
        new VoiceError('provider_error', 'elevenlabs', `Transcription session: ${describe(message)}`),
      )
    }
    // Everything else — `session_started`, the `_with_timestamps` and
    // `_entities` follow-ups we never request, `warning` — carries nothing a
    // turn needs.
  }

  /**
   * A partial REPLACES the one before it; it is never a delta, and it is always
   * about the segment the vendor is reading now. That is the oldest one still
   * waiting for an answer, or — when every commit is answered — the one he is
   * speaking. Read off the live socket: a partial that arrives after a commit
   * and before its answer extends that segment, not the next.
   */
  private onPartial(text: string): void {
    // Fact 5. Compared byte for byte because that is what the socket sends; a
    // new sentence identical to the last one loses one caption and nothing
    // else, since a partial never reaches a final.
    const echo = this.echo
    this.echo = null
    if (echo !== null && text === echo) return

    const reading = this.awaiting[0]?.segment ?? this.live
    if (!reading || reading.cancelled || reading.final !== null || !text) return
    if (reading.timing) {
      if (this.pending[0] === reading) this.options.onDelta(join(reading.prefix, text), reading.timing)
      return
    }
    // Still being spoken, so there is no snapshot yet. Captioned only when no
    // earlier turn is still waiting, as stt.ts never interleaves two turns.
    if (this.pending.length > 0) return
    // PROVISIONAL TIMING, AND ONLY FOR THE LIVE CAPTION: onset to now. The
    // final always carries the adapter's own snapshot from `commit`.
    const now = this.now()
    this.options.onDelta(join(reading.prefix, text), {
      startedAtMs: reading.startedAtMs, stoppedAtMs: now, committedAtMs: now,
    })
  }

  private onCommitted(text: string): void {
    // Set before anything below can return: the repeat follows every answer,
    // including a split's, a tombstone's and the vendor's own.
    this.echo = text || null
    const answered = this.awaiting.shift()
    if (!answered) {
      // Nothing of ours is waiting, so this is the vendor's own commit of the
      // segment he is still speaking (fact 3). The split exists so this never
      // happens; if it does, the text is that segment's prefix, and the commit
      // that ends the segment carries the rest.
      if (this.live && text.trim()) this.live.prefix = join(this.live.prefix, text)
      // Their buffer is empty now. Ours is undercounted from here, which only
      // ever pads a commit that did not need it — the safe direction.
      this.uncommittedSamples = 0
      return
    }
    const { segment: answeredSegment, closes } = answered
    if (answeredSegment.cancelled || answeredSegment.final !== null) return
    if (!closes) {
      answeredSegment.prefix = join(answeredSegment.prefix, text)
      return
    }
    this.finish(answeredSegment, join(answeredSegment.prefix, text))
  }

  private finish(committed: Segment, text: string): void {
    if (committed.timer) clearTimeout(committed.timer)
    committed.timer = null
    committed.final = text
    committed.latencyMs = Math.max(0, this.now() - (committed.timing?.committedAtMs ?? 0))
    // Answers arrive in commit order, but a timeout can finish a later clause
    // first. Release strictly in spoken order, as stt.ts does.
    while (this.pending.length > 0 && this.pending[0]?.final !== null) {
      const ready = this.pending.shift()!
      if (!ready.cancelled) this.options.onFinal(ready.final!, ready.timing!, ready.latencyMs)
    }
    this.options.onSettled?.()
  }

  private discardPending(): void {
    for (const committed of this.pending) {
      committed.cancelled = true
      if (committed.timer) clearTimeout(committed.timer)
      committed.timer = null
    }
    this.pending.length = 0
    // `awaiting` keeps them. Each has an answer on its way, and each answer
    // must land in its own grave, never in the next segment.
  }

  /** Close the vendor's buffer inside the live segment, keeping it live (fact 3). */
  private split(): void {
    if (!this.live || this.socket?.readyState !== 1 || this.awaiting.length >= MAX_PENDING_COMMITS) return
    this.awaiting.push({ segment: this.live, closes: false })
    this.sendCommit()
  }

  private flushBatch(): void {
    if (this.batch.length === 0) return
    const total = this.batch.reduce((sum, chunk) => sum + chunk.length, 0)
    const pcm = new Int16Array(total)
    let offset = 0
    for (const chunk of this.batch) {
      pcm.set(chunk, offset)
      offset += chunk.length
    }
    this.batch.length = 0
    if (this.sendAudio(pcm)) this.speechSinceCommit = true
  }

  /** Close the vendor's segment, padding it past the floor that would
   *  otherwise close the socket (fact 2). Callers have checked the socket. */
  private sendCommit(): void {
    this.flushBatch()
    const short = this.minCommitSamples - this.uncommittedSamples
    if (short > 0) this.sendAudio(new Int16Array(short))
    this.send({
      message_type: 'input_audio_chunk',
      audio_base_64: '',
      commit: true,
      sample_rate: this.options.sampleRate,
    })
    this.uncommittedSamples = 0
    this.speechSinceCommit = false
    this.reportUsage()
  }

  private tick(): void {
    if (this.closed) return
    this.idleTicks += 1
    if (this.idleTicks < KEEPALIVE_IDLE_TICKS) return
    // Silence, not microphone audio: digital zeros, which is what the privacy
    // page's "while you are speaking" depends on.
    this.sendAudio(new Int16Array(this.keepaliveSamples))
  }

  private sendAudio(pcm: Int16Array): boolean {
    if (this.socket?.readyState !== 1) return false
    this.send({
      message_type: 'input_audio_chunk',
      audio_base_64: toBase64(pcm.buffer),
      commit: false,
      sample_rate: this.options.sampleRate,
    })
    this.uncommittedSamples += pcm.length
    this.unreportedSamples += pcm.length
    this.idleTicks = 0
    return true
  }

  /**
   * What Scribe will bill: every sample sent, speech, lead-in, padding and
   * keep-alive alike — reported at each commit and at close, in MILLISECONDS in
   * the audio slot, which is the unit its row in `PIPELINE_TOKEN_RATES` is
   * priced in. Scribe reports no usage of its own, so this is our count of what
   * we sent. It feeds the rep's telemetry only; the ledger is bounded on the
   * server (`settleTranscriptionEnvelope`), never from a browser's figure.
   */
  private reportUsage(): void {
    if (!this.options.onUsage || this.unreportedSamples === 0) return
    const audio = Math.round((this.unreportedSamples * 1000) / this.options.sampleRate)
    this.unreportedSamples = 0
    this.options.onUsage({ audio, text: 0 })
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== 1) return
    this.socket.send(JSON.stringify(payload))
  }

  private now(): number {
    return this.options.clock?.() ?? performance.now()
  }
}

function segment(startedAtMs: number): Segment {
  return { timing: null, startedAtMs, prefix: '', final: null, latencyMs: 0, cancelled: false, timer: null }
}

/** A commit that fell inside one sentence split it across two answers. */
function join(prefix: string, text: string): string {
  if (!prefix) return text
  return [prefix.trim(), text.trim()].filter(Boolean).join(' ')
}

function parse(raw: unknown): { type: string; body: Record<string, unknown> } | null {
  if (typeof raw !== 'string') return null
  try {
    const body = JSON.parse(raw) as unknown
    if (!body || typeof body !== 'object') return null
    const record = body as Record<string, unknown>
    return { type: typeof record['message_type'] === 'string' ? record['message_type'] : '', body: record }
  } catch {
    return null
  }
}

function describe(message: { type: string; body: Record<string, unknown> }): string {
  const detail = typeof message.body['error'] === 'string' ? message.body['error'] : 'no detail given'
  return `${detail} (${message.type})`
}

function closeDetail(event: CloseEvent): string {
  return `${event.code}${event.reason ? `: ${event.reason}` : ''}`
}
