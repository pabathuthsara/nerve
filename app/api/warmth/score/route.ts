/**
 * LIVE scoring — drives warmth during the rep (§Part 3).
 *
 * Fast, coarse, async, never blocks a response. Small model on purpose: this
 * number moves a meter, it does not go on anyone's record. The graded scorecard
 * is a separate path with a separate model and no latency budget, so live-scorer
 * noise is never baked into a stored grade.
 *
 * Temperature zero. The anchored scale in lib/warmth/prompt.ts is doing the
 * work that sampling variance would otherwise undo.
 */

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { runScoringCall } from '@/lib/db/scoring-usage'
import { readScoringBody, ScoringInputError, SCORING_LIMITS } from '@/lib/voice/scoring-request'
import { clampSlowScore } from '@/lib/warmth/slow'
// B2's seam, on the live scorer. Dating is the default branch and reaches the
// anchors it reached yesterday; an interviewer is scored on SPECIFICITY, because
// the dating scale pins "work, where she lives" at 40-50 and its top is sexual —
// a candidate describing their last job would be graded as overreaching.
import { scorerPromptFor } from '@/lib/warmth/track-prompt'

export const runtime = 'edge'

const MODEL = process.env.WARMTH_SCORE_MODEL ?? 'gpt-4.1-mini'

function str(value: unknown, limit = 800): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, limit) : null
}

/** At most four authored bullets, each clamped. Everything here is prompt. */
function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 4)
    .map((entry) => str(entry, 200))
    .filter((entry): entry is string => entry !== null)
}

/**
 * At most three prior exchanges, both halves clamped.
 *
 * Validated here rather than trusted, for the same reason `personaName` is only
 * ever interpolated as a name: this arrives from the browser and becomes prompt
 * content. The shape is fixed and anything else is dropped.
 */
function recent(value: unknown): Array<{ him: string; her: string | null }> {
  if (!Array.isArray(value)) return []
  const out: Array<{ him: string; her: string | null }> = []
  for (const entry of value.slice(-3)) {
    if (!entry || typeof entry !== 'object') continue
    const him = str((entry as Record<string, unknown>).him)
    if (!him) continue
    out.push({ him, her: str((entry as Record<string, unknown>).her) })
  }
  return out
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'not configured' }, { status: 500 })

  let body: Record<string, unknown>
  try {
    body = await readScoringBody(request)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ScoringInputError ? error.message : 'malformed' },
      { status: error instanceof ScoringInputError ? error.status : 400 },
    )
  }

  const userText = str(body.userText)
  if (!userText) return NextResponse.json({ error: 'empty turn' }, { status: 400 })

  const agentReply = str(body.agentReply)
  const agentPrior = str(body.agentPrior)
  const personaName = str(body.personaName, 40) ?? 'She'
  // Resolved from the registry, never taken from the body. The name arrives
  // from the client and is only ever interpolated as a name; where she is
  // standing is prompt content that steers the scale, and WHICH SCALE is prompt
  // content too — so both come from the repo, the same rule the character
  // contract follows.
  const systemPrompt = scorerPromptFor(personaName)
  const warmth =
    typeof body.warmth === 'number' && Number.isFinite(body.warmth)
      ? Math.max(0, Math.min(100, Math.round(body.warmth)))
      : 0

  // WHAT SHE IS MOVED BY, extracted from her own authored contract rather than
  // re-written here (`lib/warmth/persona-notes.ts`). Maya's contract says in as
  // many words that a run of questions with nothing of his own in between loses
  // her warmth; the actor was told and the judge never was, so a fourth
  // consecutive question scored as a fourth open question.
  const notes = [
    ...lines(body.likes).map((line) => `  + ${line}`),
    ...lines(body.dislikes).map((line) => `  - ${line}`),
  ]

  // THE RUN, and a run is most of what a conversation is. The judge used to see
  // one pair, so a fourth consecutive question looked exactly like a first one
  // and mounting contempt looked like a single sour remark. Oldest first, so it
  // reads as a transcript rather than as a list.
  const history = recent(body.recent).flatMap((exchange) => [
    `HIM: ${exchange.him}`,
    exchange.her ? `HER: ${exchange.her}` : 'HER: (nothing)',
  ])

  const userContent = [
    notes.length > 0 ? `WHAT MOVES HER:\n${notes.join('\n')}` : null,
    history.length > 0 ? `EARLIER:\n${history.join('\n')}\n` : null,
    'THE TURN YOU ARE SCORING:',
    agentPrior ? `(She had just said: ${agentPrior})` : null,
    `HIM: ${userText}`,
    agentReply ? `HER: ${agentReply}` : 'HER: (no reply — she was interrupted or the scene ended)',
    `WARMTH: ${warmth}`,
  ]
    .filter(Boolean)
    .join('\n')

  const completion = await runScoringCall({
    request,
    userId: auth.userId,
    sessionId: body.sessionId,
    kind: 'warmth',
    model: MODEL,
    apiKey,
    maxOutputTokens: SCORING_LIMITS.warmthOutputTokens,
    timeoutMs: SCORING_LIMITS.warmthTimeoutMs,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  })
  if ('response' in completion) return completion.response

  let parsed: unknown
  try {
    parsed = JSON.parse(completion.content)
  } catch {
    return NextResponse.json({ error: 'unparseable' }, { status: 502 })
  }

  const score = clampSlowScore(parsed)
  if (!score) return NextResponse.json({ error: 'unusable' }, { status: 502 })

  return NextResponse.json(score)
}
