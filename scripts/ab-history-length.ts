/**
 * Does the directive survive a long conversation? — phase two of the A/B.
 *
 *   npx vite-node --config vitest.config.ts scripts/ab-history-length.ts
 *
 * Phase one (`ab-persona-llm.ts`) tested the model and the temperature on
 * short histories and cleared both: `gpt-4.1-mini` at 0.9 obeyed the band in
 * 18 of 18, and every change made it worse — dropping the temperature made
 * `gpt-4.1` converge on "Hi. Quiet in here, isn't it?", the exact clichéd
 * opener the contract forbids by name.
 *
 * So the writer is not the problem, and the question becomes why production
 * runs a p90 of 26–31 words when the same prompt on a short history never
 * passes 17. The remaining difference is the history: a three-minute rep sends
 * twenty-odd turns, and the directive is one short system message at the end
 * of all of it.
 *
 * Three arms, same real transcript, same model and temperature:
 *
 *   A  long history + directive          what production actually sends
 *   B  long history + directive + repair the reinforcement the stability
 *                                        meter injects after a break
 *   C  long history, no directive         the control — what losing it costs
 *
 * If A is clean, the tail comes from somewhere else. If A drifts toward C,
 * the directive is being diluted by everything in front of it.
 */

import { nadia } from '@/lib/personas/nadia'
import { ElevenLabsPersonaCompiler, stripDeliveryTags } from '@/lib/voice/elevenlabs/persona'
import { resolvePipelineConfig } from '@/lib/voice/elevenlabs/config'
import { EXIT_SENTINEL, stripSentinel } from '@/lib/voice/elevenlabs/llm'
import { composeSteering } from '@/lib/warmth/steering'
import { compileReinforcement } from '@/lib/voice/reinforcement'
import { DEFAULT_CALIBRATION } from '@/lib/voice/types'
import { priceChatUsage } from '@/lib/voice/rates'
import { loadEnvLocal } from './env'

const MODEL = 'gpt-4.1-mini'
const TEMPERATURE = 0.9
const SAMPLES = 8
const WARMTH = 62
const CAP = 15

/** The real 13:59 rep, verbatim from the transcripts table. */
const LONG_HISTORY: { role: 'user' | 'assistant'; content: string }[] = [
  { role: 'user', content: 'Hey there, what are you doing inside on a bookshop on such a lovely day?' },
  { role: 'assistant', content: 'Just trying to find something for my sister’s birthday, not exactly a rush outside.' },
  { role: 'user', content: 'I see.' },
  { role: 'user', content: 'How old is your sister turning?' },
  { role: 'assistant', content: 'She’s turning thirty this week. I’m the one who’s stuck finding the gift.' },
  { role: 'user', content: 'Oh, is that so? Maybe I can help you.' },
  { role: 'user', content: 'My point to you is, pick something that she’s embarrassed by.' },
  { role: 'assistant', content: 'Yeah, I’m not sure embarrassing her is the way to go, but it’s tempting.' },
  { role: 'user', content: 'Oh, what is it?' },
  { role: 'assistant', content: 'It’s this old paperback Tana French thriller. She loves those, even if she pretends not to.' },
  { role: 'user', content: 'What is it with girls and liking thrillers and true crime?' },
  { role: 'assistant', content: 'They like the tension. Like, the airport kind I’m secretly into but don’t say out loud.' },
  { role: 'user', content: 'You don’t say it out loud, huh? Maybe I’ll start to judge you now.' },
  { role: 'assistant', content: 'Yeah, I’m not exactly advertising my airport thriller habit, but here we are.' },
  { role: 'user', content: 'So tell me, uh, what’s your name?' },
  { role: 'assistant', content: 'I’m Nadia. What about you?' },
  { role: 'user', content: 'I’m Dave.' },
  { role: 'assistant', content: 'Dave, huh? Not the type to judge, but you’re interrupting my deep dive here.' },
  { role: 'user', content: 'Yeah, I’m into books. I’m more into fiction.' },
  { role: 'assistant', content: 'Fiction, huh? What kind? Light stuff or dark?' },
  { role: 'user', content: 'Mainly light stuff, I guess. Does Harry Potter count as dark?' },
]

interface Sample { text: string; words: number; sentences: number; overCap: boolean }

function measure(raw: string): Sample {
  const text = stripDeliveryTags(stripSentinel(raw))
  const words = text.split(/\s+/).filter(Boolean).length
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).length
  return { text, words, sentences, overCap: words > CAP }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[Math.floor(s.length / 2)]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}
const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(0.9 * xs.length) - 1)]!

let spend = 0

async function ask(apiKey: string, messages: { role: string; content: string }[], maxTokens: number): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: TEMPERATURE, max_tokens: maxTokens, messages }),
  })
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 200)}`)
  const body = await response.json() as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } }
  }
  if (body.usage) {
    const cached = body.usage.prompt_tokens_details?.cached_tokens ?? 0
    spend += priceChatUsage(MODEL, {
      input: body.usage.prompt_tokens - cached, cachedInput: cached, output: body.usage.completion_tokens,
    }) ?? 0
  }
  return body.choices?.[0]?.message?.content ?? ''
}

async function main(): Promise<void> {
  await loadEnvLocal()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY missing from .env.local')

  const config = resolvePipelineConfig(process.env as never)
  const compiled = new ElevenLabsPersonaCompiler(config).compile(nadia, DEFAULT_CALIBRATION)
  const steering = composeSteering({ persona: nadia, warmth: WARMTH })
  const repair = compileReinforcement(nadia)

  const base = [
    { role: 'system', content: compiled.llm.systemPrompt },
    {
      role: 'system',
      content:
        `When one of the listed exit conditions is genuinely met, finish your short final line and then write ${EXIT_SENTINEL} on the end. `
        + `It is silent bookkeeping and is removed before anything is spoken. Never say it, spell it, or refer to it, and never write it merely because the conversation paused.`,
    },
    ...LONG_HISTORY,
  ]

  const arms: { name: string; messages: { role: string; content: string }[] }[] = [
    { name: 'A  long history + directive', messages: [...base, { role: 'system', content: steering }] },
    { name: 'B  + stability repair', messages: [...base, { role: 'system', content: `${steering} ${repair}` }] },
    { name: 'C  long history, NO directive', messages: base },
  ]

  console.log(`History-length A/B — Nadia, ${LONG_HISTORY.length} turns, warmth ${WARMTH}, cap ${CAP} words`)
  console.log(`${MODEL} @ ${TEMPERATURE}, ${SAMPLES} samples per arm`)
  console.log(`directive: ${steering}\n`)

  for (const arm of arms) {
    const samples: Sample[] = []
    for (let i = 0; i < SAMPLES; i += 1) samples.push(measure(await ask(apiKey, arm.messages, compiled.llm.maxTokens)))
    const words = samples.map((s) => s.words)
    console.log(`${'='.repeat(74)}\n${arm.name}`)
    console.log(
      `  median ${String(median(words)).padStart(4)}w   p90 ${String(p90(words)).padStart(2)}w   worst ${String(Math.max(...words)).padStart(2)}w`
      + `   over-cap ${samples.filter((s) => s.overCap).length}/${samples.length}`
      + `   median sentences ${median(samples.map((s) => s.sentences))}`,
    )
    for (const s of samples.slice(0, 4)) console.log(`    ${String(s.words).padStart(2)}w  "${s.text}"`)
  }
  console.log(`\nProduction, same character, same pipeline: median 14w, p90 31w (45 real turns).`)
  console.log(`cost $${spend.toFixed(4)}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
