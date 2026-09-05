/**
 * Slow turn scoring — async, model-backed, never in the hot path.
 *
 * Judges a PAIR: his line and her answer to it. Round 6 scored his line alone
 * and our ASR turned "Sherlock Holmes" into "cello combs", so the scorer
 * charged him -3 for being "confusing" while the character had understood him
 * perfectly and answered about Sherlock. Her reply is the cheapest available
 * check on whether the transcript is trustworthy: if she answered coherently,
 * he was coherent, whatever the ASR produced.
 *
 * RESPONSIBILITIES ARE DISJOINT (§2c). This path owns intent and intimacy and
 * nothing else. It must never score length, question count, callbacks or
 * filler — the fast path already measures all of those deterministically, and
 * when both paths graded the same thing their disagreement was pure noise:
 * "Any other recommendations?" scored fast -1 / slow +2, and
 * "Ja, why, you don't like Dexter?" scored fast +5 / slow -2.
 */

import type { WarmthBand } from './bands'

export interface SlowScore {
  /**
   * How personal the turn is, on an ABSOLUTE topic scale (§2d). Not adjusted
   * for what has been earned — that comparison belongs to the engine, and
   * folding it in here would make the boundary rule double-count itself.
   */
  intimacy: number
  /** How the turn was meant, -10 hostile to +10 genuinely warm. */
  intent: number
  /** The exact words that drove the judgement. Grounding, not decoration. */
  quote: string
  reason: string
}

export interface SlowScoreRequest {
  /** His line. */
  userText: string
  /** Her answer TO THAT LINE. Null only if the session ended first. */
  agentReply: string | null
  /** Her preceding line, for context on what he was responding to. */
  agentPrior: string | null
  /** Current warmth. Context for intent; must not move intimacy. */
  warmth: number
  band: WarmthBand
  personaName: string
}

export interface SlowScorer {
  /** Resolves null when the score is unusable. Must never throw. */
  score(request: SlowScoreRequest, signal: AbortSignal): Promise<SlowScore | null>
}

/**
 * THE CREEPINESS RULE.
 *
 * We do not classify "creepy". Creepiness is not a property of a sentence — it
 * is a relationship between what was said and what has been earned. "Do you
 * have a boyfriend?" is a boundary violation at warmth 10 and flirting at
 * warmth 70, and any classifier judging the sentence alone must get one of
 * those two cases wrong.
 *
 * This only works if intimacy is absolute. Round 6 returned 0 on eight of
 * thirteen scored turns and 10 on four more — 92% of judgements collapsed onto
 * two values — so `intimacy - warmth` was never once positive and this rule
 * did not fire in a single session. The anchored scale in the route prompt
 * exists to spread that distribution.
 */
export type OverreachVerdict = 'none' | 'too-much-too-soon' | 'boundary-violation'

export interface OverreachResult {
  verdict: OverreachVerdict
  overreach: number
  /** Raw delta this verdict imposes, before gain/decay. Null when none. */
  delta: number | null
}

export function classifyOverreach(intimacy: number, warmth: number): OverreachResult {
  const overreach = intimacy - warmth

  if (overreach > 30) return { verdict: 'boundary-violation', overreach, delta: -15 }
  if (overreach > 15) return { verdict: 'too-much-too-soon', overreach, delta: -6 }
  return { verdict: 'none', overreach, delta: null }
}

export function clampSlowScore(raw: unknown): SlowScore | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const intimacy = value['intimacy']
  const intent = value['intent']
  if (typeof intimacy !== 'number' || !Number.isFinite(intimacy)) return null
  if (typeof intent !== 'number' || !Number.isFinite(intent)) return null
  return {
    intimacy: Math.max(0, Math.min(100, intimacy)),
    intent: Math.max(-10, Math.min(10, intent)),
    quote: typeof value['quote'] === 'string' ? value['quote'].slice(0, 200) : '',
    reason: typeof value['reason'] === 'string' ? value['reason'].slice(0, 200) : '',
  }
}

/** Talks to our own route, never to a provider directly. */
export class HttpSlowScorer implements SlowScorer {
  constructor(
    private readonly endpoint = '/api/warmth/score',
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    /** Read at call time: the saved session may finish opening after setup. */
    private readonly context?: () => { sessionId?: string },
  ) {}

  async score(request: SlowScoreRequest, signal: AbortSignal): Promise<SlowScore | null> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, ...this.context?.() }),
        signal,
      })
      if (!response.ok) return null
      return clampSlowScore(await response.json())
    } catch {
      // Aborted, offline, malformed — all the same non-event.
      return null
    }
  }
}
