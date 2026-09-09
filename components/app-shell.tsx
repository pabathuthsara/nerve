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
import { setActiveTrack } from '@/app/profile/actions'

/**
 * Paths that belong to a rail item other than the one their URL implies.
 *
 * One entry today and it is D5's: the interviewer picker is the interview
 * track's roster, and `RosterScreen` renders exactly the same component at
 * `/roster`. `/interview/start` is the run's own setup and belongs to the
 * picker's item for the same reason — a run is not a different section.
 */
const RUNS_UNDER: Record<string, string> = {
  '/interview/interviewers': '/roster',
  '/interview/start': '/roster',
}

const navItems = [
  { label: 'Train', href: '/train', icon: Zap, tracks: ['dating'] as Track[] },
  { label: 'Train', href: '/interview', icon: Zap, tracks: ['interview'] as Track[] },
  { label: 'Roster', href: '/roster', icon: Users, tracks: ['dating', 'interview'] as Track[] },
  { label: 'Field', href: '/field', icon: Target, tracks: ['dating'] as Track[] },
  /**
   * ── THE LIBRARY IS DATING, AND ONLY DATING ────────────────────────────
   *
   * §11 lists it under both tracks and this used to, on the argument that the
   * cards are about holding a conversation with somebody who is not helping
   * you — which an interview is. That argument does not survive reading the
   * cards. `lib/techniques/library.ts` is *"Open with the room, not with her"*,
   * *"Use what she already gave you"*, *"Ask for something specific"*, and five
   * sets of openers for a café, a gym, a platform, a party and a conference.
   * There is no reading of an interview in which **Openers — gym** is guidance.
   *
   * So the rail stops offering it here. The route is untouched and the track
   * switcher is two taps away, because a dating user who is mid-interview has
   * not lost anything they had; what is fixed is a second track advertising the
   * first one's material as its own. The interview arm's equivalent is
   * `scorecard.tryNext`, which is already authored in this arm's prose
   * (`lib/data/interview-scorecard.ts`), and `FocusLinks` — the only other
   * route from a scorecard into `/library` — has always been dating-only.
   *
   * §11 is the drift here, not the code. Recorded in `LAUNCH-GAP.md` §4.
   */
  { label: 'Library', href: '/library', icon: BookOpen, tracks: ['dating'] as Track[] },
  { label: 'Profile', href: '/profile', icon: User, tracks: ['dating', 'interview'] as Track[] },
]

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: user, loading } = useUserState()
  const { track, setTrack, adoptTrack } = useProduct()
  const online = useOnlineStatus()

  useEffect(() => {
    if (pathname.startsWith('/interview')) setTrack('interview')
    else if (pathname.startsWith('/train') || pathname.startsWith('/field')) setTrack('dating')
  }, [pathname, setTrack])

  /**
   * E2. What the URL does not say, the profile does.
   *
   * The effect above only speaks for the three prefixes that belong to one
   * track. Every shared route — `/roster`, `/library`, `/profile` and all of
   * their children — said nothing, so the provider's `dating` default answered
   * for them, and an interview account opening a bookmark got the other
   * product. `active_track` is the answer onboarding collected and nothing in
   * the chrome had ever read it.
   *
   * `adoptTrack` and not `setTrack`, because this arrives a fetch after the
   * first render and must lose to a URL that has already decided (see the note
   * in `product-provider.tsx`). Gated on `unlockedTracks`, because a stored
   * track the account cannot open would draw a nav rail to a guard.
   */
  useEffect(() => {
    if (!user) return
    if (!user.unlockedTracks.includes(user.activeTrack)) return
    adoptTrack(user.activeTrack)
  }, [adoptTrack, user])

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
  /**
   * The chrome's own answer to "which half am I in".
   *
   * Optimistic and then persisted (§02): the rail redraws and the route changes
   * on the tap, and `active_track` is written behind it so the NEXT cold load
   * starts here rather than on dating. Without that write the seeding effect
   * above would faithfully restore whatever onboarding happened to record
   * months ago, which is not what "the track I use" means.
   *
   * The write is deliberately not awaited and deliberately does not revalidate:
   * nothing server-rendered is behind this toggle, and paying for a full layout
   * revalidation on a nav tap is latency for no visible change. A failure is
   * silent by design — the switch has already worked for this session, and a
   * toast about a preference nobody asked to save would be noise.
   */
  const switchTrack = (next: Track) => {
    setTrack(next)
    router.push(next === 'dating' ? '/train' : '/interview')
    void setActiveTrack(next)
  }

  /**
   * Which rail item this path belongs to.
   *
   * ── D5, AND WHY IT IS NOT A ONE-LINE MATCH ───────────────────────────────
   *
   * `/train` and `/interview` are the two Train items and both have children
   * that are NOT theirs, so they match exactly rather than by prefix. That is
   * right and was incomplete: `/interview/interviewers` is the interviewer
   * picker, which is also the interview track's `/roster` — the same screen at
   * two URLs — so on the second one the Roster item went dark and Train lit up
   * instead, in the middle of a run. `RUNS_UNDER` names the exception, so a
   * screen that lives at two paths is highlighted the same way at both.
   */
  const active = (href: string) => {
    if (RUNS_UNDER[pathname] === href) return true
    return href === '/train' || href === '/interview'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
  }

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
              {loading ? <Skeleton height={32} /> : user ? <RepsRemaining count={user.repsRemainingToday} resetAt={user.repsResetAt} locked={user.voiceLocked} track={track} credits={user.interviewCredits} /> : null}
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

export function RepsRemaining({ count, resetAt, locked = false, track = 'dating', credits = 0 }: { count: number; resetAt: string; locked?: boolean; track?: Track; credits?: number }) {
  const remaining = useResetCountdown(resetAt)
  /**
   * ── EVERY STATE IS A TARGET (LAUNCH-GAP A2) ─────────────────────────────
   *
   * Four states, and only two of them were links: "Voice on Pro" and "No
   * credits". So the two pills a user actually looks at — "3 reps left" and "2
   * credits" — were inert `<span>`s, and the balance is the single most-tapped
   * affordance in any credit product. The visual treatment is unchanged; this
   * is a destination, not a new control.
   *
   * A count goes to where it can be changed: reps to the subscription screen,
   * credits to the interview home, which is where the packs are.
   */
  /**
   * TWO METERS, AND THE PILL HAS TO KNOW WHICH ONE IT IS ON.
   *
   * A rep is a daily rate that comes back at midnight; an interview credit is a
   * balance that does not (§5.3). Showing "9 reps left" to somebody on the
   * interview track is the pill lying on every screen — the same objection this
   * component already makes about a countdown on a plan with no voice, which is
   * why there are three states rather than two.
   *
   * A credit is never "locked" and never "resets", so neither branch below
   * applies to it.
   */
  if (track === 'interview') {
    return credits > 0
      ? <Link className="reps-pill" href="/interview"><strong>{credits}</strong> credit{credits === 1 ? '' : 's'}</Link>
      : <Link className="reps-pill reps-pill--locked" href="/interview">No credits</Link>
  }
  if (locked) {
    return <Link className="reps-pill reps-pill--locked" href="/profile/subscription">Voice on Pro</Link>
  }
  return <Link className={`reps-pill${count === 0 ? ' amber' : ''}`} href="/profile/subscription">{count > 0 ? <><strong>{count}</strong> reps left</> : <>Resets {remaining}</>}</Link>
}

export function StreakCounter({ days }: { days: number }) {
  return <span className="streak-pill"><Flame size={15} strokeWidth={1.5} /> <span className="data">{days}</span> day streak</span>
}
