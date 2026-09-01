/**
 * Audition a character — a whole rep, end to end, without a microphone.
 *
 *   npm run rep:audition                      # Tess, struggling player, 1 rep
 *   npm run rep:audition -- tess struggling 5
 *   npm run rep:audition -- nadia median 2
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Every defect in `docs/PERSONA-AUDIT.md` was found by reading the assembled
 * prompt, and reading cannot tell you whether a character is any good to talk
 * to. `db:rep` exercises the rep LIFECYCLE without a microphone; nothing
 * exercised the CHARACTER. So the one question the audit could not answer —
 * "is she enjoyable" — had no instrument at all, on the one part of the
 * product that can only be fixed by running it.
 *
 * This drives the real pipeline as far as it goes without audio:
 *
 *   · the system prompt is `compileInstructions`, the exact string the token
 *     route mints — persona, mood roll, derived block, absolute rules
 *   · warmth moves through the real `WarmthSession`, so the fast scorer, the
 *     temperament weighting, the affect axes and the posture are all live
 *   · the bracketed direction is `directiveIfChanged()`, injected only when it
 *     actually changes plus the heartbeat, exactly as the live session does
 *   · scene beats fire off the rep clock through `dueSceneBeat`
 *   · her turns go through `StabilityMeter`, at HER verbosity ceiling
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 *
 * **It is not the voice model.** A rep runs on `gpt-realtime-mini`
 * speech-to-speech; this runs the character on the chat model, because there
 * is no way to hold a scripted conversation with the realtime API from a
 * terminal. So it tests THE PROMPT, which is what the audit changed, and it
 * cannot tell you how she sounds, how she times a reply, or whether she talks
 * over you. A green run here is a necessary condition for §17's gate and not
 * that gate.
 *
 * **`canEndScene` is false**, because there is no tool channel here. The exit
 * prose differs from a live rep by that one paragraph.
 *
 * IT SPENDS MONEY. Two model calls per turn — hers and the player's — so a
 * five-rep run is a few hundred cheap completions. Run by hand, never from a
 * build, the same rule `hero:audio` follows.
 */

import { loadEnvLocal } from './env'
import { getPersonaEverAuthored } from '../lib/personas'
import { compileInstructions } from '../lib/voice/openai/persona'
import { WarmthSession } from '../lib/warmth/session'
import { bandFor } from '../lib/warmth/bands'
import { chatApiKey, completeChat, type ChatMessage } from '../lib/voice/chat'
import { StabilityMeter, DEFAULT_VERBOSITY_MEDIAN } from '../lib/metrics/stability'
import { dueSceneBeat, DATING_DURATION_MS, ARM_THRESHOLD } from '../lib/data/rep-rules'
import type { Persona, TranscriptTurn } from '../lib/voice/types'

const CHARACTER_MODEL = process.env.PIPELINE_LLM_MODEL?.trim() || 'gpt-4.1-mini'
/** The player is a fixture, not a character. A cheaper model is correct here. */
const PLAYER_MODEL = process.env.AUDITION_PLAYER_MODEL?.trim() || 'gpt-4.1-mini'

/** Roughly a three-minute rep. The real cap is the clock, not a turn count. */
const MAX_TURNS = 16
/** Seconds a turn takes, for the transcript timings the fast scorer reads. */
const SECONDS_PER_EXCHANGE = 11

/**
 * Who is at the microphone.
 *
 * `struggling` is the one that matters and the one nobody plays. It is the
 * case rung 1 exists for, it is the case the audit found broken, and it is the
 * last case a person tests when auditioning their own product — everybody
 * auditions as somebody who knows the mechanic.
 */
