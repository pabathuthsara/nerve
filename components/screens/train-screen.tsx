'use client'

import Link from 'next/link'
import { Check, ChevronRight, Mic, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBaseline, useFieldToday, useLatestFocus, useLifetimeStats, usePersonaProgress, usePersonas, useSessionHistory, useUserState, useWeeklyReview } from '@/lib/data'
import type { LifetimeStats, PersonaProgress, SessionSummary, UserState } from '@/lib/data/types'
import { chooseTodayPersona, LEVEL_NAMES, levelTone } from '@/lib/data/progression'
import { RANKS, RANK_BLURBS, RANK_NAMES, dayCount, nextRankRequirement, rankIndex, type Rank } from '@/lib/data/rank'
import { lifetimeLine, pressureMinutes } from '@/lib/data/counters'
import { daysBetween, localDay } from '@/lib/data/day'
import { FieldActions, FieldSheets, useFieldFlow } from '@/components/field/flow'
import { MilestoneSheet } from '@/components/field/milestone-sheet'
import { REJECTION_MILESTONES, type Milestone } from '@/lib/field/milestones'
import { AppShell, RepsRemaining, StreakCounter, useResetCountdown } from '@/components/app-shell'
import { Button, Card, Chip, Skeleton, Stat } from '@/components/ui'
import { PaywallSheet } from '@/components/modals'
import { TRIAL_DAYS, planById } from '@/lib/site/plans'
import { ShareButton } from '@/components/share/share-button'
import { FluidPersona } from '@/components/fluid-persona'
import { MissionCard } from '@/components/mission'
import { missionFor } from '@/lib/data/mission'
import { Mark, fieldTierMark, rankMark } from '@/components/marks'

export function TrainScreen() {
  return <AppShell title="Train"><TrainContent /></AppShell>
}

/**
 * The way back into a deferred run.
 *
 * *Look around first* on the mic step used to call `finishOnboarding`, which
 * made the escape hatch a trapdoor: somebody whose browser would not grant a
 * microphone in that moment permanently skipped the check, the brief and the
 * "How a rep works" sheet, and nothing in the product ever offered them again.
 * It stamps a deferred flag now (`lib/data/guards.ts`), which lets them move
 * freely and leaves `onboarding_complete` false — so this row can exist.
 *
 * Quiet on purpose. They asked to look around; this is a door held open, not
 * a screen asking again. It disappears the moment the run is finished, because
 * being complete is the only thing it is reading.
 */
function FinishSetup() {
  return (
    <Link className="finish-setup" href="/onboarding/mic">
      <Mic size={18} strokeWidth={1.5} />
      <span><strong>Finish setup</strong><small>Check your microphone, then meet your first character</small></span>
      <ChevronRight size={18} strokeWidth={1.5} />
    </Link>
  )
}

