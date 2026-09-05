/**
 * GRADE — the §07 scorecard. Runs ONCE, after the session ends (§Part 3).
 *
 * This uses the configured grading model rather than the live warmth model.
 * Its bounded deadline is independent of conversational response timing, and
 * its usage is recorded separately from the voice pipeline.
 *
 * Deliberately separate from /api/warmth/score. Live-scorer noise must never
 * be baked into a stored grade: that path judges single exchanges with a small
 * model under a deadline, this one reads the whole transcript with the best
 * model under its own completion deadline.
 */

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { runScoringCall } from '@/lib/db/scoring-usage'
import { parseGradeTranscript, readScoringBody, ScoringInputError, SCORING_LIMITS } from '@/lib/voice/scoring-request'
import { composeScorecard, clampSubScores } from '@/lib/grade'
import { memoryLineFrom } from '@/lib/grade/memory'
import { buildGradeSystemPrompt, renderMetrics, renderTranscript } from '@/lib/grade/prompt'
import { computeDeterministicMetrics } from '@/lib/grade/metrics'
import type { JudgementLayer, Scorecard, SubScores } from '@/lib/grade/types'

// Node rather than edge: this is a single long call with no latency budget,
// and the edge runtime's shorter execution window is the wrong trade for the
// strongest model reading a full transcript.
export const runtime = 'nodejs'
export const maxDuration = 60

/** Point this at the strongest text model on the account. */
const MODEL = process.env.GRADE_MODEL ?? 'gpt-4.1'

export async function POST(request: Request): Promise<Response> {
  // Before anything else, and before the key is even read. This route calls the
  // strongest text model on the account with a caller-supplied transcript.
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

  const transcript = parseGradeTranscript(body.transcript)
  if (!transcript || transcript.length === 0) {
    return NextResponse.json({ error: 'invalid or oversized transcript' }, { status: 400 })
  }
  const sessionSeconds = body.sessionSeconds === undefined
    ? Math.max(...transcript.map((turn) => turn.t_end))
    : body.sessionSeconds
  if (typeof sessionSeconds !== 'number' || !Number.isFinite(sessionSeconds)
    || sessionSeconds < 0 || sessionSeconds > SCORING_LIMITS.sessionSeconds) {
    return NextResponse.json({ error: 'invalid duration' }, { status: 400 })
  }
  const personaName = typeof body.personaName === 'string' ? body.personaName.slice(0, 40) : 'She'

  const metrics = computeDeterministicMetrics(transcript, sessionSeconds)

  const completion = await runScoringCall({
    request,
    userId: auth.userId,
    sessionId: body.sessionId,
    kind: 'grade',
    model: MODEL,
    apiKey,
    maxOutputTokens: SCORING_LIMITS.gradeOutputTokens,
    timeoutMs: SCORING_LIMITS.gradeTimeoutMs,
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
  })
  if ('response' in completion) return completion.response

  let parsed: Record<string, unknown>
  try {
    const decoded: unknown = JSON.parse(completion.content)
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('malformed')
    parsed = decoded as Record<string, unknown>
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
    composeScorecard({ transcript, sessionSeconds, judgement, outcome, model: completion.model }),
  )
}
