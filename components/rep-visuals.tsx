'use client'

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
