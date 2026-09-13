/**
 * Audition a texting character — a whole thread, without a keyboard.
 *
 *   npm run text:audition                       # Immy, warm player, 12 messages
 *   npm run text:audition -- noor dead_ender 14
 *   npm run text:audition -- wren recoverer 18
 *   npm run text:audition -- cleo hostile 6
 *
 * IT SPENDS MONEY. A twelve-message thread is roughly a penny (`TEXTING-PLAN.md`
 * §14), so there is no excuse for not running it — which is exactly the point.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * `INTERVIEW-TECHNICAL-PLAN.md` §13.3 is the lesson and it cost a week: the
 * suite was green, none of it had been heard out loud, and when the audition
 * harness was finally built it found five defects that were invisible at a
 * desk. Two of them generalise, and both are live risks here:
 *
 *   a rule correct on one arm can be SILENTLY WRONG on the other. The 40%
 *   question quota gagged an interviewer on four turns in five, and the
 *   directive was ignored every time — which teaches the model that the
 *   bracketed line is optional, and the bracketed line is the only thing that
 *   owns reply length.
 *
 *   a lexical heuristic tuned for short turns misfires on long ones, and vice
 *   versa. Texting messages are shorter and more fragmentary than anything
 *   either existing arm was tuned against.
 *
 * This drives the real path as far as it goes:
 *
 *   · the system prompt is `compileInstructions` with the thread's own seeded
 *     rng — the exact string `textingReply` sends, mood and all
 *   · the meter is the real `runMeter`: `scoreFast`, `WarmthEngine`, the
 *     temperament weighting, the affect axes and the posture, all live
 *   · the bracketed direction is `steeringFor` at the real cadence, so the
 *     standing orders ride only when the direction is genuinely new
 *   · her reply is trimmed by the real `capToBudget` at the mirror cap
 *   · the exit is the real `nextExit`, so a thread that fades here fades for a
 *     customer — and a faded thread generates nothing, which the log shows
 *   · the presence schedule is the real `scheduleFor`, printed rather than
 *     waited on
 *
 * ── THE ARCHETYPES, AND WHY `recoverer` IS THE GATE ──────────────────────
 *
 * Five players. Four of them prove a behaviour works; `recoverer` proves the
 * one thing the product owner actually asked for — that a cooled thread can be
 * won back. If the meter cannot climb out of GUARDED inside a thread, the
 * section does not do what it says, however green the suite is.
 */

import { chatApiKey, completeChat, type ChatMessage } from '../lib/voice/chat'
import { resolvePipelineConfig, type PipelineEnv } from '../lib/voice/elevenlabs/config'
import { getTextingPersona, TEXTING_SLUGS } from '../lib/personas/texting'
import { bandFor } from '../lib/warmth/bands'
import { isPressuring } from '../lib/warmth/texting/reciprocity'
import { nextExit, repliesAtAll, warmExitBudget, type SceneExit, type TextingEnding } from '../lib/texting/exit'
import { runMeter } from '../lib/texting/meter'
import { scheduleFor } from '../lib/texting/presence'
import { steeringFor, standingRidesThisTurn } from '../lib/texting/reply'
import { textingSentenceCapFor } from '../lib/warmth/texting/bands'
import { textingMirrorCap } from '../lib/warmth/texting/reciprocity'
import { capToBudget } from '../lib/voice/elevenlabs/truncate'
import { compileInstructions } from '../lib/voice/openai/persona'
import { seededRandom } from '../lib/voice/seed'
import { EXIT_SENTINEL, stripSentinel } from '../lib/voice/elevenlabs/llm'
import { exchangesFrom, historyFrom, type TextingTurn } from '../lib/texting/thread'

type Archetype = 'warm' | 'dead_ender' | 'hostile' | 'recoverer' | 'double_texter'

