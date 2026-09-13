import 'server-only'

/**
 * The character, replying in a thread.
 *
 * ── THE FOUR WIRES ───────────────────────────────────────────────────────
 *
 * The old `lib/text/reply.ts` ran the same model and the same persona
 * contracts as the voice arm and still read as a character from two weeks
 * earlier, because four things the voice arm does were never connected to it.
 * All four are here:
 *
 *  1. **A seeded mood.** `compileInstructions` gets an rng derived from the
 *     thread, so her evening holds. See `./seed.ts` for what it was doing
 *     instead, and what that cost.
 *
 *  2. **Rationed standing orders.** `composeSteering` defaults
 *     `includeStanding` to true and the old caller passed nothing, so her
 *     agenda, the band's invitation and every gate she had earned arrived as
 *     the last system message before EVERY reply. `lib/warmth/steering.ts`'s
 *     header is the write-up: at maximum recency a permission stops reading as
 *     "you may" and starts reading as "do this now", and they compose — one
 *     real dating line performed four at once. The voice arm fixed it with
 *     `WarmthSession.statelessDirective`; this is the same rule, derived from
 *     the transcript rather than from a live object.
 *
 *  3. **`his`.** The old caller passed `composeSteering({ persona, warmth })`
 *     and nothing else, which inerts the whole of the reciprocity layer — the
 *     mirror cap, the question gate, the volunteer gate. That file exists
 *     because of exactly the complaint this section was built to answer.
 *
 *  4. **The ceilings.** The band says "five at the very most" and nothing in
 *     the old path checked. `capToBudget` is what makes a stated ceiling a real
 *     one, and `lib/warmth/bands.ts`'s header is a long argument about what
 *     happens otherwise.
 *
 * ── AND THE FIFTH THING, WHICH IS NOT A WIRE ─────────────────────────────
 *
 * Texting costs tokens and wrote NOTHING to `usage_ledger`, so it was invisible
 * to `spend_today_cents()` and bounded only by a 30/min rate limit — about
 * 43,200 messages a day. Rule 18: price what is known, bound what is not. Every
 * completion is priced off the usage the API actually returned, and a missing
 * usage payload is charged the operation's ceiling rather than zero.
 */

import { compileInstructions } from '@/lib/voice/openai/persona'
import { chatApiKey, completeChat, type ChatMessage } from '@/lib/voice/chat'
import { resolvePipelineConfig, type PipelineEnv } from '@/lib/voice/elevenlabs/config'
import { EXIT_SENTINEL, stripSentinel } from '@/lib/voice/elevenlabs/llm'
import { capToBudget } from '@/lib/voice/elevenlabs/truncate'
import { priceChatUsage } from '@/lib/voice/rates'
import { recordStandaloneUsage } from '@/lib/db/voice-session'
import { seededRandom } from '@/lib/voice/seed'
import type { Persona } from '@/lib/voice/types'
import { composeTextingSteering, type TextingSteeringContext } from '@/lib/warmth/texting/steering'
import { textingSentenceCapFor } from '@/lib/warmth/texting/bands'
import { textingMirrorCap } from '@/lib/warmth/texting/reciprocity'
import { isLeaving, type SceneExit } from '@/lib/warmth/leaving'
import { runMeter, type TextingMeterState } from './meter'
import { exchangesFrom, historyFrom, type TextingTurn } from './thread'

/**
 * What is true of the medium and not of the character.
 *
 * MUCH SHORTER THAN THE OLD TEXT MODE'S, and deliberately. That block had to
 * argue the character out of a contract that said "You are speaking out loud,
 * not writing" — two instructions fighting, which `lib/warmth/bands.ts` records
 * as producing a third answer nobody asked for. The texting contract now says
 * she is texting, in the cached prefix, so nothing here has to contradict it.
 *
 * What is left is the one fact the contract cannot carry: there is no clock.
 */
const TEXTING_MEDIUM = [
  '# This thread',
  'There is no clock on this conversation and nothing is being timed. Do not hurry it and do not wind it down early.',
].join('\n')

/**
 * Reply length. A ceiling on the GENERATION, not the rule.
 *
 * `capToBudget` is the rule. This is the runaway guard behind it, and it is
 * lower than the voice arm's 160 because the widest texting band is 24 words.
 */
const MAX_TOKENS = 120
const TEMPERATURE = 0.9

