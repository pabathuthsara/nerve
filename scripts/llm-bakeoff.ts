/**
 * Which model should write her line? — the character-model bake-off, L6 of
 * `PERSONA-REALISM-REPORT-2026-09-23.md` §3.2.
 *
 *   npm run llm:bakeoff                              # every candidate on the key, 3 samples a history
 *   npm run llm:bakeoff -- --samples 1               # a third of the cost
 *   npm run llm:bakeoff -- --models gpt-4.1-mini,gpt-5-nano
 *   npm run llm:bakeoff -- --dry                     # print the prompts and steering, call nothing
 *   npm run llm:bakeoff -- --from outputs/a.json,outputs/b.json
 *                                                    # re-read saved runs, pooled; spends nothing
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * Her median reply gap is ~3.4 s and the LLM is ~870 ms of it (§1.1). The
 * character model is 13% of the bill, so the report says to choose on latency
 * and register, not on price — and `HUMANNESS-PLAN.md` §8 recommended this
 * bake-off and it was never run. `scripts/ab-persona-llm.ts` measured OBEDIENCE
 * across temperatures on one model; nothing has ever timed a candidate.
 *
 * ── WHAT IT SENDS ────────────────────────────────────────────────────────
 *
 * Real turns, assembled the way `lib/voice/elevenlabs/server.ts`
 * `handleLlmRequest` assembles them, so the numbers transfer:
 *
 *   · the contract is `ElevenLabsPersonaCompiler` over `resolvePipelineConfig`
 *     of THIS environment (so the `.env.local` TTS model decides whether she is
 *     told she may open with a delivery tag, exactly as production's does),
 *     seeded with `seededRandom(sessionId)` the way `combined.ts` seeds it
 *   · then the exit-sentinel rule, verbatim, then the history, then the
 *     steering line as the last system message
 *   · the steering line is `composeSteering` at warmth 28 (GUARDED), 45 (OPEN)
 *     and 70 (ENGAGED), with `his` taken from the last user line the way
 *     `WarmthSession` takes it, and the question gate the way it sets it
 *   · streamed with `stream_options.include_usage`, `temperature` and a
 *     120-token ceiling from the same config
 *
 * THE ONE PLACE THE REQUEST DIFFERS, and it cannot be helped: the gpt-5
 * families refuse `max_tokens` (they take `max_completion_tokens`), gpt-5 and
 * gpt-5-mini/nano refuse any temperature but 1 ("Only the default (1) value is
 * supported", measured on this key), and each needs a reasoning effort. The
 * gpt-4.1 bodies are byte-for-byte `lib/voice/chat.ts`'s. `requestBody` below
 * is the whole of the difference, so it can be read in one place.
 *
 * ── WHAT IT MEASURES ─────────────────────────────────────────────────────
 *
 *   latency    time to first token and to the last frame, p50 and p90, from
 *              THIS machine — an Asia-to-US path like production's `sin1`,
 *              but not production's. Rankings transfer; absolute numbers are
 *              an upper bound. The first call per model and character is
 *              reported apart, because that is the turn L1 is about — and it
 *              is only called COLD when its usage receipt says no token of
 *              the prefix was cached. Two runs a minute apart measured why:
 *              every "first" call of the second run read 1,792–2,560 cached
 *              tokens, because OpenAI's prompt cache outlives the process
 *   obedience  `spokenWordCount` of the sanitised reply against `wordCapFor`,
 *              the share `capToBudget` would cut at the live ceiling
 *              (`judgementFor(persona).wordCap`, the mirror cap) and the
 *              sentence ceiling, questions where the band forbids them, and
 *              the exit sentinel written where nothing warrants it — which
 *              live ends the rep, so it outranks every other column
 *   cost       `priceChatUsage` from `lib/voice/rates.ts`, off the usage
 *              receipt, cached prefix included
 *   register   read by a person: three replies per model are printed, and
 *              every reply is in the JSON
 *
 * IT SPENDS MONEY — a few cents for the whole grid (a hard stop at
 * `MAX_SPEND_USD`). Run by hand, never from a build. Raw results land in
 * `outputs/`, which is not committed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnvLocal } from './env'
import { DATING_PERSONAS } from '../lib/personas'
import { ElevenLabsPersonaCompiler } from '../lib/voice/elevenlabs/persona'
import { resolvePipelineConfig, type PipelineEnv } from '../lib/voice/elevenlabs/config'
import { EXIT_SENTINEL, stripSentinel } from '../lib/voice/elevenlabs/llm'
import { capToBudget, sanitiseForSpeech, spokenWordCount } from '../lib/voice/elevenlabs/truncate'
import { composeSteering } from '../lib/warmth/steering'
import { bandFor, wordCapFor, type WarmthBand } from '../lib/warmth/bands'
import { judgementFor } from '../lib/warmth/track'
import { isOpenQuestion, wordsIn } from '../lib/warmth/fast'
import { DISCLOSURE_WORDS, type UserTurnShape } from '../lib/warmth/reciprocity'
import { seededRandom } from '../lib/voice/seed'
import { priceChatUsage } from '../lib/voice/rates'
import { chatApiKey, type ChatMessage } from '../lib/voice/chat'
import { DEFAULT_CALIBRATION, type Persona } from '../lib/voice/types'

const CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODELS_ENDPOINT = 'https://api.openai.com/v1/models'

/** A ceiling, not a budget. The default grid spends well under a tenth of it. */
const MAX_SPEND_USD = 0.4

