import { RepBriefScreen } from '@/components/screens/rep-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'
import { currentUser } from '@/lib/db/server'
import { readInterviewSetup } from '@/lib/db/interview'
import { interviewCreditState } from '@/lib/db/credits'
import { hasScreenerCredit, roundType, SCREENER_ROUND, spendableFor } from '@/lib/data/interview-credits'
import { DEFAULT_FIELD } from '@/lib/data/interview-fields'
import { DEFAULT_DIFFICULTY } from '@/lib/data/interview-difficulty'

/**
 * The last screen before the microphone opens.
 *
 * The round and the credit balance are resolved here rather than fetched in the
 * browser, for the same reason the live page resolves them: both decide whether
 * this rep may start and what it costs, and neither is a thing a client gets to
 * announce (rule 11).
 */
export default async function InterviewBriefPage({ params }: { params: Promise<{ interviewerId: string }> }) {
  const { interviewerId } = await params
  await enforceFrontendGuard(`/interview/rep/${interviewerId}/brief`)

  const user = await currentUser()
  const [setup, credits] = await Promise.all([
    readInterviewSetup(),
    user ? interviewCreditState(user.id) : Promise.resolve(null),
  ])

  const spendable = spendableFor(credits?.lots ?? [], {
    round: roundType(setup?.round).id,
    holds: credits?.held ?? 0,
  })

  return (
    <RepBriefScreen
      personaId={interviewerId}
      interview
      round={roundType(setup?.round).id}
      // §4.4. The last screen before the microphone says what KIND of round
      // this is, not only whose name is on it — two of the first four interview
      // reps ever run went out on a behavioural round because nothing on the
      // way in said so.
      field={setup?.field ?? DEFAULT_FIELD}
      difficulty={setup?.difficulty ?? DEFAULT_DIFFICULTY}
      // WHAT CAN PAY FOR *THIS* ROUND, not what is in the account (§5.6).
      // A screener credit only buys the five-minute screener, so an account
      // holding one and nothing else has a balance of 1 and cannot start a
      // recruiter screen. Gating on the total let that rep reach the microphone
      // and be refused by the token route as "Connection lost".
      credits={spendable}
      // The honest sentence when the account is not empty but this round is
      // unaffordable — a free screener against a paid round, which is the exact
      // shape the dev grant produces and the one that reached the microphone.
      creditNote={spendable === 0 && hasScreenerCredit(credits?.lots ?? []) && roundType(setup?.round).id !== SCREENER_ROUND
        ? 'Your free screener only pays for the five-minute screener round. Pick that one on your setup, or add credits for the longer rounds.'
        : undefined}
    />
  )
}