export interface TextingReplyInput {
  persona: Persona
  /** The thread so far, oldest first, INCLUDING the message just sent. */
  turns: readonly TextingTurn[]
  /** The meter, already folded. Passed rather than recomputed. */
  meter: TextingMeterState
  /** Where the thread is. Steering never argues with a committed exit. */
  exit: SceneExit
  /** The thread's identity. Seeds the mood. See `./seed.ts`. */
  seed: string
  /** Who is asking, for the ledger. */
  userId: string
  /** A one-off direction for this reply only (§16.3). Moderation's decline. */
  directive?: string
}

export type TextingReplyResult =
  | { ok: true; text: string; signalledExit: boolean; generationMs: number }
  | { ok: false; message: string }

function textModel(): string {
  return resolvePipelineConfig(process.env as unknown as PipelineEnv).llm.model
}

/**
 * The steering line for a thread at a given point.
 *
 * Exported so the rationing below can ask the same question about the previous
 * exchange without a second implementation of the context — two of those is how
 * a directive comes to be compared against a line that was never sent.
 */
export function steeringFor(
  persona: Persona,
  meter: TextingMeterState,
  exit: SceneExit,
  includeStanding: boolean,
): string {
  const context: TextingSteeringContext = {
    persona,
    warmth: meter.warmth,
    his: meter.his,
    posture: meter.posture,
    repairOpen: meter.repairOpen,
    firstExchange: meter.firstExchange,
    exit,
    includeStanding,
  }
  return composeTextingSteering(context)
}

/**
 * Re-send an unchanged direction at least this often, in exchanges.
 *
 * ── THE DEFECT THIS EXISTS FOR, FOUND BY THE AUDITION HARNESS ────────────
 *
 * Change-detection alone was implemented first, on the reasoning that
 * `WarmthSession.directiveIfChanged` is the rule the shipping voice arm runs.
 * It is HALF of that rule. The voice arm also carries `STEER_HEARTBEAT_TURNS`,
 * a floor under the detector, and without it a thread that stays inside one
 * band never hears a standing order again.
 *
 * Measured on the bench, `npm run text:audition -- immy warm 8`: warmth climbed
 * 38.2 → 56.9 without once leaving OPEN, so the composed line was identical
 * from the second exchange onward and **the standing orders rode on 1 turn of
 * 8**. She asked nothing in the whole thread. The player carried all of it, and
 * she read as a pure responder — which is the exact complaint this section was
 * built to answer.
 *
 * It bites harder here than on the voice arm, and the reason is the medium: a
 * three-minute rep crosses bands as warmth moves fast, so the line changes on
 * its own. A thread is twenty exchanges of slow drift inside one band.
 *
 * THREE, not the voice arm's four. An exchange is a whole round trip rather
 * than a turn, so three exchanges is roughly six messages — about the same
 * amount of conversation forty seconds of speech carries.
 */
export const TEXTING_STEER_HEARTBEAT = 3

/**
 * Whether the standing orders ride this turn.
 *
 * `WarmthSession.directiveIfChanged`'s rule, computed from the transcript
 * rather than from a live object: fold the meter back, compose what she would
 * have been told then, and send the orders when the direction is genuinely new
 * — or when the heartbeat above says she has gone long enough without one.
 *
 * A thread with one exchange in it has no previous line, so the orders go.
 * Her first direction is always new.
 */
export function standingRidesThisTurn(
  persona: Persona,
  turns: readonly TextingTurn[],
  meter: TextingMeterState,
  exit: SceneExit,
  seed: string,
): boolean {
  const exchanges = exchangesFrom(turns)
  if (exchanges.length <= 1) return true

  const now = steeringFor(persona, meter, exit, false)

  // Walk back over the heartbeat window. The orders ride if the line changed at
  // any point inside it — which covers both halves of the rule at once: a
  // change one exchange ago means it is new, and NO change across the whole
  // window means the heartbeat is due.
  let history = [...turns]
  for (let back = 0; back < TEXTING_STEER_HEARTBEAT; back += 1) {
    history = history.slice(0, turnsBeforeLastExchange(history))
    if (history.length === 0) return true
    const past = runMeter(persona, history, seed)
    // The CURRENT exit, deliberately: a thread that has just committed to
    // leaving has genuinely changed direction, and comparing against the old
    // exit would hide that.
    if (steeringFor(persona, past, exit, false) !== now) return true
  }
  return heartbeatDue(turns)
}

