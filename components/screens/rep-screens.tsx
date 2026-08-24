'use client'

import Link from 'next/link'
import { ChevronLeft, LockKeyhole, WifiOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useInterviewers, usePersona, usePersonaMemory, usePersonaProgress, useUserState } from '@/lib/data'
import { MemoryLine } from './memory-line'
import { DATING_DURATION_MS, useRepSession, type LiveRepConfig, type SpeakingState } from '@/lib/data/rep'
import { WRAP_UP_MS } from '@/lib/data/rep-rules'
import type { Band } from '@/lib/data/types'
import { TOP_TIER } from '@/lib/data/progression'
import { Button, Skeleton } from '@/components/ui'
import { RuleBlock } from './onboarding-screens'
import { ConnectionLostModal, EndRepModal, HowItWorksSheet, MicLostModal, PaywallSheet, TrainingWheelsOffModal } from '@/components/modals'
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
  const level = subject?.level ?? 1

  const enter = () => {
    if (!online || subject?.locked) return
    if ((user?.repsRemainingToday ?? 1) === 0) { setPaywall(true); return }
    if (level === TOP_TIER && !trainingOff) { setTrainingOff(true); return }
    setCurtain(true)
    window.setTimeout(() => router.push(interview ? `/interview/rep/${personaId}/live` : `/rep/${personaId}/live`), 560)
  }

  const loading = userLoading || (interview ? interviewersLoading : personaLoading)
  if (loading) return <main className="brief-page"><div className="brief-shell"><Skeleton width={96} height={96} style={{ borderRadius: '50%' }} /><Skeleton width={160} height={34} /><Skeleton height={180} /></div></main>
  if (!subject) return <BriefGate title="Rep not found" description="That training partner is not available." href={interview ? '/interview/interviewers' : '/roster'} />
  if (subject.locked) return <BriefGate title={`${subject.name} is locked`} description={interview ? 'Reach level 4 to unlock this interviewer.' : persona?.unlockRequirement ?? 'Keep training to unlock this rep.'} href={interview ? '/interview/interviewers' : '/roster'} locked />
  const setting = interview ? `${interviewer?.styleLabel ?? 'Interviewer'} · ${interviewer?.gender ?? ''}` : persona?.setting ?? ''
  const hook = interview ? interviewer?.blurb ?? '' : persona?.hook ?? ''
  const back = interview ? '/interview/interviewers' : `/roster/${personaId}`
  return <main className={`brief-page${curtain ? ' brief-page--curtain' : ''}`}><Link className="rep-back" href={back} aria-label="Back"><ChevronLeft size={24} strokeWidth={1.5} /></Link><section className="brief-shell"><FluidPersona name={subject.name} personaId={subject.id} warmth={progress && progress.attempts > 0 ? progress.bestWarmth : 18} size={132} /><h1 className="display-lg">{subject.name}</h1><span className="label">{setting}</span><p className="brief-hook">{hook}</p>{!interview && progress && progress.attempts > 0 ? <span className="label mute">Your best: warmth {progress.bestWarmth}{progress.wins > 0 ? `, ${progress.wins} number${progress.wins === 1 ? '' : 's'}` : ', no number'}</span> : null}{!interview ? <MemoryLine personaId={personaId} name={subject.name} memory={memory.data} onForgotten={memory.reload} /> : null}<RuleBlock interview={interview} />{!online ? <p className="brief-offline"><WifiOff size={15} strokeWidth={1.5} /> Reconnect to start a rep.</p> : null}<Button size="lg" fullWidth onClick={enter} disabled={!online}>{online ? 'Start' : 'Offline'}</Button><Button variant="ghost" fullWidth onClick={() => setHow(true)}>How does this work?</Button></section><HowItWorksSheet open={how} onClose={() => setHow(false)} /><PaywallSheet open={paywall} onClose={() => setPaywall(false)} /><TrainingWheelsOffModal open={trainingOff} onClose={() => { setTrainingOff(false); setCurtain(true); window.setTimeout(() => router.push(interview ? `/interview/rep/${personaId}/live` : `/rep/${personaId}/live`), 560) }} /></main>
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
  useEffect(() => { if (session.error === 'mic') setMicLost(true) }, [session.error])
  useEffect(() => { if (!online) pause(); else if (session.paused && !micLost) resume() }, [micLost, online, pause, resume, session.paused])
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
    const delay = outcome.won ? 2700 : 1900
    // A rep with no row — the insert failed, or the user was signed out — has
    // no result screen to go to. Back to training rather than a dead link.
    const timer = window.setTimeout(() => { navigatedRef.current = true; router.push(sessionId ? `/session/${sessionId}/result` : '/train') }, delay)
    return () => window.clearTimeout(timer)
  }, [outcome, router, sessionId])

  if (loading) return <main className="rep-live"><span className="label rep-connecting">Preparing rep</span></main>
  if (!subject) return <BriefGate title="Rep not found" description="That training partner is not available." href={interview ? '/interview/interviewers' : '/roster'} />
  if (subject.locked) return <BriefGate title={`${subject.name} is locked`} description="This rep has not unlocked yet." href={interview ? '/interview/interviewers' : '/roster'} locked />
  if (blockedByReps) return <BriefGate title="No reps left today" description="Your daily reps reset tonight." href="/profile/subscription" />
  if (!live) return <BriefGate title={interview ? 'Interview reps are not open yet' : `${subject.name} is not ready`} description={interview ? 'The interview track opens once its interviewers are written.' : 'This character has no session configured yet.'} href={interview ? '/interview' : '/roster'} />
  if (!online) return <BriefGate title="You're offline" description="Reconnect before starting or resuming this rep." href={interview ? '/interview' : '/train'} />

  const displayBand = interview ? interviewBand(session.band) : session.band
  const statusLine = speakingLabel(session.speaking, subject?.name ?? (interview ? 'interviewer' : 'her'), session.band)
  const loss = session.outcome && !session.outcome.won
  // Thirty seconds out — the same instant she is told to wind down. Gone once
  // the clock reads zero, because at that point she is finishing, not being
  // hurried.
  const wrapCue = !session.outcome && session.status === 'live'
    && session.msRemaining > 0 && session.msRemaining <= WRAP_UP_MS
  const visualWarmth = session.outcome?.won ? 100 : loss ? 0 : session.warmth
  return <main className={`rep-live${loss ? ' rep-live--loss' : ''}${session.outcome?.won ? ' rep-live--win' : ''}`}><div className={`rep-top${chromeDim ? ' rep-top--dim' : ''}`}><button className="rep-back" aria-label="End rep" disabled={Boolean(session.outcome)} onClick={() => { if (!session.outcome) setEndOpen(true) }}><ChevronLeft size={25} strokeWidth={1.5} /></button><TimeArc msRemaining={session.msRemaining} durationMs={durationMs} /></div>{interview && session.question ? <p className="interview-question">{session.question}</p> : null}<section className="rep-center">{caption && subject ? <div className="rep-caption"><strong>{subject.name}</strong><span>{interview ? interviewer?.styleLabel : persona?.settingShort}</span></div> : null}<div className="orb-stage"><FluidPersona name={subject.name} personaId={subject.id} warmth={visualWarmth} announceWarmth speaking={loss ? 'thinking' : session.speaking} userLevel={session.userLevel} personaLevel={session.personaLevel} status={session.status === 'connecting' ? 'connecting' : 'live'} interactive fill /></div>{session.status === 'connecting' ? <span className="label rep-connecting">Connecting</span> : null}{session.status !== 'connecting' && level < 4 && !session.outcome ? <div className="band-readout"><span className="label" style={{ color: bandCss(session.band) }}>{displayBand}</span>{session.trainingWheels ? <strong className="data"><small>Warmth</small>{session.warmth}<i>/ {session.threshold}</i></strong> : null}</div> : null}{wrapCue ? <span className="wrap-cue label">30 seconds · land the conversation</span> : null}{session.outcome?.won && session.outcome.phoneNumber ? <PhoneNumberCard number={session.outcome.phoneNumber} /> : null}{loss ? <p className="exit-line">“{session.outcome?.exitLine}”</p> : null}<div className="mic-status" aria-live="polite">{statusLine}</div><div className="sr-only" aria-live="polite">{wrapCue ? 'Thirty seconds left. Land the conversation.' : bandAnnouncement(session.band, interview)}</div></section>{interview ? <span className="question-count data">Q{session.questionIndex} / {session.questionTotal}</span> : null}{resumeCount ? <div className="resume-count data">{resumeCount}</div> : null}<EndRepModal open={endOpen} onClose={() => setEndOpen(false)} onEnd={() => { setEndOpen(false); session.end() }} /><MicLostModal open={micLost} onResume={() => { setMicLost(false); resume() }} onEnd={() => { setMicLost(false); session.end() }} /><ConnectionLostModal open={session.error === 'connection'} attempt={session.retryAttempt} onRetry={session.retry} onEnd={session.end} /></main>
}