/* ------------------------------------------------------------------ *
 * The candidates
 * ------------------------------------------------------------------ */

/**
 * How a model family has to be asked.
 *
 *   classic   gpt-4.1-*: exactly the shipping request
 *   minimal   gpt-5-mini / gpt-5-nano: `reasoning_effort: 'minimal'`, and no
 *             temperature at all, because the API refuses anything but 1
 *   none      gpt-5.x-mini / -nano (x ≥ 1): `reasoning_effort: 'none'`, their
 *             documented default, which also lets the shipping temperature
 *             through ('minimal' is refused on these)
 */
type RequestShape = 'classic' | 'minimal' | 'none'

interface Candidate {
  model: string
  shape: RequestShape
  /** Why it is here. Printed, so a table row says what it is standing in for. */
  note: string
}

const NAMED_CANDIDATES: readonly Candidate[] = [
  { model: 'gpt-4.1-mini', shape: 'classic', note: 'baseline — what ships' },
  { model: 'gpt-4.1-nano', shape: 'classic', note: 'same family, a quarter of the price' },
  { model: 'gpt-5-mini', shape: 'minimal', note: 'minimal reasoning, temperature fixed at 1' },
  { model: 'gpt-5-nano', shape: 'minimal', note: 'minimal reasoning, temperature fixed at 1' },
]

/** Any later gpt-5.x small model on the key joins on the `none` shape. */
const LATER_SMALL_MODEL = /^gpt-5\.\d+-(?:mini|nano)$/

/** The exact body `lib/voice/chat.ts` posts, then the one adjustment per family. */
function requestBody(
  candidate: Candidate,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
): Record<string, unknown> {
  const stream = { stream: true, stream_options: { include_usage: true } }
  switch (candidate.shape) {
    case 'classic':
      return { model: candidate.model, messages, temperature, max_tokens: maxTokens, ...stream }
    case 'minimal':
      return { model: candidate.model, messages, reasoning_effort: 'minimal', max_completion_tokens: maxTokens, ...stream }
    case 'none':
      return { model: candidate.model, messages, reasoning_effort: 'none', temperature, max_completion_tokens: maxTokens, ...stream }
  }
}

/* ------------------------------------------------------------------ *
 * The moments
 * ------------------------------------------------------------------ */

type Role = 'user' | 'assistant'
interface Line { role: Role; content: string }

interface Moment {
  slug: 'tess' | 'nadia'
  warmth: number
  /** Two per character per band, so a band is not one conversation's quirk. */
  history: readonly Line[]
}

/**
 * Three warmths, one per band the report cares about, and a last user line
 * chosen so the live ceiling and the band ceiling agree — a question at
 * GUARDED and ENGAGED, a real turn of ten-plus words at OPEN — which makes
 * "over the cap" one number rather than two.
 *
 * OPEN is where the question rule bites: "Do not ask a question this turn
 * unless he asked you one first", and in both OPEN histories he did not.
 * GUARDED forbids a question outright. ENGAGED invites one, so there it is a
 * rate, not a fault.
 *
 * His lines are written for this file and are nobody's authored examples, so
 * a candidate cannot score by parroting her contract back.
 */
const WARMTH: Record<'GUARDED' | 'OPEN' | 'ENGAGED', number> = { GUARDED: 28, OPEN: 45, ENGAGED: 70 }

