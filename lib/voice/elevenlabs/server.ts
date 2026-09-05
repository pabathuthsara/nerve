/**
 * Server halves of the pipeline.
 *
 * These are the two hops a raw-TTS pipeline needs and a managed agent does not:
 * one for the character model, one for synthesis. Both exist for the same
 * reason — neither vendor issues a browser-safe credential for these endpoints,
 * so the standing keys stay here.
 *
 * The handlers live in `lib/voice/` rather than in `app/api/`, and the route
 * files are one-line re-exports. That keeps §04's rule intact: the application
 * layer contains no provider endpoint, no provider request shape, and no
 * provider vocabulary. Repointing at another vendor touches this directory and
 * nothing else.
 *
 * Both stream. Buffering either one would put the whole generation on the
 * critical path and there is nothing in a three-word reply to hide it behind.
 */

import { getPersona } from '@/lib/personas'
import { ElevenLabsPersonaCompiler } from './persona'
import {
  isPcmOutputFormat,
  isTtsModelId,
  resolvePipelineConfig,
  ttsModelSpec,
  type PipelineEnv,
} from './config'
import { CREDITS_HEADER, FORMAT_HEADER } from './tts'
import { EXIT_SENTINEL } from './llm'
import { DEFAULT_CALIBRATION, clamp, type Calibration } from '../types'
import { chatApiKey, streamChat, type ChatMessage } from '../chat'
import { readSubscription } from './mint'
import { PROVIDER_REQUEST_ID_HEADER, vendorRequestId } from '../request-id'

const TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech'

/** Longer than this is not a spoken reply, it is someone probing the proxy. */
const MAX_TTS_CHARS = 600
/** Enough for an eight-minute rep at her reply length, with room to spare. */
const MAX_HISTORY_TURNS = 120

function env(): PipelineEnv {
  return process.env as unknown as PipelineEnv
}

function json(body: unknown, status: number, requestId?: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(requestId ? { [PROVIDER_REQUEST_ID_HEADER]: requestId } : {}) },
  })
}

/* ------------------------------------------------------------------ *
 * The character model
 * ------------------------------------------------------------------ */

interface LlmBody {
  personaId?: unknown
  history?: unknown
  steering?: unknown
  calibration?: unknown
}

/**
 * What the caller knows about the person and this route does not.
 *
 * Resolved by the route from the authenticated user (`lib/db/persona-context.ts`)
 * and passed in, never read off the request body — the same rule the persona
 * id follows. Optional so the calibration harnesses can drive this route as
 * nobody.
 *
 * This is the hop the pipeline arm was missing entirely. The Realtime arm read
 * character memory at its mint; this one compiled the contract from the bare
 * roster record, so on ElevenLabs no character had ever remembered anybody.
 */
export interface PersonaOverlay {
  memorySummary?: string
  userName?: string
}

export async function handleLlmRequest(
  request: Request,
  overlay: PersonaOverlay = {},
): Promise<Response> {
  const key = chatApiKey()
  if (!key.ok) return json({ error: key.error.message }, 500)

  let body: LlmBody
  try {
    body = (await request.json()) as LlmBody
  } catch {
    return json({ error: 'Malformed request body.' }, 400)
  }

  const base = getPersona(typeof body.personaId === 'string' ? body.personaId : '')
  if (!base) return json({ error: 'No such persona.' }, 404)

  const persona = { ...base, ...overlay }

  const config = resolvePipelineConfig(env())
  const compiled = new ElevenLabsPersonaCompiler(config).compile(
    persona,
    parseCalibration(body.calibration),
  )

  // The contract is compiled here, from an id. It is never accepted from the
  // client — same rule as the token route, same reason.
  const messages: ChatMessage[] = [
    { role: 'system', content: compiled.llm.systemPrompt },
    {
      role: 'system',
      content:
        `When one of the listed exit conditions is genuinely met, finish your short final line and then write ${EXIT_SENTINEL} on the end. `
        + `It is silent bookkeeping and is removed before anything is spoken. Never say it, spell it, or refer to it, and never write it merely because the conversation paused.`,
    },
    ...parseHistory(body.history),
  ]

  // The warmth band's directive for this turn. Appended as its own message
  // rather than folded into the system prompt, so the cached prefix — the
  // character contract — stays byte-identical for the life of the session.
  const steering = typeof body.steering === 'string' ? body.steering.trim() : ''
  if (steering) messages.push({ role: 'system', content: steering })

  const upstream = await streamChat({
    apiKey: key.key,
    model: compiled.llm.model,
    messages,
    temperature: compiled.llm.temperature,
    maxTokens: compiled.llm.maxTokens,
    signal: request.signal,
  })

  if (!upstream.ok) return json({ error: upstream.error.message }, 502,
    upstream.error.kind === 'upstream' ? upstream.error.requestId : undefined)

  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      ...(upstream.requestId ? { [PROVIDER_REQUEST_ID_HEADER]: upstream.requestId } : {}),
    },
  })
}

function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(-MAX_HISTORY_TURNS)
    .map((entry) => {
      const item = entry as Record<string, unknown>
      const role = item['role']
      const content = item['content']
      if (role !== 'user' && role !== 'assistant') return null
      if (typeof content !== 'string' || !content.trim()) return null
      return { role, content: content.slice(0, 2000) }
    })
    .filter((entry): entry is ChatMessage => entry !== null)
}