function TrainContent() {
  const userState = useUserState()
  const { data: user, loading: userLoading } = userState
  const { data: sessions, loading: sessionsLoading } = useSessionHistory()
  // R7 and R15. The counters that only go up, and the evidence a comeback
  // screen is built on.
  const { data: lifetime } = useLifetimeStats()
  const { data: personas, loading: personaLoading } = usePersonas()
  const { data: progressRaw, loading: progressLoading } = usePersonaProgress()
  // The standing objective. `focus` is the last graded rep's two weakest
  // sub-scores, weakest first, so the mission changes when the weakness does
  // and there is no second copy of it to fall out of step.
  const { data: focus } = useLatestFocus()
  const mission = missionFor(focus)
  const field = useFieldToday()
  const { data: assignment, loading: challengeLoading } = field
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  // An ask made moves the streak as well as the card (§09) — and can cross a
  // rejection milestone, which has to land here too rather than waiting for
  // the user to happen to open `/field`.
  const flow = useFieldFlow(assignment, {
    onChanged: () => { field.reload(); userState.reload() },
    onMilestone: (at) => setMilestone(REJECTION_MILESTONES.find((entry) => entry.at === at) ?? null),
  })
  const [paywallOpen, setPaywallOpen] = useState(false)
  // The real countdown, not `PaywallSheet`'s hard-coded default. Meaningless on
  // a locked account — nothing resets — and the sheet does not show it there.
  const resetIn = useResetCountdown(user?.repsResetAt)
  const loading = userLoading || personaLoading || progressLoading
  // Chosen for you, not picked off a list: the decision before the rep is the
  // part people use to avoid the rep.
  const progress: PersonaProgress[] = Array.isArray(progressRaw) ? progressRaw : []
  // The onboarding answer, finally spending. It is the last tie-break inside
  // `chooseTodayPersona`, so it decides the first rep and then gets out of the
  // way of the rotation.
  const persona = chooseTodayPersona(personas, progress, user?.currentLevel ?? 1, user?.focusArea)
  const personaProgress = persona ? progress.find((item) => item.personaId === persona.id) : undefined
  const last = sessions[0]
  const challenge = assignment?.challenge
  const remaining = user?.repsRemainingToday ?? 0
  // Not the same thing as `remaining === 0`. A Pro account at three of three is
  // out for today and has three more at midnight; a free account has none, ever
  // (`lib/data/allowance.ts`), and telling those two people the same sentence is
  // what makes a paywall read as a bug.
  const voiceLocked = user?.voiceLocked ?? false
  const repHref = persona ? `/rep/${persona.id}/brief` : '/roster'

  return (
    <>
      <div className="train-grid">
        <section>
          <div className="train-meta-row">
            {userLoading || !user ? <><Skeleton width={108} height={32} /><Skeleton width={108} height={20} /></> : <><RepsRemaining count={user.repsRemainingToday} resetAt={user.repsResetAt} locked={user.voiceLocked} /><StreakCounter days={user.streakDays} /></>}
          </div>
          {user && !user.onboardingComplete ? <FinishSetup /> : null}
          {/* R15 first, then R14, and never both: somebody back after a
              fortnight does not also need to be told their streak is at risk
              tonight — it is already gone, and saying so twice is the guilt
              copy §4 of the audit rules out. */}
          {user ? <ComebackCard user={user} lifetime={lifetime} /> : null}
          {user ? <StreakAtRiskCard user={user} hasChallenge={Boolean(challenge)} /> : null}
          {/* Above the character, not below it. The mission is what the rep is
              for; the character is who you happen to be running it against. */}
          <MissionCard mission={mission} />
          {loading || !persona ? <Skeleton height={430} /> : (
            <article className="today-card">
              <div className="today-card__visual" />
              <FluidPersona name={persona.name} personaId={persona.id} warmth={personaProgress && personaProgress.attempts > 0 ? personaProgress.bestWarmth : 18} fill className="today-card__persona" />
              <div className="today-card__grain" />
              <div className="today-card__content">
                <div><Chip tone="band" band={levelTone(persona.level)}>Level {String(persona.level).padStart(2, '0')} — {LEVEL_NAMES[persona.level]}</Chip></div>
                <h1 className="display-xl">{persona.name}</h1>
                <span className="label">{persona.setting}</span>
                <p className="today-card__hook">{persona.hook}</p>
                {/* The activation cliff, closed (F-14). The primary action on
                    this screen used to read OUT OF REPS in amber — a dead
                    control the whole layout pointed at, on the screen a new
                    user lands on ten minutes after signing up. Text mode costs
                    no quota and is the same character, so when the day's voice
                    reps are gone the screen reorganises around what is still
                    open instead of around waiting. */}
                <div className="today-card__action">
                  {remaining > 0 ? <>
                    <Link href={repHref} className="arena-button arena-button--primary arena-button--lg arena-button--full">Start rep</Link>
                    <Link href="/roster" className="arena-button arena-button--ghost arena-button--sm arena-button--full"><RotateCcw size={16} strokeWidth={1.5} /> Someone else</Link>
                  </> : voiceLocked ? <>
                    {/* THE ONE PLACE A FREE ACCOUNT MEETS THE OFFER.
                        This used to route straight to text: the primary button
                        read "Talk to Nadia in text" and the word Pro appeared
                        nowhere on the screen a free user lands on every day. It
                        was the right shape for the wrong state — F-14 is about a
                        PAYING account at the end of its day, where there is
                        nothing to sell and text is genuinely the open door.
                        A free account is the opposite case: the door is shut
                        until somebody buys a key, and walking them quietly past
                        it is not restraint, it is a funnel with no ask in it.
                        The button keeps saying the thing they actually want to
                        do, and the sheet says what it costs and offers text as
                        the second option rather than as the only one. */}
                    <Button size="lg" fullWidth onClick={() => setPaywallOpen(true)}>Start rep with {persona.name}</Button>
                    <Link href={`/text/${persona.id}`} className="arena-button arena-button--ghost arena-button--sm arena-button--full">Or type to her — always free</Link>
                  </> : <>
                    {/* Out for today on a plan that HAS voice. Nothing to sell:
                        it comes back at midnight, and pushing Elite at somebody
                        who is already paying and already trained today is how a
                        plan limit turns into an advert (§14). */}
                    <Link href={`/text/${persona.id}`} className="arena-button arena-button--primary arena-button--lg arena-button--full">Talk to {persona.name} in text</Link>
                    <Button variant="ghost" size="sm" fullWidth onClick={() => setPaywallOpen(true)}>Voice reps are done for today</Button>
                  </>}
                </div>
              </div>
            </article>
          )}
        </section>
        <aside className="side-stack">
          {userLoading || !user ? <Skeleton height={86} /> : <RankRail rank={user.rank} />}
          <div className="side-stats">
            {/* Three states, not a count and a zero. The sign-up rep is a
                one-off on top of the plan (`lib/data/allowance.ts`), so it says
                so while it is unspent; and a free account's zero is not a
                counter that resets at midnight, so it does not pretend to be
                one. A pill reading 0 / 0 with a countdown under it looks like a
                bug and hides the only thing the user can do about it. */}
            {/* A figure when there is a figure, and an offer when there is not.
                `Voice on Pro` was being typeset as a `stat--lg` value — mono, up
                to 2.4rem, `white-space: nowrap` — inside a `1fr` grid column, so
                on the one screen a free account lands on every day it pushed the
                column wider than the track and **the whole right rail overflowed
                the viewport**. Prose in a slot built for a numeral.
                It is a link now rather than a dead label: this is the cell that
                says what the account cannot do, so it is also the cheapest place
                to say what fixes it. */}
            <div>{userLoading || !user ? <Skeleton height={50} /> : user.voiceLocked ? <VoiceOfferStat /> : <Stat label="Reps remaining" value={`${user.repsRemainingToday} / ${user.repsPerDay}`} size="lg" detail={user.signupRepAvailable ? 'Your sign-up rep, on us' : undefined} />}</div>
            <div>{userLoading || !user ? <Skeleton height={50} /> : <Stat label="Current streak" value={dayCount(user.streakDays)} size="lg" />}</div>
            {/* R7. The in-app half had no monotonic counter at all — the streak
                resets and `rejectionsCollected` lives entirely in the field, so
                every number on this screen could go down. This one cannot, and
                it sits beside the one that can on purpose. */}
            <div>{lifetime && lifetime.totalReps > 0 ? <Stat label="Reps run" value={lifetime.totalReps} size="lg" detail={`${pressureMinutes(lifetime.totalMs)} minutes under pressure`} /> : null}</div>
          </div>
          <Card className="field-card">
            {challengeLoading || !challenge ? <><Skeleton width={82} height={24} /><Skeleton height={28} /><Skeleton height={42} /><Skeleton height={36} /></> : flow.status === 'done' || flow.status === 'skipped' ? <div className="field-card__head"><span>{flow.status === 'done' ? <Check size={18} strokeWidth={1.5} className="volt" /> : <X size={18} strokeWidth={1.5} className="muted" />} <span className="label">{flow.status === 'done' ? 'Field rep logged' : 'Logged honestly'}</span></span><Link className="label volt-link" href="/field">The log</Link></div> : <>
              <div className="field-card__head"><span className="mark-row"><Mark name={fieldTierMark(challenge.tier)} size={17} /><span className="label">Today in the field</span></span><Chip>Tier {challenge.tier}</Chip></div>
              <div><h2 className="display-md">{challenge.title}</h2><p className="field-card__copy">{challenge.brief}</p></div>
              <FieldActions flow={flow} size="sm" />
            </>}
          </Card>
          <WeeklyReviewCard />
          <BaselineCard />
          <Card className="last-result">
            <span className="label">Last rep</span>
            {sessionsLoading ? <Skeleton height={62} /> : last ? <SessionRow session={last} /> : <p className="muted">Your last rep will land here.</p>}
          </Card>
          <p className="label mute" style={{ margin: '0 2px' }}>One rep. One field move. Then leave it alone.</p>
        </aside>
      </div>
      <FieldSheets flow={flow} title={challenge?.title ?? ''} />
      <MilestoneSheet milestone={milestone} onClose={() => setMilestone(null)} />
      {/* `PaywallSheet`, not a second one written here. The sheet this replaced
          said "Your voice reps reset tonight" to everybody — which is false for
          a free account, where nothing resets — and hard-coded `3 / day` and
          `6 / day`, so a price or a rep count changed in `lib/site/plans.ts`
          would have been changed in one place and not the other. The shared
          sheet reads both from that record and tells the two accounts apart. */}
      <PaywallSheet
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        locked={voiceLocked}
        reset={resetIn}
        personaId={persona?.id ?? null}
      />
    </>
  )
}

