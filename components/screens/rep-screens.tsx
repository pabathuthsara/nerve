'use client'

import Link from 'next/link'
import { ChevronLeft, LockKeyhole, MicOff, WifiOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useInterviewers, useLatestFocus, usePersona, usePersonaMemory, usePersonaProgress, useUserState } from '@/lib/data'
import { techniqueBySlug, techniqueForSubScore } from '@/lib/techniques/library'
import { focusPlan } from '@/lib/data/focus'
import { MemoryLine } from './memory-line'
import { DATING_DURATION_MS, useRepSession, type LiveRepConfig, type SpeakingState } from '@/lib/data/rep'
import { WRAP_UP_MS } from '@/lib/data/rep-rules'
import { interviewDurationMs, interviewWrapUpMs } from '@/lib/data/interview-rules'
import { DEFAULT_ROUND, ROUND_SHAPE_LABEL, roundType, type RoundTypeId } from '@/lib/data/interview-credits'
import { DEFAULT_FIELD, type InterviewFieldId } from '@/lib/data/interview-fields'
import { DEFAULT_DIFFICULTY, difficultySpec, type DifficultyLevel } from '@/lib/data/interview-difficulty'
import { probeLadderEnabled } from '@/lib/data/interview-probes'
import { INTERVIEW_BAND_LABEL } from '@/lib/warmth/interview/bands'
import type { Band } from '@/lib/data/types'
import { TOP_TIER } from '@/lib/data/progression'
import { Button, Skeleton } from '@/components/ui'
import { RuleBlock } from './rep-format'
import { ConnectionLostModal, DistressModal, EndRepModal, HowItWorksSheet, MicBlockedSheet, MicLostModal, MicPrimerSheet, PaywallSheet, TrainingWheelsOffModal } from '@/components/modals'
import { micPermission, type MicPermission } from '@/lib/data/mic'
import { PhoneNumberCard, TimeArc } from '@/components/rep-visuals'
import { useOnlineStatus } from '@/lib/hooks/use-online-status'
import { FluidPersona } from '@/components/fluid-persona'
import { capture } from '@/components/analytics'
import { MissionLine, MissionNote } from '@/components/mission'
import { GuidedBrief, GuidedLine } from '@/components/guided'
import { guidedPromptFor, guidedScriptFor } from '@/lib/data/guided'
import { missionFor } from '@/lib/data/mission'
import { useRepProduction } from '@/lib/hooks/use-rep-production'
import { sceneId } from '@/lib/voice/types'

interface RepScreenProps {
  personaId: string
  interview?: boolean
  /**
   * Which round this interview is (§5.7). Resolved on the server from
   * `interview_setups`; ignored entirely on the dating arm.
   */
  round?: RoundTypeId
  /**
   * The candidate's field and how hard the questions are (§5, §7.2).
   *
   * Both resolved on the server from `interview_setups`, for the same reason
   * the round is, and both ignored entirely on the dating arm. The field
   * decides whether the probe ladder has anything authored to climb; the
   * difficulty decides how hard to pitch it, and nothing about her mood.
   */
  field?: InterviewFieldId
  difficulty?: DifficultyLevel
  /**
   * The question caption (§5.11). **Off by default**, and the setup screen
   * recommends it stays off — a real interview has no captions and practising
   * without them is the point.
   */
  captions?: boolean
  /**
   * Credits that can pay for THIS round. Read on the server (§5.6).
   *
   * Round-aware, not the account total: a screener credit only buys the
   * five-minute screener, so an account holding one and nothing else has a
   * balance of one and can start no paid round. Gating on the total sent that
   * rep to the microphone to be refused by the token route.
   */
  credits?: number
  /**
   * What THIS round costs, in credits (LAUNCH-GAP B3).
   *
   * Rounds are priced by length now — a recruiter screen is one and a deep
   * technical is three — so `credits <= 0` is no longer the gate. An account
   * with two credits looking at a deep technical is not empty and still cannot
   * start it, and gating on emptiness sends that rep to the microphone to be
   * refused by the token route.
   */
  cost?: number
  /**
   * Whether this deployment can open a pack checkout (`packsConfigured()`).
   *
   * Read on the server and handed down, exactly as `/interview` does it: a buy
   * button that errors on somebody trying to give us money is worse than one
   * that admits it is not ready, and rule 15 guarantees a window where this is
   * false.
   */
  packsOpen?: boolean
  /**
   * Why the balance is zero, when the account is not actually empty.
   *
   * "You have no interview credits" is the wrong sentence for somebody holding
   * a free screener and looking at a recruiter screen. The page knows which of
   * the two it is; this is how it says so.
   */
  creditNote?: string
  query?: Record<string, string | undefined>
  /**
   * Everything the transport needs, resolved on the server. Null when this
   * character has no engine config — the eight-persona roster is being
   * written, and a rep against a character nobody authored is not a rep.
   */
  live?: LiveRepConfig | null
}

