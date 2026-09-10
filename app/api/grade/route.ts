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
import { gradeEligibility } from '@/lib/grade/eligibility'
import { runScoringCall } from '@/lib/db/scoring-usage'
import { parseGradeTranscript, readScoringBody, ScoringInputError, SCORING_LIMITS } from '@/lib/voice/scoring-request'
import { composeScorecard, clampSubScores } from '@/lib/grade'
import { memoryLineFrom } from '@/lib/grade/memory'
// B2's seam. Dating is the default branch and reaches exactly the rubric it
// reached yesterday; the interview arm gets its own, resolved from the authored
// roster rather than from the request body.
import { rubricForPersonaName } from '@/lib/grade/track'
import { computeDeterministicMetrics } from '@/lib/grade/metrics'
import type { AccuracyLayer, JudgementLayer, Scorecard, SubScores } from '@/lib/grade/types'
// The second pass (§8.2). Its own call, its own model, its own budget line, and
// skipped entirely when the round produced no probes — which is every dating
// rep and every behavioural interview round.
import {
  accuracyReading,
  accuracyResult,
  buildAccuracySystemPrompt,
  parseAccuracyJudgements,
  probePairsFrom,
  renderProbePairs,
} from '@/lib/grade/interview/accuracy'
import { readInterviewSetupFor } from '@/lib/db/interview'
import { DEFAULT_DIFFICULTY } from '@/lib/data/interview-difficulty'
import { DEFAULT_FIELD } from '@/lib/data/interview-fields'

// Node rather than edge: this is a single long call with no latency budget,
// and the edge runtime's shorter execution window is the wrong trade for the
// strongest model reading a full transcript.
export const runtime = 'nodejs'
export const maxDuration = 60

/** Point this at the strongest text model on the account. */
const MODEL = process.env.GRADE_MODEL ?? 'gpt-4.1'

/**
 * The model that judges correctness (§8.2).
 *
 * Its own setting, defaulting to the same strong model the rubric uses, because
 * the two calls are asking different questions and one of them may need to move
 * without the other. It is deliberately not `gpt-4.1-mini`: an abstention costs
 * nothing and a false WRONG costs the account, so this is the wrong place to
 * save a fraction of a cent.
 */
const ACCURACY_MODEL = process.env.GRADE_ACCURACY_MODEL ?? MODEL

/** Enough for twelve verdicts with a quote and a correction on each. */
const ACCURACY_OUTPUT_TOKENS = 1_600

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

  // NOTHING HERE IS WORTH A NUMBER. Checked before the model call, so a rep
  // that cannot be graded does not also cost one. See `lib/grade/eligibility.ts`
  // — an 18-second "Hello." scored 45, and a session in which she never spoke
  // scored 36 for a pipeline failure.
  const eligible = gradeEligibility({ sessionSeconds, transcript })
  if (!eligible.ok) {
    return NextResponse.json({ error: 'not graded', reason: eligible.reason }, { status: 422 })
  }

  const metrics = computeDeterministicMetrics(transcript, sessionSeconds)
  const rubric = rubricForPersonaName(personaName)

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
      { role: 'system', content: rubric.systemPrompt() },
      {
        role: 'user',
        content: [
          `TRANSCRIPT (${Math.round(sessionSeconds)}s):`,
          rubric.renderTranscript(transcript, personaName),
          '',
          'ALREADY MEASURED:',
          // The track's own targets. The dating block is byte-identical to
          // what it was; the interview one states the bands a candidate is
          // actually scored against, because handing a grader "target 40-55%"
          // beside a 68% somebody earned by answering properly marks them down
          // twice for the same correct behaviour.
          rubric.renderMetrics(metrics),
        ].join('\n'),
      },
    ],
  })
  if ('response' in completion) return completion.response

  let parsed: Record<string, unknown>
  try {
    const decoded: unknown = JSON.parse(completion.content)
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('malformed')
    parsed = rubric.normalise(decoded as Record<string, unknown>)
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

  // ── THE SECOND PASS ────────────────────────────────────────────────
  //
  // Separate rather than folded into the rubric above, for the three reasons
  // §8.2 gives: the existing prompt is already long and a twenty-five-minute
  // transcript makes it longer; accuracy wants a different model and a
  // different temperature; and a separate call can be SKIPPED, which it is on
  // every behavioural round and on every dating rep.
  //
  // A failure here is not a failure of the grade. The scorecard is returned
  // with no accuracy layer, the composite is the six, and the candidate gets
  // the card they would have got before this plan — which is the correct
  // failure mode for a dimension whose whole design is that abstaining is free.
  const accuracy = await scoreAccuracy({
    request, userId: auth.userId, sessionId: body.sessionId, apiKey,
    transcript, track: rubric.track,
  })

  return NextResponse.json(
    composeScorecard({
      transcript, sessionSeconds, judgement, outcome, model: completion.model,
      // Sixty percent of the composite, and four of the dating bands score
      // correct interview behaviour at zero. The dating branch passes the
      // table it always used.
      bands: rubric.metricBands,
      ...(accuracy ? { accuracy } : {}),
    }),
  )
}

async function scoreAccuracy(input: {
  request: Request
  userId: string
  sessionId: unknown
  apiKey: string
  transcript: readonly import('@/lib/voice/types').TranscriptTurn[]
  track: string
}): Promise<AccuracyLayer | null> {
  if (input.track !== 'interview') return null
  const pairs = probePairsFrom(input.transcript)
  if (pairs.length === 0) return null

  // The field and the level come from the SETUP on the service role, never
  // from the request body — the same rule the round follows in the token route
  // (rule 11). A grader told by the browser that the candidate is an intern
  // would mark a staff answer complete on request.
  const setup = input.userId === 'internal' ? null : await readInterviewSetupFor(input.userId)
  const field = setup?.field ?? DEFAULT_FIELD
  const difficulty = setup?.difficulty ?? DEFAULT_DIFFICULTY

  const completion = await runScoringCall({
    request: input.request,
    userId: input.userId,
    sessionId: input.sessionId,
    kind: 'grade',
    // A SECOND operation on the same session and the same budget bucket. Left
    // as the default `'grade'` it would settle the rubric call's reservation on
    // top of itself and report one of the two costs.
    operationId: 'grade-accuracy',
    model: ACCURACY_MODEL,
    apiKey: input.apiKey,
    maxOutputTokens: ACCURACY_OUTPUT_TOKENS,
    timeoutMs: SCORING_LIMITS.gradeTimeoutMs,
    messages: [
      { role: 'system', content: buildAccuracySystemPrompt({ field, difficulty }) },
      { role: 'user', content: renderProbePairs(pairs) },
    ],
  })
  if ('response' in completion) return null

  let judgements
  try {
    const decoded: unknown = JSON.parse(completion.content)
    judgements = parseAccuracyJudgements(decoded, pairs)
  } catch {
    return null
  }

  const result = accuracyResult(pairs, judgements)
  return { ...result, reading: accuracyReading(result) }
}