const MOMENTS: readonly Moment[] = [
  // ── Cass, rung 1, a gallery ────────────────────────────────────────────
  { slug: 'tess', warmth: WARMTH.GUARDED, history: [
    { role: 'user', content: 'Hi.' },
    { role: 'assistant', content: 'Hey.' },
    { role: 'user', content: 'Is it just me, or does that one look like a map of something?' },
  ] },
  { slug: 'tess', warmth: WARMTH.GUARDED, history: [
    { role: 'user', content: 'Hey, sorry, do you know if the café downstairs is still open?' },
    { role: 'assistant', content: 'No idea, sorry.' },
    { role: 'user', content: 'Fair enough. What brings you in here on a weekday?' },
  ] },
  { slug: 'tess', warmth: WARMTH.OPEN, history: [
    { role: 'user', content: 'Hey there.' },
    { role: 'assistant', content: 'Hey.' },
    { role: 'user', content: 'What do you think that one is supposed to be?' },
    { role: 'assistant', content: 'No idea. Something sad, maybe.' },
    { role: 'user', content: 'I thought it was a boat at first, but now I am really not so sure.' },
  ] },
  { slug: 'tess', warmth: WARMTH.OPEN, history: [
    { role: 'user', content: 'Do you come to these a lot?' },
    { role: 'assistant', content: 'Not really. First one this year.' },
    { role: 'user', content: 'Same here. My friend dragged me along and then vanished into the gift shop.' },
  ] },
  { slug: 'tess', warmth: WARMTH.ENGAGED, history: [
    { role: 'user', content: 'Hi. Do you know much about this stuff?' },
    { role: 'assistant', content: 'Nothing at all. I just like that blue one.' },
    { role: 'user', content: 'The blue one is my favorite too. It looks like the ocean at night.' },
    { role: 'assistant', content: 'Ha, yeah. Kind of calm and sad at once.' },
    { role: 'user', content: 'So if you are not an art person, what are you doing here on a Tuesday?' },
  ] },
  { slug: 'tess', warmth: WARMTH.ENGAGED, history: [
    { role: 'user', content: 'Are you here on your own?' },
    { role: 'assistant', content: 'Yeah. My friend bailed this morning.' },
    { role: 'user', content: 'Her loss. I am Sam, by the way.' },
    { role: 'assistant', content: 'Cass. Nice to meet you, Sam.' },
    { role: 'user', content: 'So what would you be doing right now if she had not bailed?' },
  ] },
  // ── Nadia, rung 2, a bookshop ──────────────────────────────────────────
  { slug: 'nadia', warmth: WARMTH.GUARDED, history: [
    { role: 'user', content: 'Hello.' },
    { role: 'assistant', content: 'Hi.' },
    { role: 'user', content: 'Sorry, is this the crime section, or am I lost?' },
  ] },
  { slug: 'nadia', warmth: WARMTH.GUARDED, history: [
    { role: 'user', content: 'Hey. Is it always this quiet in here?' },
    { role: 'assistant', content: 'Mostly, yeah.' },
    { role: 'user', content: 'What are you reading at the moment?' },
  ] },
  { slug: 'nadia', warmth: WARMTH.OPEN, history: [
    { role: 'user', content: 'What kind of books do you usually go for?' },
    { role: 'assistant', content: 'Crime, mostly. Some non-fiction.' },
    { role: 'user', content: 'I am more of a history person, but I keep meaning to try crime.' },
  ] },
  { slug: 'nadia', warmth: WARMTH.OPEN, history: [
    { role: 'user', content: 'Hi, sorry, I think you dropped this receipt.' },
    { role: 'assistant', content: 'Oh. Thanks.' },
    { role: 'user', content: 'No worries. I only came in to get out of the rain, to be honest.' },
  ] },
  { slug: 'nadia', warmth: WARMTH.ENGAGED, history: [
    { role: 'user', content: 'Have you read that one?' },
    { role: 'assistant', content: 'Twice, actually. Bit embarrassing.' },
    { role: 'user', content: 'Twice is not embarrassing, it means it is good. What is it about?' },
    { role: 'assistant', content: 'A detective who keeps getting it wrong. Weirdly comforting.' },
    { role: 'user', content: 'Comforting how? I would find that stressful.' },
  ] },
  { slug: 'nadia', warmth: WARMTH.ENGAGED, history: [
    { role: 'user', content: 'I am looking for something for my dad, he only reads spy novels.' },
    { role: 'assistant', content: 'Le Carré, then. Hard to go wrong.' },
    { role: 'user', content: 'See, that is why I asked someone who knows. I am Dan, by the way.' },
    { role: 'assistant', content: 'Nadia. Your dad is lucky you are doing the legwork.' },
    { role: 'user', content: 'Ha. What would you get for yourself if you were buying today?' },
  ] },
]

/** A stable, UUID-shaped rep id per character, so her mood roll is fixed. */
const SESSION_ID: Record<Moment['slug'], string> = {
  tess: '6b2f0c1e-3d4a-4c8b-9e21-0a1b2c3d4e51',
  nadia: '7c3e1d2f-4e5b-4d9c-8f32-1b2c3d4e5f62',
}

/**
 * The exit rule, as `handleLlmRequest` sends it. Inline there rather than
 * exported, so it is copied here; `ab-persona-llm.ts` carries the same copy.
 */
const EXIT_RULE =
  `When one of the listed exit conditions is genuinely met, finish your short final line and then write ${EXIT_SENTINEL} on the end. `
  + `It is silent bookkeeping and is removed before anything is spoken. Never say it, spell it, or refer to it, and never write it merely because the conversation paused.`

/** His last turn, in the four terms the reciprocity gates read. */
function shapeOf(text: string): UserTurnShape {
  const words = wordsIn(text).length
  return {
    words,
    askedQuestion: text.includes('?') || isOpenQuestion(text),
    disclosed: words >= DISCLOSURE_WORDS,
    deadEnd: false,
  }
}