export function RepBriefScreen({
  personaId,
  interview = false,
  round = DEFAULT_ROUND,
  field = DEFAULT_FIELD,
  difficulty = DEFAULT_DIFFICULTY,
  credits = 0,
  cost = 1,
  creditNote,
  packsOpen = false,
}: RepScreenProps) {
  const router = useRouter()
  const { data: persona, loading: personaLoading } = usePersona(personaId)
  const { data: interviewers, loading: interviewersLoading } = useInterviewers()
  const { data: user, loading: userLoading } = useUserState()
  const { data: progressRaw } = usePersonaProgress(personaId)
  const progress = Array.isArray(progressRaw) ? null : progressRaw
  // Dating only. An interviewer carrying a memory of your last attempt is a
  // different feature with different rules, and it is not this one (§08).
  const memory = usePersonaMemory(interview ? '' : personaId)
  const online = useOnlineStatus()
  const interviewer = interviewers.find((item) => item.id === personaId)
  const subject = interview ? interviewer : persona
  const [how, setHow] = useState(false)
  const [paywall, setPaywall] = useState(false)
  const [trainingOff, setTrainingOff] = useState(false)
  const [curtain, setCurtain] = useState(false)
  const [primer, setPrimer] = useState(false)
  // Asked once when the screen opens, so pressing Start never waits on a
  // permissions query. `null` means we have not looked yet.
  const [micState, setMicState] = useState<MicPermission | null>(null)
  useEffect(() => { void micPermission().then(setMicState) }, [])
  const level = subject?.level ?? 1

  // The same objective the scorecard set and Train has been showing. Restated
  // here because this is the last screen before the microphone opens.
  const { data: focus } = useLatestFocus()
  const mission = missionFor(focus)

  /**
   * Funnel step one (B7). Fired once the brief actually has a character to
   * show, not on mount — the screen spends its first frames as a skeleton, and
   * a "viewed" that counts skeletons measures routing rather than reading.
   */
  const briefSeen = useRef(false)
  useEffect(() => {
    if (!subject || subject.locked || briefSeen.current) return
    briefSeen.current = true
    capture('brief_viewed', { persona_id: personaId, level, track: interview ? 'interview' : 'dating', mode: 'voice' })
  }, [interview, level, personaId, subject])

  const start = () => {
    // Funnel step two. Fired at the commit point rather than on connect, so
    // the gap between this and `rep_first_user_turn` still contains the reps
    // that never got a connection — that gap is the thing worth seeing.
    capture('rep_started', { persona_id: personaId, level, track: interview ? 'interview' : 'dating', mode: 'voice' })
    setCurtain(true)
    window.setTimeout(() => router.push(interview ? `/interview/rep/${personaId}/live` : `/rep/${personaId}/live`), 560)
  }

  const enter = () => {
    if (!online || subject?.locked) return
    // Two meters, two refusals (§5.2). An interview is bought out of a credit
    // balance and a dating rep out of a daily rate, and asking the wrong one
    // refuses a paying customer for having used their three dating reps.
    // A round nobody can pay for is refused HERE, in a sentence, rather than at
    // the microphone as a 402 dressed up as a lost connection.
    if (interview ? credits < cost : (user?.repsRemainingToday ?? 1) === 0) { setPaywall(true); return }
    if (level === TOP_TIER && !trainingOff) { setTrainingOff(true); return }
    // §12, B10. The explanation goes BEFORE the browser dialog, because a
    // prompt nobody understands gets dismissed and a dismissal is permanent on
    // most browsers. Skipped once permission is granted — an explanation of a
    // dialog that will not appear is just a door in the way.
    if (micState !== 'granted' && !primerSeen()) { setPrimer(true); return }
    start()
  }

  const loading = userLoading || (interview ? interviewersLoading : personaLoading)
  if (loading) return <main className="brief-page"><div className="brief-shell"><Skeleton width={96} height={96} style={{ borderRadius: '50%' }} /><Skeleton width={160} height={34} /><Skeleton height={180} /></div></main>
  if (!subject) return <BriefGate title="Rep not found" description="That training partner is not available." href={interview ? '/interview/interviewers' : '/roster'} />
  if (subject.locked) return <BriefGate title={`${subject.name} is locked`} description={interview ? 'Reach level 4 to unlock this interviewer.' : persona?.unlockRequirement ?? 'Keep training to unlock this rep.'} href={interview ? '/interview/interviewers' : '/roster'} locked />
  // §4.4. The shape, and — on a round that probes — how hard the questions are.
  // A round that changes what the interview IS cannot be a quiet dropdown
  // default, and this is the last screen before the microphone opens.
  const setting = interview
    ? [
      interviewer?.styleLabel ?? 'Interviewer',
      roundType(round).label,
      ROUND_SHAPE_LABEL[roundType(round).shape],
      ...(probeLadderEnabled({ round, field })
        ? [`${difficultySpec(difficulty).label} questions`]
        : []),
    ].join(' · ')
    : persona?.setting ?? ''
  const hook = interview ? interviewer?.blurb ?? '' : persona?.hook ?? ''
  // The script, read once and unhurried, BEFORE the microphone opens. §05's
  // objection is to interruption, and this is the surface where coaching has
  // always been allowed — it is also where a screen-reader user meets it, since
  // the live rail is `aria-hidden`.
  //
  // It is the badge and the opening line now rather than the whole script, and
  // it stands INSTEAD OF the mission note rather than under it — a brief that
  // carried a mission and six prompts was handing a first-time user two sets of
  // objectives for the same three minutes, which is the round-6 failure wearing
  // an interface. The live screen has always made that choice; this one had not.
  const briefScript = interview ? null : guidedScriptFor(personaId)
  const back = interview ? '/interview/interviewers' : `/roster/${personaId}`
  return <main className={`brief-page${curtain ? ' brief-page--curtain' : ''}`}><Link className="rep-back" href={back} aria-label="Back"><ChevronLeft size={24} strokeWidth={1.5} /></Link><section className="brief-shell"><FluidPersona name={subject.name} personaId={subject.id} warmth={progress && progress.attempts > 0 ? progress.bestWarmth : 18} size={132} /><h1 className="display-lg">{subject.name}</h1><span className="label">{setting}</span><p className="brief-hook">{hook}</p>{!interview && progress && progress.attempts > 0 ? <span className="label mute">Your best: warmth {progress.bestWarmth}{progress.wins > 0 ? `, ${progress.wins} number${progress.wins === 1 ? '' : 's'}` : ', no number'}</span> : null}{!interview ? <MemoryLine personaId={personaId} name={subject.name} memory={memory.data} onForgotten={memory.reload} /> : null}<RuleBlock interview={interview} minutes={Math.round(interviewDurationMs(round) / 60_000)} />{!interview && !briefScript ? <MissionNote mission={mission} /> : null}{briefScript ? <GuidedBrief script={briefScript} /> : null}{!interview ? <TechniqueOfTheSession focus={user?.focusArea ?? null} /> : null}{!online ? <p className="brief-offline"><WifiOff size={15} strokeWidth={1.5} /> Reconnect to start a rep.</p> : null}<Button size="lg" fullWidth onClick={enter} disabled={!online}>{online ? 'Start' : 'Offline'}</Button>{/* The way out of the microphone, offered at the exact moment somebody
    is deciding whether to grant it (P1). Same character, no permission,
    no quota — and it is a link rather than a modal because a person
    hesitating here should not have to answer another question. */}
{!interview ? <Link className="arena-button arena-button--ghost arena-button--full" href={`/text/${personaId}`}>Not ready to talk? Type instead</Link> : null}<Button variant="ghost" fullWidth onClick={() => setHow(true)}>How does this work?</Button></section><HowItWorksSheet open={how} onClose={() => setHow(false)} interview={interview} minutes={Math.round(interviewDurationMs(round) / 60_000)} /><PaywallSheet open={paywall} onClose={() => setPaywall(false)} locked={user?.voiceLocked ?? false} personaId={interview ? null : personaId} interview={interview} packsOpen={packsOpen} credits={credits} cost={cost} roundLabel={roundType(round).label} reason={interview ? creditNote : undefined} /><TrainingWheelsOffModal interview={interview} open={trainingOff} onClose={() => { setTrainingOff(false); setCurtain(true); window.setTimeout(() => router.push(interview ? `/interview/rep/${personaId}/live` : `/rep/${personaId}/live`), 560) }} /><MicPrimerSheet open={primer} onClose={() => setPrimer(false)} onAllow={() => { rememberPrimer(); setPrimer(false); start() }} /></main>
}

