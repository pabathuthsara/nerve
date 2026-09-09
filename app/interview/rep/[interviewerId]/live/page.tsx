import { notFound } from 'next/navigation'
import { RepLiveScreen } from '@/components/screens/rep-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'
import type { LiveRepConfig } from '@/lib/data/rep'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { getPersona } from '@/lib/personas'
import { resolveProviderId } from '@/lib/voice'
import { DEFAULT_CALIBRATION } from '@/lib/voice/types'
import { readInterviewSetup } from '@/lib/db/interview'
import { creditRefusal, hasScreenerCredit, openingRound, roundType, spendableFor } from '@/lib/data/interview-credits'
import { DEFAULT_FIELD } from '@/lib/data/interview-fields'
import { DEFAULT_DIFFICULTY } from '@/lib/data/interview-difficulty'
import { interviewTrajectory } from '@/lib/warmth/interview/trajectory'
import { interviewCreditState } from '@/lib/db/credits'

/**
 * The live interview, resolved on the server.
 *
 * `live={null}` was hard-coded here since August, so the screen has always
 * rendered "Interview reps are not open yet." Four interviewers are authored
 * now (B8) and this is the page that opens one.
 *
 * ── WHAT IS DECIDED HERE AND WHY ─────────────────────────────────────────
 *
 * **The round**, read from `interview_setups` rather than from a query
 * parameter. It decides how long the rep runs, what the wind-down is and how
 * much the rep costs, so it is a server fact (rule 11) — the same reason the
 * token route reads it again rather than trusting what the browser sends.
 *
 * **The gain cap**, scaled to the round by `interviewTrajectory`. Everything
 * else about the trajectory is who she is and does not move.
 * `levelTrajectory` is read, never edited (§5.10, rule 19).
 *
 * **Difficulty is chosen, not earned**, so unlike the dating page there is no
 * `readOffset` here. §5.10: somebody who paid because they interview on
 * Thursday needs the hard one tonight, and adaptive difficulty adjusting an
 * interviewer underneath them would be the ladder this track deliberately does
 * not have.
 */
export default async function InterviewLivePage({ params }: { params: Promise<{ interviewerId: string }> }) {
  const { interviewerId } = await params
  await enforceFrontendGuard(`/interview/rep/${interviewerId}/live`)

  const persona = getPersona(interviewerId)
  const user = await currentUser()
  if (!user) notFound()

  // A dating character reached through an interview URL is not an interview.
  // The track is the authored one, never the route's.
  const interviewer = persona?.track === 'interview' ? persona : null

  const supabase = await supabaseServer()
  const [{ data: profile }, setup, credits] = await Promise.all([
    supabase
      .from('profiles')
      .select('vad_offset_ms, ambience, ambience_volume')
      .eq('id', user.id)
      .maybeSingle(),
    readInterviewSetup(),
    interviewCreditState(user.id),
  ])

  const screener = hasScreenerCredit(credits.lots)
  // A saved setup always wins; this only decides what a null one means, and
  // `recruiter` meant the free credit on every account could not be spent (B1).
  const round = roundType(setup?.round ?? openingRound(screener))

  const live: LiveRepConfig | null = interviewer
    ? {
        persona: {
          ...interviewer,
          trajectory: interviewTrajectory(interviewer.trajectory, round.id),
        },
        provider: resolveProviderId({ envDefault: process.env.VOICE_PROVIDER }),
        model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-mini',
        calibration: {
          silenceMs: DEFAULT_CALIBRATION.silenceMs,
          patienceOffsetMs: profile?.vad_offset_ms ?? 0,
        },
        userId: user.id,
        ambience: profile?.ambience ?? true,
        ambienceVolume: profile?.ambience_volume ?? 60,
      }
    : null

  const spendable = spendableFor(credits.lots, { round: round.id, holds: credits.held })

  return (
    <RepLiveScreen
      personaId={interviewerId}
      live={live}
      interview
      round={round.id}
      // §5 and §7.2, resolved here for the same reason the round is: the field
      // decides whether the probe ladder has anything authored to climb, and
      // the difficulty is the stored slider or the level the role title
      // implies. Neither touches warmth (§5.3).
      field={setup?.field ?? DEFAULT_FIELD}
      difficulty={setup?.difficulty ?? DEFAULT_DIFFICULTY}
      captions={setup?.captions ?? false}
      // The same round-aware number the brief gates on. See the note there.
      credits={spendable}
      cost={round.credits}
      // The honest sentence when the account is not empty but this round is
      // unaffordable — a free screener against a paid round, or a balance short
      // of a longer one. One function, three surfaces.
      creditNote={creditRefusal({ spendable, round: round.id, hasScreener: screener }) ?? undefined}
    />
  )
}