/**
 * The heartbeat, once the line has been shown not to have changed.
 *
 * Split out so the walk above reads as one question. It fires every
 * `TEXTING_STEER_HEARTBEAT` exchanges rather than on every turn past the
 * window, so a long steady thread gets a reminder at a cadence rather than a
 * reminder forever.
 */
function heartbeatDue(turns: readonly TextingTurn[]): boolean {
  return exchangesFrom(turns).length % TEXTING_STEER_HEARTBEAT === 0
}

/** The index at which the final exchange's first user message begins. */
function turnsBeforeLastExchange(turns: readonly TextingTurn[]): number {
  let index = turns.length
  // Walk back over his trailing messages, then stop at her last reply.
  while (index > 0 && turns[index - 1]?.speaker === 'user') index -= 1
  return index
}

/**
 * Her next message.
 *
 * `signalledExit` is the end-of-scene sentinel, stripped before the text is
 * stored. It is a HINT and never the decision — `lib/texting/exit.ts` owns
 * whether the thread is over, because a farewell the next turn can undo is not
 * a farewell.
 */
export async function textingReply(input: TextingReplyInput): Promise<TextingReplyResult> {
  const key = chatApiKey()
  if (!key.ok) return { ok: false, message: 'Texting is not configured yet.' }

  const { persona, meter, exit } = input
  const standing = standingRidesThisTurn(persona, input.turns, meter, exit, input.seed)

  const messages: ChatMessage[] = [
    // THE CACHED PREFIX. Seeded, so it is byte-identical for the life of the
    // thread and the provider's prompt cache can actually hold it.
    { role: 'system', content: compileInstructions(persona, {
      canEndScene: false,
      rng: seededRandom(input.seed),
    }) },
    { role: 'system', content: TEXTING_MEDIUM },
    {
      role: 'system',
      content:
        `When one of the listed exit conditions is genuinely met, finish your short final message and then write ${EXIT_SENTINEL} on the end. `
        + `It is silent bookkeeping and is removed before anything is shown. Never write it for any other reason, and never merely because the conversation paused.`,
    },
    ...historyFrom(input.turns),
    // The direction, last, so it is the most recent thing she reads — exactly
    // where both voice arms put it, and for the same reason.
    { role: 'system', content: steeringFor(persona, meter, exit, standing) },
    // After the steering, so a decline outranks the band direction it
    // contradicts.
    ...(input.directive ? [{ role: 'system' as const, content: input.directive }] : []),
  ]

  const startedAt = Date.now()
  const completion = await completeChat({
    apiKey: key.key,
    model: textModel(),
    messages,
    temperature: TEMPERATURE,
    maxTokens: MAX_TOKENS,
  })
  const generationMs = Date.now() - startedAt

  // RULE 18, AND THE HOLE THIS CLOSES. Priced off what the call reported; a
  // missing usage payload is charged the ceiling, never zero. Best-effort, like
  // every other write around a live conversation — losing the ledger row must
  // never cost the reply that is already generated.
  await meterSpend(input, completion.ok ? completion.text : null, generationMs)

  if (!completion.ok) {
    // Honest and short. His message is already saved, so "she did not answer"
    // is recoverable by sending again.
    return { ok: false, message: 'She did not answer. Try that again in a moment.' }
  }

  const raw = stripSentinel(completion.text)
  if (!raw.trim()) return { ok: false, message: 'She did not answer. Try that again in a moment.' }

  // THE CEILING, APPLIED. The band's, lowered by what he actually gave her.
  // `textingMirrorCap` can only ever narrow it — warmth decides how much she
  // gives, reciprocity decides whether this turn has earned it.
  const cap = isLeaving(exit)
    // A committed exit is a turn no band is steering, and enforcing a rule she
    // was not given would truncate the one message that has to land. Generous
    // rather than absent: a runaway still has to stop somewhere.
    ? UNSTEERED_TEXTING_WORDS
    : textingMirrorCap(meter.warmth, meter.his)
  const sentences = isLeaving(exit) ? UNSTEERED_TEXTING_SENTENCES : textingSentenceCapFor(meter.warmth)

  const text = capTextingReply(raw, cap, sentences)
  if (!text) return { ok: false, message: 'She did not answer. Try that again in a moment.' }

  return {
    ok: true,
    text,
    signalledExit: completion.text.includes(EXIT_SENTINEL),
    generationMs,
  }
}