export function RepLiveScreen({
  personaId,
  interview = false,
  live = null,
  round = DEFAULT_ROUND,
  field = DEFAULT_FIELD,
  difficulty = DEFAULT_DIFFICULTY,
  captions: captionsEnabled = false,
  credits = 0,
  cost = 1,
  creditNote,
}: RepScreenProps) {
  const router = useRouter()
  const { data: persona, loading: personaLoading } = usePersona(personaId)
  const { data: interviewers, loading: interviewersLoading } = useInterviewers()
  const { data: user, loading: userLoading } = useUserState()
  const online = useOnlineStatus()
  const interviewer = interviewers.find((item) => item.id === personaId)
  const subject = interview ? interviewer : persona
  const level = subject?.level ?? 1
  // A6. **Length is a property of the round** (§5.7), and this was a hardcoded
  // `480_000` sitting beside an `INTERVIEW_DURATION_MS` it could already
  // disagree with. The dating number is untouched and still comes from
  // `rep-rules.ts`.
  const durationMs = interview ? interviewDurationMs(round) : DATING_DURATION_MS
  const session = useRepSession(personaId, {
    durationMs,
    trainingWheels: level < 4,
    interview,
    config: live,
    ...(interview ? { round, field, difficulty } : {}),
    // A3/A4, and ONLY here. A twenty-minute rep on a paid item reconnects and
    // stops its clock while the room is empty; a three-minute dating rep runs
    // exactly the code it ran yesterday.
    ...(interview ? { reconnect: true } : {}),
  })
  const [endOpen, setEndOpen] = useState(false)
  const [chromeDim, setChromeDim] = useState(false)
  const [caption, setCaption] = useState(true)
  const [resumeCount, setResumeCount] = useState<number | null>(null)
  const [micLost, setMicLost] = useState(false)
  const navigatedRef = useRef(false)
  const resumeTimerRef = useRef<number | null>(null)
  const { start, pause, resume, outcome, sessionId } = session

  const loading = userLoading || (interview ? interviewersLoading : personaLoading)
  // TWO DIFFERENT METERS, AND THEY ARE NOT INTERCHANGEABLE (§5.2, §5.3).
  //
  // A dating rep is bought out of a daily rate that resets at midnight. An
  // interview is bought out of a credit balance that does not — so asking
  // `repsRemainingToday` about an interview would refuse a paying customer
  // because they had used their three dating reps, and telling them it resets
  // tonight would be a lie about a midnight that changes nothing.
  const blockedByReps = !userLoading && !interview && (user?.repsRemainingToday ?? 0) <= 0
  const blockedByCredits = interview && credits < cost
  /**
   * The rep no longer opens the instant loading finishes.
   *
   * `start()` is now what the countdown calls, so the three seconds before a
   * stranger speaks are a real beat somebody was counted into rather than a
   * state change they happened to be present for. The connection opens during
   * the count, which also means the first thing they hear is not silence with
   * a person in it. See `useRepProduction`.
   */
  const repReady = !loading && !!subject && !subject.locked && !blockedByReps && !blockedByCredits && online && !!live
  // The one thing §05 rule 6 allows on this screen besides the timer and the
  // waveform. Read here, drawn as a single static line.
  const { data: liveFocus } = useLatestFocus()
  const liveMission = missionFor(liveFocus)
  // THE ONE GUIDED CHARACTER (`lib/data/guided.ts`). Null for everybody else,
  // and null on the interview track, which has its own question rail and would
  // otherwise carry two sets of instructions at once.
  const guidedScript = interview ? null : guidedScriptFor(personaId)
  const production = useRepProduction({
    ready: repReady,
    onGo: start,
    ended: Boolean(session.outcome),
    wrapping: !session.outcome && session.status === 'live'
      && session.msRemaining <= (interview ? interviewWrapUpMs(round) : WRAP_UP_MS),
    // `sceneId()` is the codebase's own answer to "which scene is this":
    // the authored bed when there is one, the reverb's scene otherwise. The
    // `bed: null` on eight of nine personas was the switch for the
    // convolver-era bed, which is not the mechanism playing here.
    sceneId: live ? sceneId(live.persona.room) : null,
    ambience: live?.ambience ?? false,
    ambienceVolume: live?.ambienceVolume ?? 0,
  })
  useEffect(() => { if (micLost) pause() }, [micLost, pause])

  /**
   * Funnel steps three and four (B7).
   *
   * `heardUser` is the hook's own "the first word we actually heard", so this
   * measures somebody speaking rather than somebody's microphone opening —
   * which is the entire distinction the step exists to draw. The clock starts
   * when the session goes live, so the number is time-to-first-word from the
   * moment she could hear them, not from the route change.
   */
  const liveAtRef = useRef<number | null>(null)
  const firstTurnRef = useRef(false)
  const completedRef = useRef(false)
  useEffect(() => {
    if (session.status === 'live' && liveAtRef.current === null) liveAtRef.current = Date.now()
  }, [session.status])
  useEffect(() => {
    if (!session.heardUser || firstTurnRef.current || !sessionId) return
    firstTurnRef.current = true
    capture('rep_first_user_turn', { session_id: sessionId, ms_to_first_turn: Date.now() - (liveAtRef.current ?? Date.now()) })
  }, [session.heardUser, sessionId])
  useEffect(() => {
    if (!outcome || completedRef.current || !sessionId) return
    completedRef.current = true
    capture('rep_completed', {
      session_id: sessionId,
      duration_ms: Date.now() - (liveAtRef.current ?? Date.now()),
      // Never the score and never whether she said yes — §07 means outcome is
      // not a metric here either. `ended_by` is about how the rep terminated,
      // which is a reliability question, not a performance one.
      ended_by: session.endReason ?? 'character',
    })
  }, [outcome, session.endReason, sessionId])
  // A refused microphone and a microphone that stopped working are different
  // problems with different fixes (§12). The hook reports both as `mic`, so the
  // permission state is what tells them apart: telling somebody whose headset
  // unplugged to go and edit their site settings is how a fixable problem
  // becomes an abandoned session.
  const [micBlocked, setMicBlocked] = useState(false)
  useEffect(() => { if (micBlocked) pause() }, [micBlocked, pause])
  useEffect(() => {
    if (session.error !== 'mic') return
    void micPermission().then((state) => {
      if (state === 'denied') setMicBlocked(true)
      else setMicLost(true)
    })
  }, [session.error])
  useEffect(() => { if (!online) pause(); else if (session.paused && !micLost && !micBlocked) resume() }, [micBlocked, micLost, online, pause, resume, session.paused])
  useEffect(() => { const dim = window.setTimeout(() => setChromeDim(true), 4000); const hide = window.setTimeout(() => setCaption(false), 3000); return () => { window.clearTimeout(dim); window.clearTimeout(hide) } }, [])
  useEffect(() => {
    const clearResumeTimer = () => {
      if (resumeTimerRef.current !== null) window.clearInterval(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    const visibility = () => {
      clearResumeTimer()
      if (document.hidden) { setResumeCount(null); pause(); return }
      if (!online || micLost) return
      setResumeCount(3)
      resumeTimerRef.current = window.setInterval(() => setResumeCount((value) => {
        if (value === null || value <= 1) { clearResumeTimer(); resume(); return null }
        return value - 1
      }), 700)
    }
    document.addEventListener('visibilitychange', visibility)
    return () => { clearResumeTimer(); document.removeEventListener('visibilitychange', visibility) }
  }, [micLost, online, pause, resume])
  /**
   * Leave a rep that never became one.
   *
   * The effect below navigates on an OUTCOME, which only exists after a rep
   * that actually ran. A mint that failed has none — so every "End" on a
   * pre-connection modal needs to end the rep AND say where to go, or it is a
   * button that appears to do nothing. It did.
   */
  const leave = () => {
    navigatedRef.current = true
    session.end()
    router.push(interview ? '/interview' : '/train')
  }

  useEffect(() => {
    if (!outcome || navigatedRef.current) return
    setEndOpen(false)
    setMicLost(false)
    // §16.8. A rep that ended in distress does not get a result screen: a
    // scorecard, a warmth number and a "run it back" button are the training
    // frame, and the frame is exactly what was dropped. The modal is the whole
    // of what happens next, and the user leaves it when they choose to.
    if (session.safety.distress) return
    const delay = outcome.won ? 2700 : 1900
    // A rep with no row — the insert failed, or the user was signed out — has
    // no result screen to go to. Back to training rather than a dead link.
    const timer = window.setTimeout(() => { navigatedRef.current = true; router.push(sessionId ? `/session/${sessionId}/result` : '/train') }, delay)
    return () => window.clearTimeout(timer)
  }, [outcome, router, session.safety.distress, sessionId])

  /**
   * THE SERVER SAID NO, AND SAID WHY.
   *
   * A whole screen rather than a modal over a live rep, because there is no
   * live rep behind it — the refusal happened at the token route, before a
   * microphone opened. It used to arrive as `ConnectionLostModal`: a Retry that
   * refused three more times and an End button that did nothing at all.
   *
   * The sentence is the ROUTE'S, not this screen's. Only the server knows
   * whether this was credits, the daily quota or the spend ceiling, and each
   * one sends somebody somewhere different.
   */
  if (session.error === 'refused') {
    return <BriefGate
      title={interview ? 'This interview cannot start' : 'This rep cannot start'}
      description={session.refusal ?? 'This rep cannot start right now.'}
      href={interview ? '/interview' : '/train'}
      locked
    />
  }

  if (loading) return <main className="rep-live"><span className="label rep-connecting">Preparing rep</span></main>
  if (!subject) return <BriefGate title="Rep not found" description="That training partner is not available." href={interview ? '/interview/interviewers' : '/roster'} />
  if (subject.locked) return <BriefGate title={`${subject.name} is locked`} description="This rep has not unlocked yet." href={interview ? '/interview/interviewers' : '/roster'} locked />
  // Two refusals, two sentences. Telling a free account its reps reset tonight
  // is a lie about a midnight that changes nothing, and it hides the only thing
  // they can actually do — see `voiceRefusal` in `lib/data/allowance.ts`.
  if (blockedByReps) {
    return user?.voiceLocked
      ? <BriefGate title="Voice is on Pro" description="Your streak, your field log and text mode all stay open. Voice reps come with Pro." href="/profile/subscription" />
      : <BriefGate title="No reps left today" description="Your daily reps reset tonight." href="/profile/subscription" />
  }
  // A third refusal, and a third screen. An interview credit does not come back
  // at midnight and is not part of any plan, so neither of the two above is
  // true of it — and a surface that explains what it costs beats a dead end.
  if (blockedByCredits) {
    // To the store rather than the interview home: this gate exists because
    // there is nothing to spend, and the balance and the packs live on their
    // own route now.
    return <BriefGate title={creditNote ? 'Not this round' : 'No interview credits'} description={creditNote ?? 'Interviews are bought as credits rather than by the day. They do not expire once you have paid for them.'} href="/interview/credits" />
  }
  if (!live) return <BriefGate title={interview ? 'Interview reps are not open yet' : `${subject.name} is not ready`} description={interview ? 'The interview track opens once its interviewers are written.' : 'This character has no session configured yet.'} href={interview ? '/interview' : '/roster'} />
  if (!online) return <BriefGate title="You're offline" description="Reconnect before starting or resuming this rep." href={interview ? '/interview' : '/train'} />

  const displayBand = interview ? interviewBand(session.band) : session.band
  // Nothing on this screen may claim the rep has started before it has. The
  // avatar is already drawn in and quiet while the transport comes up, but the
  // status line was reading "listening" the whole time — so a first-time user
  // opens with a sentence into a peer connection that does not exist yet, and
  // reads her not answering as the app not hearing him.
  const connecting = session.status === 'connecting'
  const statusLine = connecting
    ? null
    : speakingLabel(session.speaking, subject?.name ?? (interview ? 'interviewer' : 'her'), session.band, session.userLevel)
  const loss = session.outcome && !session.outcome.won
  // Thirty seconds out — the same instant she is told to wind down. Gone once
  // the clock reads zero, because at that point she is finishing, not being
  // hurried.
  // The interview's closing beat is a QUESTION put to the candidate, and it
  // fires on its own proportional constant — thirty seconds is not enough time
  // to answer "do you have any questions for me?" (B7).
  const wrapAt = interview ? interviewWrapUpMs(round) : WRAP_UP_MS
  const wrapCue = !session.outcome && session.status === 'live'
    && session.msRemaining > 0 && session.msRemaining <= wrapAt
  // Which step he is on. Advances on completed exchanges — his turn AND her
  // reply — so a rail that is meant to teach following an answer can never
  // point at one that has not arrived. The wind-down owns the close outright
  // and is the only way to reach it. See `guidedStepFor`.
  //
  // `herLastTurnAsked` is the one thing the rail reads about the CONVERSATION
  // rather than about its length, and it outranks the ladder everywhere except
  // the wind-down: a prompt telling him to ask a follow-up while she is waiting
  // on an answer is not a prompt that fits badly, it is one that talks over her.
  const guidedPrompt = guidedScript
    ? guidedPromptFor(
      guidedScript,
      { userTurns: session.userTurns, agentTurns: session.agentTurns },
      { wrapping: wrapCue, herLastTurnAsked: session.herLastTurnAsked },
    )
    : null
  // F-10. "Listening" was a label, not a signal: a whole rep could run with a
  // muted headset, the wrong input device or a permission the browser quietly
  // withheld, and the interface said the same thing throughout.
  //
  // Gated on never having been heard AT ALL, not on a recent silence, because
  // letting a silence sit is something the format explicitly allows — telling
  // somebody "we can't hear you" while they are deliberately holding a pause
  // would be a worse bug than the one being fixed. It is also not coaching:
  // it says nothing about the conversation (§05).
  const silentFor = durationMs - session.msRemaining
  const unheard = !session.outcome && session.status === 'live'
    && !session.heardUser && silentFor >= SILENCE_NUDGE_MS
  const visualWarmth = session.outcome?.won ? 100 : loss ? 0 : session.warmth
  // The guided rail is lifted out of the centred stack and anchored to the
  // floor of the screen, so the composition above it has to know to stop
  // short. One class, set only on the one character who has a rail.
  return <main className={`rep-live${guidedScript ? ' rep-live--guided' : ''}${connecting ? ' rep-live--connecting' : ''}${loss ? ' rep-live--loss' : ''}${session.outcome?.won ? ' rep-live--win' : ''}${session.outcome ? ' rep-live--over' : ''}${production.arming ? ' rep-live--arming' : ''}`}><div className={`rep-top${chromeDim ? ' rep-top--dim' : ''}`}><button className="rep-back" aria-label={interview ? 'Leave interview' : 'End rep'} disabled={Boolean(session.outcome)} onClick={() => { if (!session.outcome) setEndOpen(true) }}><ChevronLeft size={25} strokeWidth={1.5} /></button><TimeArc msRemaining={session.msRemaining} durationMs={durationMs} /></div>{production.count !== null ? <div className="rep-arm" role="status" aria-live="assertive"><span className="rep-arm__count data" key={production.count}>{production.count}</span><span className="rep-arm__label label">{subject.name} is about to speak</span></div> : null}{/* THE WAIT, GIVEN A SCREEN (11 September).
      It was a 9px label under a fully-drawn avatar, so the first thing a new
      account saw was her — present, rendered, apparently listening — while the
      transport was still opening and nothing they said was reaching anything.
      An interface that draws somebody before she can hear you is telling a
      small lie at the one moment a nervous person is deciding whether this
      works. She is not drawn until she can hear you; until then the screen is
      a skeleton of her, which is §02's answer to a spinner, and it says whose
      ears are not open yet by name rather than as "she". Under the count
      rather than beside it: `onGo` fires at the TOP of the 3·2·1, so most
      connections are open before the last tick and this is never seen at all. */}
{connecting && !production.arming ? <div className="rep-connect" role="status" aria-live="polite"><div className="rep-connect__orb" /><span className="rep-connect__label label">Connecting</span><p className="rep-connect__line">{subject.name} can&apos;t hear you yet</p></div> : null}{interview && captionsEnabled && session.question ? <p className="interview-question">{session.question}</p> : null}<section className="rep-center">{caption && subject ? <div className="rep-caption"><strong>{subject.name}</strong><span>{interview ? interviewer?.styleLabel : persona?.settingShort}</span></div> : null}<div className="orb-stage"><FluidPersona name={subject.name} personaId={subject.id} warmth={visualWarmth} announceWarmth speaking={loss ? 'thinking' : session.speaking} userLevel={session.userLevel} personaLevel={session.personaLevel} status={session.status === 'connecting' ? 'connecting' : 'live'} interactive fill /></div>{!connecting && level < 4 && !session.outcome ? <div className="band-readout"><span className="label" style={{ color: bandCss(session.band) }}>{displayBand}</span>{session.trainingWheels ? <strong className="data"><small>Warmth</small>{session.warmth}<i>/ {session.threshold}</i></strong> : null}</div> : null}{!connecting && !session.outcome && !production.arming ? (guidedPrompt ? <GuidedLine prompt={guidedPrompt} /> : <MissionLine mission={liveMission} />) : null}{wrapCue ? <span className="wrap-cue label">30 seconds · land the conversation</span> : null}{session.outcome?.won && session.outcome.phoneNumber ? <PhoneNumberCard number={session.outcome.phoneNumber} /> : null}{loss ? <p className="exit-line">“{session.outcome?.exitLine}”</p> : null}{unheard ? <p className="silence-nudge" role="status"><MicOff size={15} strokeWidth={1.5} /> We can&apos;t hear you. Check your microphone and input device.</p> : null}<div className="mic-status" aria-live="polite">{statusLine}</div><div className="sr-only" aria-live="polite">{wrapCue ? 'Thirty seconds left. Land the conversation.' : bandAnnouncement(session.band, interview)}</div></section>{interview ? <span className="question-count data">Q{session.questionIndex} / {session.questionTotal}</span> : null}{resumeCount ? <div className="resume-count data">{resumeCount}</div> : null}{/* The back arrow reaches this too, including on a rep that never started.
      `session.error` is only ever set by a failed start, so it is the exact
      test for "there is no rep here to finish" — and on that path ending has
      to navigate, because there will be no outcome to navigate on. */}
<EndRepModal interview={interview} open={endOpen} onClose={() => setEndOpen(false)} onEnd={() => { setEndOpen(false); if (session.error) leave(); else session.end() }} /><MicLostModal open={micLost} onResume={() => { setMicLost(false); resume() }} onEnd={() => { setMicLost(false); session.end() }} /><MicBlockedSheet open={micBlocked} onClose={() => { setMicBlocked(false); leave() }} onRetry={() => { setMicBlocked(false); session.retry() }} />{/* `session.end()` finishes the rep; it does not navigate, and on a rep
      that never connected there is no outcome for the effect above to
      navigate ON. So leaving is said explicitly here — this modal's End
      button did nothing at all until it was. */}
<ConnectionLostModal open={session.error === 'connection'} attempt={session.retryAttempt} onRetry={session.retry} onEnd={leave} /><DistressModal open={session.safety.distress} onClose={() => { navigatedRef.current = true; router.push('/train') }} /></main>
}

function BriefGate({ title, description, href, locked = false }: { title: string; description: string; href: string; locked?: boolean }) {
  return <main className="brief-page"><section className="brief-shell brief-gate">{locked ? <LockKeyhole size={34} strokeWidth={1.5} /> : <WifiOff size={34} strokeWidth={1.5} />}<span className="label">Rep unavailable</span><h1 className="display-lg">{title}</h1><p className="brief-hook">{description}</p><Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={href}>Go back</Link></section></main>
}

/** How long a rep may hear nothing before it says so (F-10). */
const SILENCE_NUDGE_MS = 15_000

function speakingLabel(speaking: SpeakingState, name: string, band: Band, level: number) {
  if (speaking === 'thinking') return null
  if (speaking === 'persona') return <><b style={{ background: bandCss(band) }} /> {name.toLowerCase()}</>
  // "Listening" used to be a word beside a dot that never moved. It is now the
  // input stream itself — the same analyser the avatar reads — so a
  // microphone that is not working is visible rather than merely claimed.
  return <><InputMeter level={level} /> {speaking === 'user' ? 'you' : 'listening'}</>
}

/**
 * The live input level (F-10).
 *
 * Four hairlines rather than a number: this is a signal that something is
 * arriving, not a measurement anybody should read. It sits inside the status
 * line it replaces, so nothing new competes with the bloom (§05).
 */
function InputMeter({ level }: { level: number }) {
  const bars = 4
  const lit = Math.min(bars, Math.round(level * bars * 1.6))
  return (
    <span className="input-meter" aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => (
        <i key={index} className={index < lit ? 'is-live' : undefined} />
      ))}
    </span>
  )
}

