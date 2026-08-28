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
import type { Band } from '@/lib/data/types'
import { TOP_TIER } from '@/lib/data/progression'
import { Button, Skeleton } from '@/components/ui'
import { RuleBlock } from './onboarding-screens'
import { ConnectionLostModal, DistressModal, EndRepModal, HowItWorksSheet, MicBlockedSheet, MicLostModal, MicPrimerSheet, PaywallSheet, TrainingWheelsOffModal } from '@/components/modals'
import { micPermission, type MicPermission } from '@/lib/data/mic'
import { PhoneNumberCard, TimeArc } from '@/components/rep-visuals'
import { useOnlineStatus } from '@/lib/hooks/use-online-status'
import { FluidPersona } from '@/components/fluid-persona'

interface RepScreenProps {
  personaId: string
  interview?: boolean
  query?: Record<string, string | undefined>
  /**
   * Everything the transport needs, resolved on the server. Null when this
   * character has no engine config — the eight-persona roster is being
   * written, and a rep against a character nobody authored is not a rep.
   */
  live?: LiveRepConfig | null
}

export function RepBriefScreen({ personaId, interview = false }: RepScreenProps) {
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

  const start = () => {
    setCurtain(true)
    window.setTimeout(() => router.push(interview ? `/interview/rep/${personaId}/live` : `/rep/${personaId}/live`), 560)
  }

  const enter = () => {
    if (!online || subject?.locked) return
    if ((user?.repsRemainingToday ?? 1) === 0) { setPaywall(true); return }
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
  const setting = interview ? `${interviewer?.styleLabel ?? 'Interviewer'} · ${interviewer?.gender ?? ''}` : persona?.setting ?? ''
  const hook = interview ? interviewer?.blurb ?? '' : persona?.hook ?? ''
  const back = interview ? '/interview/interviewers' : `/roster/${personaId}`
  return <main className={`brief-page${curtain ? ' brief-page--curtain' : ''}`}><Link className="rep-back" href={back} aria-label="Back"><ChevronLeft size={24} strokeWidth={1.5} /></Link><section className="brief-shell"><FluidPersona name={subject.name} personaId={subject.id} warmth={progress && progress.attempts > 0 ? progress.bestWarmth : 18} size={132} /><h1 className="display-lg">{subject.name}</h1><span className="label">{setting}</span><p className="brief-hook">{hook}</p>{!interview && progress && progress.attempts > 0 ? <span className="label mute">Your best: warmth {progress.bestWarmth}{progress.wins > 0 ? `, ${progress.wins} number${progress.wins === 1 ? '' : 's'}` : ', no number'}</span> : null}{!interview ? <MemoryLine personaId={personaId} name={subject.name} memory={memory.data} onForgotten={memory.reload} /> : null}<RuleBlock interview={interview} />{!interview ? <TechniqueOfTheSession focus={user?.focusArea ?? null} /> : null}{!online ? <p className="brief-offline"><WifiOff size={15} strokeWidth={1.5} /> Reconnect to start a rep.</p> : null}<Button size="lg" fullWidth onClick={enter} disabled={!online}>{online ? 'Start' : 'Offline'}</Button>{/* The way out of the microphone, offered at the exact moment somebody
    is deciding whether to grant it (P1). Same character, no permission,
    no quota — and it is a link rather than a modal because a person
    hesitating here should not have to answer another question. */}
{!interview ? <Link className="arena-button arena-button--ghost arena-button--full" href={`/text/${personaId}`}>Not ready to talk? Type instead</Link> : null}<Button variant="ghost" fullWidth onClick={() => setHow(true)}>How does this work?</Button></section><HowItWorksSheet open={how} onClose={() => setHow(false)} /><PaywallSheet open={paywall} onClose={() => setPaywall(false)} /><TrainingWheelsOffModal open={trainingOff} onClose={() => { setTrainingOff(false); setCurtain(true); window.setTimeout(() => router.push(interview ? `/interview/rep/${personaId}/live` : `/rep/${personaId}/live`), 560) }} /><MicPrimerSheet open={primer} onClose={() => setPrimer(false)} onAllow={() => { rememberPrimer(); setPrimer(false); start() }} /></main>
}

export function RepLiveScreen({ personaId, interview = false, live = null }: RepScreenProps) {
  const router = useRouter()
  const { data: persona, loading: personaLoading } = usePersona(personaId)
  const { data: interviewers, loading: interviewersLoading } = useInterviewers()
  const { data: user, loading: userLoading } = useUserState()
  const online = useOnlineStatus()
  const interviewer = interviewers.find((item) => item.id === personaId)
  const subject = interview ? interviewer : persona
  const level = subject?.level ?? 1
  // Two minutes, and she leaves when they run out (§05).
  const durationMs = interview ? 480_000 : DATING_DURATION_MS
  const session = useRepSession(personaId, { durationMs, trainingWheels: level < 4, interview, config: live })
  const [endOpen, setEndOpen] = useState(false)
  const [chromeDim, setChromeDim] = useState(false)
  const [caption, setCaption] = useState(true)
  const [resumeCount, setResumeCount] = useState<number | null>(null)
  const [micLost, setMicLost] = useState(false)
  const navigatedRef = useRef(false)
  const resumeTimerRef = useRef<number | null>(null)
  const { start, pause, resume, outcome, sessionId } = session

  const loading = userLoading || (interview ? interviewersLoading : personaLoading)
  const blockedByReps = !userLoading && (user?.repsRemainingToday ?? 0) <= 0
  useEffect(() => { if (!loading && subject && !subject.locked && !blockedByReps && online && live) start() }, [blockedByReps, live, loading, online, start, subject])
  useEffect(() => { if (micLost) pause() }, [micLost, pause])
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

  if (loading) return <main className="rep-live"><span className="label rep-connecting">Preparing rep</span></main>
  if (!subject) return <BriefGate title="Rep not found" description="That training partner is not available." href={interview ? '/interview/interviewers' : '/roster'} />
  if (subject.locked) return <BriefGate title={`${subject.name} is locked`} description="This rep has not unlocked yet." href={interview ? '/interview/interviewers' : '/roster'} locked />
  if (blockedByReps) return <BriefGate title="No reps left today" description="Your daily reps reset tonight." href="/profile/subscription" />
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
  const wrapCue = !session.outcome && session.status === 'live'
    && session.msRemaining > 0 && session.msRemaining <= WRAP_UP_MS
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
  return <main className={`rep-live${loss ? ' rep-live--loss' : ''}${session.outcome?.won ? ' rep-live--win' : ''}`}><div className={`rep-top${chromeDim ? ' rep-top--dim' : ''}`}><button className="rep-back" aria-label="End rep" disabled={Boolean(session.outcome)} onClick={() => { if (!session.outcome) setEndOpen(true) }}><ChevronLeft size={25} strokeWidth={1.5} /></button><TimeArc msRemaining={session.msRemaining} durationMs={durationMs} /></div>{interview && session.question ? <p className="interview-question">{session.question}</p> : null}<section className="rep-center">{caption && subject ? <div className="rep-caption"><strong>{subject.name}</strong><span>{interview ? interviewer?.styleLabel : persona?.settingShort}</span></div> : null}<div className="orb-stage"><FluidPersona name={subject.name} personaId={subject.id} warmth={visualWarmth} announceWarmth speaking={loss ? 'thinking' : session.speaking} userLevel={session.userLevel} personaLevel={session.personaLevel} status={session.status === 'connecting' ? 'connecting' : 'live'} interactive fill /></div>{connecting ? <span className="label rep-connecting">Connecting · she can’t hear you yet</span> : null}{!connecting && level < 4 && !session.outcome ? <div className="band-readout"><span className="label" style={{ color: bandCss(session.band) }}>{displayBand}</span>{session.trainingWheels ? <strong className="data"><small>Warmth</small>{session.warmth}<i>/ {session.threshold}</i></strong> : null}</div> : null}{wrapCue ? <span className="wrap-cue label">30 seconds · land the conversation</span> : null}{session.outcome?.won && session.outcome.phoneNumber ? <PhoneNumberCard number={session.outcome.phoneNumber} /> : null}{loss ? <p className="exit-line">“{session.outcome?.exitLine}”</p> : null}{unheard ? <p className="silence-nudge" role="status"><MicOff size={15} strokeWidth={1.5} /> We can&apos;t hear you. Check your microphone and input device.</p> : null}<div className="mic-status" aria-live="polite">{statusLine}</div><div className="sr-only" aria-live="polite">{wrapCue ? 'Thirty seconds left. Land the conversation.' : bandAnnouncement(session.band, interview)}</div></section>{interview ? <span className="question-count data">Q{session.questionIndex} / {session.questionTotal}</span> : null}{resumeCount ? <div className="resume-count data">{resumeCount}</div> : null}<EndRepModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={() => { setEndOpen(false); session.end() }} /><MicLostModal open={micLost} onResume={() => { setMicLost(false); resume() }} onEnd={() => { setMicLost(false); session.end() }} /><MicBlockedSheet open={micBlocked} onClose={() => { setMicBlocked(false); session.end() }} onRetry={() => { setMicBlocked(false); session.retry() }} /><ConnectionLostModal open={session.error === 'connection'} attempt={session.retryAttempt} onRetry={session.retry} onEnd={session.end} /><DistressModal open={session.safety.distress} onClose={() => { navigatedRef.current = true; router.push('/train') }} /></main>
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
function interviewBand(band: Band) { return ({ CLOSED: 'SKEPTICAL', GUARDED: 'NEUTRAL', OPEN: 'INTERESTED', ENGAGED: 'IMPRESSED', INVESTED: 'CONVINCED' } as const)[band] }
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