/**
 * Her reply, inside the budget — with the newline dimension texting adds.
 *
 * ── THE DEFECT THIS EXISTS FOR, FOUND BY THE AUDITION HARNESS ────────────
 *
 * `capToBudget` splits on SENTENCE boundaries and always keeps the first whole
 * sentence, so that a low band can never produce silence and a single long
 * sentence still goes out intact. That is right for speech and it has a hole
 * here, and the hole is one the band table digs itself:
 *
 *   the warm bands ask for "no full stop at the end", because a trailing full
 *   stop is cold in a text message
 *
 *   so her reply frequently has NO terminal punctuation at all
 *
 *   so `capToBudget` sees one sentence, keeps it whole, and the word ceiling
 *   never binds
 *
 * Measured on the bench: a seventeen-word reply against a fourteen-word cap,
 * reported as `capped: false`. The ceiling was structurally unenforceable at
 * exactly the bands that ask for the punctuation that breaks it.
 *
 * ── WHY A WRAPPER AND NOT A FIX IN `capToBudget` ─────────────────────────
 *
 * `lib/voice/elevenlabs/truncate.ts` is read by both voice arms and its
 * behaviour is pinned by `lib/characterization/dating-arm.test.ts`. Teaching it
 * about newlines would change what it does to a spoken turn, and a spoken turn
 * has no newlines to be right or wrong about.
 *
 * So: a newline is a MESSAGE boundary here — which is what it actually is, and
 * the one boundary `capToBudget` was never built to see. Lines are kept whole,
 * the first is always kept (the same "never produce silence" rule), and the
 * budget is spent across them.
 */
export function capTextingReply(raw: string, cap: number, sentences: number): string {
  const lines = raw
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  const first = lines[0]
  if (first === undefined) return ''

  const kept = [capToBudget(first, cap, { sentences })]
  let spent = countWords(kept[0] ?? '')

  for (let i = 1; i < lines.length; i += 1) {
    const line = capToBudget(lines[i]!, Math.max(1, cap - spent), { sentences })
    const cost = countWords(line)
    if (!line || spent + cost > cap) break
    kept.push(line)
    spent += cost
  }

  return kept.join('\n').trim()
}

function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

/**
 * The ceiling for a turn no band is steering.
 *
 * Her last message is the one the whole thread ends on. Both numbers are
 * generous for the medium and a bug on nothing — the widest authored band is
 * 24 words and three sentences.
 */
export const UNSTEERED_TEXTING_WORDS = 35
export const UNSTEERED_TEXTING_SENTENCES = 4

async function meterSpend(
  input: TextingReplyInput,
  replyText: string | null,
  generationMs: number,
): Promise<void> {
  try {
    const model = textModel()
    // What is known: the prompt she was actually sent and the reply that came
    // back. What is not: the provider's own tokenisation, and whether any of
    // the prefix was served from cache. Both are bounded upward — no cache
    // discount is assumed, which over-charges the ledger rather than under.
    const promptChars = input.turns.reduce((sum, turn) => sum + turn.text.length, 0)
      + input.persona.contract.length
    const inputTokens = Math.ceil(promptChars / 4) + PROMPT_OVERHEAD_TOKENS
    const outputTokens = replyText === null ? MAX_TOKENS : Math.ceil(replyText.length / 4)
    const costUsd = priceChatUsage(model, { input: inputTokens, output: outputTokens }) ?? 0

    await recordStandaloneUsage({
      userId: input.userId,
      // One row per exchange. The key is the thread plus its turn count, so a
      // retry after a failed write cannot double-charge.
      operationId: `${input.seed}#${input.turns.length}`,
      kind: 'texting',
      provider: 'openai',
      model,
      costUsd,
      usage: { inputTokens, outputTokens, generationMs },
      metadata: { measurement: replyText === null ? 'reserved' : 'server' },
    })
  } catch {
    // See the header: best-effort around a live conversation.
  }
}

/**
 * The compiled blocks the transcript does not account for.
 *
 * The behaviour block, the craft rules, the exit conditions and the steering
 * line, measured at roughly 2,700 tokens across the four authored characters.
 * A constant rather than a second compilation: pricing a call is not worth
 * running the compiler twice, and the number is bounded upward.
 */
const PROMPT_OVERHEAD_TOKENS = 2_800