function bandCss(band: Band) { return `var(--band-${band.toLowerCase()})` }
// The relabel lives in `lib/warmth/interview/bands.ts` beside the table it
// names, so a band cannot appear with no word for it.
function interviewBand(band: Band) { return INTERVIEW_BAND_LABEL[band] }
function bandAnnouncement(band: Band, interview: boolean) { if (interview) return `Their impression is ${interviewBand(band).toLowerCase()}.`; return ({ CLOSED: "She's closed off.", GUARDED: "She's guarded.", OPEN: "She's opening up.", ENGAGED: "She's engaged.", INVESTED: "She's invested." } as const)[band] }

/**
 * One thing to work on, drawn from the last rep (§10 D, §11).
 *
 * §11 lists the brief as "Scene, mission, technique of the session". The first
 * two shipped; this is the third, and it is the only place in the product where
 * a technique arrives before the rep rather than after it.
 *
 * Deliberately one card and one line. §05 forbids coaching *during* a rep, and
 * a briefing that turns into a lesson is the same mistake moved thirty seconds
 * earlier — the moment before the mic opens stays a single action.
 *
 * Before the first graded rep it falls back to the onboarding answer, which is
 * the only thing we know about somebody who has not trained yet — and which
 * used to buy them nothing at all. It is still advice about a rep they have
 * run, in the world; it is just their word for it rather than a grader's.
 *
 * Silent when there is neither. Advice invented out of nothing is not advice.
 */
