/** Transport bounds and provider usage for the two independent scorers.
 * The prompts, rubric and models remain owned by their existing modules. */
import type { TranscriptTurn } from './types'
import { priceChatUsage } from './rates'

export const SCORING_LIMITS = {
  jsonBytes: 128 * 1024,
  gradeTurns: 160,
  gradeTurnCharacters: 4_000,
  gradeCharacters: 32_000,
  // Validation headroom for the eight-minute diagnostic rep. The product's
  // three-minute timer remains in rep-rules; this is not a format change.
  sessionSeconds: 600,
  gradeOutputTokens: 1_200,
  warmthOutputTokens: 160,
  gradeTimeoutMs: 45_000,
  warmthTimeoutMs: 8_000,
} as const

export class ScoringInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Bound the actual stream, not just a caller-supplied Content-Length. */
export async function readScoringBody(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > SCORING_LIMITS.jsonBytes) {
    throw new ScoringInputError('request too large', 413)
  }
  if (!request.body) throw new ScoringInputError('malformed')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > SCORING_LIMITS.jsonBytes) {
        await reader.cancel()
        throw new ScoringInputError('request too large', 413)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    const body: unknown = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ScoringInputError('malformed')
    }
    return body as Record<string, unknown>
  } catch (error) {
    if (error instanceof ScoringInputError) throw error
    throw new ScoringInputError('malformed')
  } finally {
    reader.releaseLock()
  }
}

/** Refuse oversized transcripts rather than silently grading a partial rep. */
export function parseGradeTranscript(raw: unknown): TranscriptTurn[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SCORING_LIMITS.gradeTurns) return null
  let characters = 0
  const turns: TranscriptTurn[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const t = entry as Record<string, unknown>
    if (t.speaker !== 'user' && t.speaker !== 'agent') return null
    if (typeof t.text !== 'string' || t.text.length > SCORING_LIMITS.gradeTurnCharacters) return null
    characters += t.text.length
    if (characters > SCORING_LIMITS.gradeCharacters) return null
    if (typeof t.t_start !== 'number' || typeof t.t_end !== 'number'
      || !Number.isFinite(t.t_start) || !Number.isFinite(t.t_end)
      || t.t_start < 0 || t.t_end < t.t_start || t.t_end > SCORING_LIMITS.sessionSeconds) return null
    turns.push({ speaker: t.speaker, text: t.text, t_start: t.t_start, t_end: t.t_end })
  }
  return turns
}

export interface ChatTokenUsage {
  input: number
  cachedInput: number
  output: number
  total: number
}

const tokenCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** OpenAI Chat Completions usage, including input already counted as cached. */
export function parseChatTokenUsage(raw: unknown): ChatTokenUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const usage = raw as Record<string, unknown>
  if (!tokenCount(usage.prompt_tokens) || !tokenCount(usage.completion_tokens)) return null
  const details = usage.prompt_tokens_details
  const cached = details && typeof details === 'object'
    ? (details as Record<string, unknown>).cached_tokens ?? 0 : 0
  if (!tokenCount(cached) || cached > usage.prompt_tokens) return null
  const total = usage.total_tokens ?? usage.prompt_tokens + usage.completion_tokens
  if (!tokenCount(total) || total < usage.prompt_tokens + usage.completion_tokens) return null
  return { input: usage.prompt_tokens, cachedInput: cached, output: usage.completion_tokens, total }
}

/** A conservative reservation, never a reported token count. UTF-8 bytes bound
 * tokenizer input for these BPE text models; extra headroom covers framing. */
export function reserveChatCost(
  model: string,
  messages: readonly { role: string; content: string }[],
  maxOutputTokens: number,
): { inputTokens: number; maxCostUsd: number } | null {
  const inputTokens = messages.reduce((n, message) =>
    n + new TextEncoder().encode(message.content).byteLength + 32, 256)
  const maxCostUsd = priceChatUsage(model, { input: inputTokens, output: maxOutputTokens })
  return maxCostUsd === null ? null : { inputTokens, maxCostUsd }
}

/** Keep the same deadline through response.json(), not only until headers. */
export function scoringDeadline(request: Request, ms: number): {
  signal: AbortSignal
  dispose: () => void
} {
  const controller = new AbortController()
  const onAbort = () => controller.abort(request.signal.reason)
  if (request.signal.aborted) onAbort()
  else request.signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Scoring timed out', 'TimeoutError')), ms)
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', onAbort)
    },
  }
}
