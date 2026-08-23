'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import type { Band } from '@/lib/data/types'
import type { SpeakingState } from '@/lib/data/rep'

const bandColor: Record<Band, string> = {
  CLOSED: 'var(--band-closed)', GUARDED: 'var(--band-guarded)', OPEN: 'var(--band-open)', ENGAGED: 'var(--band-engaged)', INVESTED: 'var(--band-invested)',
}

export function Orb({ speaking, userLevel, personaLevel, band, neutral = false }: { speaking: SpeakingState; userLevel: number; personaLevel: number; band: Band; neutral?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const levelsRef = useRef({ userLevel, personaLevel, speaking })
  useEffect(() => { levelsRef.current = { userLevel, personaLevel, speaking } }, [personaLevel, speaking, userLevel])
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      node.style.setProperty('--amp', '.2')
      node.style.setProperty('--glow', '.24')
      return
    }
    let frame = 0
    let smoothed = .08
    const render = () => {
      const current = levelsRef.current
      const raw = current.speaking === 'user' ? current.userLevel : current.speaking === 'persona' ? current.personaLevel : current.speaking === 'thinking' ? .02 : .08
      smoothed += (raw - smoothed) * .25
      node.style.setProperty('--amp', smoothed.toFixed(3))
      node.style.setProperty('--glow', Math.min(.86, .16 + smoothed * .72).toFixed(3))
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [])
  const style = { '--orb-color': neutral ? 'var(--text-dim)' : bandColor[band] } as CSSProperties
  return <div ref={ref} className={`orb orb--${speaking}`} style={style} aria-hidden="true"><div className="orb__glow" /><div className="orb__body"><i className="orb__inner" /></div></div>
}

export function WarmthRing({ value, threshold, band, delta, neutral = false, settled = false }: { value: number; threshold: number; band: Band; delta: number; neutral?: boolean; settled?: boolean }) {
  const size = 330
  const stroke = 4
  const radius = 158
  const circumference = 2 * Math.PI * radius
  const color = neutral ? 'var(--text-dim)' : bandColor[band]
  const pulse = !settled && delta !== 0 ? <i key={delta} className={`warmth-ring__pulse warmth-ring__pulse--${delta > 0 ? 'positive' : 'negative'}`} /> : null
  return <div className={`warmth-ring${settled ? ' warmth-ring--settled' : ''}`} style={{ '--threshold-angle': `${threshold * 3.6}deg` } as CSSProperties}><svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} /><circle className="warmth-ring__value" cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, value)) / 100)} /></svg><i className="threshold-tick" />{pulse}</div>
}

export function TimeArc({ msRemaining, durationMs }: { msRemaining: number; durationMs: number }) {
  const seconds = Math.max(0, Math.ceil(msRemaining / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const warning = seconds <= 20
  const size = 28
  const radius = 11
  const circumference = 2 * Math.PI * radius
  const progress = durationMs ? msRemaining / durationMs : 0
  return <div className={`time-arc${warning ? ' time-arc--warning' : ''}`}><svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r={radius} fill="none" stroke="var(--line)" strokeWidth="2" /><circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} /></svg><span className="data" aria-live="off">{minutes}:{String(rest).padStart(2, '0')}</span></div>
}

export function PhoneNumberCard({ number }: { number: string }) {
  return <div className="phone-card"><span className="label">New number</span><div className="phone-number data" aria-label={number}>{[...number].map((character, index) => <span key={`${character}-${index}`} style={{ animationDelay: `${index * 40}ms` }}>{character === ' ' ? '\u00a0' : character}</span>)}</div></div>
}
