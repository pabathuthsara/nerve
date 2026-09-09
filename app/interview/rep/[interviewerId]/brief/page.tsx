import { RepBriefScreen } from '@/components/screens/rep-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'
import { currentUser } from '@/lib/db/server'
import { readInterviewSetup } from '@/lib/db/interview'
import { interviewCreditState } from '@/lib/db/credits'
import { packsConfigured } from '@/lib/billing/plans'
import { creditRefusal, hasScreenerCredit, openingRound, roundType, spendableFor } from '@/lib/data/interview-credits'
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

  const lots = credits?.lots ?? []
  const screener = hasScreenerCredit(lots)
  /**
   * The round this rep is, and the one an account with nothing but the free
   * screener opens on (LAUNCH-GAP B1). A saved setup always wins; this only
   * decides what a null one means, and `recruiter` meant "the free credit on
   * every account cannot be spent".
   */
  const round = setup?.round ? roundType(setup.round).id : openingRound(screener)
  const spendable = spendableFor(lots, { round, holds: credits?.held ?? 0 })

  return (
    <RepBriefScreen
      personaId={interviewerId}
      interview
      round={round}
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
      // What this round costs, so the screen compares like with like: since B3
      // a technical is two credits and a balance of one is not enough.
      cost={roundType(round).credits}
      // B2: the paywall this brief opens is the interview track's single
      // monetisation moment, and it sells packs rather than a subscription.
      // Whether a checkout can be opened at all is an environment fact.
      packsOpen={packsConfigured()}
      // The honest sentence when the account is not empty but this round is
      // unaffordable — a free screener against a paid round, or a balance that
      // is short of a longer round. One function, three surfaces.
      creditNote={creditRefusal({ spendable, round, hasScreener: screener }) ?? undefined}
    />
  )
}
