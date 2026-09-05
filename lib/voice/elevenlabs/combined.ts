/** LLM → HTTP synthesis, in one server request. The browser only receives audio. */
import { getPersona } from '@/lib/personas'
import { DEFAULT_CALIBRATION, type Calibration } from '../types'
import { priceChatUsage } from '../rates'
import { resolvePipelineConfig, ttsModelSpec, type PipelineEnv } from './config'
import { ElevenLabsPersonaCompiler, deliveryFor } from './persona'
import { EXIT_SENTINEL, LlmClient } from './llm'
import { handleLlmRequest, handleTtsRequest, type PersonaOverlay } from './server'
import { parseAlignment, shouldFlush } from './tts'
import { ReplyBudget } from './truncate'
import { UNSTEERED_WORD_CAP, wordCapFor } from '@/lib/warmth/bands'
import { MAX_TURN_TTS_CHARACTERS, type TurnEvent, type TurnRequest } from './turn-protocol'
import { proxiedRequestId } from '../request-id'

const MAX_BODY_BYTES = 32_768
const MAX_HISTORY_CHARS = 16_000
const TURN_TIMEOUT_MS = 25_000

export interface TurnContext extends PersonaOverlay {
  calibration?: Calibration
}

export interface TurnAccounting {
  status: 'completed' | 'aborted' | 'failed'
  costUsd: number | null
  usage: {
    llm: { input: number; output: number; cachedInput: number } | null
    tts: { attemptedCharacters: number; characters: number; costUsd: number }
  }
  metadata: Record<string, string | number | boolean | null | string[]>
}

export interface CombinedDependencies {
  llm?: typeof handleLlmRequest
  tts?: typeof handleTtsRequest
  now?: () => number
  onComplete?: (accounting: TurnAccounting) => Promise<void>
}

/** Reject oversized requests before allocating vendor work. Never trust Content-Length alone. */
export async function parseTurnRequest(request: Request): Promise<TurnRequest | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  let bytes = 0
  let text = ''
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); return null }
      text += decoder.decode(chunk.value, { stream: true })
    }
    const body = JSON.parse(text + decoder.decode()) as Record<string, unknown>
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (typeof body.sessionId !== 'string' || !uuid.test(body.sessionId)
      || typeof body.turnId !== 'string' || !uuid.test(body.turnId)
      || typeof body.personaId !== 'string' || !getPersona(body.personaId)
      || !Array.isArray(body.history) || body.history.length > 80) return null
    let historyChars = 0
    const history: TurnRequest['history'] = []
    for (const raw of body.history) {
      if (!raw || typeof raw !== 'object') return null
      const entry = raw as Record<string, unknown>
      if ((entry.role !== 'user' && entry.role !== 'assistant') || typeof entry.content !== 'string'
        || entry.content.length > 2000) return null
      historyChars += entry.content.length
      if (historyChars > MAX_HISTORY_CHARS) return null
      history.push({ role: entry.role, content: entry.content })
    }
    if (body.steering !== null && body.steering !== undefined && typeof body.steering !== 'string') return null
    const steering = typeof body.steering === 'string' ? body.steering.trim() : null
    if (steering && steering.length > 4000) return null
    return {
      sessionId: body.sessionId, turnId: body.turnId, personaId: body.personaId, history, steering,
      warmth: typeof body.warmth === 'number' && Number.isFinite(body.warmth)
        ? Math.max(0, Math.min(100, body.warmth)) : 0,
      // Clamped into the range the warmth layer can actually ask for. Absent
      // stays absent, so `createCombinedTurn` can tell "no ceiling supplied"
      // from "a ceiling of one" and fall back to the warmth-derived number.
      ...(typeof body.wordCap === 'number' && Number.isFinite(body.wordCap)
        ? { wordCap: Math.round(Math.max(1, Math.min(UNSTEERED_WORD_CAP, body.wordCap))) }
        : {}),
    }
  } catch { return null } finally { reader.releaseLock() }
}

