/**
 * The character, as a streaming text model.
 *
 * Identical contract to the OpenAI arm — same compiled instructions, same
 * warmth-band steering items, same reinforcement text. That is deliberate and
 * it is what makes the A/B mean anything: if the two arms feel different, the
 * difference is the voice, not the writing.
 *
 * The system prompt is compiled server-side from a persona id and never sent
 * from the browser, for the same reason the token route works that way: a
 * client that can post its own instructions can post its own character, and the
 * character contract is the product.
 *
 * Cancellable at any token. Barge-in aborts the request, and whatever arrived
 * before the abort is the only thing she is allowed to remember saying.
 */

import { VoiceError, type TranscriptTurn } from '../types'
import { parseChatTokenUsage } from '../scoring-request'

/** Emitted by the model at the very end of a reply when an exit condition is
 *  genuinely met. Stripped before synthesis, so it can never be spoken — which
 *  makes it strictly safer than the tool channel the OpenAI arm uses. */
export const EXIT_SENTINEL = '[[END_SCENE]]'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmStreamRequest {
  personaId: string
  /** The conversation so far, in our normalised turn shape. */
  history: LlmMessage[]
  /** The warmth-band directive for this turn, if one is pending. */
  steering: string | null
}

export interface LlmStreamEvents {
  onFirstToken: () => void
  onDelta: (text: string) => void
  onUsage?: (usage: { input: number; output: number; cachedInput?: number }) => void
}

export interface LlmStreamResult {
  text: string
  /** True when the model asked to end the scene. */
  exit: boolean
  /** True when the stream was cut short by a barge-in. */
  aborted: boolean
}

export interface LlmClientOptions {
  endpoint?: string
  fetchImpl?: typeof fetch
}

export class LlmClient {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch

  constructor(options: LlmClientOptions = {}) {
    this.endpoint = options.endpoint ?? '/api/voice/llm'
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  async stream(
    request: LlmStreamRequest,
    events: LlmStreamEvents,
    signal: AbortSignal,
  ): Promise<LlmStreamResult> {
    let response: Response
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })
    } catch (cause) {
      if (signal.aborted) return { text: '', exit: false, aborted: true }
      throw new VoiceError('provider_error', 'elevenlabs', 'The character model was unreachable.', {
        cause,
      })
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      throw new VoiceError(
        'provider_error',
        'elevenlabs',
        `The character model refused (${response.status}). ${detail.slice(0, 300)}`,
      )
    }

    const reader = response.body.getReader()
    const cancel = () => { void reader.cancel(signal.reason).catch(() => undefined) }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    let first = true

    const consume = (raw: string) => {
      if (signal.aborted) return
      const line = raw.trim()
      if (!line.startsWith('data:')) return
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      const delta = parseChunk(payload, events.onUsage)
      if (!delta) return
      if (first) { first = false; events.onFirstToken() }
      text += delta
      events.onDelta(delta)
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > 2_000_000) throw new Error('Invalid character model frame.')

        let index = buffer.indexOf('\n')
        while (index !== -1) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          index = buffer.indexOf('\n')

          consume(line)
        }
      }
      // Some proxies finish the last SSE data line at EOF without a newline.
      // This may be the usage receipt; dropping it loses actual accounting.
      consume(buffer + decoder.decode())
    } catch (cause) {
      if (signal.aborted) return finish(text, true)
      throw new VoiceError('provider_error', 'elevenlabs', 'The character model stream broke.', {
        cause,
      })
    } finally {
      signal.removeEventListener('abort', cancel)
      reader.releaseLock()
    }

    return finish(text, signal.aborted)
  }
}

function finish(text: string, aborted: boolean): LlmStreamResult {
  return { text: stripSentinel(text), exit: text.includes(EXIT_SENTINEL), aborted }
}

/** Never let the sentinel reach synthesis or the transcript. */
export function stripSentinel(text: string): string {
  return text.split(EXIT_SENTINEL).join('').trim()
}

function parseChunk(
  payload: string,
  onUsage: LlmStreamEvents['onUsage'],
): string {
  let parsed: Record<string, unknown>
  try {
    const value: unknown = JSON.parse(payload)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
    parsed = value as Record<string, unknown>
  } catch {
    return ''
  }

  const usage = parseChatTokenUsage(parsed['usage'])
  if (usage && onUsage) {
    onUsage({
      input: usage.input,
      output: usage.output,
      cachedInput: usage.cachedInput,
    })
  }

  const choices = parsed['choices']
  if (!Array.isArray(choices) || choices.length === 0) return ''
  if (!choices[0] || typeof choices[0] !== 'object') return ''
  const delta = (choices[0] as Record<string, unknown>)['delta'] as
    | Record<string, unknown>
    | undefined
  const content = delta?.['content']
  return typeof content === 'string' ? content : ''
}

/**
 * Our normalised turns as chat messages.
 *
 * Only what she can legitimately remember: a turn truncated by a barge-in was
 * already shortened before it reached the transcript, so this needs no special
 * case for it — which is exactly why truncation happens at the transcript
 * rather than here.
 */
export function historyFrom(turns: readonly TranscriptTurn[]): LlmMessage[] {
  return turns
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn) => ({
      role: turn.speaker === 'user' ? ('user' as const) : ('assistant' as const),
      content: turn.text,
    }))
}
