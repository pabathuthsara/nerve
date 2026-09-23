/**
 * Was his line meant to be funny? (PERSONA-REALISM-REPORT R3, 5.4.)
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * The laugh is a rationed permission (`WarmthSession.decideExpression`) and
 * the writer is told "If something he just said is actually funny, you may
 * open with [laughs]. Only then." The first auditions on 23 September showed
 * what a permission at maximum recency always does: she used it. Nadia laughed
 * three times in sixteen turns, twice at lines that were ordinary questions,
 * and a laugh at nothing is the sycophantic tell the whole product exists to
 * remove — worse than no laugh, because laughter is the interest signal a
 * listener trusts most (Grammer & Eibl-Eibesfeldt 1990).
 *
 * The report's 5.4 asked for a `funny` judgement "so she laughs at jokes and
 * not at random", and the live judge cannot give it in time: it scores the PAIR
 * after her reply. So this is the same question asked of a very small model,
 * about his line alone, in PARALLEL with the writer — which takes longer — and
 * the pipeline keeps her `[laughs]` only if the answer is yes. No added latency
 * on any turn where the writer is slower than this, which is every turn
 * measured; about a hundredth of a cent when it runs, and it runs only on a
 * turn the session already permitted a laugh on.
 *
 * Fails CLOSED: an error, a timeout or an unreadable answer is "not funny",
 * and the line ships without the laugh. Losing a laugh costs a beat; a laugh at
 * nothing costs the character.
 */

import { priceChatUsage } from '../rates'
import { chatApiKey } from '../chat'

export const HUMOUR_MODEL = 'gpt-4.1-nano'

/** A bound for the reservation: a short prompt and one output token. */
export const HUMOUR_MAX_INPUT_TOKENS = 600

const SYSTEM = [
  'You judge one line from a man talking to a woman he has just met.',
  'Answer with exactly one letter.',
  'Y if HIS line was plainly meant to be funny: a joke, a tease, wordplay, an absurd or self-deprecating remark.',
  'N for anything else: friendly, sincere, a plain question, small talk, or hostile. Hostile is never funny.',
].join(' ')

export interface HumourVerdict {
  funny: boolean
  usage: { input: number; output: number; cachedInput: number } | null
}

export type HumourJudge = (input: { his: string; herPrior: string | null }, signal: AbortSignal) => Promise<HumourVerdict>

/** The judge the turn route uses. Injectable, so tests never call a vendor. */
export const judgeHumour: HumourJudge = async ({ his, herPrior }, signal) => {
  const key = chatApiKey()
  if (!key.ok || !his.trim()) return { funny: false, usage: null }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key.key}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal,
      body: JSON.stringify({
        model: HUMOUR_MODEL,
        temperature: 0,
        max_tokens: 1,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `${herPrior ? `HER: ${herPrior.slice(0, 400)}\n` : ''}HIM: ${his.slice(0, 600)}` },
        ],
      }),
    })
    if (!response.ok) return { funny: false, usage: null }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
    }
    const answer = payload.choices?.[0]?.message?.content?.trim().toUpperCase() ?? ''
    const usage = payload.usage
      ? {
          input: payload.usage.prompt_tokens ?? 0,
          output: payload.usage.completion_tokens ?? 0,
          cachedInput: payload.usage.prompt_tokens_details?.cached_tokens ?? 0,
        }
      : null
    return { funny: answer.startsWith('Y'), usage }
  } catch {
    return { funny: false, usage: null }
  }
}

/** What a verdict cost, for the turn's receipt. Null usage is priced at the bound. */
export function humourCost(verdict: HumourVerdict | null): number {
  if (!verdict) return 0
  const usage = verdict.usage ?? { input: HUMOUR_MAX_INPUT_TOKENS, output: 1, cachedInput: 0 }
  return priceChatUsage(HUMOUR_MODEL, usage) ?? 0
}

/** The most one check can cost, for the turn's reservation (rule 18). */
export function humourBound(): number {
  return priceChatUsage(HUMOUR_MODEL, { input: HUMOUR_MAX_INPUT_TOKENS, output: 1, cachedInput: 0 }) ?? 0
}

/**
 * How long past the writer the pipeline will wait for the verdict. The writer
 * is nearly always slower; this bounds the rare turn where it is not.
 */
export const HUMOUR_GRACE_MS = 350
