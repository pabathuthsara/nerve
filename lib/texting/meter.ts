/**
 * The texting meter.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * The old text mode's entire meter was this:
 *
 *     const raised = trajectory.start + Math.max(0, userTurns) * trajectory.gain
 *
 * Warmth as a function of HOW MANY TIMES HE HAD TYPED and nothing else. Charm
 * and abuse raised it at identical rates, which is why a thread of sustained
 * hostility was answered with sustained engagement: she was not ignoring the
 * signal, there was no signal. A mode whose whole subject is reading somebody's
 * interest had no representation of it.
 *
 * The reason given at the time was honest and is no longer true. `lib/text/
 * warmth.ts` argued that the local scorer "reads pause length, filler rate and
 * hesitation off a spoken turn's timings" — which was true of TWO of
 * `scoreFast`'s eight reasons. The other six (open question, engaged length,
 * callback, dead end, dead-end streak, contempt) are lexical facts about a
 * string and work verbatim on a typed message. And two files that did not exist
 * when text mode was written now do exactly this job: `turn-kind.ts` classifies
 * a turn six ways with no model and no timings, and `leaving.ts` holds a
 * monotonic scene state.
 *
 * ── WHY IT CALLS `scoreFast` RATHER THAN RESTATING IT ────────────────────
 *
 * A second point table would drift. The dating table has been repriced twice on
 * measured evidence — dead ends from -3/-4 to -6/-8, contempt added at -10 —
 * and a copy here would have missed both. So this file calls the real scorer
 * and neutralises the two timing-dependent reasons **by construction**:
 *
 *   hesitation    `gapSeconds: null`, which is already the honest answer for a
 *                 typed turn and is the documented way to disable it
 *   filler-rate   a sentinel duration that puts the rate permanently below its
 *                 own threshold. See `FILLER_SENTINEL_SECONDS`.
 *
 * Both are asserted in `meter.test.ts`: neither reason may EVER appear in a
 * texting score, for any input. That is the guard that makes the sentinel
 * honest rather than a fabricated timing.
 *
 * ── AND IT IS A PURE FOLD, NOT A STORED OBJECT ───────────────────────────
 *
 * `WarmthSession` keeps a live engine because a rep is a process with a
 * connection attached. A thread is not: it is a row, read fresh on every
 * message, possibly on another device. So the meter is recomputed from the
 * transcript every time — deterministic, seeded from the thread, and with
 * nothing stored that a schema change could orphan or a bug could corrupt.
 *
 * The cost is one lexical pass over at most 120 turns, with no network and no
 * model, which does not appear in a latency measurement.
 */

import {
  scoreFast,
  type FastScore,
  type FastScoreContext,
} from '@/lib/warmth/fast'
import { WarmthEngine, type WarmthEvent } from '@/lib/warmth/engine'
import { bandFor, type WarmthBand } from '@/lib/warmth/bands'
import { asksSomething, classifyUserTurn, deadEndFrom } from '@/lib/warmth/turn-kind'
import { seededRandom } from '@/lib/voice/seed'
import type { Persona, TranscriptTurn } from '@/lib/voice/types'
import type { Posture } from '@/lib/warmth/affect'
import type { TextingTurnShape } from '@/lib/warmth/texting/reciprocity'
import { exchangesFrom, type Exchange, type TextingTurn } from './thread'
import { TEXTING_WARMTH_CEILING } from './warmth'

/**
 * The synthetic turn duration that makes `filler-rate` unreachable.
 *
 * `fillerRatePerMinute` is `count / max(0.5, t_end - t_start) * 60` and the
 * reason fires above 5/min. A message is capped at 500 characters, so it cannot
 * contain more than ~125 filler tokens even if it were nothing else. At ten
 * hours the highest rate any legal message can produce is 125/36000*60 = 0.2,
 * which is forty times below the threshold.
 *
 * This is NOT a claim about how long he took to type. It is the value that
 * switches a reason off, chosen so that no input can switch it back on, and
 * `meter.test.ts` asserts the outcome rather than trusting the arithmetic.
 */
export const FILLER_SENTINEL_SECONDS = 36_000

/** How many of his messages in a row are folded into one scored turn. */
export const MAX_FOLDED_MESSAGES = 8

export interface TextingMeterState {
  /** Interest. The number the band is read off. */
  warmth: number
  comfort: number
  liking: number
  band: WarmthBand
  posture: Posture
  repairOpen: boolean
  /** Every applied turn, oldest first. Read by the debrief. */
  events: WarmthEvent[]
  /** What he did in the most recent exchange, or null if he has not spoken. */
  his: TextingTurnShape | null
  /** The most recent exchange is his first. */
  firstExchange: boolean
  /** Dead ends immediately preceding — and including — the latest turn. */
  deadEndStreak: number
  /** Completed exchanges: his messages AND her reply. */
  completedExchanges: number
  /** His messages, in total. The unit the allowance is not counted in. */
  userMessages: number
  /** The steering line composed for the exchange before this one, or null. */
  previousWarmth: number | null
}

