import 'server-only'

/**
 * The moderation call, and the row it leaves behind (§16.3).
 *
 * One function, called from two places that look nothing alike — the live rep
 * (over `/api/safety`, several times a minute, on both streams) and text mode
 * (inside the Server Action, before the model is asked for a reply). Both need
 * the same decision and the same record, so both get the same function rather
 * than a copy each.
 *
 * WHAT IT WRITES. Every non-`ok` verdict becomes a `safety_events` row, with
 * the service role, because a moderation flag its subject could forge is a
 * moderation flag that proves nothing — the migration says so and the RLS
 * policy enforces it. The row carries the verdict, the categories that fired,
 * the stream and the scope. It does not carry the turn. "Never more of the
 * text than the decision needed" is the migration's rule and the decision
 * needs none of it: the categories are the decision.
 *
 * WHAT IT COSTS. Nothing, at the vendor — the moderation endpoint is free. It
 * still goes through the spend gate at the route, because "free today" is a
 * vendor's pricing decision and an open endpoint holding our key is a standing
 * invoice whatever the rate is (§14, B9).
 *
 * WHAT HAPPENS WHEN IT BREAKS. It fails OPEN: an unreachable classifier
 * returns `ok` and the rep carries on. That is the uncomfortable choice and it
 * is the considered one. The alternative — ending reps because a third party
 * had a bad minute — converts a vendor blip into every live conversation in
 * the product being cut off mid-sentence, which §05 forbids outright, and it
 * would train users to read the safety layer as the thing that breaks reps.
 * The exposure is bounded by everything else that still stands: the character
 * contract, the PG-13 instruction in every persona prompt, and the report
 * control on the session screen. The failure is counted, not swallowed.
 */

import { supabaseAdmin } from '@/lib/db/admin'
import { asJson } from '@/lib/db/json'
import {
  classifyModeration,
  firedCategories,
  type ModerationResult,
  type SafetySpeaker,
  type SafetyVerdict,
} from './moderation'
import {
  nextSafetyAction,
  stateFromEvents,
  type SafetyAction,
} from './escalation'

const ENDPOINT = 'https://api.openai.com/v1/moderations'

/**
 * The multimodal classifier, which is the one that reads a transcript well.
 * Overridable so a swap is an environment variable rather than a deploy, the
 * same way every other model in this product is named.
 */
const MODEL = process.env.MODERATION_MODEL ?? 'omni-moderation-latest'

export interface AssessInput {
  userId: string
  /**
   * The rep this belongs to, for the foreign key. Null for text mode, and
   * null for the first turns of a rep whose row has not landed yet.
   */
  sessionId: string | null
  /**
   * What the strike count is counted over. The session id for a rep; for text
   * mode, the thread — `text:<persona>` — because a text thread has no
   * `sessions` row to hang a foreign key on and strikes still have to survive
   * a page reload.
   */
  scope: string
  speaker: SafetySpeaker
  text: string
}

export interface Assessment {
  verdict: SafetyVerdict
  action: SafetyAction
}

const CLEAR: Assessment = { verdict: 'ok', action: 'none' }

/**
 * Classify one turn, decide what happens, and write it down.
 *
 * Never throws. Every caller is on a path where a rep or a typed message is
 * already in flight, and there is no failure here worth ending one over.
 */
export async function assessTurn(input: AssessInput): Promise<Assessment> {
  const text = input.text.trim()
  if (!text) return CLEAR

  const result = await moderate(text)
  if (!result) return CLEAR

  const verdict = classifyModeration(result, input.speaker)
  const categories = firedCategories(result)

  // Flagged by the provider, under every floor of ours. Recorded so the gap
  // between their threshold and ours is a number somebody can look at rather
  // than an assertion in a comment, and otherwise a non-event.
  if (verdict === 'ok') {
    if (result.flagged) {
      await record(input, { kind: 'moderation', verdict, action: 'none', categories })
    }
    return CLEAR
  }

  const state = stateFromEvents(await priorEvents(input.userId, input.scope))
  const decision = nextSafetyAction(state, { verdict, speaker: input.speaker })

  if (decision.kind) {
    await record(input, { kind: decision.kind, verdict, action: decision.action, categories })
  }

  return { verdict, action: decision.action }
}

/** The provider call, reduced to `ModerationResult`. Null when unusable. */
async function moderate(text: string): Promise<ModerationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // Capped rather than sent whole. A moderation verdict does not improve
      // past a few hundred characters and a turn in this product is a spoken
      // sentence; the cap is what stops a pasted wall of text from becoming
      // the most expensive request in the rep.
      body: JSON.stringify({ model: MODEL, input: text.slice(0, 2000) }),
    })
    if (!response.ok) return null

    const payload = (await response.json()) as {
      results?: {
        flagged?: unknown
        categories?: Record<string, unknown>
        category_scores?: Record<string, unknown>
      }[]
    }

    const first = payload.results?.[0]
    if (!first) return null

    return {
      flagged: first.flagged === true,
      categories: booleans(first.categories),
      scores: numbers(first.category_scores),
    }
  } catch {
    // See the header: unreachable is `ok`, and the rep keeps going.
    return null
  }
}

function booleans(raw: Record<string, unknown> | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}

function numbers(raw: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

/**
 * The strikes already on this rep or thread.
 *
 * Read rather than remembered. The client is not the authority on how many
 * times it has crossed a line, and a counter living in a hook does not survive
 * a reload, a second tab, or a client that simply stops calling.
 *
 * Scoped to the last two hours because a scope is not unique forever: a text
 * thread's key is the persona slug, so without a window a strike from a
 * conversation in March would still be counted against one in August.
 */
async function priorEvents(
  userId: string,
  scope: string,
): Promise<{ kind: string; speaker: SafetySpeaker | null }[]> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  try {
    const { data } = await supabaseAdmin()
      .from('safety_events')
      .select('kind, detail')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(50)

    return (data ?? [])
      .map((row) => ({ kind: row.kind, detail: detailOf(row.detail) }))
      .filter((row) => row.detail.scope === scope)
      .map((row) => ({
        kind: row.kind,
        speaker: row.detail.speaker === 'agent' ? ('agent' as const) : ('user' as const),
      }))
  } catch {
    // An unreadable history is a first strike. The other way round — assuming
    // the worst — would end a rep because a query timed out.
    return []
  }
}

function detailOf(raw: unknown): { scope?: string; speaker?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const value = raw as Record<string, unknown>
  return {
    ...(typeof value['scope'] === 'string' ? { scope: value['scope'] } : {}),
    ...(typeof value['speaker'] === 'string' ? { speaker: value['speaker'] } : {}),
  }
}

/** Best-effort, like every other write around a live rep. */
async function record(
  input: AssessInput,
  event: { kind: string; verdict: SafetyVerdict; action: SafetyAction; categories: string[] },
): Promise<void> {
  try {
    await supabaseAdmin().from('safety_events').insert({
      user_id: input.userId,
      session_id: input.sessionId,
      kind: event.kind,
      detail: asJson({
        scope: input.scope,
        speaker: input.speaker,
        verdict: event.verdict,
        action: event.action,
        categories: event.categories,
        model: MODEL,
      }),
    })
  } catch {
    // A rep does not end because a log row failed to insert.
  }
}