function BriefGate({ title, description, href, locked = false }: { title: string; description: string; href: string; locked?: boolean }) {
  return <main className="brief-page"><section className="brief-shell brief-gate">{locked ? <LockKeyhole size={34} strokeWidth={1.5} /> : <WifiOff size={34} strokeWidth={1.5} />}<span className="label">Rep unavailable</span><h1 className="display-lg">{title}</h1><p className="brief-hook">{description}</p><Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={href}>Go back</Link></section></main>
}

function speakingLabel(speaking: SpeakingState, name: string, band: Band) {
  if (speaking === 'thinking') return null
  if (speaking === 'none') return <><i style={{ background: 'var(--volt)' }} /> listening</>
  if (speaking === 'user') return <><i style={{ background: 'var(--cool)' }} /> you</>
  if (speaking === 'persona') return <><b style={{ background: bandCss(band) }} /> {name.toLowerCase()}</>
  return <><i style={{ background: 'var(--volt)' }} /> listening</>
}

function bandCss(band: Band) { return `var(--band-${band.toLowerCase()})` }
function interviewBand(band: Band) { return ({ CLOSED: 'SKEPTICAL', GUARDED: 'NEUTRAL', OPEN: 'INTERESTED', ENGAGED: 'IMPRESSED', INVESTED: 'CONVINCED' } as const)[band] }
function bandAnnouncement(band: Band, interview: boolean) { if (interview) return `Their impression is ${interviewBand(band).toLowerCase()}.`; return ({ CLOSED: "She's closed off.", GUARDED: "She's guarded.", OPEN: "She's opening up.", ENGAGED: "She's engaged.", INVESTED: "She's invested." } as const)[band] }