const PLAYERS: Record<string, string> = {
  struggling: [
    'You are a nervous man in his late twenties who has never done this before. You have just made yourself say something to a stranger and you are already regretting it.',
    'HARD LIMIT: never more than seven words in a reply. Most of your replies are two or three words.',
    'You never ask a question. You would not know what to ask.',
    'You agree and stop. "yeah", "no, same", "fair enough", "ha, right".',
    'You never tell a story and you never volunteer anything about yourself unless you are asked twice.',
    'Do not use the same filler phrase twice in a row.',
    'You are not rude and you are not weird. You are just out of your depth.',
  ].join(' '),
  median: [
    'You are a man in his late twenties who is a bit nervous but holding it together. This is not easy for you and you are doing it anyway.',
    'Reply in one short sentence, usually eight to fifteen words.',
    'MOST OF YOUR TURNS ARE STATEMENTS, NOT QUESTIONS. Never ask a question two turns running. Aim for roughly one question in every three or four turns — §07 targets three to eight in a whole three-minute rep, not one per turn.',
    'When you do not ask, react to what she said and add one small thing of your own.',
    'You sometimes miss what she is getting at. You do not banter well yet.',
  ].join(' '),
  competent: [
    'You are a man in his late twenties who is good at this without being slick.',
    'Reply in one or two sentences. You pick up on what she actually said and follow it.',
    'You ask open questions, you tease lightly, and you have your own opinions.',
    'You are never a salesman and you never push.',
  ].join(' '),
}

interface RepResult {
  index: number
  finalWarmth: number
  peakWarmth: number
  armed: boolean
  bands: string[]
  agentTurns: string[]
  medianAgentWords: number
  breaks: number
  drifts: number
  breakDetail: string[]
  distinctDirectives: number
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

async function say(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  key: string,
): Promise<string | null> {
  const completion = await completeChat({
    apiKey: key,
    model,
    messages,
    temperature,
    maxTokens: 160,
  })
  if (!completion.ok) {
    console.error(`  ! ${completion.error.message}`)
    return null
  }
  return completion.text
}

async function runRep(
  persona: Persona,
  playerBrief: string,
  index: number,
  key: string,
): Promise<RepResult | null> {
  // The exact prompt the token route mints, mood roll included.
  const instructions = compileInstructions(persona, { canEndScene: false })

  let clock = 0
  const session = new WarmthSession({
    persona,
    trajectory: persona.trajectory,
    scorer: null,
    nowSeconds: () => clock,
  })

  const meter = new StabilityMeter({
    // Hers, not the roster's. A character with her own band table is allowed a
    // longer median and must not be scored as broken for using it.
    verbosityMedian: persona.verbosityMedian ?? DEFAULT_VERBOSITY_MEDIAN,
  })

  const history: ChatMessage[] = []
  const agentTurns: string[] = []
  const bands: string[] = []
  const directives = new Set<string>()
  const breakDetail: string[] = []
  let peak = session.engine.warmth
  let beatsFired = 0

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    // ── his turn ────────────────────────────────────────────────────────
    const playerMessages: ChatMessage[] = [
      { role: 'system', content: playerBrief },
      {
        role: 'system',
        content:
          `You are talking to a woman you do not know, in this situation: ${persona.scene} `
          + 'Write only what you say out loud. No stage directions, no quotation marks, no narration. '
          + (turn === 0 ? 'This is your opening line. You have to start it.' : ''),
      },
      // Her side is the "user" from the player's point of view.
      ...history.map((message) => ({
        role: message.role === 'assistant' ? ('user' as const) : ('assistant' as const),
        content: message.content,
      })),
    ]
    const userText = await say(PLAYER_MODEL, playerMessages, 0.9, key)
    if (!userText) return null

    clock += SECONDS_PER_EXCHANGE
    const userTurn: TranscriptTurn = {
      speaker: 'user',
      text: userText,
      t_start: clock - 4,
      t_end: clock,
    }
    session.onUserTurn(userTurn)
    meter.observeUser()
    history.push({ role: 'user', content: userText })

    const warmth = session.engine.warmth
    peak = Math.max(peak, warmth)
    bands.push(bandFor(warmth))

    // ── what she is told, if it changed ─────────────────────────────────
    const steer: ChatMessage[] = []
    const directive = session.directiveIfChanged()
    if (directive) {
      directives.add(directive)
      steer.push({ role: 'system', content: directive })
    }

    // ── what the room does to her, on its own clock ─────────────────────
    const beat = dueSceneBeat({
      beats: persona.sceneBeats,
      elapsedFraction: (clock * 1000) / DATING_DURATION_MS,
      fired: beatsFired,
    })
    if (beat) {
      beatsFired += 1
      steer.push({ role: 'system', content: beat.direction })
    }

    // ── her turn ────────────────────────────────────────────────────────
    const agentText = await say(
      CHARACTER_MODEL,
      [{ role: 'system', content: instructions }, ...history, ...steer],
      0.9,
      key,
    )
    if (!agentText) return null

    history.push({ role: 'assistant', content: agentText })
    agentTurns.push(agentText)
    session.onAgentTurn({
      speaker: 'agent',
      text: agentText,
      t_start: clock,
      t_end: clock + 3,
    })
    for (const hit of meter.observe(agentText, clock)) {
      breakDetail.push(`${hit.severity} · ${hit.rule} · ${hit.match}`)
    }
    clock += 3

    // Full turns, not truncated. The whole reason this harness exists is that
    // a summary statistic cannot tell you whether somebody is good company.
    process.stdout.write(
      `\n  ${String(turn + 1).padStart(2)}  warmth ${warmth.toFixed(0)} ${bandFor(warmth)}\n`
        + `      HIM  ${userText}\n`
        + `      HER  ${agentText}   [${words(agentText)}w]\n`,
    )
    for (const line of steer) process.stdout.write(`      →    ${line.content}\n`)
  }