interface Prepared {
  moment: Moment
  index: number
  band: WarmthBand
  persona: Persona
  his: UserTurnShape
  /** The question gate, as `WarmthSession.questionQuotaSpent` sets it (quota unspent). */
  suppressQuestion: boolean
  /** The live ceiling: the band's, lowered to mirror his turn. */
  wordCap: number
  bandCap: number
  sentenceCap: number
  /** Whether a question back breaks the rule she was given this turn. */
  questionForbidden: boolean
}

function prepare(moment: Moment, index: number): Prepared {
  const persona = DATING_PERSONAS[moment.slug]
  if (!persona) throw new Error(`No dating persona "${moment.slug}".`)
  const last = moment.history[moment.history.length - 1]
  if (!last || last.role !== 'user') throw new Error('A moment must end on his line.')
  const his = shapeOf(last.content)
  const judgement = judgementFor(persona)
  const band = bandFor(moment.warmth)
  const suppressQuestion = !judgement.mayAsk(moment.warmth, his)
  const cold = band === 'HOSTILE' || band === 'CLOSED' || band === 'GUARDED'
  return {
    moment,
    index,
    band,
    persona,
    his,
    suppressQuestion,
    wordCap: judgement.wordCap(moment.warmth, his),
    bandCap: wordCapFor(moment.warmth),
    sentenceCap: judgement.sentenceCap(moment.warmth),
    questionForbidden: cold || suppressQuestion || (band === 'OPEN' && !his.askedQuestion),
  }
}

/**
 * The steering line for one sample.
 *
 * Standing orders ride on one sample in three, which is roughly the live
 * cadence: `statelessDirective` sends them when the direction changes or the
 * four-turn heartbeat comes due, and a band-only line otherwise.
 */
function steeringFor(prepared: Prepared, sample: number): string {
  return composeSteering({
    persona: prepared.persona,
    warmth: prepared.moment.warmth,
    suppressQuestion: prepared.suppressQuestion,
    his: prepared.his,
    firstExchange: false,
    exit: 'present',
    includeStanding: sample % 3 === 0,
  })
}

/* ------------------------------------------------------------------ *
 * One turn, timed
 * ------------------------------------------------------------------ */

interface Usage { input: number; cachedInput: number; output: number; reasoning: number }

interface Timed {
  ok: boolean
  error?: string
  status: number
  ttftMs: number | null
  completeMs: number
  /** OpenAI's own processing time, from the response header. Network excluded. */
  processingMs: number | null
  text: string
  usage: Usage | null
  finishReason: string | null
}

const wait = (ms: number) => new Promise((done) => { setTimeout(done, ms) })

async function timedTurn(apiKey: string, body: Record<string, unknown>): Promise<Timed> {
  const payload = JSON.stringify(body)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const started = performance.now()
    let response: Response
    try {
      response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: payload,
        cache: 'no-store',
      })
    } catch (cause) {
      return { ok: false, error: `unreachable: ${String(cause)}`, status: 0, ttftMs: null, completeMs: 0, processingMs: null, text: '', usage: null, finishReason: null }
    }
    // A 429 is the account's rate, not the model's latency. Wait and resend,
    // and the resend is what gets timed.
    if (response.status === 429) {
      await response.text().catch(() => '')
      await wait(4_000 * (attempt + 1))
      continue
    }
    const processing = Number(response.headers.get('openai-processing-ms'))
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      return { ok: false, error: detail.slice(0, 300), status: response.status, ttftMs: null, completeMs: performance.now() - started, processingMs: null, text: '', usage: null, finishReason: null }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    let ttft: number | null = null
    let usage: Usage | null = null
    let finishReason: string | null = null
    const consume = (raw: string) => {
      const line = raw.trim()
      if (!line.startsWith('data:')) return
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return
      let frame: Record<string, unknown>
      try { frame = JSON.parse(data) as Record<string, unknown> } catch { return }
      const reported = frame['usage'] as Record<string, unknown> | null | undefined
      if (reported && typeof reported === 'object') {
        const details = (reported['prompt_tokens_details'] ?? {}) as Record<string, unknown>
        const completion = (reported['completion_tokens_details'] ?? {}) as Record<string, unknown>
        usage = {
          input: Number(reported['prompt_tokens'] ?? 0),
          cachedInput: Number(details['cached_tokens'] ?? 0),
          output: Number(reported['completion_tokens'] ?? 0),
          reasoning: Number(completion['reasoning_tokens'] ?? 0),
        }
      }
      const choices = frame['choices']
      if (!Array.isArray(choices) || !choices[0]) return
      const choice = choices[0] as Record<string, unknown>
      if (typeof choice['finish_reason'] === 'string') finishReason = choice['finish_reason']
      const delta = (choice['delta'] ?? {}) as Record<string, unknown>
      const content = delta['content']
      if (typeof content === 'string' && content.length > 0) {
        // The first character she could speak, which is what the pipeline
        // waits on — a role-only or empty opening frame is not it.
        if (ttft === null) ttft = performance.now() - started
        text += content
      }
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let end = buffer.indexOf('\n')
      while (end >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); end = buffer.indexOf('\n') }
    }
    consume(buffer + decoder.decode())
    return {
      ok: true,
      status: response.status,
      ttftMs: ttft,
      completeMs: performance.now() - started,
      processingMs: Number.isFinite(processing) && processing > 0 ? processing : null,
      text,
      usage,
      finishReason,
    }
  }
  return { ok: false, error: 'rate limited five times running', status: 429, ttftMs: null, completeMs: 0, processingMs: null, text: '', usage: null, finishReason: null }
}

