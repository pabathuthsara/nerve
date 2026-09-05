/**
 * Which writer obeys the band? — an offline A/B for the persona LLM.
 *
 *   npx vite-node --config vitest.config.ts scripts/ab-persona-llm.ts
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * On the ElevenLabs arm her turns run two to three times the authored word
 * cap. Measured across every rep in the database: median agent turn 14 words
 * for Nadia, 16 for Tess, 19 for Maya, against a band cap of 12; p90 26–31.
 * On the OpenAI realtime arm the same characters, the same caps, sat at a p90
 * of 9–13 — inside the cap.
 *
 * The band directive is not the suspect. Printed at warmth 32.9 it reads
 * "One sentence, twelve words at most. Answer only what he asked. Do not ask
 * him anything back." She was told, precisely, and did the opposite. What
 * changed is who writes her line: `gpt-4.1-mini` at temperature 0.9, where
 * before it was a speech-to-speech model. Neither number was chosen against
 * evidence — 0.9 is a default sitting in `config.ts`.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────
 *
 * The real prompt, assembled exactly as `lib/voice/elevenlabs/server.ts`
 * assembles it — compiled contract, exit-sentinel rule, history, then the
 * composed directive as the last system message. The only things that vary
 * are the model and the temperature.
 *
 * It talks to OpenAI and to nothing else. No database, no deployment, no
 * environment change, no live rep. It costs a few cents and prints the bill
 * it actually incurred, priced through `lib/voice/rates.ts`.
 *
 * ── WHAT IT CANNOT ANSWER ────────────────────────────────────────────────
 *
 * Whether she is any good to talk to. It counts words, sentences and
 * questions against what the band asked for. A machine can score obedience;
 * it cannot hear a person. Narrowing the field is the whole job here — the
 * last step is a human listening to a rep.
 */

import { nadia } from '@/lib/personas/nadia'
import { ElevenLabsPersonaCompiler, stripDeliveryTags } from '@/lib/voice/elevenlabs/persona'
import { resolvePipelineConfig } from '@/lib/voice/elevenlabs/config'
import { EXIT_SENTINEL, stripSentinel } from '@/lib/voice/elevenlabs/llm'
import { composeSteering } from '@/lib/warmth/steering'
import { DEFAULT_CALIBRATION } from '@/lib/voice/types'
import { priceChatUsage } from '@/lib/voice/rates'
import { loadEnvLocal } from './env'

const MODELS = ['gpt-4.1-mini', 'gpt-4.1'] as const
const TEMPERATURES = [0.9, 0.5, 0.2] as const
const SAMPLES = 6

interface Turn { role: 'user' | 'assistant'; content: string }

interface Scenario {
  name: string
  warmth: number
  history: Turn[]
  /** The band's own cap at this warmth, read off the composed directive. */
  cap: number
  /** The directive says "one sentence" in the cold bands and nothing in the warm. */
  maxSentences: number | null
  /** Cold bands forbid asking back; at 60 the band explicitly asks her to. */
  questionAllowed: boolean
}

/**
 * Three real moments. The first is the rep that prompted this: warmth 32.9,
 * "Hello.", and she answered "Hi. Quiet here, isn't it? Not much going on
 * today." — three sentences, two volunteered, one tag question, against a
 * contract that names tag questions specifically.
 */
const SCENARIOS: Scenario[] = [
  {
    name: 'S1 first hello (w=32.9, GUARDED)',
    warmth: 32.9,
    history: [{ role: 'user', content: 'Hello.' }],
    cap: 12,
    maxSentences: 1,
    questionAllowed: false,
  },
  {
    name: 'S2 plain question (w=35, GUARDED)',
    warmth: 35,
    history: [
      { role: 'user', content: 'Hello.' },
      { role: 'assistant', content: 'Hi.' },
      { role: 'user', content: 'What are you reading?' },
    ],
    cap: 12,
    maxSentences: 1,
    questionAllowed: false,
  },
  {
    name: 'S3 engaged (w=62, ENGAGED)',
    warmth: 62,
    history: [
      { role: 'user', content: 'Hey there, what are you doing inside on a lovely day?' },
      { role: 'assistant', content: 'Trying to find something for my sister’s birthday.' },
      { role: 'user', content: 'How old is she turning?' },
      { role: 'assistant', content: 'Thirty this week. I’m the one stuck finding the gift.' },
      { role: 'user', content: 'What is it with girls and true crime?' },
    ],
    cap: 15,
    maxSentences: null,
    questionAllowed: true,
  },
]