/**
 * The counter cell, on an account that has no counter.
 *
 * Free grants no voice reps at all (`lib/site/plans.ts`), so there is no
 * fraction to print and nothing resets at midnight. It says what is true, what
 * it costs, and what stays free either way — the last clause matters, because
 * §14's rule is that running out must never read as losing the account.
 *
 * The price and the trial length come from `lib/site/plans.ts` rather than
 * being written here, for the reason that file exists.
 */
function VoiceOfferStat() {
  const pro = planById('pro')
  return (
    <Link className="stat stat--offer" href="/profile/subscription">
      <span className="label">Reps remaining</span>
      <span className="stat__value">Voice is on Pro</span>
      <span className="mute">{TRIAL_DAYS} days free, then {pro.price} a month. The field, text and your streak stay free.</span>
    </Link>
  )
}

/**
 * Is it evening where the user actually is?
 *
 * Read in an effect rather than at render, because the server has no local
 * clock and a wall-clock read during SSR is a hydration mismatch on the screen
 * a returning user lands on first.
 */
function useEveningHere(fromHour = 20): boolean {
  const [evening, setEvening] = useState(false)
  useEffect(() => { setEvening(new Date().getHours() >= fromHour) }, [fromHour])
  return evening
}

/**
 * The streak save, before it is needed (RETENTION-AUDIT R14).
 *
 * §14's rule that running out must never break the streak is implemented — a
 * field ask keeps the day, and it costs no voice minutes — and **nobody has
 * ever been told.** That is a streak freeze with no consumable and no economy
 * behind it, sitting in the database being invisible.
 *
 * One line, one button, and only in the evening: a card that says this at nine
 * in the morning is nagging, and §4 of the audit rules out anything that
 * punishes absence. It says what is true and offers the cheapest way to fix it.
 * It disappears the moment the day is claimed.
 */