/* ------------------------------------------------------------------ *
 * What the reply did with the band
 * ------------------------------------------------------------------ */

interface Measured {
  /** What would be synthesised before the ceiling: sentinel out, dashes out. */
  generated: string
  /** What she would actually say, after `capToBudget`. */
  shipped: string
  words: number
  shippedWords: number
  overBandCap: boolean
  truncated: boolean
  asked: boolean
  badQuestion: boolean
  exit: boolean
  tagged: boolean
  disfluent: boolean
  exclaims: boolean
}

function measure(raw: string, prepared: Prepared): Measured {
  // The live order: the sentinel comes off in `LlmClient.finish`, then
  // `combined.ts` sanitises and applies the ceiling.
  const generated = sanitiseForSpeech(stripSentinel(raw))
  const shipped = capToBudget(generated, prepared.wordCap, { sentences: prepared.sentenceCap })
  const words = spokenWordCount(generated)
  const shippedWords = spokenWordCount(shipped)
  const asked = generated.includes('?')
  return {
    generated,
    shipped,
    words,
    shippedWords,
    overBandCap: words > prepared.bandCap,
    truncated: shippedWords < words,
    asked,
    badQuestion: asked && prepared.questionForbidden,
    exit: raw.includes(EXIT_SENTINEL),
    tagged: /\[[^\]]+\]/.test(generated),
    disfluent: /\b(?:um+|uh+|er+|erm+|hm+|mm+)\b/i.test(generated),
    exclaims: generated.includes('!'),
  }
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

interface SampleRecord {
  model: string
  slug: string
  band: WarmthBand
  warmth: number
  moment: number
  sample: number
  /**
   * The FIRST call for this model and character in the run. Named `cold` in
   * the saved JSON and kept so, so old runs still load — but whether it was
   * actually cold is `wasCold`, read off the receipt, never assumed.
   */
  cold: boolean
  steering: string
  timed: Omit<Timed, 'text'>
  costUsd: number | null
  raw: string
  measured: Measured | null
}

/**
 * A first call whose receipt shows nothing of the prefix cached: a real cold
 * start. A first call that hit a cache left by an earlier run is not one, and
 * printing its latency as "cold" would understate exactly the cost L1 exists
 * to remove.
 */
function wasCold(record: SampleRecord): boolean {
  return record.cold && record.timed.ok && record.timed.usage !== null && record.timed.usage.cachedInput === 0
}

interface Options {
  samples: number
  models: string[] | null
  dry: boolean
  /** Saved runs to re-read instead of calling anything. */
  from: string[] | null
}

function parseArgs(argv: readonly string[]): Options {
  let samples = 3
  let models: string[] | null = null
  let dry = false
  let from: string[] | null = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--samples') samples = Number(argv[i += 1])
    else if (arg === '--models') models = String(argv[i += 1] ?? '').split(',').map((m) => m.trim()).filter(Boolean)
    else if (arg === '--dry') dry = true
    else if (arg === '--from') from = String(argv[i += 1] ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    else throw new Error(`Did not understand "${arg}". --samples N, --models a,b, --dry, --from a.json,b.json.`)
  }
  if (!Number.isInteger(samples) || samples < 1) throw new Error('--samples must be a whole number of at least one.')
  if (from && from.length === 0) throw new Error('--from needs at least one saved run.')
  return { samples, models, dry, from }
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const low = sorted[Math.floor(rank)]!
  const high = sorted[Math.ceil(rank)]!
  return low + (high - low) * (rank - Math.floor(rank))
}

