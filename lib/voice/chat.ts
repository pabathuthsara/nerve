/**
 * The character model, as a chat completion.
 *
 * One home for the endpoint, the request shape and the standing key, because
 * there are two callers now: the assembled pipeline (`elevenlabs/server.ts`),
 * which streams so her first word can be synthesised before the last one is
 * generated, and text mode (`lib/text/reply.ts`), which does not — a typed
 * reply arrives as a message, whole, and streaming it would buy nothing but a
 * second parser to keep correct.
 *
 * Everything provider-shaped lives here and in this file only, which is what
 * keeps §04's rule true: repointing at another vendor touches `lib/voice/` and
 * nothing above it.
 *
 * Server-side. The key is a standing credential and never leaves the server —
 * both callers are a Server Action or a route handler.
 */

const CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  signal?: AbortSignal
}

export type ChatFailure =
  /** No key configured. Ours, not theirs — a 500. */
  | { kind: 'not_configured'; message: string }
  /** Could not reach them, or they refused. A 502. */
  | { kind: 'upstream'; message: string; status?: number }

export type ChatStream =
  | { ok: true; body: ReadableStream<Uint8Array> }
  | { ok: false; error: ChatFailure }

export type ChatCompletion =
  | { ok: true; text: string }
  | { ok: false; error: ChatFailure }

/** The standing key, or a failure the caller can turn into a status. */
export function chatApiKey(): { ok: true; key: string } | { ok: false; error: ChatFailure } {
  const key = process.env['OPENAI_API_KEY']
  if (!key) {
    return { ok: false, error: { kind: 'not_configured', message: 'OPENAI_API_KEY is not set.' } }
  }
  return { ok: true, key }
}

async function post(request: ChatRequest, stream: boolean): Promise<Response | ChatFailure> {
  try {
    return await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    })
  } catch (cause) {
    return { kind: 'upstream', message: `Character model unreachable. ${String(cause)}` }
  }
}

/** The streaming arm. The body is handed straight back to the browser. */
export async function streamChat(request: ChatRequest): Promise<ChatStream> {
  const response = await post(request, true)
  if (!(response instanceof Response)) return { ok: false, error: response }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    return {
      ok: false,
      error: {
        kind: 'upstream',
        status: response.status,
        message: `Character model refused (${response.status}). ${detail.slice(0, 400)}`,
      },
    }
  }
  return { ok: true, body: response.body }
}

/** The whole reply, for callers with nothing to hide the generation behind. */
export async function completeChat(request: ChatRequest): Promise<ChatCompletion> {
  const response = await post(request, false)
  if (!(response instanceof Response)) return { ok: false, error: response }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return {
      ok: false,
      error: {
        kind: 'upstream',
        status: response.status,
        message: `Character model refused (${response.status}). ${detail.slice(0, 400)}`,
      },
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    return { ok: false, error: { kind: 'upstream', message: `Unreadable reply. ${String(cause)}` } }
  }

  const text = firstMessage(payload)
  if (!text) {
    return { ok: false, error: { kind: 'upstream', message: 'The character model returned nothing.' } }
  }
  return { ok: true, text }
}

function firstMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as Record<string, unknown>)['choices']
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const message = (choices[0] as Record<string, unknown>)['message'] as
    | Record<string, unknown>
    | undefined
  const content = message?.['content']
  return typeof content === 'string' ? content.trim() : ''
}