function TechniqueOfTheSession({ focus }: { focus: 'opening' | 'sustaining' | 'flirting' | 'rejection' | null }) {
  const { data: graded, loading } = useLatestFocus()
  const weakest = graded[0]
  const fromGrade = weakest ? techniqueForSubScore(weakest) : null
  const plan = focusPlan(focus)
  const card = fromGrade ?? (plan ? techniqueBySlug(plan.cardSlug) : null)
  if (loading || !card) return null
  return (
    <Link href={`/library/${card.slug}`} className="brief-technique">
      <span className="label">{fromGrade ? 'Work on' : 'You said the hard part is'} · {fromGrade ? card.title : plan?.label}</span>
      <p>{fromGrade ? card.summary : `${card.title}. ${card.summary}`}</p>
    </Link>
  )
}

/**
 * Whether this browser has already been shown the primer.
 *
 * Per-browser rather than per-account on purpose: the thing being explained is
 * a browser dialog, and the same person on a new laptop is about to see it
 * again for the first time. Wrapped because private-mode storage throws.
 */
const PRIMER_KEY = 'nerve.mic.primed'

function primerSeen(): boolean {
  try { return globalThis.localStorage?.getItem(PRIMER_KEY) === '1' } catch { return false }
}

function rememberPrimer(): void {
  try { globalThis.localStorage?.setItem(PRIMER_KEY, '1') } catch { /* private mode */ }
}