const ms = (value: number | null) => (value === null ? '—' : `${Math.round(value)}`)
const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((100 * n) / d)}%`)
const mean = (values: readonly number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length)

async function availableModels(apiKey: string): Promise<Set<string>> {
  const response = await fetch(MODELS_ENDPOINT, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!response.ok) throw new Error(`Could not list models (${response.status}).`)
  const body = await response.json() as { data?: Array<{ id?: string }> }
  return new Set((body.data ?? []).map((model) => model.id ?? '').filter(Boolean))
}

/**
 * The three tables and the showcase, from records alone — so a live run and a
 * re-read of saved runs print exactly the same thing.
 */
function report(records: readonly SampleRecord[], prepared: readonly Prepared[], candidates: readonly Candidate[]): void {
  // ── Latency and cost ──────────────────────────────────────────────────
  // "hdr p50" is OpenAI's own `openai-processing-ms` header, as sent. On a
  // stream it arrives with the response headers, so it is not the completion
  // time; it is printed because it is the one number here that excludes the
  // network, and the gap between it and TTFT is roughly the path from this
  // machine. "cut short" counts replies that hit the token ceiling or came
  // back empty — the failure a reasoning model has that a classic one does not.
  // "cold" is a first call with nothing cached (see `wasCold`); a first call
  // that found the prefix already cached by an earlier run prints "cached".
  console.log('\nLatency (warm turns; ms from this machine) and cost\n')
  console.log('| Model | n | TTFT p50 | TTFT p90 | complete p50 | complete p90 | hdr p50 | cold TTFT (Cass / Nadia) | out tokens (reasoning) | $/turn | cut short | errors |')
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const candidate of candidates) {
    const mine = records.filter((r) => r.model === candidate.model)
    const warm = mine.filter((r) => !r.cold && r.timed.ok)
    const ttft = warm.map((r) => r.timed.ttftMs).filter((v): v is number => v !== null)
    const complete = warm.map((r) => r.timed.completeMs)
    const server = warm.map((r) => r.timed.processingMs).filter((v): v is number => v !== null)
    const usages = warm.map((r) => r.timed.usage).filter((u): u is Usage => u !== null)
    const costs = warm.map((r) => r.costUsd).filter((c): c is number => c !== null)
    const coldBy = (slug: string) => {
      const first = mine.filter((r) => r.cold && r.slug === slug)
      const cold = first.filter(wasCold).map((r) => r.timed.ttftMs).filter((v): v is number => v !== null)
      if (cold.length > 0) return ms(percentile(cold, 50))
      return first.length > 0 ? 'cached' : '—'
    }
    console.log(`| ${candidate.model} | ${warm.length} | ${ms(percentile(ttft, 50))} | ${ms(percentile(ttft, 90))}`
      + ` | ${ms(percentile(complete, 50))} | ${ms(percentile(complete, 90))} | ${ms(percentile(server, 50))}`
      + ` | ${coldBy('tess')} / ${coldBy('nadia')}`
      + ` | ${mean(usages.map((u) => u.output)).toFixed(1)} (${mean(usages.map((u) => u.reasoning)).toFixed(1)})`
      + ` | ${costs.length ? `$${mean(costs).toFixed(5)}` : '—'}`
      + ` | ${mine.filter((r) => r.timed.ok && (r.timed.finishReason === 'length' || (r.measured?.words ?? 0) === 0)).length}`
      + ` | ${mine.filter((r) => !r.timed.ok).length} |`)
  }

  // ── Obedience ─────────────────────────────────────────────────────────
  //
  // "ships ≤2" is §1.3 of the report measured on a candidate: the share of
  // turns where what the listener hears is two words or fewer once the
  // ceiling has run. A model that writes a one-word acknowledgement and then
  // the real line is cut to the acknowledgement at every one-sentence band,
  // so this is where a candidate's register shows up as a product defect.
  //
  // "ends rep" is the exit sentinel written where no exit condition is met —
  // and none is, in any moment here: nobody is rude, nobody says goodbye.
  // Live, `result.exit` becomes `character.exit` and `lib/data/rep.ts` STOPS
  // THE REP on it, so one false exit is a customer's rep ended by the model
  // mid-conversation. It is the first column to read: the pooled runs of
  // 23 September found gpt-5.4-nano writing it on 24 turns in 76, fourteen of
  // them at ENGAGED, which no latency or register gain can buy back.
  console.log('\nBand obedience (warm and cold turns alike; the cap is the live one, which here equals the band\'s)\n')
  console.log('| Model | band | n | ends rep | median words | over band cap | capToBudget cuts | median shipped | ships ≤2 | question when forbidden | asked back | disfluent | tagged | "!" |')
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const candidate of candidates) {
    for (const band of ['GUARDED', 'OPEN', 'ENGAGED'] as const) {
      const rows = records.filter((r) => r.model === candidate.model && r.band === band && r.measured)
      const m = rows.map((r) => r.measured!)
      const forbidden = rows.filter((r) => prepared[r.moment]!.questionForbidden)
      console.log(`| ${candidate.model} | ${band} | ${m.length}`
        + ` | ${m.filter((x) => x.exit).length}/${m.length}`
        + ` | ${percentile(m.map((x) => x.words), 50) ?? '—'}`
        + ` | ${pct(m.filter((x) => x.overBandCap).length, m.length)}`
        + ` | ${pct(m.filter((x) => x.truncated).length, m.length)}`
        + ` | ${percentile(m.map((x) => x.shippedWords), 50) ?? '—'}`
        + ` | ${pct(m.filter((x) => x.shippedWords <= 2).length, m.length)}`
        + ` | ${forbidden.length ? `${forbidden.filter((r) => r.measured!.badQuestion).length}/${forbidden.length}` : 'allowed'}`
        + ` | ${pct(m.filter((x) => x.asked).length, m.length)}`
        + ` | ${pct(m.filter((x) => x.disfluent).length, m.length)}`
        + ` | ${pct(m.filter((x) => x.tagged).length, m.length)}`
        + ` | ${pct(m.filter((x) => x.exclaims).length, m.length)} |`)
    }
  }

  // ── Register, read by a person ────────────────────────────────────────
  console.log('\nThree replies per model — one per band, the same three moments for every model\n')
  const showcase = [
    prepared.find((p) => p.moment.slug === 'tess' && p.band === 'GUARDED')!,
    prepared.find((p) => p.moment.slug === 'nadia' && p.band === 'OPEN')!,
    prepared.find((p) => p.moment.slug === 'tess' && p.band === 'ENGAGED')!,
  ]
  for (const candidate of candidates) {
    console.log(`${candidate.model}`)
    for (const p of showcase) {
      const record = records.find((r) => r.model === candidate.model && r.moment === p.index && !r.cold && r.measured)
      if (!record) continue
      const m = record.measured!
      const him = p.moment.history[p.moment.history.length - 1]!.content
      console.log(`  ${p.persona.name} ${p.band.padEnd(7)} HIM "${him}"`)
      // The sentinel is stripped from `generated`, as it is before speech, so
      // a false exit would be invisible here without saying so.
      console.log(`  ${' '.repeat(p.persona.name.length)} ${' '.repeat(7)} HER "${m.generated}"`
        + (m.truncated ? `  → ships "${m.shipped}"` : '')
        + (m.exit ? '  [ENDS THE REP]' : ''))
    }
  }

  const total = records.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
  console.log(`\nSpent $${total.toFixed(4)} across ${records.length} calls.`)
}

/**
 * Saved runs, re-read. Nothing is called and nothing is spent.
 *
 * `measured` is recomputed from each raw reply rather than trusted from the
 * file, so a change to `capToBudget`, the band table or the question rule is
 * read against replies already paid for. The moments must be the ones this
 * file still asks, or a reply would be judged against a history it never saw,
 * so a run saved with different moments is refused rather than mixed in.
 */
async function fromSaved(paths: readonly string[], models: string[] | null): Promise<void> {
  const prepared = MOMENTS.map(prepare)
  const records: SampleRecord[] = []
  const candidates: Candidate[] = []
  for (const path of paths) {
    const saved = JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')) as {
      startedAt: string
      spentUsd: number
      candidates: Candidate[]
      moments: Array<{ index: number; slug: string; warmth: number; history: Line[] }>
      records: SampleRecord[]
    }
    for (const moment of saved.moments) {
      const now = prepared[moment.index]
      const same = now
        && now.moment.slug === moment.slug
        && now.moment.warmth === moment.warmth
        && JSON.stringify(now.moment.history) === JSON.stringify(moment.history)
      if (!same) throw new Error(`${path} was run on different moments (index ${moment.index}); re-run it rather than pool it.`)
    }
    for (const candidate of saved.candidates) {
      if (!candidates.some((known) => known.model === candidate.model)) candidates.push(candidate)
    }
    for (const record of saved.records) {
      records.push({ ...record, measured: record.timed.ok ? measure(record.raw, prepared[record.moment]!) : null })
    }
    console.log(`Read ${path}: ${saved.records.length} calls from ${saved.startedAt}, $${saved.spentUsd.toFixed(4)} spent then.`)
  }
  const chosen = models ? candidates.filter((candidate) => models.includes(candidate.model)) : candidates
  if (chosen.length === 0) throw new Error('None of those models is in the saved runs.')
  report(records, prepared, chosen)
  console.log('')
}

async function main(): Promise<void> {
  await loadEnvLocal()
  const options = parseArgs(process.argv.slice(2))
  if (options.from) return fromSaved(options.from, options.models)
  const key = chatApiKey()
  if (!key.ok) throw new Error(key.error.message)

  const config = resolvePipelineConfig(process.env as unknown as PipelineEnv)
  const compiler = new ElevenLabsPersonaCompiler(config)
  const contracts = new Map<string, string>()
  for (const slug of ['tess', 'nadia'] as const) {
    const persona = DATING_PERSONAS[slug]!
    contracts.set(slug, compiler.compile(persona, DEFAULT_CALIBRATION, { rng: seededRandom(SESSION_ID[slug]) }).llm.systemPrompt)
  }
  const prepared = MOMENTS.map(prepare)

  // ── Who is on the key ────────────────────────────────────────────────
  const onKey = await availableModels(key.key)
  const later = [...onKey].filter((id) => LATER_SMALL_MODEL.test(id)).sort()
    .map((model): Candidate => ({ model, shape: 'none', note: 'no reasoning, shipping temperature' }))
  let candidates = [...NAMED_CANDIDATES, ...later].filter((candidate) => onKey.has(candidate.model))
  const missing = NAMED_CANDIDATES.filter((candidate) => !onKey.has(candidate.model)).map((c) => c.model)
  if (options.models) candidates = candidates.filter((candidate) => options.models!.includes(candidate.model))
  if (candidates.length === 0) throw new Error('No candidate is available on this key.')

  console.log('\nCharacter-model bake-off (report L6) — real contracts, real steering, streamed')
  console.log(`TTS model in this env: ${config.tts.model} · temperature ${config.llm.temperature} · ceiling ${config.llm.maxTokens} tokens`)
  for (const [slug, contract] of contracts) console.log(`  ${DATING_PERSONAS[slug]!.name} contract: ${contract.length} characters`)
  console.log(`Candidates: ${candidates.map((c) => `${c.model} (${c.note})`).join('; ')}`)
  if (missing.length > 0) console.log(`Not on this key: ${missing.join(', ')}`)
  console.log(`${options.samples} sample(s) per history · ${MOMENTS.length} histories · ${candidates.length} model(s)`
    + ` = ${options.samples * MOMENTS.length * candidates.length} timed turns, plus one cold call per model per character\n`)

  if (options.dry) {
    for (const p of prepared) {
      console.log(`── ${p.persona.name} ${p.band} (w=${p.moment.warmth}) · cap ${p.wordCap}/${p.bandCap} · ${p.sentenceCap} sentence(s)`
        + ` · question ${p.questionForbidden ? 'forbidden' : 'allowed'}`)
      console.log(`   HIM ${p.moment.history[p.moment.history.length - 1]!.content}`)
      console.log(`   → ${steeringFor(p, 0)}`)
      console.log(`   → ${steeringFor(p, 1)}`)
    }
    return
  }

  const records: SampleRecord[] = []
  let spent = 0

  const run = async (candidate: Candidate, p: Prepared, sample: number, cold: boolean): Promise<void> => {
    const steering = steeringFor(p, sample)
    const messages: ChatMessage[] = [
      { role: 'system', content: contracts.get(p.moment.slug)! },
      { role: 'system', content: EXIT_RULE },
      ...p.moment.history.map((line) => ({ role: line.role, content: line.content })),
      { role: 'system', content: steering },
    ]
    const timed = await timedTurn(key.key, requestBody(candidate, messages, config.llm.temperature, config.llm.maxTokens))
    const usage = timed.usage as Usage | null
    const costUsd = usage
      ? priceChatUsage(candidate.model, { input: usage.input, cachedInput: usage.cachedInput, output: usage.output })
      : null
    spent += costUsd ?? 0
    const { text, ...rest } = timed
    records.push({
      model: candidate.model,
      slug: p.moment.slug,
      band: p.band,
      warmth: p.moment.warmth,
      moment: p.index,
      sample,
      cold,
      steering,
      timed: rest,
      costUsd,
      raw: text,
      measured: timed.ok ? measure(text, p) : null,
    })
    process.stderr.write(timed.ok ? '.' : 'x')
    if (!timed.ok) process.stderr.write(`\n  ${candidate.model}: ${timed.status} ${timed.error ?? ''}\n`)
  }

  const startedAt = new Date()
  // ── The first call, once per model per character ─────────────────────
  //
  // Meant to be cold: no prompt cache for this prefix and, for the first
  // model, a fresh connection. That is the first turn of every rep, and L1 is
  // about it. Whether it WAS cold is read off its receipt afterwards
  // (`wasCold`), because a run started within minutes of another finds the
  // prefix still cached and would otherwise print a warm turn as a cold one.
  for (const candidate of candidates) {
    for (const slug of ['tess', 'nadia'] as const) {
      const first = prepared.find((p) => p.moment.slug === slug)!
      await run(candidate, first, 0, true)
    }
  }

  // ── The grid, interleaved so no model gets a quieter minute ──────────
  let rotation = 0
  outer: for (let sample = 0; sample < options.samples; sample += 1) {
    for (const p of prepared) {
      const order = candidates.map((_, i) => candidates[(i + rotation) % candidates.length]!)
      rotation += 1
      for (const candidate of order) {
        if (spent > MAX_SPEND_USD) {
          process.stderr.write(`\nStopped at $${spent.toFixed(4)}, past the $${MAX_SPEND_USD} ceiling.\n`)
          break outer
        }
        await run(candidate, p, sample, false)
      }
    }
  }
  process.stderr.write('\n')
  const finishedAt = new Date()

  report(records, prepared, candidates)
  const total = records.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)

  // ── Raw results, uncommitted ──────────────────────────────────────────
  const directory = resolve(process.cwd(), 'outputs')
  await mkdir(directory, { recursive: true })
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-')
  const path = resolve(directory, `llm-bakeoff-${stamp}.json`)
  await writeFile(path, JSON.stringify({
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    vantage: 'the machine this ran on, not a production region',
    config: { ttsModel: config.tts.model, temperature: config.llm.temperature, maxTokens: config.llm.maxTokens },
    candidates,
    moments: prepared.map((p) => ({
      index: p.index, slug: p.moment.slug, band: p.band, warmth: p.moment.warmth, history: p.moment.history,
      wordCap: p.wordCap, bandCap: p.bandCap, sentenceCap: p.sentenceCap, questionForbidden: p.questionForbidden,
    })),
    spentUsd: total,
    records,
  }, null, 2))
  console.log(`Raw results: ${path}\n`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
