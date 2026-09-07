/**
 * Ephemeral token mint (§04).
 *
 * The browser holds the peer connection directly with the model; this route
 * exists so the standing API key never leaves the server. Runs on the edge,
 * because a slow mint is latency the user feels before the rep even starts.
 *
 * The persona is compiled from an id rather than accepted from the client. A
 * client that could post its own instructions could post its own character, and
 * the character contract is the product.
 *
 * Note what this file does not contain: any provider's endpoint, request shape
 * or vocabulary. It resolves a provider and calls `mintSession`.
 */

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { personaContext } from '@/lib/db/persona-context'
import { mayOpenSession } from '@/lib/db/progress'
import { getPersona } from '@/lib/personas'
import { mintSession, pipelineSessionModel, pipelineTranscriptionAllowance } from '@/lib/voice/mint'
import { readScoringBody, ScoringInputError } from '@/lib/voice/scoring-request'
import { openVoiceSession, openInterviewVoiceSession, abortVoiceStartupAttempt, reserveVoiceOperation, settleVoiceOperation } from '@/lib/db/voice-session'
import { holdInterviewCredit, interviewCreditState, releaseInterviewCredit } from '@/lib/db/credits'
import { readCvText, readInterviewSetupFor } from '@/lib/db/interview'
import { compileInterviewBrief } from '@/lib/personas/interview/brief'
import { DEFAULT_DIFFICULTY } from '@/lib/data/interview-difficulty'
import { DEFAULT_FIELD } from '@/lib/data/interview-fields'
import { nextLotToSpend, roundType } from '@/lib/data/interview-credits'
import { resolveProviderId } from '@/lib/voice'
import { DEFAULT_CALIBRATION, VoiceError, clamp, type Calibration } from '@/lib/voice/types'

export const runtime = 'edge'

interface MintRequest {
  personaId?: unknown
  calibration?: unknown
  /** A/B and debugging hook. At M1 this comes off the authenticated profile. */
  userId?: unknown
  /** M0-only character-model arm. Restricted below. */
  model?: unknown
}

const M0_MODELS = [
  'gpt-realtime-mini',
  'gpt-realtime-2.1-mini',
  'gpt-realtime',
  'gpt-realtime-2.1',
] as const

function parseModel(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  return (M0_MODELS as readonly string[]).includes(input) ? input : undefined
}

function parseCalibration(input: unknown): Calibration {
  if (!input || typeof input !== 'object') return DEFAULT_CALIBRATION
  const raw = input as Record<string, unknown>
  const silenceMs =
    typeof raw['silenceMs'] === 'number' && Number.isFinite(raw['silenceMs']) ? raw['silenceMs'] : DEFAULT_CALIBRATION.silenceMs
  const patience = typeof raw['patienceOffsetMs'] === 'number' && Number.isFinite(raw['patienceOffsetMs']) ? raw['patienceOffsetMs'] : 0
  return {
    silenceMs: clamp(silenceMs, 200, 3000),
    patienceOffsetMs: clamp(patience, 0, 1500),
  }
}

