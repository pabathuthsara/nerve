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
import { buildSystemPrompt, scorerPlaceFor } from '@/lib/warmth/prompt'

export const runtime = 'edge'

const MODEL = process.env.WARMTH_SCORE_MODEL ?? 'gpt-4.1-mini'

function str(value: unknown, limit = 800): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, limit) : null
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
  // standing is prompt content that steers the intimacy scale, so it comes from
  // the repo — the same rule the character contract follows.
  const place = scorerPlaceFor(personaName)
  const warmth =
    typeof body.warmth === 'number' && Number.isFinite(body.warmth)
      ? Math.max(0, Math.min(100, Math.round(body.warmth)))
      : 0

  const userContent = [
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
      { role: 'system', content: buildSystemPrompt(personaName, place) },
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