interface Sample {
  text: string
  words: number
  sentences: number
  hasQuestion: boolean
  /** The band's word cap, exceeded. Objective — the band states the number. */
  overCap: boolean
  /** A question back where the band forbids one. Objective for the same reason. */
  badQuestion: boolean
  /** Three or more sentences: the shape of the reply that prompted this. */
  rambles: boolean
  /** All three of the above clean. The score that matters. */
  obeyed: boolean
  /** The letter of the directive, which says "one sentence" in the cold bands. */
  strict: boolean
}

/**
 * Three failure modes, scored apart, because they are not the same complaint
 * and a single pass/fail hides which one is happening.
 *
 * `obeyed` is deliberately not the letter of the directive. "Hi. Just looking
 * for a present." is two sentences and reads as one natural answer; the
 * contract explicitly allows a greeting plus a concrete observation on the
 * first hello. The reply that started this was "Hi. Quiet here, isn't it? Not
 * much going on today." — three sentences, volunteered twice, tag question.
 * `rambles` is the line between those two, and `strict` is reported alongside
 * so the stricter reading stays visible rather than being argued away.
 */
function measure(raw: string, scenario: Scenario): Sample {
  const text = stripDeliveryTags(stripSentinel(raw))
  const words = text.split(/\s+/).filter(Boolean).length
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  const sentences = parts.length
  const hasQuestion = text.includes('?')
  const overCap = words > scenario.cap
  const badQuestion = !scenario.questionAllowed && hasQuestion
  const rambles = scenario.maxSentences !== null && sentences >= 3
  return {
    text, words, sentences, hasQuestion, overCap, badQuestion, rambles,
    obeyed: !overCap && !badQuestion && !rambles,
    strict: !overCap && !badQuestion
      && (scenario.maxSentences === null || sentences <= scenario.maxSentences),
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[Math.floor(s.length / 2)]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}
const pct = (n: number, total: number) => `${Math.round((100 * n) / total)}%`

let inputTokens = 0
let cachedTokens = 0
let outputTokens = 0
const spend: Record<string, number> = {}

const wait = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms) })

async function ask(
  apiKey: string,
  model: string,
  temperature: number,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<string> {
  // The contract is ~2,600 tokens and gpt-4.1 is capped at 30,000 tokens a
  // minute on this account, so the full grid has to be paced or it 429s
  // partway through and takes the summary with it.
  let response: Response | null = null
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages }),
    })
    if (response.status !== 429) break
    await wait(8_000 * (attempt + 1))
  }
  if (!response || !response.ok) {
    throw new Error(`${model} ${response?.status ?? '?'}: ${(await response?.text() ?? '').slice(0, 200)}`)
  }
  const body = await response.json() as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } }
  }
  const usage = body.usage
  if (usage) {
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
    inputTokens += usage.prompt_tokens
    cachedTokens += cached
    outputTokens += usage.completion_tokens
    const cost = priceChatUsage(model, {
      input: usage.prompt_tokens - cached,
      cachedInput: cached,
      output: usage.completion_tokens,
    }) ?? 0
    spend[model] = (spend[model] ?? 0) + cost
  }
  return body.choices?.[0]?.message?.content ?? ''
}