function parseCalibration(input: unknown): Calibration {
  if (!input || typeof input !== 'object') return DEFAULT_CALIBRATION
  const raw = input as Record<string, unknown>
  const silenceMs =
    typeof raw['silenceMs'] === 'number' ? raw['silenceMs'] : DEFAULT_CALIBRATION.silenceMs
  const patience = typeof raw['patienceOffsetMs'] === 'number' ? raw['patienceOffsetMs'] : 0
  return {
    silenceMs: clamp(silenceMs, 200, 3000),
    patienceOffsetMs: clamp(patience, 0, 1500),
  }
}

/* ------------------------------------------------------------------ *
 * Synthesis
 * ------------------------------------------------------------------ */

interface TtsBody {
  personaId?: unknown
  text?: unknown
  model?: unknown
  outputFormat?: unknown
  settings?: unknown
  timestamps?: unknown
}

export async function handleTtsRequest(request: Request): Promise<Response> {
  const apiKey = process.env['ELEVENLABS_API_KEY']
  if (!apiKey) return json({ error: 'ELEVENLABS_API_KEY is not set.' }, 500)

  let body: TtsBody
  try {
    body = (await request.json()) as TtsBody
  } catch {
    return json({ error: 'Malformed request body.' }, 400)
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return json({ error: 'Nothing to say.' }, 400)
  if (text.length > MAX_TTS_CHARS) {
    return json({ error: `Refused: ${text.length} characters is not a spoken reply.` }, 400)
  }

  const persona = getPersona(typeof body.personaId === 'string' ? body.personaId : '')
  if (!persona) return json({ error: 'No such persona.' }, 404)

  const config = resolvePipelineConfig(env())
  // The voice is resolved from the persona here, not taken from the client.
  // Otherwise the proxy is an open synthesis endpoint on our credits.
  const compiled = new ElevenLabsPersonaCompiler(config).compile(persona, DEFAULT_CALIBRATION)

  const model = isTtsModelId(body.model) ? body.model : compiled.tts.model
  const outputFormat = isPcmOutputFormat(body.outputFormat)
    ? body.outputFormat
    : compiled.tts.outputFormat
  const settings = parseSettings(body.settings, compiled.tts)
  const wantsTimestamps = body.timestamps !== false && ttsModelSpec(model).supportsTimestamps

  const path = wantsTimestamps ? 'stream/with-timestamps' : 'stream'
  const url =
    `${TTS_ENDPOINT}/${encodeURIComponent(compiled.tts.voice_id)}/${path}`
    + `?output_format=${encodeURIComponent(outputFormat)}`

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: wantsTimestamps ? 'application/json' : 'audio/*',
      },
      // Same reason as the character model in ../chat.ts: a cached fetch is a
      // buffered fetch, and buffering audio defeats streaming synthesis.
      cache: 'no-store',
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarity_boost,
          speed: settings.speed,
        },
        // Nothing to optimise a latency setting against on a three-word reply,
        // and the aggressive levels degrade prosody. Left at the default.
        apply_text_normalization: 'off',
      }),
      signal: request.signal,
    })
  } catch (cause) {
    return json({ error: `Synthesis unreachable. ${String(cause)}` }, 502)
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    return json({ error: `Synthesis refused (${upstream.status}). ${detail.slice(0, 400)}` }, 502, vendorRequestId(upstream.headers))
  }

  const headers = new Headers({
    'content-type': wantsTimestamps ? 'application/x-ndjson' : 'application/octet-stream',
    'cache-control': 'no-store',
    [FORMAT_HEADER]: wantsTimestamps ? 'ndjson' : 'pcm',
  })
  // Some responses carry the running counter. Free when it is there.
  const remaining = upstream.headers.get('character-limit-remaining')
    ?? upstream.headers.get('x-character-limit-remaining')
  if (remaining) headers.set(CREDITS_HEADER, remaining)
  const region = upstream.headers.get('x-region')
  if (region) headers.set('x-nerve-tts-region', region)
  const requestId = vendorRequestId(upstream.headers)
  if (requestId) headers.set(PROVIDER_REQUEST_ID_HEADER, requestId)

  return new Response(upstream.body, { headers })
}

function parseSettings(
  raw: unknown,
  fallback: { stability: number; similarity_boost: number; speed: number },
): { stability: number; similarity_boost: number; speed: number } {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pick = (key: string, min: number, max: number, or: number): number => {
    const candidate = value[key]
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? clamp(candidate, min, max)
      : or
  }
  return {
    stability: pick('stability', 0, 1, fallback.stability),
    similarity_boost: pick('similarity_boost', 0, 1, fallback.similarity_boost),
    speed: pick('speed', 0.7, 1.2, fallback.speed),
  }
}

/* ------------------------------------------------------------------ *
 * Credits
 * ------------------------------------------------------------------ */

/** Read at the end of a rep so the report carries the vendor's own number
 *  alongside our character count, and the two can be reconciled. */
export async function handleCreditsRequest(): Promise<Response> {
  const apiKey = process.env['ELEVENLABS_API_KEY']
  if (!apiKey) return json({ error: 'ELEVENLABS_API_KEY is not set.' }, 500)
  const credits = await readSubscription(apiKey)
  return json(credits, 200)
}