function StreakAtRiskCard({ user, hasChallenge }: { user: UserState; hasChallenge: boolean }) {
  const evening = useEveningHere()
  if (!evening || user.streakActiveToday || user.streakDays < 1) return null
  return (
    <Card className="streak-risk">
      <div>
        <span className="label">Day {user.streakDays + 1}</span>
        <p className="streak-risk__line">Nothing logged yet. A field ask keeps the day, and it costs no reps.</p>
      </div>
      <Link className="arena-button arena-button--secondary arena-button--sm" href={hasChallenge ? '/field' : '/roster'}>
        {hasChallenge ? 'Today’s ask' : 'Find a rep'}
      </Link>
    </Card>
  )
}

/** Seven days away is a comeback rather than a gap. */
const COMEBACK_DAYS = 7

/**
 * The comeback (RETENTION-AUDIT R15).
 *
 * Return after a week away and the product behaved as though nothing had
 * happened, except that the streak was silently zero. Almost nobody builds this
 * screen and it is the cheapest win-back there is — and it is the one place a
 * lost streak can be made to read as a fact rather than as a punishment.
 *
 * The counters are the whole argument: the streak is a thing that resets and
 * the reps are a thing that does not, so the sentence is "your streak is gone;
 * the reps aren't" over a number that is exactly where they left it. No guilt,
 * no "we missed you", nothing that scores the absence — §4 of the audit is
 * explicit that this product already costs the user courage and must not charge
 * them shame on top of it.
 */
