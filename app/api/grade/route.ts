/**
 * GRADE — the §07 scorecard. Runs ONCE, after the session ends (§Part 3).
 *
 * No latency budget, so this uses the strongest text model configured rather
 * than the cheap one that drives warmth live. It is roughly 1% of session cost
 * and it is the number the user's progression record depends on, so the
 * trade is not close.
 *
 * Deliberately separate from /api/warmth/score. Live-scorer noise must never
 * be baked into a stored grade: that path judges single exchanges with a small
 * model under a deadline, this one reads the whole transcript with the best
 * model and no deadline.
 */

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { composeScorecard, clampSubScores } from '@/lib/grade'
import { memoryLineFrom } from '@/lib/grade/memory'
import { buildGradeSystemPrompt, renderMetrics, renderTranscript } from '@/lib/grade/prompt'
import { computeDeterministicMetrics } from '@/lib/grade/metrics'
import type { JudgementLayer, Scorecard, SubScores } from '@/lib/grade/types'
import type { TranscriptTurn } from '@/lib/voice/types'

// Node rather than edge: this is a single long call with no latency budget,
// and the edge runtime's shorter execution window is the wrong trade for the
// strongest model reading a full transcript.
export const runtime = 'nodejs'
export const maxDuration = 60

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
/** Point this at the strongest text model on the account. */
const MODEL = process.env.GRADE_MODEL ?? 'gpt-4.1'

interface GradeBody {
  transcript?: unknown
  sessionSeconds?: unknown
  personaName?: unknown
}

function parseTranscript(raw: unknown): TranscriptTurn[] | null {
  if (!Array.isArray(raw)) return null
  const turns: TranscriptTurn[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const t = entry as Record<string, unknown>
    if (t['speaker'] !== 'user' && t['speaker'] !== 'agent') return null
    if (typeof t['text'] !== 'string') return null
    if (typeof t['t_start'] !== 'number' || typeof t['t_end'] !== 'number') return null
    turns.push({
      speaker: t['speaker'],
      text: t['text'],
      t_start: t['t_start'],
      t_end: t['t_end'],
    })
  }
  return turns
}

export async function POST(request: Request): Promise<Response> {
  // Before anything else, and before the key is even read. This route calls the
  // strongest text model on the account with a caller-supplied transcript.
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  // The most expensive single call in the product per request, and the one a
  // loop is cheapest to write against. §18's margins assume nobody is trying.
  const allowed = await maySpend(auth.userId, 'grade')
  if (!allowed.ok) return allowed.response

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'not configured' }, { status: 500 })

  let body: GradeBody
  try {
    body = (await request.json()) as GradeBody
  } catch {
    return NextResponse.json({ error: 'malformed' }, { status: 400 })
  }

  const transcript = parseTranscript(body.transcript)
  if (!transcript || transcript.length === 0) {
    return NextResponse.json({ error: 'no transcript' }, { status: 400 })
  }
  const sessionSeconds =
    typeof body.sessionSeconds === 'number' && Number.isFinite(body.sessionSeconds)
      ? body.sessionSeconds
      : transcript[transcript.length - 1]?.t_end ?? 0
  const personaName = typeof body.personaName === 'string' ? body.personaName : 'She'

  const metrics = computeDeterministicMetrics(transcript, sessionSeconds)

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildGradeSystemPrompt() },
          {
            role: 'user',
            content: [
              `TRANSCRIPT (${Math.round(sessionSeconds)}s):`,
              renderTranscript(transcript, personaName),
              '',
              'ALREADY MEASURED:',
              renderMetrics(metrics),
            ].join('\n'),
          },
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

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'unparseable' }, { status: 502 })
  }

  const scores = clampSubScores(parsed)
  if (!scores) return NextResponse.json({ error: 'unusable scores' }, { status: 502 })

  const rawEvidence = parsed['evidence']
  const evidence: Partial<Record<keyof SubScores, string>> = {}
  if (rawEvidence && typeof rawEvidence === 'object') {
    for (const [key, value] of Object.entries(rawEvidence as Record<string, unknown>)) {
      if (typeof value === 'string') {
        evidence[key as keyof SubScores] = value.slice(0, 200)
      }
    }
  }

  const judgement: JudgementLayer = {
    scores,
    evidence,
    wentWell: typeof parsed['wentWell'] === 'string' ? parsed['wentWell'].slice(0, 300) : '',
    // The only place a memory line is judged fit to store. The prompt asks for
    // the right shape; this decides. A line that fails is dropped and she
    // brings nothing up next time, which is the normal case anyway (§08).
    memoryLine: memoryLineFrom(parsed['memoryLine']),
  }

  const rawOutcome = parsed['outcome']
  const outcome: Scorecard['outcome'] =
    rawOutcome === 'receptive' || rawOutcome === 'neutral' || rawOutcome === 'rejecting'
      ? rawOutcome
      : 'unknown'

  return NextResponse.json(
    composeScorecard({ transcript, sessionSeconds, judgement, outcome, model: MODEL }),
  )
}