const PLAYERS: Record<Archetype, string> = {
  warm: [
    'You are a man in his late twenties texting somebody he met recently and likes.',
    'Lower case, short messages, one at a time. You react to what she actually said and add something of your own.',
    'You ask a real question roughly one message in three, never two running.',
    'You are never a salesman and you never push.',
  ].join(' '),
  dead_ender: [
    'You are a man texting somebody, and you are not putting any effort in.',
    'Reply in one or two words almost every time: "yeah", "ok", "sure", "lol", "nice".',
    'Never ask anything. Never add anything of your own. Do not be rude, just empty.',
  ].join(' '),
  hostile: [
    'You are a man who has decided this conversation is a waste of his time and is being unpleasant about it.',
    'Short, contemptuous messages. Tell her she is boring, tell her to leave you alone.',
    'Never apologise and never soften it.',
  ].join(' '),
  recoverer: [
    'You are a man texting somebody he met recently. THIS IS A TWO-PART PERFORMANCE.',
    'For your first five messages you are distracted and lazy: one or two word replies, no questions, nothing of your own.',
    'From your sixth message onward you snap out of it completely. You apologise once, briefly and without grovelling, and then you are genuinely engaged — real questions, your own opinions, and you pick up things she said earlier.',
    'Lower case, short messages.',
  ].join(' '),
  double_texter: [
    'You are a man texting somebody and you are slightly too keen.',
    'You often send two or three short messages in a row instead of one.',
    'PUT EACH SEPARATE MESSAGE ON ITS OWN LINE. Two or three lines most turns.',
    'Lower case. Nothing rude, just too much.',
  ].join(' '),
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

async function say(model: string, messages: ChatMessage[], key: string, maxTokens = 120): Promise<string | null> {
  const completion = await completeChat({ apiKey: key, model, messages, temperature: 0.9, maxTokens })
  if (!completion.ok) {
    console.error(`  ! ${completion.error.message}`)
    return null
  }
  return completion.text
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const [slugArg, playerArg, countArg] = process.argv.slice(2)
  const slug = slugArg ?? 'immy'
  const archetype = (playerArg ?? 'warm') as Archetype
  const messages = Math.max(2, Math.min(40, Number(countArg ?? 12)))

  const persona = getTextingPersona(slug)
  if (!persona) {
    console.error(`No such texting character: ${slug}. Try one of ${TEXTING_SLUGS.join(', ')}.`)
    process.exit(1)
  }
  if (!PLAYERS[archetype]) {
    console.error(`No such player: ${archetype}. Try one of ${Object.keys(PLAYERS).join(', ')}.`)
    process.exit(1)
  }

  const key = chatApiKey()
  if (!key.ok) {
    console.error(key.error.message)
    process.exit(1)
  }
  const model = resolvePipelineConfig(process.env as unknown as PipelineEnv).llm.model
  const seed = `audition:${slug}:${archetype}:${Date.now()}`

  console.log(`\n${persona.name.toUpperCase()} · rung ${persona.level} · ${archetype} · ${messages} messages`)
  console.log(`  ${persona.premise}`)
  console.log(`  ${persona.scene}\n`)

  let turns: TextingTurn[] = []
  let exit: SceneExit = 'present'
  let ending: TextingEnding | null = null
  const budget = warmExitBudget(seed)
  const agentWords: number[] = []
  const directives = new Set<string>()
  let capped = 0
  let standingSent = 0

  const contract = compileInstructions(persona, { canEndScene: false, rng: seededRandom(seed) })

  for (let i = 0; i < messages && ending === null; i += 1) {
    // HIS TURN. The player model sees only what a person would.
    const hisHistory = turns.map((turn) => ({
      role: turn.speaker === 'user' ? ('assistant' as const) : ('user' as const),
      content: turn.text,
    }))
    const his = await say(model, [
      { role: 'system', content: PLAYERS[archetype] },
      { role: 'system', content: `You are texting ${persona.name}. ${persona.premise} Send one message. No quotation marks, no preamble.` },
      ...hisHistory,
    ], key.key, 90)
    if (his === null) break

    /**
     * HIS MESSAGES, PLURAL.
     *
     * A newline from the player model is a separate message, which is the one
     * thing speech cannot do and therefore the one thing the dating harness
     * never had to model. Without this the `double_texter` archetype was
     * unexercisable — every exchange carried exactly one message, so
     * `TextingTurnShape.messages` was always 1 and `isPressuring` could never
     * fire on the bench.
     */
    const hisMessages = his
      .trim()
      .split(/\r?\n+/)
      .map((line) => line.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
      .slice(0, 4)
    if (hisMessages.length === 0) break

    for (const message of hisMessages) {
      turns = [...turns, { speaker: 'user', text: message, at: new Date().toISOString() }]
      console.log(`  him   ${message}`)
    }

    // THE REAL METER, THE REAL EXIT.
    const meter = runMeter(persona, turns, seed)
    const lastExchange = exchangesFrom(turns).at(-1)
    const lastUserText = (lastExchange?.user ?? []).map((turn) => turn.text).join('\n')
    const verdict = nextExit({
      current: exit,
      warmth: meter.warmth,
      deadEndStreak: meter.deadEndStreak,
      completedExchanges: meter.completedExchanges,
      lastUserText,
      budget,
    })
    exit = verdict.exit
    ending = verdict.ending

    if (!repliesAtAll(exit, ending)) {
      console.log(`  her   ·· left on read ··   [${bandFor(meter.warmth)} ${meter.warmth.toFixed(1)}]`)
      break
    }

    // THE REAL DIRECTION, AT THE REAL CADENCE.
    const standing = standingRidesThisTurn(persona, turns, meter, exit, seed)
    if (standing) standingSent += 1
    const directive = steeringFor(persona, meter, exit, standing)
    directives.add(directive)

    const generated = await say(model, [
      { role: 'system', content: contract },
      { role: 'system', content: '# This thread\nThere is no clock on this conversation and nothing is being timed. Do not hurry it and do not wind it down early.' },
      { role: 'system', content: `When one of the listed exit conditions is genuinely met, finish your short final message and then write ${EXIT_SENTINEL} on the end.` },
      ...historyFrom(turns),
      { role: 'system', content: directive },
    ], key.key)
    if (generated === null) break

    const raw = stripSentinel(generated).trim()
    const cap = textingMirrorCap(meter.warmth, meter.his)
    const trimmed = capToBudget(raw, cap, { sentences: textingSentenceCapFor(meter.warmth) }).trim()
    if (trimmed !== raw) capped += 1

    const schedule = scheduleFor({
      warmth: meter.warmth,
      replyText: trimmed,
      pressuring: isPressuring(meter.warmth, meter.his),
      generationMs: 900,
      seed: `${seed}#${i}`,
    })

    agentWords.push(words(trimmed))
    turns = [...turns, { speaker: 'persona', text: trimmed, at: new Date().toISOString() }]

    const flags = [
      standing ? 'standing' : '',
      trimmed !== raw ? `capped ${words(raw)}→${words(trimmed)}` : '',
      exit !== 'present' ? exit : '',
      isPressuring(meter.warmth, meter.his) ? 'pressured' : '',
    ].filter(Boolean).join(' ')

    console.log(`  her   ${trimmed}`)
    console.log(
      `        [${bandFor(meter.warmth)} ${meter.warmth.toFixed(1)}  cap ${cap}  `
      + `seen +${(schedule.seenAfterMs / 1000).toFixed(1)}s  reply +${(schedule.revealAfterMs / 1000).toFixed(1)}s${flags ? '  ' + flags : ''}]`,
    )

    if (generated.includes(EXIT_SENTINEL)) {
      const forward = nextExit({
        current: exit, warmth: meter.warmth, deadEndStreak: meter.deadEndStreak,
        completedExchanges: meter.completedExchanges, lastUserText, budget, modelSignalled: true,
      })
      exit = forward.exit
      ending = forward.ending
    }
  }

  const final = runMeter(persona, turns, seed)
  console.log('\n  ──────────────────────────────────────────────')
  console.log(`  ending           ${ending ?? 'still going'}`)
  console.log(`  warmth           opened ${(final.events[0]?.warmthBefore ?? 0).toFixed(1)} · closed ${final.warmth.toFixed(1)} · band ${bandFor(final.warmth)}`)
  console.log(`  her median words ${median(agentWords)}  (band ceiling ${textingMirrorCap(final.warmth, final.his)})`)
  console.log(`  capped turns     ${capped} of ${agentWords.length}`)
  console.log(`  directions       ${directives.size} distinct, standing orders on ${standingSent} of ${agentWords.length} turns`)
  console.log(`  exchanges        ${final.completedExchanges} of a ${budget}-exchange budget`)
  console.log(`  dead-end streak  ${final.deadEndStreak}`)

  // THE ONE THAT MATTERS. See the header.
  if (archetype === 'recoverer') {
    const trough = Math.min(...final.events.map((event) => event.warmthAfter))
    console.log(`\n  RECOVERY         trough ${trough.toFixed(1)} → closed ${final.warmth.toFixed(1)} (${(final.warmth - trough).toFixed(1)} points back)`)
    if (final.warmth <= trough + 2) {
      console.log('  ⚠ she did not come back. A cooled thread that cannot be won back is the')
      console.log('    one thing this section promises and does not do.')
    }
  }
  console.log()
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