function ComebackCard({ user, lifetime }: { user: UserState; lifetime: LifetimeStats | null }) {
  if (!user.lastTrainedOn || user.streakActiveToday) return null
  const away = daysBetween(user.lastTrainedOn, localDay(new Date(), null))
  if (away < COMEBACK_DAYS) return null
  const line = lifetime ? lifetimeLine({ reps: lifetime.totalReps, totalMs: lifetime.totalMs }) : null
  return (
    <Card className="comeback">
      <span className="label">{away} days away</span>
      <h2 className="display-md">You&apos;re back</h2>
      <p className="comeback__line">Your streak is gone. The reps aren&apos;t — nothing you have already done can be taken off you, and today is day one of the next run.</p>
      {line ? <p className="comeback__counter data">{line}</p> : null}
    </Card>
  )
}

/**
 * The Sunday letter (§09, §11).
 *
 * The fourth reason to come back. It appears when one has been written and
 * says nothing at all otherwise — a card that explains it will have something
 * to say on Sunday is a card taking up room for six days.
 */
function WeeklyReviewCard() {
  const { data: review, loading } = useWeeklyReview()
  if (loading || !review) return null
  return <Card className="weekly-card"><div className="field-card__head"><span className="mark-row"><Mark name="state-letter" size={17} /><span className="label">Your week</span></span><Chip>{formatWeek(review.weekStart)}</Chip></div><div className="weekly-card__figures"><Stat label="Reps" value={review.stats.reps} /><Stat label="Asks" value={review.stats.asksMade} /><Stat label="Refusals" value={review.stats.rejections} /></div><p className="weekly-card__copy">{review.copy}</p><ShareButton kind="weekly" label="Make a card" /></Card>
}

