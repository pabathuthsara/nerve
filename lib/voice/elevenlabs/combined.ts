/**
 * LLM → HTTP synthesis, in one server request. The browser only receives audio.
 *
 * ── ONE TURN IS ONE PROSODIC UNIT (HUMANNESS-PLAN §2) ───────────────────
 *
 * This used to flush her line to synthesis SENTENCE BY SENTENCE as it arrived,
 * each sentence a separate generation with no knowledge of its neighbours.
 * That is the reported "the tone doesn't feel consistent line by line", and
 * three facts made it worse than it looked.
 *
 * ElevenLabs' own v3 prompting guide states that very short prompts cause
 * inconsistent output and recommends inputs over 250 characters. Every band in
 * `lib/warmth/bands.ts` sits far below that — INVESTED is about 55 characters,
 * a fifth of the floor — and the pipeline then split THAT further. Request
 * stitching, which exists for exactly this problem, is not available on
 * eleven_v3. And the splitting bought nothing: her turns are three to fifteen
 * words, so nine times out of ten the whole turn is one sentence and the
 * chunking paid its full prosodic cost for zero latency benefit.
 *
 * So the reply is buffered whole and spoken once. On a nine-word turn that
 * costs roughly 150-250ms over first-sentence flush — which §3's latency layer
 * is deliberately spending anyway, in every band but the two warmest.
 */
import { getPersona } from '@/lib/personas'
import { withInterviewBrief } from '@/lib/personas/interview/overlay'
import { DEFAULT_CALIBRATION, type Calibration } from '../types'
import { priceChatUsage } from '../rates'
import { resolvePipelineConfig, ttsModelSpec, type PipelineEnv } from './config'
import { ElevenLabsPersonaCompiler, deliveryFor } from './persona'
import { LlmClient } from './llm'
import { handleLlmRequest, handleTtsRequest, type PersonaOverlay } from './server'
import { parseAlignment } from './tts'
import { capToBudget, sanitiseForSpeech, spokenWordCount } from './truncate'
import { sentenceCapFor, wordCapFor } from '@/lib/warmth/bands'
import { MAX_REQUESTED_SENTENCE_CAP, MAX_REQUESTED_WORD_CAP, MAX_TURN_TTS_CHARACTERS, type TurnEvent, type TurnRequest } from './turn-protocol'
import { proxiedRequestId } from '../request-id'
import { seededRandom } from '../seed'

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
        ? { wordCap: Math.round(Math.max(1, Math.min(MAX_REQUESTED_WORD_CAP, body.wordCap))) }
        : {}),
      ...(typeof body.sentenceCap === 'number' && Number.isFinite(body.sentenceCap)
        ? { sentenceCap: Math.round(Math.max(1, Math.min(MAX_REQUESTED_SENTENCE_CAP, body.sentenceCap))) }
        : {}),
    }
  } catch { return null } finally { reader.releaseLock() }
}

