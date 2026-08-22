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
import { clampSlowScore } from '@/lib/warmth/slow'
import { buildSystemPrompt } from '@/lib/warmth/prompt'

export const runtime = 'edge'

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.WARMTH_SCORE_MODEL ?? 'gpt-4.1-mini'

interface ScoreRequest {
  userText?: unknown
  agentReply?: unknown
  agentPrior?: unknown
  warmth?: unknown
  personaName?: unknown
}

function str(value: unknown, limit = 800): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, limit) : null
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'not configured' }, { status: 500 })

  let body: ScoreRequest
  try {
    body = (await request.json()) as ScoreRequest
  } catch {
    return NextResponse.json({ error: 'malformed' }, { status: 400 })
  }

  const userText = str(body.userText)
  if (!userText) return NextResponse.json({ error: 'empty turn' }, { status: 400 })

  const agentReply = str(body.agentReply)
  const agentPrior = str(body.agentPrior)
  const personaName = str(body.personaName, 40) ?? 'She'
  const warmth =
    typeof body.warmth === 'number' && Number.isFinite(body.warmth)
      ? Math.round(body.warmth)
      : 0

  const userContent = [
    agentPrior ? `(She had just said: ${agentPrior})` : null,
    `HIM: ${userText}`,
    agentReply ? `HER: ${agentReply}` : 'HER: (no reply — she was interrupted or the scene ended)',
    `WARMTH: ${warmth}`,
  ]
    .filter(Boolean)
    .join('\n')

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 160,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(personaName) },
          { role: 'user', content: userContent },
        ],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'upstream unreachable' }, { status: 502 })
  }

  if (!response.ok) {
    return NextResponse.json({ error: `upstream ${response.status}` }, { status: 502 })
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[]
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'no content' }, { status: 502 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return NextResponse.json({ error: 'unparseable' }, { status: 502 })
  }

  const score = clampSlowScore(parsed)
  if (!score) return NextResponse.json({ error: 'unusable' }, { status: 502 })

  return NextResponse.json(score)
}