/**
 * His turn, as the scorer sees it.
 *
 * WORDS IS THE BEST SINGLE MESSAGE, NEVER THE SUM. Summing would mean five
 * "hey"s is a twenty-five word turn, and the mirror cap would hand him a
 * paragraph back for volume. He gets credit for the best thing he actually
 * said. See `lib/warmth/texting/reciprocity.ts`.
 */
export function shapeOf(
  messages: readonly TextingTurn[],
  score: FastScore,
  bestWords: number,
): TextingTurnShape {
  return {
    words: bestWords,
    askedQuestion: messages.some((message) => asksSomething(message.text)),
    disclosed: bestWords >= 8,
    deadEnd: score.deadEnd,
    messages: Math.min(messages.length, MAX_FOLDED_MESSAGES),
  }
}

/**
 * Score one folded turn.
 *
 * The messages are joined with a newline rather than a space so that
 * `capToBudget`'s sentence splitting and the callback search both see them as
 * the separate utterances they are.
 */
export function scoreTypedTurn(
  messages: readonly TextingTurn[],
  context: Omit<FastScoreContext, 'gapSeconds'>,
): FastScore {
  const text = messages.map((message) => message.text).join('\n')
  const turn: TranscriptTurn = {
    speaker: 'user',
    text,
    t_start: 0,
    t_end: FILLER_SENTINEL_SECONDS,
  }
  return scoreFast(turn, { ...context, gapSeconds: null })
}

/** Her turns so far, as the callback search wants them. */
function agentTurnsFrom(turns: readonly TextingTurn[]): TranscriptTurn[] {
  return turns
    .filter((turn) => turn.speaker === 'persona')
    .map((turn) => ({ speaker: 'agent' as const, text: turn.text, t_start: 0, t_end: 0 }))
}

function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

/**
 * The whole meter, folded over a thread.
 *
 * `seed` is the thread's identity — see `lib/texting/seed.ts`. It drives the
 * engine's opening jitter, so the same thread replays to the same numbers on
 * every device and on every read, and a different thread against the same
 * character opens somewhere else.
 */
export function runMeter(
  persona: Persona,
  turns: readonly TextingTurn[],
  seed: string,
): TextingMeterState {
  const engine = new WarmthEngine({
    trajectory: persona.trajectory,
    personality: persona.personality,
    postureMode: persona.postureMode ?? 'relative',
    rng: seededRandom(seed),
  })

  const exchanges = exchangesFrom(turns)
  let his: TextingTurnShape | null = null
  let deadEndStreak = 0
  let completed = 0
  let userMessages = 0
  let previousWarmth: number | null = null
  let priorTurns: TextingTurn[] = []

  exchanges.forEach((exchange: Exchange, index) => {
    const opening = index === 0
    const herLast = lastPersonaTurn(priorTurns)
    const bestWords = exchange.user.reduce(
      (widest, message) => Math.max(widest, wordCount(message.text)),
      0,
    )

    const score = scoreTypedTurn(exchange.user, {
      level: persona.level,
      personality: persona.personality,
      agentTurns: agentTurnsFrom(priorTurns),
      precedingDeadEnds: deadEndStreak,
      openingTurn: opening,
      ...(herLast ? { herLastTurnAsked: asksSomething(herLast.text) } : {}),
    })

    previousWarmth = engine.warmth
    engine.applyFast(
      score,
      Date.parse(exchange.user[0]?.at ?? '') || index,
      exchange.user.map((message) => message.text).join('\n'),
    )

    his = shapeOf(exchange.user, score, bestWords)
    deadEndStreak = score.deadEnd ? deadEndStreak + 1 : 0
    userMessages += exchange.user.length
    if (exchange.reply) completed += 1

    priorTurns = [...priorTurns, ...exchange.user, ...(exchange.reply ? [exchange.reply] : [])]
  })

  // THE CEILING IS APPLIED ON THE WAY OUT, NOT INSIDE THE ENGINE.
  //
  // `trajectory.sessionCeiling` is the character's own and belongs to her;
  // this one belongs to the SECTION, and lowering a persona's trajectory to
  // express it would mean a texting character whose authored curve is a lie.
  // See `./warmth.ts` for the argument the ceiling itself rests on.
  const warmth = Math.min(engine.warmth, TEXTING_WARMTH_CEILING)

  return {
    warmth,
    comfort: engine.comfort,
    liking: engine.liking,
    band: bandFor(warmth),
    posture: engine.posture,
    repairOpen: engine.repairOpen,
    events: [...engine.events],
    his,
    firstExchange: exchanges.length <= 1,
    deadEndStreak,
    completedExchanges: completed,
    userMessages,
    previousWarmth,
  }
}

function lastPersonaTurn(turns: readonly TextingTurn[]): TextingTurn | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i]
    if (turn?.speaker === 'persona') return turn
  }
  return null
}

/** Re-exported for callers that need the classifier's own verdict. */
export { classifyUserTurn, deadEndFrom }
