/**
 * ElevenLabs streaming synthesis, through our own proxy.
 *
 * The proxy hop exists because raw text-to-speech has no ephemeral-token story:
 * the only credential is the standing API key, and that cannot go in a browser.
 * It costs a network leg, and that leg is the single clearest thing to try
 * moving if `ttsFirstByteMs` comes back ugly — the route runs on the edge for
 * exactly that reason.
 *
 * Playback begins on the first chunk. Her replies are about three words long,
 * so there is nothing to hide latency behind and waiting for the full clip
 * would add its own duration to every turn.
 *
 * Where the vendor returns character alignment we keep it, because that is what
 * lets a barge-in cut her transcript at the exact character that reached the
 * ear instead of at a guess.
 */

import { VoiceError } from '../types'
import { fromBase64, pcm16ToFloat } from './capture'
import type { AlignmentChunk } from './truncate'
import type { ElevenLabsTtsModelId, PcmOutputFormat, VoiceSettings } from './config'

/** Set by the proxy so the client does not have to sniff the body. */
export const FORMAT_HEADER = 'x-nerve-tts-format'
/** Set by the proxy from the vendor's own counter, when it sends one. */
export const CREDITS_HEADER = 'x-nerve-credits-remaining'

export interface TtsRequest {
  personaId: string
  text: string
  model: ElevenLabsTtsModelId
  outputFormat: PcmOutputFormat
  settings: VoiceSettings
  timestamps: boolean
}

export interface TtsEvents {
  /** First audio byte off the wire. The stage this branch was written to measure. */
  onFirstByte: () => void
  onChunk: (samples: Float32Array, alignment: AlignmentChunk | null) => void
  onCreditsRemaining?: (remaining: number) => void
}

export interface TtsClientOptions {
  endpoint?: string
  fetchImpl?: typeof fetch
}

export class TtsClient {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch

  constructor(options: TtsClientOptions = {}) {
    this.endpoint = options.endpoint ?? '/api/voice/tts'
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  async stream(request: TtsRequest, events: TtsEvents, signal: AbortSignal): Promise<void> {
    let response: Response
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })
    } catch (cause) {
      if (signal.aborted) return
      throw new VoiceError('provider_error', 'elevenlabs', 'Synthesis was unreachable.', { cause })
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      throw new VoiceError(
        'provider_error',
        'elevenlabs',
        `Synthesis refused (${response.status}). ${detail.slice(0, 300)}`,
      )
    }

    const remaining = Number(response.headers.get(CREDITS_HEADER))
    if (Number.isFinite(remaining) && response.headers.get(CREDITS_HEADER)) {
      events.onCreditsRemaining?.(remaining)
    }

    const aligned = response.headers.get(FORMAT_HEADER) === 'ndjson'
    const reader = response.body.getReader()
    let first = true

    const emit = (samples: Float32Array, alignment: AlignmentChunk | null) => {
      if (first) {
        first = false
        events.onFirstByte()
      }
      if (samples.length > 0) events.onChunk(samples, alignment)
    }

    try {
      if (aligned) await readNdjson(reader, emit, signal)
      else await readRawPcm(reader, emit, signal)
    } catch (cause) {
      if (signal.aborted) return
      throw new VoiceError('provider_error', 'elevenlabs', 'The synthesis stream broke.', { cause })
    } finally {
      reader.releaseLock()
    }
  }
}

type Emit = (samples: Float32Array, alignment: AlignmentChunk | null) => void

async function readNdjson(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  emit: Emit,
  signal: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done || signal.aborted) break
    buffer += decoder.decode(value, { stream: true })

    let index = buffer.indexOf('\n')
    while (index !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
      if (line) emitLine(line, emit)
    }
  }
  if (buffer.trim() && !signal.aborted) emitLine(buffer.trim(), emit)
}

function emitLine(line: string, emit: Emit): void {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return
  }
  const audio = parsed['audio_base64'] ?? parsed['audio']
  if (typeof audio !== 'string' || !audio) return
  emit(pcm16ToFloat(fromBase64(audio)), parseAlignment(parsed['alignment']))
}

/**
 * Prefer the raw alignment over `normalized_alignment`.
 *
 * Normalisation expands "Dr." and digits into the words actually spoken, which
 * is useful for captions and wrong for us: the transcript has to be the text
 * she was given, so its characters must line up with what we sent.
 */
export function parseAlignment(raw: unknown): AlignmentChunk | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const characters = value['characters']
  const starts = value['character_start_times_seconds']
  const ends = value['character_end_times_seconds']
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return null
  return {
    characters: characters.map((entry) => String(entry)),
    characterStartTimesSeconds: starts.map((entry) => Number(entry) || 0),
    characterEndTimesSeconds: ends.map((entry) => Number(entry) || 0),
  }
}

async function readRawPcm(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  emit: Emit,
  signal: AbortSignal,
): Promise<void> {
  // PCM16 is two bytes a sample and a chunk boundary can land between them.
  let carry: Uint8Array | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done || signal.aborted) break
    let bytes = value
    if (carry) {
      const merged = new Uint8Array(carry.length + bytes.length)
      merged.set(carry)
      merged.set(bytes, carry.length)
      bytes = merged
      carry = null
    }
    if (bytes.length % 2 === 1) {
      carry = bytes.subarray(bytes.length - 1).slice()
      bytes = bytes.subarray(0, bytes.length - 1)
    }
    if (bytes.length > 0) emit(pcm16ToFloat(bytes), null)
  }
}

/* ------------------------------------------------------------------ *
 * Chunking
 * ------------------------------------------------------------------ */

/**
 * When to hand accumulated tokens to synthesis.
 *
 * Kept blunt on purpose. Her replies are around three words, so for most turns
 * the first flush and the last are the same moment and any cleverness here buys
 * nothing. The one case worth catching is the occasional longer line, where
 * flushing at the first sentence end starts her talking a beat sooner.
 */
export function shouldFlush(pending: string, streamEnded: boolean): boolean {
  const text = pending.trim()
  if (text.length === 0) return false
  if (streamEnded) return true
  // Below this a "sentence" is usually an abbreviation or a false positive, and
  // a two-character clip costs a whole request for nothing.
  if (text.length < 12) return false
  return /[.!?]["'’]?$/.test(text)
}