function formatWeek(weekStart: string): string {
  const [year = 0, month = 1, day = 1] = weekStart.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * The week-four offer (§08).
 *
 * Silent until day 28, and silent again once the re-test has been taken — at
 * which point it becomes the way back to the comparison, which is the actual
 * reward. A card that nags about a measurement is a card people learn to skip.
 */
function BaselineCard() {
  const { data: state, loading } = useBaseline()
  if (loading || !state) return null
  if (!state.due && !state.retestSessionId) return null
  const done = state.retestSessionId !== null
  return <Card className="baseline-offer"><div className="field-card__head"><span className="mark-row"><Mark name="state-chart" size={17} /><span className="label">{done ? 'Week four' : 'Four weeks in'}</span></span><Chip tone="volt">{state.baseline.score} → ?</Chip></div><div><h2 className="display-md">{done ? 'Then and now' : 'Re-take the measurement'}</h2><p className="field-card__copy">{done ? `Your first rep scored ${state.baseline.score}. See what four weeks did to it.` : `${state.personaName}, same level, same three minutes. The only thing that has changed is you.`}</p></div><div className="field-card__actions">{done ? <Link className="arena-button arena-button--secondary arena-button--sm" href="/progress/baseline">See both</Link> : <Link className="arena-button arena-button--primary arena-button--sm" href={`/rep/${state.baseline.personaId}/brief`}>Take it</Link>}</div></Card>
}

export function SessionRow({ session }: { session: SessionSummary }) {
  const minutes = Math.floor(session.durationMs / 60000)
  const seconds = Math.floor((session.durationMs % 60000) / 1000)
  // A composite of null is a rep that has not been graded yet — a dash, never
  // a zero somebody could read as a verdict.
  return <Link className="session-row" href={`/session/${session.id}/scorecard`}><span className="session-row__main"><span className={`session-row__outcome${session.won ? ' session-row__outcome--won' : ''}`}>{session.won ? <Check size={15} strokeWidth={1.5} /> : <X size={15} strokeWidth={1.5} />}</span><span><strong style={{ display: 'block', fontWeight: 500 }}>{session.personaName}</strong><span className="label">{session.personaSettingShort} · {minutes}:{String(seconds).padStart(2, '0')}</span></span></span><span className="session-row__score">{session.compositeScore ?? '—'}</span></Link>
}

/**
 * The §08 rank rail. "Shown as a rail on the home screen rather than as a
 * badge shelf."
 *
 * The distinction in that sentence is the whole brief: a badge says you have
 * one, a rail says where you are and what is above you. So every rank is drawn
 * — including the ones not yet reached — and the next one names its price in
 * the same words the roster uses, because a rail with no next step is a badge
 * with extra steps.
 *
 * Rank is the slow number. The level moves when you unlock a character; this
 * moves when you have proven you can hold one, and it is deliberately harder
 * to move than the thing next to it.
 *
 * **V21.** The rail drew four identical dots with the names underneath, which
 * told you the order and nothing else: `Rookie · Regular · Contender · Closer`
 * in one weight, one size and one grey, so knowing where you stood meant
 * reading the words and remembering which way they ran. The four rank marks
 * are ascending chevrons and the top one closes, so the shape carries the
 * standing and the word only confirms it. The held one is the single volt
 * thing on the card; the ones behind it are Ink-2 and the ones ahead are muted,
 * which is the difference between a rail and a badge shelf drawn rather than
 * stated.
 */
function RankRail({ rank }: { rank: Rank }) {
  const here = rankIndex(rank)
  const next = nextRankRequirement(rank)
  return (
    <Card className="rank-rail">
      <div className="rank-rail__head">
        <Mark name={rankMark(rank)} size={26} current />
        <div>
          <span className="label">Rank</span>
          <strong className="display-md volt">{RANK_NAMES[rank]}</strong>
        </div>
      </div>
      <ol className="rank-rail__track" aria-label={`Rank ${RANK_NAMES[rank]}, ${here + 1} of ${RANKS.length}`}>
        {RANKS.map((entry, index) => (
          <li
            key={entry}
            className={index === here ? 'is-here' : index < here ? 'is-done' : undefined}
            aria-current={index === here ? 'step' : undefined}
          >
            <Mark name={rankMark(entry)} size={19} current={index === here} muted={index > here} />
            <span className="label">{RANK_NAMES[entry]}</span>
          </li>
        ))}
      </ol>
      <p>{RANK_BLURBS[rank]}</p>
      {next ? <span className="label mute">Next · {next}</span> : null}
    </Card>
  )
}