  const stats = meter.stats(clock)
  return {
    index,
    finalWarmth: session.engine.warmth,
    peakWarmth: peak,
    armed: peak >= ARM_THRESHOLD,
    bands,
    agentTurns,
    medianAgentWords: median(agentTurns.map(words)),
    breaks: stats.breaks,
    drifts: stats.drifts,
    breakDetail,
    distinctDirectives: directives.size,
  }
}

async function main(): Promise<void> {
  await loadEnvLocal()

  const [slugArg, playerArg, countArg] = process.argv.slice(2)
  const slug = slugArg ?? 'tess'
  const player = playerArg ?? 'struggling'
  const reps = Number(countArg ?? 1)

  const persona = getPersonaEverAuthored(slug)
  if (!persona) {
    console.error(`No persona "${slug}".`)
    process.exit(1)
  }
  const brief = PLAYERS[player]
  if (!brief) {
    console.error(`No player "${player}". One of: ${Object.keys(PLAYERS).join(', ')}`)
    process.exit(1)
  }

  const key = chatApiKey()
  if (!key.ok) {
    console.error(key.error.message)
    process.exit(1)
  }

  console.log(
    `\nAuditioning ${persona.name} (rung ${persona.level}) against a ${player} player.`
      + `\nCharacter: ${CHARACTER_MODEL} · player: ${PLAYER_MODEL} · ${reps} rep(s) of ${MAX_TURNS} turns.`
      + `\nThis is the prompt, not the voice — see the note at the top of this file.\n`,
  )

  const results: RepResult[] = []
  for (let i = 1; i <= reps; i += 1) {
    console.log(`── rep ${i} ─────────────────────────────────────────────────────`)
    const result = await runRep(persona, brief, i, key.key)
    if (!result) {
      console.error('  rep aborted.')
      continue
    }
    results.push(result)
    console.log(
      `  → final ${result.finalWarmth.toFixed(1)} · peak ${result.peakWarmth.toFixed(1)}`
        + ` · ${result.armed ? 'ARMED' : 'not armed'} · median ${result.medianAgentWords} words`
        + ` · ${result.breaks} breaks / ${result.drifts} drifts`
        + ` · ${result.distinctDirectives} distinct directions\n`,
    )
    for (const detail of result.breakDetail) console.log(`     ${detail}`)
  }

  if (results.length === 0) {
    console.error('Nothing completed.')
    process.exit(1)
  }

  // The M0 gate is breaks per five minutes; these reps are about three.
  const minutes = (results.length * MAX_TURNS * (SECONDS_PER_EXCHANGE + 3)) / 60
  const totalBreaks = results.reduce((sum, result) => sum + result.breaks, 0)
  console.log('══ summary ══════════════════════════════════════════════════════')
  console.log(`  reps                 ${results.length}`)
  console.log(`  armed                ${results.filter((r) => r.armed).length}/${results.length}`)
  console.log(
    `  median agent words   ${median(results.map((r) => r.medianAgentWords))}`,
  )
  console.log(
    `  distinct directions  ${median(results.map((r) => r.distinctDirectives))} per rep (median)`,
  )
  console.log(`  breaks / 5 min       ${((totalBreaks / minutes) * 5).toFixed(2)}  (gate < 0.5)`)
  console.log(`  drifts               ${results.reduce((sum, r) => sum + r.drifts, 0)}`)
  console.log(
    `  bands visited        ${[...new Set(results.flatMap((r) => r.bands))].join(', ')}\n`,
  )
}

void main()
