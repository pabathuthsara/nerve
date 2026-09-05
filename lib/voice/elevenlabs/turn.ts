/** One cancellable HTTP stream carries a complete server-orchestrated reply. */
import { VoiceError } from '../types'
import { fromBase64, pcm16ToFloat } from './capture'
import type { AlignmentChunk } from './truncate'
import { TURN_ENDPOINT, type TurnEvent, type TurnRequest, type TurnTimingStage } from './turn-protocol'

type UsageEvent = Extract<TurnEvent, { type: 'usage' }>

export interface TurnEvents {
  onClip: (id: string, text: string) => void
  onAudio: (clipId: string, samples: Float32Array, alignment: AlignmentChunk | null) => void
  onTiming: (stage: TurnTimingStage, ms: number) => void
  /** Cumulative usage for this turn. The adapter applies it once. */
  onUsage: (usage: UsageEvent) => void
}

export interface TurnClientOptions {
  endpoint?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class TurnClient {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: TurnClientOptions = {}) {
    this.endpoint = options.endpoint ?? TURN_ENDPOINT
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 25_000
  }

  async stream(
    request: TurnRequest,
    events: TurnEvents,
    signal: AbortSignal,
  ): Promise<{ exit: boolean; aborted: boolean }> {
    if (signal.aborted) return { exit: false, aborted: true }
    const abort = new AbortController()
    const onAbort = () => abort.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => abort.abort(), this.timeoutMs)
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    const cancelReader = () => { void reader?.cancel().catch(() => {}) }
    abort.signal.addEventListener('abort', cancelReader, { once: true })

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: abort.signal,
      })
      if (abort.signal.aborted) {
        await response.body?.cancel().catch(() => {})
        if (signal.aborted) return { exit: false, aborted: true }
        throw new Error('Turn timed out.')
      }
      if (!response.ok || !response.body) {
        let reason = ''
        if (response.body) {
          reader = response.body.getReader()
          let bytes = 0
          let refusal = ''
          const decoder = new TextDecoder()
          try {
            for (;;) {
              const next = await reader.read()
              if (next.done || abort.signal.aborted) break
              bytes += next.value.byteLength
              if (bytes > 4096) { refusal = ''; break }
              refusal += decoder.decode(next.value, { stream: true })
            }
            const parsed: unknown = JSON.parse(refusal + decoder.decode())
            if (parsed && typeof parsed === 'object' && 'reason' in parsed && typeof parsed.reason === 'string') {
              reason = parsed.reason
            }
          } catch { /* A malformed error body cannot grant permission or trigger a retry. */ }
          finally {
            await reader.cancel().catch(() => {})
            reader.releaseLock()
            reader = null
          }
        }
        if (abort.signal.aborted) throw new Error('Turn timed out.')
        throw new VoiceError('provider_error', 'elevenlabs', `The voice turn was refused (${response.status}).`, {
          // Terminal session refusals stop/persist the rep. Busy/duplicate and
          // transient service failures remain recoverable turn incidents.
          fatal: response.status === 401 || response.status === 403
            || ['budget', 'resources', 'expired', 'closed', 'missing'].includes(reason),
        })
      }

      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false
      let exit = false
      const consume = (line: string) => {
        if (!line.trim() || abort.signal.aborted || finished) return
        const event = parseTurnEvent(line)
        switch (event.type) {
          case 'clip': events.onClip(event.id, event.text); break
          case 'audio': {
            const bytes = fromBase64(event.audio_base64)
            if (bytes.length % 2 !== 0) throw new Error('Incomplete PCM sample.')
            if (bytes.length > 0) events.onAudio(event.clipId, pcm16ToFloat(bytes), event.alignment)
            break
          }
          case 'timing': events.onTiming(event.stage, event.ms); break
          case 'usage': events.onUsage(event); break
          case 'done': finished = true; exit = event.exit; break
          case 'error': throw new VoiceError('provider_error', 'elevenlabs', event.message, { fatal: false })
        }
      }

      while (!finished && !abort.signal.aborted) {
        const { done, value } = await reader.read()
        if (done || abort.signal.aborted) break
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > 2_000_000) throw new Error('Voice event exceeded the stream limit.')
        let index = buffer.indexOf('\n')
        while (index !== -1 && !abort.signal.aborted && !finished) {
          consume(buffer.slice(0, index))
          buffer = buffer.slice(index + 1)
          index = buffer.indexOf('\n')
        }
      }
      if (!finished && !abort.signal.aborted) consume(buffer + decoder.decode())
      if (signal.aborted) return { exit: false, aborted: true }
      if (abort.signal.aborted) throw new Error('Turn timed out.')
      if (!finished) throw new Error('Voice stream ended before completion.')
      return { exit, aborted: false }
    } catch (cause) {
      if (signal.aborted) return { exit: false, aborted: true }
      if (cause instanceof VoiceError) throw cause
      throw new VoiceError('provider_error', 'elevenlabs',
        abort.signal.aborted ? 'The voice reply took too long.' : 'The voice stream was interrupted.',
        { fatal: false, cause })
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      abort.signal.removeEventListener('abort', cancelReader)
      // A done/error event can precede EOF. Close the body so no orphan stream
      // survives a barge-in or continues to consume provider work.
      await reader?.cancel().catch(() => {})
      reader?.releaseLock()
      abort.abort()
    }
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function alignment(value: unknown): value is AlignmentChunk | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  const characters = raw['characters']
  const starts = raw['characterStartTimesSeconds']
  const ends = raw['characterEndTimesSeconds']
  return Array.isArray(characters) && characters.every((ch) => typeof ch === 'string')
    && Array.isArray(starts) && starts.every(finite)
    && Array.isArray(ends) && ends.every(finite)
    && characters.length === starts.length && characters.length === ends.length
}

/** Fail visibly on a broken protocol instead of silently committing lost audio. */
function parseTurnEvent(line: string): TurnEvent {
  const parsed: unknown = JSON.parse(line)
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid voice event.')
  const event = parsed as Record<string, unknown>
  switch (event['type']) {
    case 'clip':
      if (typeof event['id'] === 'string' && typeof event['text'] === 'string') return event as TurnEvent
      break
    case 'audio':
      if (typeof event['clipId'] === 'string' && typeof event['audio_base64'] === 'string'
        && alignment(event['alignment'])) return event as TurnEvent
      break
    case 'timing':
      if (['llmFirstTokenMs', 'llmCompleteMs', 'ttsFirstByteMs'].includes(String(event['stage']))
        && finite(event['ms'])) return event as TurnEvent
      break
    case 'usage': {
      const llm = event['llm'] as Record<string, unknown> | undefined
      const tts = event['tts'] as Record<string, unknown> | undefined
      if (llm && tts && finite(llm['input']) && finite(llm['output']) && finite(llm['cachedInput'])
        && finite(tts['characters']) && finite(tts['costUsd'])) return event as TurnEvent
      break
    }
    case 'done':
      if (typeof event['exit'] === 'boolean') return event as TurnEvent
      break
    case 'error':
      if (typeof event['message'] === 'string') return event as TurnEvent
      break
  }
  throw new Error('Invalid voice event payload.')
}
