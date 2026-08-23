'use client'

import Link from 'next/link'
import { Check, ChevronLeft, Mic, MicOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { usePersona } from '@/lib/data'
import { finishOnboarding, saveOnboardingChoice } from '@/app/profile/actions'
import { Avatar, Button, Chip, Sheet } from '@/components/ui'

type OnboardingRoute = '/onboarding/track' | '/onboarding/focus' | '/onboarding/experience' | '/onboarding/mic' | '/onboarding/ready'

const stepMap: Record<OnboardingRoute, number> = {
  '/onboarding/track': 0, '/onboarding/focus': 1, '/onboarding/experience': 2, '/onboarding/mic': 3, '/onboarding/ready': 4,
}

export function OnboardingScreen({ route }: { route: OnboardingRoute }) {
  const step = stepMap[route]
  return <main className="onboarding-page"><OnboardingProgress step={step} />{step > 0 ? <Link className="onboarding-back" aria-label="Back" href={previous(route)}><ChevronLeft size={24} strokeWidth={1.5} /></Link> : null}<div className="onboarding-shell">{route === '/onboarding/track' ? <TrackStep /> : null}{route === '/onboarding/focus' ? <FocusStep /> : null}{route === '/onboarding/experience' ? <ExperienceStep /> : null}{route === '/onboarding/mic' ? <MicStep /> : null}{route === '/onboarding/ready' ? <ReadyStep /> : null}</div></main>
}

function previous(route: OnboardingRoute): string {
  const routes: OnboardingRoute[] = ['/onboarding/track', '/onboarding/focus', '/onboarding/experience', '/onboarding/mic', '/onboarding/ready']
  return routes[Math.max(0, routes.indexOf(route) - 1)] ?? '/onboarding/track'
}

function OnboardingProgress({ step }: { step: number }) {
  return <div className="onboarding-progress" aria-label={`Step ${step + 1} of 5`}>{[0, 1, 2, 3, 4].map((index) => <i key={index} className={index <= step ? 'done' : ''} />)}</div>
}

function TrackStep() {
  const router = useRouter()
  const [waitlist, setWaitlist] = useState(false)
  const choose = (value: 'dating' | 'interview') => {
    // Interview is M4. Recording the demand is the honest version of a track
    // that does not exist yet; switching them to it would not be.
    if (value === 'interview') { window.setTimeout(() => setWaitlist(true), 180); return }
    void saveOnboardingChoice({ track: 'dating' })
    window.setTimeout(() => router.push('/onboarding/focus'), 180)
  }
  if (waitlist) return <div className="onboarding-state"><span className="label volt">Demand recorded</span><h1 className="display-lg">Interview training opens soon.</h1><p>You&apos;re on the list. Dating reps are already live if you want to start building the same conversational control.</p><Button fullWidth size="lg" onClick={() => router.push('/onboarding/focus')}>Try a dating rep meanwhile</Button><Button fullWidth variant="ghost">I&apos;ll wait</Button></div>
  return <Question title="What are you training for?"><Option label="Talking to people I'm attracted to" sub="Approach, conversation, getting the number" onClick={() => choose('dating')} /><Option label="Job interviews" sub="Behavioural, technical, panel" onClick={() => choose('interview')} /><Option label="Speaking English more naturally" sub="Coming soon" disabled aside={<Chip>Soon</Chip>} /></Question>
}

const FOCUS_OPTIONS = [
  { label: 'Starting the conversation', value: 'opening' },
  { label: 'Keeping it going past two lines', value: 'sustaining' },
  { label: 'Making it flirty without being weird', value: 'flirting' },
  { label: "Handling it when she's not interested", value: 'rejection' },
] as const

function FocusStep() {
  const router = useRouter()
  const choose = (focusArea: (typeof FOCUS_OPTIONS)[number]['value']) => {
    void saveOnboardingChoice({ focusArea })
    window.setTimeout(() => router.push('/onboarding/experience'), 180)
  }
  return <Question title="What's the hard part?">{FOCUS_OPTIONS.map((option) => <Option key={option.value} label={option.label} onClick={() => choose(option.value)} />)}</Question>
}

const EXPERIENCE_OPTIONS = [
  { label: 'Basically never', value: 'never' },
  { label: 'Once in a while', value: 'sometimes' },
  { label: 'Fairly often, want to get sharper', value: 'often' },
] as const

function ExperienceStep() {
  const router = useRouter()
  const choose = (experience: (typeof EXPERIENCE_OPTIONS)[number]['value']) => {
    void saveOnboardingChoice({ experience })
    window.setTimeout(() => router.push('/onboarding/mic'), 180)
  }
  return <Question title="How often do you do this for real?">{EXPERIENCE_OPTIONS.map((option) => <Option key={option.value} label={option.label} onClick={() => choose(option.value)} />)}</Question>
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="onboarding-question"><h1 className="display-lg">{title}</h1><div className="option-stack">{children}</div></section>
}

function Option({ label, sub, aside, disabled = false, onClick }: { label: string; sub?: string; aside?: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  const [selected, setSelected] = useState(false)
  return <button className={`option-card${selected ? ' option-card--selected' : ''}`} disabled={disabled} onClick={() => { setSelected(true); onClick?.() }}><span><strong>{label}</strong>{sub ? <small>{sub}</small> : null}</span>{aside}</button>
}

type MicState = 'request' | 'denied' | 'testing' | 'confirmed'
interface AudioDevice { deviceId: string; label: string }

function MicStep() {
  const router = useRouter()
  const [state, setState] = useState<MicState>('request')
  const [level, setLevel] = useState(0)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  const stop = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => stop, [])

  const request = async () => {
    stop()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      streamRef.current = stream
      const listed = await navigator.mediaDevices.enumerateDevices()
      setDevices(listed.filter((item) => item.kind === 'audioinput').map((item, index) => ({ deviceId: item.deviceId, label: item.label || `Microphone ${index + 1}` })))
      setState('testing')
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      context.createMediaStreamSource(stream).connect(analyser)
      const values = new Uint8Array(analyser.frequencyBinCount)
      let aboveSince = 0
      const tick = () => {
        analyser.getByteFrequencyData(values)
        let sum = 0
        for (const value of values) sum += value * value
        const next = Math.min(1, Math.sqrt(sum / values.length) / 90)
        setLevel(next)
        if (next > .12) {
          if (aboveSince === 0) aboveSince = performance.now()
          if (performance.now() - aboveSince > 800) { setState('confirmed'); void context.close(); return }
        } else aboveSince = 0
        frameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch { setState('denied') }
  }

  return <section className="mic-check">{state === 'request' ? <><Mic size={52} strokeWidth={1.25} className="volt" /><h1 className="display-lg">We need your microphone</h1><p>Reps are spoken out loud. Nothing is recorded to disk.</p><Button size="lg" fullWidth onClick={() => void request()}>Allow microphone</Button></> : null}{state === 'denied' ? <><MicOff size={52} strokeWidth={1.25} className="danger" /><h1 className="display-lg">We can&apos;t hear you</h1><p>Click the lock in your address bar, open Site settings, set Microphone to Allow, then try again.</p><Button variant="secondary" size="lg" fullWidth onClick={() => void request()}>Try again</Button></> : null}{state === 'testing' ? <><span className="label">Mic level</span><MicLevelMeter level={level} /><h1 className="display-md">Say: “testing, one two three”</h1><p>Headphones recommended — she&apos;ll hear herself otherwise.</p><DevicePicker devices={devices} value={deviceId} onChange={(value) => { setDeviceId(value); void request() }} /></> : null}{state === 'confirmed' ? <><Check size={52} strokeWidth={1.25} className="volt" /><h1 className="display-lg">We can hear you</h1><div className="mic-transcript data">“testing, one two three”</div><DevicePicker devices={devices} value={deviceId} onChange={setDeviceId} /><Button size="lg" fullWidth onClick={() => { stop(); router.push('/onboarding/ready') }}>Continue</Button></> : null}</section>
}

function MicLevelMeter({ level }: { level: number }) {
  const active = Math.round(level * 12)
  return <div className="mic-meter" aria-label={`Microphone level ${Math.round(level * 100)} percent`}>{Array.from({ length: 12 }, (_, index) => <i key={index} className={index < active ? 'active' : ''} />)}</div>
}

function DevicePicker({ devices, value, onChange }: { devices: AudioDevice[]; value: string; onChange: (value: string) => void }) {
  return <label className="device-picker"><span className="label">Input device</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">System default</option>{devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
}

function ReadyStep() {
  const router = useRouter()
  const { data: persona } = usePersona('nadia')
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  if (!persona) return <div className="brief-shell"><div className="skeleton" style={{ width: 96, height: 96, borderRadius: '50%' }} /></div>
  // Awaited, not fired and forgotten: the route guard sends anyone whose
  // onboarding is unfinished straight back here, so leaving before the write
  // lands is a loop rather than a rep.
  const start = async () => {
    setStarting(true)
    await finishOnboarding()
    router.push('/rep/nadia/brief?calibration=1')
  }
  return <section className="brief-shell"><Avatar name={persona.name} src={persona.portraitUrl} size={96} /><h1 className="display-lg">{persona.name}</h1><span className="label">{persona.setting}</span><p className="brief-hook">{persona.hook}</p><RuleBlock interview={false} /><Button size="lg" fullWidth loading={starting} onClick={() => void start()}>Start</Button><Button variant="ghost" fullWidth onClick={() => setOpen(true)}>How does this work?</Button><HowItWorks open={open} onClose={() => setOpen(false)} /></section>
}

export function RuleBlock({ interview }: { interview: boolean }) {
  const rows = interview ? [['Time', '8:00'], ['Goal', 'Get a callback'], ['It ends', "When they've heard enough"]] : [['Time', '3:00'], ['Goal', 'Get her number'], ['She leaves', 'When time runs out']]
  return <div className="rule-block">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="How a rep works"><div className="how-list">{['Talk out loud.', 'You have three minutes.', 'The ring shows how she feels.', 'She decides at the end whether you get her number.'].map((item, index) => <div key={item}><span className="data">0{index + 1}</span><p>{item}</p></div>)}</div><div className="ring-illustration" aria-hidden="true"><i /><i /><i /></div></Sheet>
}

export type { OnboardingRoute }
