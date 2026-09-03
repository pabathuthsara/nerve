'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Flame, Target, User, Users, Zap } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useUserState } from '@/lib/data'
import type { Track } from '@/lib/data/types'
import { useProduct } from './product-provider'
import { Avatar, Skeleton } from './ui'
import { useOnlineStatus } from '@/lib/hooks/use-online-status'
import { identifyPerson } from './analytics'

const navItems = [
  { label: 'Train', href: '/train', icon: Zap, tracks: ['dating'] as Track[] },
  { label: 'Train', href: '/interview', icon: Zap, tracks: ['interview'] as Track[] },
  { label: 'Roster', href: '/roster', icon: Users, tracks: ['dating', 'interview'] as Track[] },
  { label: 'Field', href: '/field', icon: Target, tracks: ['dating'] as Track[] },
  // §11 lists the library under both tracks. The cards are about holding a
  // conversation with somebody who is not helping you, which an interview is.
  { label: 'Library', href: '/library', icon: BookOpen, tracks: ['dating', 'interview'] as Track[] },
  { label: 'Profile', href: '/profile', icon: User, tracks: ['dating', 'interview'] as Track[] },
]

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: user, loading } = useUserState()
  const { track, setTrack } = useProduct()
  const online = useOnlineStatus()

  useEffect(() => {
    if (pathname.startsWith('/interview')) setTrack('interview')
    else if (pathname.startsWith('/train') || pathname.startsWith('/field')) setTrack('dating')
  }, [pathname, setTrack])

  /**
   * Ties the funnel to a person (B7).
   *
   * Here rather than in `<Analytics>` because the root layout sits above auth
   * and has no user to name. Every signed-in screen renders through this
   * shell, so this is the one place that always knows — and `identify` is
   * idempotent, so re-running it on a plan or level change is the point rather
   * than a cost.
   */
  useEffect(() => {
    if (!user) return
    identifyPerson(user.id, { plan: user.plan, level: user.currentLevel, streak_days: user.streakDays })
  }, [user])

  const items = useMemo(() => navItems.filter((item) => item.tracks.includes(track)), [track])
  const switchTrack = (next: Track) => {
    setTrack(next)
    router.push(next === 'dating' ? '/train' : '/interview')
  }

  const active = (href: string) => href === '/train' || href === '/interview'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)

  return (
      <div className={`app-frame${/^\/roster\/[^/]+$/.test(pathname) ? ' app-frame--persona-detail' : ''}`}>
        <header className="mobile-topbar">
          <span className="wordmark" aria-label="Nerve">NERVE</span>
          {user && user.unlockedTracks.length > 1 ? <TrackSwitcher track={track} onChange={switchTrack} compact /> : <span className="label">{title}</span>}
        </header>
        {!online ? <div className="offline-bar">Offline — reps unavailable</div> : null}
        <aside className="sidebar-rail">
          <div className="rail-inner">
            <Link href={track === 'dating' ? '/train' : '/interview'} className="wordmark">NERVE</Link>
            <div style={{ marginTop: 18 }}>
              {loading ? <Skeleton height={36} /> : user && user.unlockedTracks.length > 1 ? <TrackSwitcher track={track} onChange={switchTrack} /> : null}
            </div>
            <nav className="rail-nav" aria-label="Main navigation">
              {items.map((item) => {
                const Icon = item.icon
                return <Link key={item.href} href={item.href} className={`rail-link${active(item.href) ? ' rail-link--active' : ''}`}><Icon size={20} strokeWidth={1.5} /><span>{item.label}</span></Link>
              })}
            </nav>
            <div className="rail-bottom">
              {loading ? <Skeleton height={32} /> : user ? <RepsRemaining count={user.repsRemainingToday} resetAt={user.repsResetAt} locked={user.voiceLocked} /> : null}
              <Link className="account-row" href="/profile">
                <Avatar name={user?.displayName ?? 'N'} size={32} />
                <span style={{ minWidth: 0 }}><strong style={{ display: 'block', color: 'var(--text)', fontWeight: 500 }}>{user?.displayName ?? 'Account'}</strong><span className="label">{user?.plan ?? 'free'} plan</span></span>
              </Link>
            </div>
          </div>
        </aside>
        <main className="app-content"><div className="content-shell">{children}</div></main>
        <nav className="bottom-tabs" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }} aria-label="Main navigation">
          {items.map((item) => {
            const Icon = item.icon
            return <Link key={item.href} href={item.href} className={`nav-tab${active(item.href) ? ' nav-tab--active' : ''}`}><Icon size={20} strokeWidth={1.5} /><span className="nav-tab__label">{item.label}</span></Link>
          })}
        </nav>
      </div>
  )
}

export function TrackSwitcher({ track, onChange, compact = false }: { track: Track; onChange: (track: Track) => void; compact?: boolean }) {
  return <div className="track-switcher" role="group" style={compact ? { width: 142 } : undefined} aria-label="Training track"><button aria-pressed={track === 'dating'} onClick={() => onChange('dating')}>Dating</button><button aria-pressed={track === 'interview'} onClick={() => onChange('interview')}>Interview</button></div>
}

/**
 * The rep counter in the chrome.
 *
 * Three states, not two. A count is a count; zero on a plan that HAS voice is a
 * countdown to the reset, and that is honest because the reset happens. Zero on
 * a plan with no voice at all is neither — nothing resets, so a countdown would
 * be the pill lying every minute, on every screen. That case says what is
 * actually true and points at the one screen that can change it.
 */
/**
 * How long until the day's reps come back, as `HH:MM`.
 *
 * Shared, because two things say it and they must not disagree: the pill in the
 * chrome, and the countdown on `PaywallSheet` — which took a `reset` prop with
 * a hard-coded `'04:12'` default and was being handed that default by every
 * caller except the brief. A paywall telling somebody their reps return in four
 * hours and twelve minutes, every time, on any screen, is the one lie on a
 * screen that is asking for money.
 *
 * Ticks once a minute, because it is displayed to the minute.
 */
export function useResetCountdown(resetAt: string | null | undefined): string {
  const [remaining, setRemaining] = useState('00:00')
  useEffect(() => {
    if (!resetAt) return
    const update = () => {
      const ms = Math.max(0, new Date(resetAt).getTime() - Date.now())
      const hours = Math.floor(ms / 3_600_000)
      const minutes = Math.floor((ms % 3_600_000) / 60_000)
      setRemaining(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
    }
    update()
    const timer = window.setInterval(update, 60_000)
    return () => window.clearInterval(timer)
  }, [resetAt])
  return remaining
}

export function RepsRemaining({ count, resetAt, locked = false }: { count: number; resetAt: string; locked?: boolean }) {
  const remaining = useResetCountdown(resetAt)
  if (locked) {
    return <Link className="reps-pill reps-pill--locked" href="/profile/subscription">Voice on Pro</Link>
  }
  return <span className={`reps-pill${count === 0 ? ' amber' : ''}`}>{count > 0 ? <><strong>{count}</strong> reps left</> : <>Resets {remaining}</>}</span>
}

export function StreakCounter({ days }: { days: number }) {
  return <span className="streak-pill"><Flame size={15} strokeWidth={1.5} /> <span className="data">{days}</span> day streak</span>
}