/** UTF-8 bytes safely overestimate BPE input tokens, including message framing. */
export function turnReservation(input: TurnRequest) {
  const persona = getPersona(input.personaId)!
  const config = resolvePipelineConfig(process.env as PipelineEnv)
  const compiled = new ElevenLabsPersonaCompiler(config).compile(persona, DEFAULT_CALIBRATION)
  // Overlay names/memory, endpoint sentinel instructions and message framing have a separate allowance.
  const inputTokens = new TextEncoder().encode(compiled.llm.systemPrompt
    + input.history.map((m) => m.content).join('\n') + (input.steering ?? '')).length + 4096
  const cost = priceChatUsage(compiled.llm.model, { input: inputTokens, output: compiled.llm.maxTokens, cachedInput: 0 })
  return {
    model: compiled.llm.model,
    maxCostUsd: cost === null ? null : cost + MAX_TURN_TTS_CHARACTERS / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars,
    resources: { llmInputTokens: inputTokens, llmOutputTokens: compiled.llm.maxTokens, ttsCharacters: MAX_TURN_TTS_CHARACTERS },
  }
}

/** Hold a partial exit marker across deltas; it must never be spoken. */
function safePending(text: string): string {
  const start = text.indexOf('[[')
  if (start >= 0) return text.slice(0, start)
  return text.endsWith('[') ? text.slice(0, -1) : text
}