export async function POST(request: Request): Promise<Response> {
  // The most expensive endpoint in the product. It hands back a credential that
  // buys an eight-minute Realtime session on our account, and it shipped open —
  // the only thing protecting it was that the path had not been guessed.
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  // Before the quota, because the kill switches have to reach the most
  // expensive endpoint in the product or they are not switches (B9).
  const allowed = await maySpend(auth.userId, 'token')
  if (!allowed.ok) return allowed.response

  let body: MintRequest
  try {
    body = await readScoringBody(request)
  } catch (error) {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: error instanceof ScoringInputError ? error.status : 400 })
  }
  const provider = resolveProviderId({
    envDefault: process.env.VOICE_PROVIDER,
    userId: auth.userId === 'internal' && typeof body.userId === 'string' ? body.userId : auth.userId,
  })

  const personaId = typeof body.personaId === 'string' ? body.personaId : ''
  const base = getPersona(personaId)
  if (!base) {
    return NextResponse.json({ error: `No persona named "${personaId}".` }, { status: 404 })
  }

  // The daily quota, at the point where money is actually committed. The rep
  // itself spends the counter when the transport connects; this refuses to
  // hand out a credential to somebody who has none left to spend (§14).
  //
  // Resolved before the quota check because an INTERVIEW is not bought out of
  // the daily rate at all — it is bought out of a credit balance (§5.2), and
  // `mayOpenSession` must not be asked about it. `persona.track` is read off
  // the authored roster, never off the request.
  const interview = base?.track === 'interview'
  if (auth.userId !== 'internal' && provider !== 'elevenlabs' && !interview) {
    const allowed = await mayOpenSession(auth.userId)
    if (!allowed.ok) {
      // `refusal` travels with the message so the browser can tell a Pro
      // account that has run out for today from a free account that has no
      // voice at all. Those are the same status code and entirely different
      // screens — see `voiceRefusal` in `lib/data/allowance.ts`.
      return NextResponse.json(
        { error: allowed.message ?? 'No reps left today.', refusal: allowed.refusal ?? 'daily' },
        { status: 429 },
      )
    }
  }

  // THE HOP THAT LOST CHARACTER MEMORY.
  //
  // Everything else about §08 worked: the grade produces a line, `grade/memory`
  // refuses anything that is about him rather than about her, it is stored under
  // the user's own context, the brief screen shows it, and "start fresh" deletes
  // it. The live page even read it back and attached it to the persona — and
  // then the browser sent us `persona.slug` and nothing else, and this route
  // rebuilt the contract from the bare roster record. `compileInstructions`'
  // "You have met before" block was never once reached in production.
  //
  // It is read HERE rather than accepted from the client on purpose, and it is
  // the same reason the persona is compiled from an id: a client that can post
  // its own memory can post its own character. `requireUser` has already run, so
  // this is derived from the authenticated user and cannot be forged.
  //
  // The same lookup now also carries what he is called, so §08's `usesYourName`
  // gate has a name to open onto. Both live in `lib/db/persona-context.ts`
  // because three routes need them and two of them used to disagree.
  let persona = {
    ...base,
    ...(await personaContext(auth.userId, base.slug)),
  }

  // Resolved here as well as in the page, from the same function, so the two
  // cannot disagree about which adapter a given user is on.
  let owned: { sessionId: string; resumed: boolean } | null = null
  let sttOperationId: string | null = null
  const sttAllowance = pipelineTranscriptionAllowance()
  if (provider === 'elevenlabs' && auth.userId !== 'internal') {
    if (!sttAllowance) return NextResponse.json({ error: 'This transcription model has no verified rate.' }, { status: 503 })

    // THE INTERVIEW BRANCH, AND IT IS A BRANCH RATHER THAN A PARAMETER (A1).
    //
    // The round decides how long the envelope is and therefore what the rep
    // costs, so it is read from `interview_setups` with the service role rather
    // than accepted from the request body — the same rule that compiles the
    // persona from an id (rule 11, rule 18).
    //
    // The credit is HELD before the session opens and released if the session
    // does not. Held rather than spent: it is settled when the scorecard is
    // written, so a rep that dies at minute fourteen of twenty leaves the
    // balance where it was.
    // Read ONCE, here, and stored on the session: every turn of the rep then
    // reads the identical string, which is what keeps the CV inside the cached
    // prefix rather than paying for it twenty-two times (C5).
    const setup = interview ? await readInterviewSetupFor(auth.userId) : null
    const round = interview ? roundType(setup?.round).id : null
    // WHICH DESIGN PROBLEM A SYSTEM DESIGN ROUND POSES (§7.3).
    //
    // A fresh id per session rather than anything derived from the account, so
    // two consecutive deep technicals land on different briefs without anything
    // having to remember the last one. It is minted here because this is where
    // the brief is compiled, and it is thrown away afterwards — the chosen
    // problem survives as prose inside `voice_sessions.context`, which is the
    // only copy anything downstream needs.
    const briefSeed = crypto.randomUUID()
    const brief = interview && round
      ? compileInterviewBrief({
        roleTitle: setup?.roleTitle ?? '',
        company: setup?.company ?? '',
        jobDescription: setup?.jobDescription ?? '',
        field: setup?.field ?? DEFAULT_FIELD,
        round,
        cvText: await readCvText(auth.userId),
        customQuestions: setup?.customQuestions ?? [],
        // Resolved on the SERVER from the stored slider, or from the role title
        // when the slider was never touched (rule 11's habit, even though a
        // difficulty is not something anybody could pay to change).
        difficulty: setup?.difficulty ?? DEFAULT_DIFFICULTY,
        seed: briefSeed,
      })
      : null
    if (interview && round) {
      // Refuse BEFORE creating a session row. The hold itself is keyed on the
      // session id and cannot be taken until one exists, so this is the cheap
      // read and the write below is the one that counts — the same two-step
      // `openVoiceSession` uses for the daily quota.
      const state = await interviewCreditState(auth.userId)
      if (!nextLotToSpend(state.lots, { round }) || state.available <= 0) {
        return NextResponse.json({
          error: roundType(round).credits === 0
            ? 'Your free screener has already been used.'
            : 'You have no interview credits left.',
          refusal: 'credits',
        }, { status: 402 })
      }
    }

    const opened = interview && round
      ? await openInterviewVoiceSession({
        userId: auth.userId, personaSlug: base.slug, provider, model: pipelineSessionModel(),
        context: {
          userName: persona.userName,
          memorySummary: persona.memorySummary,
          ...(brief ? { interviewBrief: brief } : {}),
        },
        durationMs: roundType(round).durationMs,
      })
      : await openVoiceSession({
        userId: auth.userId, personaSlug: base.slug, provider, model: pipelineSessionModel(),
        context: { userName: persona.userName, memorySummary: persona.memorySummary },
      })
    if (!opened.ok) return NextResponse.json({ error: opened.message, refusal: opened.refusal, reason: opened.reason }, { status: opened.status })
    owned = opened
    persona = { ...base, ...opened.context }

    if (interview && round) {
      const held = await holdInterviewCredit({ userId: auth.userId, sessionId: opened.sessionId, round })
      if (!held.ok) {
        if (!opened.resumed) await abortVoiceStartupAttempt({ userId: auth.userId, sessionId: opened.sessionId, operationId: null })
        return NextResponse.json(
          { error: held.message, ...(held.reason === 'balance' ? { refusal: 'credits' } : {}) },
          { status: held.reason === 'balance' ? 402 : 503 },
        )
      }
    }

    sttOperationId = `stt:${crypto.randomUUID()}`
    const stt = await reserveVoiceOperation({
      userId: auth.userId, sessionId: opened.sessionId, personaSlug: base.slug,
      operationId: sttOperationId, kind: 'stt', model: sttAllowance.model,
      maxCostUsd: sttAllowance.maxCostUsd, resources: { sttAudioMs: sttAllowance.audioMs },
    })
    if (!stt.ok) {
      if (!owned.resumed) {
        if (interview) await releaseInterviewCredit({ userId: auth.userId, sessionId: owned.sessionId })
        await abortVoiceStartupAttempt({ userId: auth.userId, sessionId: owned.sessionId, operationId: null })
      }
      return NextResponse.json({ error: stt.message, reason: stt.reason }, { status: stt.status })
    }
  }

  try {
    const minted = await mintSession(provider, persona, parseCalibration(body.calibration), {
      apiKey: process.env.OPENAI_API_KEY,
      model: parseModel(body.model) ?? process.env.OPENAI_REALTIME_MODEL,
    })
    // THE ENVELOPE IS NOT SETTLED HERE, AND IT USED TO BE.
    //
    // Settling at mint meant settling before the rep had run, with nothing to
    // settle against — so it went in as `costUsd: null`, which the RPC reads as
    // "charge the whole reservation". Every rep bought four minutes of
    // transcription at the door whether it lasted three minutes or thirty
    // seconds.
    //
    // The reservation stays HELD instead, which is what a reservation is for:
    // `voice_spend_committed_cents` counts an outstanding one against the daily
    // cap exactly as it counted the settled charge, so nothing is loosened
    // while the rep is live. `finishRep` settles it against the seconds the rep
    // actually ran. See `settleTranscriptionEnvelope`.
    return NextResponse.json(owned ? {
      ...minted, sessionId: owned.sessionId, startupAttemptId: sttOperationId,
      turn: { endpoint: '/api/voice/turn' },
    } : minted)
  } catch (cause) {
    if (owned && sttOperationId) {
      try {
        const saved = await settleVoiceOperation({
          userId: auth.userId, sessionId: owned.sessionId, operationId: sttOperationId,
          costUsd: 0, resources: { sttAudioMs: 0 }, status: 'failed',
          metadata: { source: 'transcription-credential-not-issued' },
        })
        if (!saved.ok) console.error('[nerve] voice usage persistence failed', { transport: 'token', operationId: sttOperationId })
      } catch {
        console.error('[nerve] voice usage persistence failed', { transport: 'token', operationId: sttOperationId })
      }
    }
    if (owned && sttOperationId) await abortVoiceStartupAttempt({
      userId: auth.userId, sessionId: owned.sessionId, operationId: sttOperationId,
    })
    // A credential that was never issued is a rep that never happened. The
    // credit goes straight back rather than waiting for the hold to time out.
    if (owned && interview) await releaseInterviewCredit({ userId: auth.userId, sessionId: owned.sessionId })
    if (cause instanceof VoiceError) {
      // A missing key is our misconfiguration (500); a stubbed adapter is
      // unimplemented (501); anything else means the provider refused (502).
      const status =
        cause.code === 'not_configured' ? 500 : cause.code === 'not_implemented' ? 501 : 502
      return NextResponse.json({ error: cause.message }, { status })
    }
    return NextResponse.json({ error: String(cause) }, { status: 500 })
  }
}