/** UTF-8 bytes safely overestimate BPE input tokens, including message framing. */
export function turnReservation(input: TurnRequest) {
  const persona = getPersona(input.personaId)!
  const config = resolvePipelineConfig(process.env as PipelineEnv)
  // Same seed the turn itself will use, so the estimate is measured against
  // the prompt that is actually sent rather than a differently-rolled one.
  const compiled = new ElevenLabsPersonaCompiler(config)
    .compile(persona, DEFAULT_CALIBRATION, { rng: seededRandom(input.sessionId) })
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
  // The interview brief joins the CONTRACT, which is the cached prefix (C5).
  // `withInterviewBrief` is a no-op without one, so a dating turn compiles the
  // byte-identical prompt A0 pins.
  const persona = withInterviewBrief({ ...getPersona(input.personaId)!, ...context }, context)
  const compiled = new ElevenLabsPersonaCompiler(resolvePipelineConfig(process.env as PipelineEnv))
    .compile(persona, context.calibration ?? DEFAULT_CALIBRATION, { rng: seededRandom(input.sessionId) })
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
      // ONLY INVENT A SENTENCE CEILING WHEN THE CALLER SUPPLIED NO CEILING AT
      // ALL, and the closing turn is the reason. A caller that sent a word cap
      // has taken ownership of this turn's length — the wind-down hand-over
      // stands the band down and sends `UNSTEERED_WORD_CAP` — and quietly
      // applying a BAND sentence rule to a turn the band is not steering is two
      // systems owning one thing, with the number offer as the casualty. It is
      // naturally two or three sentences and rule 3 is written about it.
      const sentenceCap = input.sentenceCap
        ?? (input.wordCap === undefined ? sentenceCapFor(input.warmth) : undefined)
      /** What she actually said, after the ceiling. Zero until generation ends. */
      let spokenWords = 0
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
            }), { ...context, moodSeed: input.sessionId })
            llmRequestId = proxiedRequestId(response.headers)
            return response
          },
        })
        const result = await client.stream(input, {
          onFirstToken: () => emit({ type: 'timing', stage: 'llmFirstTokenMs', ms: now() - started }),
          // NOTHING IS SPOKEN UNTIL THE WHOLE LINE HAS ARRIVED.
          //
          // The deltas are collected and nothing else. See the header: a turn
          // is one prosodic unit, and a sentence handed to v3 on its own is a
          // generation that knows nothing about its neighbours.
          //
          // PAST THE CEILING: DRAIN, DO NOT CANCEL — and this is why the
          // ceiling is applied here rather than by stopping the stream. OpenAI
          // sends the usage receipt as the LAST frame, so a cancelled turn
          // settles with an unknown cost, and an unknown cost keeps the whole
          // conservative reservation. Measured on the first real rep: three
          // capped turns billed at $0.0358 each against an actual $0.003, which
          // put $0.149 of a $0.20 session budget on the meter and ended the rep
          // at 126 seconds of 180 with a budget refusal. What cancelling saves
          // is the tail of a 120-token ceiling — a hundredth of a cent.
          onUsage: (usage) => { llmUsage = { input: usage.input, output: usage.output, cachedInput: usage.cachedInput ?? 0 } },
        }, abort.signal)
        emit({ type: 'timing', stage: 'llmCompleteMs', ms: now() - started })
        // The ceiling, applied to the reply that arrived whole. `capToBudget`
        // is the same rule the flush used to enforce a sentence at a time — it
        // keeps whole sentences, always keeps the first one, and never cuts
        // mid-clause. The part past the ceiling is the part she is not saying,
        // so it must reach neither synthesis nor the transcript: the transcript
        // is what comes back as history on the next turn.
        // Sanitised BEFORE the ceiling, so the sentence count is taken on the
        // punctuation that will actually be spoken and the transcript matches
        // the audio. See `sanitiseForSpeech`.
        const generated = sanitiseForSpeech(result.text)
        const spoken = capToBudget(generated, wordCap, sentenceCap === undefined ? {} : { sentences: sentenceCap })
        spokenWords = spokenWordCount(spoken)
        capped = spokenWords < spokenWordCount(generated)
        if (!abort.signal.aborted) enqueue(spoken)
        await chain
        if (failure) throw failure
        status = abort.signal.aborted ? 'aborted' : 'completed'
        if (status === 'completed') {
          if (llmUsage) emit({ type: 'usage', llm: llmUsage, tts: { characters, costUsd: characters / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars } })
          emit({ type: 'done', exit: result.exit })
        } else if (!requestSignal.aborted) emit({ type: 'error', message: 'The reply timed out. Please try again.' })
      } catch {
        status = requestSignal.aborted ? 'aborted' : 'failed'
        abort.abort()
        await chain
        if (!requestSignal.aborted) emit({ type: 'error', message: 'The reply could not finish. Please try again.' })
      } finally {
        clearTimeout(deadline)
        requestSignal.removeEventListener('abort', abortFromRequest)
        const usdPerChar = ttsModelSpec(compiled.tts.model).usdPer1kChars / 1000
        const ttsCost = characters * usdPerChar
        // AN UNCERTAIN CLIP IS BOUNDED, NOT UNKNOWN — AND IT USED TO POISON
        // THE WHOLE RECEIPT.
        //
        // `uncertainSynthesis` means a synthesis request was in flight when the
        // turn ended, so it may or may not have been generated and billed
        // upstream. That single boolean used to send `costUsd` to null, and a
        // null settles at the operation's full conservative reservation
        // (`voice_operation_settle`: `coalesce(p_cost_usd, max_cost_usd)`).
        //
        // Measured on the rep of 6 September: her first reply was aborted with
        // ZERO characters synthesised and a known LLM cost of $0.0009, and it
        // was charged $0.0357 — 38x, and 43% of the whole rep's ledger. Five
        // barge-ins in one rep would reach the $0.20 session budget and refuse
        // a turn at two minutes, which is the same failure the ceiling comment
        // above this block already records for capped turns.
        //
        // The characters actually SUBMITTED are the most the vendor could
        // possibly have charged for, so that is the number. Still conservative,
        // still never under-charges, and it is arithmetic rather than a
        // fallback. The LLM half is not uncertain at all and is priced as
        // measured — losing it was pure collateral damage.
        const ttsCharged = uncertainSynthesis ? attemptedCharacters * usdPerChar : ttsCost
        const llmCost = llmUsage ? priceChatUsage(compiled.llm.model, llmUsage) : null
        // The final audio and done event have already been emitted. The route
        // keeps `finished` alive with after(), so persisting the receipt need
        // not add another database round trip to the browser's turn stream.
        if (!controllerClosed) { controllerClosed = true; controller.close() }
        try {
          await dependencies.onComplete?.({
            // Null only when the LLM never reported usage at all — a stream
            // cancelled before its final frame, which is the one case with no
            // bound available. Everything else is priced.
            status, costUsd: llmCost === null ? null : llmCost + ttsCharged,
            usage: { llm: llmUsage, tts: { attemptedCharacters, characters, costUsd: ttsCost } },
            metadata: {
              durationMs: Math.round(now() - started), clips, firstAudio, firstAudioMs, ttsRegion,
              functionRegion: process.env.VERCEL_REGION ?? 'local',
              deployment: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
              deploymentUrl: process.env.VERCEL_URL ?? 'local',
              ttsModel: compiled.tts.model, llmModel: compiled.llm.model,
              llmRequestId, ttsRequestIds,
              wordCap, sentenceCap: sentenceCap ?? null, spokenWords, capped,
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