export function createCombinedTurn(
  input: TurnRequest,
  context: TurnContext,
  requestSignal: AbortSignal,
  dependencies: CombinedDependencies = {},
): { response: Response; finished: Promise<void> } {
  const now = dependencies.now ?? performance.now.bind(performance)
  const started = now()
  const abort = new AbortController()
  const abortFromRequest = () => abort.abort(requestSignal.reason)
  requestSignal.addEventListener('abort', abortFromRequest, { once: true })
  if (requestSignal.aborted) abortFromRequest()
  const deadline = setTimeout(() => abort.abort(new Error('Turn deadline exceeded.')), TURN_TIMEOUT_MS)
  const persona = { ...getPersona(input.personaId)!, ...context }
  const compiled = new ElevenLabsPersonaCompiler(resolvePipelineConfig(process.env as PipelineEnv))
    .compile(persona, context.calibration ?? DEFAULT_CALIBRATION)
  const delivery = deliveryFor(persona, compiled, input.warmth)
  const encoder = new TextEncoder()
  let complete!: () => void
  const finished = new Promise<void>((resolve) => { complete = resolve })
  let controllerClosed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const timings: Partial<Record<Extract<TurnEvent, { type: 'timing' }>['stage'], number>> = {}
      const emit = (event: TurnEvent) => {
        if (event.type === 'timing' && timings[event.stage] === undefined) timings[event.stage] = Math.round(event.ms)
        if (!controllerClosed && !requestSignal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      let llmUsage: TurnAccounting['usage']['llm'] = null
      let attemptedCharacters = 0
      let characters = 0
      let uncertainSynthesis = false
      let clips = 0
      let chain = Promise.resolve()
      let pending = ''
      let firstAudio = false
      let firstAudioMs: number | null = null
      let ttsRegion: string | null = null
      let llmRequestId: string | null = null
      const ttsRequestIds: string[] = []
      let status: TurnAccounting['status'] = 'completed'
      let failure: unknown = null
      // The caller's ceiling when it sent one — only it knows whether the
      // band is steering this turn. See `TurnRequest.wordCap`.
      const wordCap = input.wordCap ?? wordCapFor(input.warmth)
      const budget = new ReplyBudget(wordCap)
      let capped = false
      const enqueue = (plainText: string) => {
        if (!plainText.trim()) return
        const clipId = String(clips++)
        const tagged = delivery.deliveryTags.length && clipId === '0' && !/^\s*\[[^\]]+\]/.test(plainText)
          ? `${delivery.deliveryTags[0]} ${plainText.trim()}`
          : plainText.trim()
        chain = chain.then(async () => {
          if (abort.signal.aborted || failure) return
          if (attemptedCharacters + tagged.length > MAX_TURN_TTS_CHARACTERS) throw new Error('The reply exceeded its synthesis allowance.')
          attemptedCharacters += tagged.length
          const synthesisStart = now()
          const body = {
            personaId: input.personaId, text: tagged, model: compiled.tts.model,
            outputFormat: compiled.tts.outputFormat, timestamps: true,
            settings: delivery.settings,
          }
          // An interrupted request can still have been generated and billed upstream.
          uncertainSynthesis = true
          const response = await (dependencies.tts ?? handleTtsRequest)(new Request('http://nerve.internal/tts', {
            method: 'POST', body: JSON.stringify(body), signal: abort.signal,
          }))
          const requestId = proxiedRequestId(response.headers)
          if (requestId && ttsRequestIds.length < 64 && !ttsRequestIds.includes(requestId)) ttsRequestIds.push(requestId)
          if (!response.ok || !response.body) throw new Error('Voice synthesis failed. Please try again.')
          characters += tagged.length
          uncertainSynthesis = false
          ttsRegion = response.headers.get('x-nerve-tts-region') ?? ttsRegion
          emit({ type: 'clip', id: clipId, text: tagged })
          let buffer = ''
          const decoder = new TextDecoder()
          const reader = response.body.getReader()
          // A barge-in must also release a body stalled between audio frames;
          // checking the signal only after reader.read() cannot wake that read.
          const cancelAudio = () => { void reader.cancel(abort.signal.reason).catch(() => undefined) }
          abort.signal.addEventListener('abort', cancelAudio, { once: true })
          if (abort.signal.aborted) cancelAudio()
          let clipHasAudio = false
          const line = (value: string) => {
            if (!value.trim() || abort.signal.aborted) return
            const frame = JSON.parse(value) as Record<string, unknown>
            const audio = frame.audio_base64 ?? frame.audio
            if (typeof audio !== 'string' || !audio) return
            if (!clipHasAudio) {
              clipHasAudio = true
              emit({ type: 'timing', stage: 'ttsFirstByteMs', ms: now() - synthesisStart })
            }
            if (!firstAudio) { firstAudio = true; firstAudioMs = Math.round(now() - started) }
            emit({ type: 'audio', clipId, audio_base64: audio, alignment: parseAlignment(frame.alignment) })
          }
          try {
            for (;;) {
              const chunk = await reader.read()
              if (chunk.done || abort.signal.aborted) break
              buffer += decoder.decode(chunk.value, { stream: true })
              if (buffer.length > 2_000_000) throw new Error('Invalid synthesis frame.')
              let end = buffer.indexOf('\n')
              while (end >= 0) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1); end = buffer.indexOf('\n') }
            }
            if (!abort.signal.aborted) line(buffer + decoder.decode())
            if (!clipHasAudio && !abort.signal.aborted) throw new Error('Voice synthesis returned no audio.')
          } finally {
            abort.signal.removeEventListener('abort', cancelAudio)
            if (abort.signal.aborted) await reader.cancel().catch(() => undefined)
            reader.releaseLock()
          }
        }).catch((cause: unknown) => { failure = cause; abort.abort(cause) })
      }
      try {
        const client = new LlmClient({
          fetchImpl: async (_url, options) => {
            const response = await (dependencies.llm ?? handleLlmRequest)(new Request('http://nerve.internal/llm', {
              ...options, body: JSON.stringify({ ...input, calibration: context.calibration }), signal: abort.signal,
            }), context)
            llmRequestId = proxiedRequestId(response.headers)
            return response
          },
        })
        const result = await client.stream(input, {
          onFirstToken: () => emit({ type: 'timing', stage: 'llmFirstTokenMs', ms: now() - started }),
          onDelta: (delta) => {
            pending += delta
            const safe = safePending(pending)
            if (shouldFlush(safe, false)) {
              // Preserve a trailing partial sentinel until a later delta finishes it.
              pending = pending.slice(safe.length)
              // PAST THE CEILING: DRAIN, DO NOT CANCEL.
              //
              // The first cut of this cancelled the model stream here, which is
              // the obvious thing and is wrong. OpenAI sends the usage receipt
              // as the LAST frame of the stream, so a cancelled turn settles
              // with an unknown cost — and an unknown cost keeps the whole
              // conservative reservation. Measured on the first real rep: three
              // capped turns billed at $0.0358 each against an actual $0.003,
              // which put $0.149 of a $0.20 session budget on the meter and
              // ended the rep at 126 seconds of 180 with a budget refusal.
              //
              // What cancelling actually saves is the tail of a 120-token
              // ceiling — a hundredth of a cent. What it costs is twelve times
              // the turn. So the remaining tokens are read and thrown away.
              if (capped) return
              enqueue(safe)
              // Spent AFTER the sentence goes out, so the first one is always
              // free and no band can produce silence. See `ReplyBudget`.
              capped = budget.spend(safe)
            }
          },
          onUsage: (usage) => { llmUsage = { input: usage.input, output: usage.output, cachedInput: usage.cachedInput ?? 0 } },
        }, abort.signal)
        emit({ type: 'timing', stage: 'llmCompleteMs', ms: now() - started })
        // A capped turn's unflushed tail is the part she is not saying. It must
        // not be synthesised and it must not reach the transcript, because the
        // transcript is what comes back as history on the next turn.
        if (!abort.signal.aborted && !capped) enqueue(safePending(pending))
        await chain
        if (failure) throw failure
        status = abort.signal.aborted ? 'aborted' : 'completed'
        if (status === 'completed') {
          if (llmUsage) emit({ type: 'usage', llm: llmUsage, tts: { characters, costUsd: characters / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars } })
          emit({ type: 'done', exit: result.exit || pending.includes(EXIT_SENTINEL) })
        } else if (!requestSignal.aborted) emit({ type: 'error', message: 'The reply timed out. Please try again.' })
      } catch {
        status = requestSignal.aborted ? 'aborted' : 'failed'
        abort.abort()
        await chain
        if (!requestSignal.aborted) emit({ type: 'error', message: 'The reply could not finish. Please try again.' })
      } finally {
        clearTimeout(deadline)
        requestSignal.removeEventListener('abort', abortFromRequest)
        const ttsCost = characters / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars
        const llmCost = llmUsage ? priceChatUsage(compiled.llm.model, llmUsage) : null
        // The final audio and done event have already been emitted. The route
        // keeps `finished` alive with after(), so persisting the receipt need
        // not add another database round trip to the browser's turn stream.
        if (!controllerClosed) { controllerClosed = true; controller.close() }
        try {
          await dependencies.onComplete?.({
            status, costUsd: llmCost === null || uncertainSynthesis ? null : llmCost + ttsCost,
            usage: { llm: llmUsage, tts: { attemptedCharacters, characters, costUsd: ttsCost } },
            metadata: {
              durationMs: Math.round(now() - started), clips, firstAudio, firstAudioMs, ttsRegion,
              functionRegion: process.env.VERCEL_REGION ?? 'local',
              deployment: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
              deploymentUrl: process.env.VERCEL_URL ?? 'local',
              ttsModel: compiled.tts.model, llmModel: compiled.llm.model,
              llmRequestId, ttsRequestIds,
              wordCap, spokenWords: budget.words, capped,
              ...timings,
            },
          }).catch(() => undefined) // A failed settlement leaves the server reservation held.
        } finally {
          complete()
        }
      }
    },
    cancel() { controllerClosed = true; abort.abort(new Error('Client disconnected.')) },
  })
  return {
    response: new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }),
    finished,
  }
}