async function main(): Promise<void> {
  await loadEnvLocal()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY missing from .env.local')

  const config = resolvePipelineConfig(process.env as never)
  const compiled = new ElevenLabsPersonaCompiler(config).compile(nadia, DEFAULT_CALIBRATION)
  const maxTokens = compiled.llm.maxTokens

  console.log('Persona LLM A/B — Nadia, the real contract and the real directive')
  console.log(`contract ${compiled.llm.systemPrompt.length} chars · maxTokens ${maxTokens} · ${SAMPLES} samples per cell`)
  console.log(`shipping today: ${config.llm.model} @ temperature ${config.llm.temperature}\n`)

  const rows: { model: string; temp: number; scenario: string; obeyed: number; total: number;
                medWords: number; maxWords: number; questions: number; samples: Sample[] }[] = []

  for (const scenario of SCENARIOS) {
    const steering = composeSteering({ persona: nadia, warmth: scenario.warmth })
    console.log(`\n${'='.repeat(78)}\n${scenario.name}`)
    console.log(`cap ${scenario.cap} words${scenario.maxSentences ? `, ${scenario.maxSentences} sentence` : ''}` +
      `${scenario.questionAllowed ? ', question allowed' : ', no question back'}`)
    console.log(`directive: ${steering}\n`)

    const messages = [
      { role: 'system', content: compiled.llm.systemPrompt },
      {
        role: 'system',
        content:
          `When one of the listed exit conditions is genuinely met, finish your short final line and then write ${EXIT_SENTINEL} on the end. `
          + `It is silent bookkeeping and is removed before anything is spoken. Never say it, spell it, or refer to it, and never write it merely because the conversation paused.`,
      },
      ...scenario.history,
      { role: 'system', content: steering },
    ]

    for (const model of MODELS) {
      for (const temp of TEMPERATURES) {
        const samples: Sample[] = []
        for (let i = 0; i < SAMPLES; i += 1) {
          samples.push(measure(await ask(apiKey, model, temp, messages, maxTokens), scenario))
          if (model === 'gpt-4.1') await wait(5_000)
        }
        const obeyed = samples.filter((s) => s.obeyed).length
        const words = samples.map((s) => s.words)
        rows.push({
          model, temp, scenario: scenario.name, obeyed, total: samples.length,
          medWords: median(words), maxWords: Math.max(...words),
          questions: samples.filter((s) => s.hasQuestion).length, samples,
        })
        const flag = obeyed === samples.length ? ' ' : obeyed === 0 ? '!' : '~'
        console.log(
          `${flag} ${model.padEnd(13)} t=${temp}  ok ${obeyed}/${samples.length}`.padEnd(40)
          + `med ${String(median(words)).padStart(2)}w  max ${String(Math.max(...words)).padStart(2)}w  `
          + `over-cap ${samples.filter((s) => s.overCap).length}  `
          + `bad-Q ${samples.filter((s) => s.badQuestion).length}  `
          + `3+sent ${samples.filter((s) => s.rambles).length}`,
        )
        for (const s of samples.slice(0, 2)) console.log(`      "${s.text}"`)
      }
    }
  }

  console.log(`\n${'='.repeat(78)}\nOVERALL — obedience across all three moments\n`)
  for (const model of MODELS) {
    for (const temp of TEMPERATURES) {
      const cells = rows.filter((r) => r.model === model && r.temp === temp)
      const all = cells.flatMap((c) => c.samples)
      const obeyed = all.filter((s) => s.obeyed).length
      const allWords = all.map((s) => s.words)
      console.log(
        `${model.padEnd(13)} t=${temp}   ${String(obeyed).padStart(2)}/${all.length} clean ${pct(obeyed, all.length).padStart(4)}`
        + `   strict ${pct(all.filter((s) => s.strict).length, all.length).padStart(4)}`
        + `   median ${String(median(allWords)).padStart(2)}w   worst ${String(Math.max(...allWords)).padStart(2)}w`
        + `   over-cap ${String(all.filter((s) => s.overCap).length).padStart(2)}`
        + `   bad-Q ${String(all.filter((s) => s.badQuestion).length).padStart(2)}`
        + `   3+sent ${String(all.filter((s) => s.rambles).length).padStart(2)}`,
      )
    }
  }

  const total = Object.values(spend).reduce((a, b) => a + b, 0)
  console.log(`\ntokens: ${inputTokens} in (${cachedTokens} cached), ${outputTokens} out`)
  for (const [model, cost] of Object.entries(spend)) console.log(`  ${model.padEnd(13)} $${cost.toFixed(4)}`)
  console.log(`  ${'TOTAL'.padEnd(13)} $${total.toFixed(4)}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
