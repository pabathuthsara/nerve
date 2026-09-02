'use client'

import Link from 'next/link'
import { Check, ChevronRight, Download, FlaskConical, Headphones, LogOut, Mic, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldStats, useLifetimeStats, usePlanWaitlist, useSessionHistory, useSubscription, useUserState } from '@/lib/data'
import type { FieldStats, Plan, SessionSummary, SubscriptionState } from '@/lib/data/types'
import { signOut } from '@/app/auth/actions'
import { resetPerson } from '@/components/analytics'
import { forgetAllMemory, markUiFlag, saveAudioPreferences, saveDisplayName, saveFocusArea, saveTrainingWheels } from '@/app/profile/actions'
import { FOCUS_OPTIONS } from '@/components/screens/onboarding-screens'
// The published address, from the one place that owns it. Spelled out here
// until 30 August, which is how these copies went stale while the footer and
// the legal pages moved.
import { SUPPORT_EMAIL } from '@/components/site/site-chrome'
import type { FocusArea } from '@/lib/data/focus'
import { planWaitlistFlag } from '@/lib/data/ui-flags'
import { BILLING_NOTE, CHECKOUT_NOTE, CHECKOUT_UNCONFIGURED_NOTE, PUBLIC_PLANS, TRIAL_DAYS, TRIAL_NOTE, repsLine, type PublicPlan } from '@/lib/site/plans'
import { cancelSubscription, startCheckout } from '@/app/profile/subscription/actions'
import { forgetCurrentUser } from '@/lib/data/session'
import { roomToneAvailable } from '@/lib/audio/scenes'
import { setSoundEnabled, soundEnabled } from '@/lib/hooks/use-rep-production'
import { AppShell } from '@/components/app-shell'
import { Avatar, Button, Card, Chip, EmptyState, Input, Modal, Sheet, Skeleton, Stat, Tabs, useToast } from '@/components/ui'
import { SessionRow } from './train-screen'
import { SharedCards } from '@/components/share/shared-cards'
import { ShareButton } from '@/components/share/share-button'

export type ProfileRoute = '/profile' | '/profile/history' | '/profile/settings' | '/profile/subscription'

export function ProfileScreen({
  route,
  checkoutOpen = false,
  testMode = false,
  bought = false,
}: {
  route: ProfileRoute
  /**
   * Whether this deployment can actually open a checkout. From the server —
   * the answer depends on secrets that must not reach a client bundle. See
   * `BillingContext` in `components/route-view.tsx`.
   */
  checkoutOpen?: boolean
  /** A purchase here takes no real money. The screen must say so. */
  testMode?: boolean
  /** Back from a completed checkout. The provider appends `?bought=1`. */
  bought?: boolean
}) {
  if (route === '/profile/history') return <HistoryScreen />
  if (route === '/profile/settings') return <SettingsScreen />
  if (route === '/profile/subscription') return <SubscriptionScreen checkoutOpen={checkoutOpen} testMode={testMode} bought={bought} />
  return <ProfileHome />
}

function ProfileHome() {
  const { data: user, loading: userLoading } = useUserState()
  const { data: sessions, loading: sessionLoading } = useSessionHistory()
  const { data: stats, loading: statsLoading } = useLifetimeStats()
  const { data: field, loading: fieldLoading } = useFieldStats()
  const [signOutOpen, setSignOutOpen] = useState(false)
  return <AppShell title="Profile"><div className="profile-head">{userLoading || !user ? <><Skeleton width={64} height={64} style={{ borderRadius: '50%' }} /><div style={{ flex: 1 }}><Skeleton width={170} height={34} /><Skeleton width={210} height={14} style={{ marginTop: 8 }} /></div></> : <><Avatar name={user.displayName} size={64} /><div><h1 className="display-lg">{user.displayName}</h1><span className="muted">{user.email}</span></div><Chip tone="volt">{user.plan}</Chip></>}</div><section><span className="label">Lifetime stats</span>{statsLoading || !stats ? <div className="profile-stats">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} height={92} />)}</div> : <div className="profile-stats"><Stat label="Total reps" value={stats.totalReps} /><Stat label="Avg score" value={stats.averageScore === null ? '—' : stats.averageScore} /><Stat label="Best time" value={stats.bestTimeMs === null ? '—' : formatTime(stats.bestTimeMs)} /><Stat label="Avg warmth gain" value={stats.averageWarmthGain === null ? '—' : `${stats.averageWarmthGain > 0 ? '+' : ''}${stats.averageWarmthGain}`} /><Stat label="Current streak" value={`${stats.currentStreak} days`} /><Stat label="Longest streak" value={`${stats.longestStreak} days`} /></div>}{stats && stats.currentStreak >= 7 ? <div style={{ margin: '-8px 0 24px' }}><ShareButton kind="streak" label={`Share ${stats.currentStreak} days`} /></div> : null}</section><FieldSummary stats={field} loading={fieldLoading} /><Card className="profile-chart-card"><div className="card-heading"><div><span className="label">Last 20 sessions</span><h2 className="display-md">Warmth over time</h2></div><div className="chart-legend"><span><i /> Warmth</span><span><i className="cool" /> Score</span></div></div>{sessionLoading ? <Skeleton height={150} /> : <WarmthChart sessions={sessions} />}</Card><nav className="profile-links"><ProfileLink href="/progress" label="Progress" /><ProfileLink href="/profile/history" label="Session history" /><ProfileLink href="/profile/subscription" label="Subscription" /><ProfileLink href="/profile/settings" label="Settings" /></nav><Button variant="ghost" onClick={() => setSignOutOpen(true)}><LogOut size={18} strokeWidth={1.5} /> Sign out</Button><Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out?"><div className="sheet-stack"><p>Your saved reps stay exactly where they are.</p><form action={signOut} onSubmit={() => { forgetCurrentUser(); resetPerson() }}><Button type="submit" fullWidth>Sign out</Button></form><Button variant="ghost" fullWidth onClick={() => setSignOutOpen(false)}>Stay here</Button></div></Sheet></AppShell>
}

function formatTime(ms: number) { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }

/**
 * The field, in three numbers (§09).
 *
 * Rejections collected leads, because that is the headline counter and not
 * successes. The gap beside it is the summary of the chart on `/field` — the
 * whole argument compressed into two figures, which is what makes it the thing
 * people screenshot. Hand-written copy for the case where the gap has not
 * opened yet, and no claim the numbers do not carry.
 */
function FieldSummary({ stats, loading }: { stats: FieldStats | null; loading: boolean }) {
  if (loading) return <section><span className="label">The field</span><div className="profile-stats">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} height={92} />)}</div></section>
  if (!stats || stats.asksMade === 0) return <section><span className="label">The field</span><Card><p className="muted" style={{ margin: 0 }}>Nothing logged outside the app yet. The first ask is where this starts saying something.</p></Card></section>
  const gap = stats.anxiety
  return <section><span className="label">The field</span><div className="profile-stats profile-stats--three"><Stat label="Rejections collected" value={stats.rejectionsCollected} /><Stat label="Asks made" value={stats.asksMade} /><Stat label="Expected vs actual" value={gap ? `${gap.meanPredicted} → ${gap.meanActual}` : '—'} detail={gap ? gapCopy(gap.meanGap) : 'Log one with both numbers'} /></div></section>
}

function gapCopy(meanGap: number): string {
  if (meanGap >= 2) return 'Consistently easier than you thought'
  if (meanGap > 0) return 'A little easier than you thought'
  if (meanGap === 0) return 'Your read on this is accurate'
  return 'Harder than you thought — ease back a tier'
}

function WarmthChart({ sessions }: { sessions: SessionSummary[] }) {
  // Oldest to newest, last twenty. No padding: a chart that repeats four reps
  // until it looks like twenty is a chart that lies about how much work you
  // have done.
  const values = sessions.slice(0, 20).reverse()
  if (values.length < 2) return <EmptyState title="Not enough reps yet" description="Two reps and this becomes a line worth reading." />
  const x = (index: number) => 12 + index * (376 / Math.max(1, values.length - 1))
  const points = values.map((session, index) => `${x(index)},${112 - session.finalWarmth}`).join(' ')
  const scored = values.map((session, index) => ({ session, index })).filter((entry) => entry.session.compositeScore !== null)
  const scorePoints = scored.map((entry) => `${x(entry.index)},${112 - (entry.session.compositeScore ?? 0)}`).join(' ')
  return <div className="warmth-chart"><svg viewBox="0 0 400 130" role="img" aria-label="Warmth and score over recent sessions"><g className="chart-grid"><line x1="0" y1="25" x2="400" y2="25" /><line x1="0" y1="65" x2="400" y2="65" /><line x1="0" y1="105" x2="400" y2="105" /></g>{scored.length > 1 ? <polyline className="chart-score" points={scorePoints} /> : null}<polyline className="chart-warmth" points={points} />{values.map((session, index) => <circle key={session.id} cx={x(index)} cy={112 - session.finalWarmth} r="2.4" />)}</svg></div>
}

function ProfileLink({ href, label }: { href: string; label: string }) { return <Link href={href}><span>{label}</span><ChevronRight size={18} strokeWidth={1.5} /></Link> }

function HistoryScreen() {
  const { data: sessions, loading } = useSessionHistory()
  const [filter, setFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL')
  const [persona, setPersona] = useState('all')

  const personas = useMemo(() => {
    const names = new Map<string, string>()
    for (const session of sessions) names.set(session.personaId, session.personaName)
    return [...names.entries()]
  }, [sessions])

  const filtered = useMemo(() => sessions.filter((session) => {
    if (filter === 'WINS' && !session.won) return false
    if (filter === 'LOSSES' && session.won) return false
    return persona === 'all' || session.personaId === persona
  }), [filter, persona, sessions])

  // Grouped by the day the rep happened, in the reader's own timezone.
  const groups = useMemo(() => {
    const buckets = new Map<string, SessionSummary[]>()
    for (const session of filtered) {
      const label = dayLabel(session.startedAt)
      buckets.set(label, [...(buckets.get(label) ?? []), session])
    }
    return [...buckets.entries()]
  }, [filtered])

  return <AppShell title="History"><div className="screen-heading compact"><span className="label">Review the work</span><h1 className="display-lg">Session history</h1></div><div className="history-toolbar"><Tabs items={['ALL', 'WINS', 'LOSSES'] as const} value={filter} onChange={setFilter} label="History filter" /><label className="persona-filter"><span className="label">Persona</span><select value={persona} onChange={(event) => setPersona(event.target.value)}><option value="all">All personas</option>{personas.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>{loading ? <div className="history-list">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} height={72} />)}</div> : groups.length ? <div className="history-groups">{groups.map(([label, rows]) => <section key={label}><header className="sticky-group">{label}</header>{rows.map((session) => <SessionRow key={session.id} session={session} />)}</section>)}</div> : <EmptyState title={sessions.length ? 'Nothing under this filter' : 'No reps yet'} description={sessions.length ? 'Widen the filter to see the rest of your work.' : 'Run the first one. It gives this page something honest to show.'} action={sessions.length ? undefined : <Link className="arena-button arena-button--primary" href="/train">Start your first</Link>} />}</AppShell>
}

function dayLabel(iso: string): string {
  const day = new Date(iso)
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const daysAgo = Math.floor((midnight.getTime() - day.getTime()) / 86_400_000)
  if (daysAgo < 0) return 'Today'
  if (daysAgo < 1) return 'Yesterday'
  return day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function SettingsScreen() {
  const { data: user, loading } = useUserState()
  const toast = useToast()
  const [name, setName] = useState('')
  const [warmth, setWarmth] = useState(true)
  const [ambience, setAmbience] = useState(true)
  // §02 wants the kit mutable in one tap. Per browser rather than per account,
  // like the other sound-shaped preferences — whether you want the countdown
  // audible is a fact about the room you are sitting in, not about you.
  const [sound, setSound] = useState(true)
  useEffect(() => { setSound(soundEnabled()) }, [])
  const [volume, setVolume] = useState(60)
  const [focus, setFocus] = useState<FocusArea | ''>('')
  const [micOpen, setMicOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  // Confirmed rather than one-tap, unlike the per-character reset: clearing one
  // line is a small correction, clearing all of them is not recoverable by
  // running a single rep.
  const [forgetOpen, setForgetOpen] = useState(false)
  const [forgetting, setForgetting] = useState(false)
  // Procedural acoustics are off (see lib/audio/scenes). A control that stores
  // a preference nothing reads is a control that lies, so it says so instead.
  // Was `roomAcousticsEnabled()`, which is about the convolver and left this
  // toggle disabled reading "rooms are silent while the new sound is
  // recorded". `lib/audio/room-tone.ts` is that sound, so the row is live.
  const room = roomToneAvailable()

  // Seed the controls once the profile arrives. Uncontrolled-then-controlled
  // is a React warning; controlled-from-nothing is a field that wipes what the
  // user already has the moment it renders.
  useEffect(() => {
    if (!user) return
    setName(user.displayName)
    setWarmth(user.trainingWheels)
    setAmbience(user.ambience)
    setVolume(user.ambienceVolume)
    setFocus(user.focusArea ?? '')
  }, [user])

  const save = (result: Promise<{ ok: boolean; message: string | null }>, success: string) => {
    void result.then((outcome) => toast.push(outcome.ok ? success : outcome.message ?? 'Not saved.', outcome.ok ? 'volt' : 'red'))
  }

  return <AppShell title="Settings"><div className="screen-heading compact"><span className="label">System preferences</span><h1 className="display-lg">Settings</h1></div><div className="settings-groups"><SettingsGroup label="Account"><SettingRow label="Display name" detail="Shown on your profile"><input className="inline-edit" aria-label="Display name" value={name} disabled={loading} onChange={(event) => setName(event.target.value)} onBlur={() => { if (user && name.trim() && name !== user.displayName) save(saveDisplayName(name), 'Name saved.') }} /></SettingRow><SettingRow label="Email" detail={user?.email ?? '—'} /><SettingRow label="Password"><Link href="/forgot-password" className="text-action">Change password</Link></SettingRow></SettingsGroup><SettingsGroup label="Audio"><DeviceSelect label="Input device" kind="audioinput" value={user?.inputDevice ?? null} onChange={(device) => save(saveAudioPreferences({ inputDevice: device }), 'Input device saved.')} /><DeviceSelect label="Output device" kind="audiooutput" value={user?.outputDevice ?? null} onChange={(device) => save(saveAudioPreferences({ outputDevice: device }), 'Output device saved.')} /><SettingRow label="Test microphone" detail="Check level and device"><Button size="sm" variant="secondary" onClick={() => setMicOpen(true)}><Mic size={16} strokeWidth={1.5} /> Test mic</Button></SettingRow><div className="setting-slider"><div><strong>Room ambience volume</strong><span className="data">{room ? `${volume}%` : 'Off'}</span></div><input aria-label="Room ambience volume" type="range" min={0} max={100} value={volume} disabled={!room} onChange={(event) => setVolume(Number(event.target.value))} onPointerUp={() => save(saveAudioPreferences({ ambienceVolume: volume }), 'Volume saved.')} onKeyUp={() => save(saveAudioPreferences({ ambienceVolume: volume }), 'Volume saved.')} /></div></SettingsGroup><SettingsGroup label="Training">{/* The onboarding answer, changeable (§ ONBOARDING-AUDIT R21). It steers
    the first character, the first field challenge and the technique card on
    the brief, and until now it was set once in the first ninety seconds
    somebody ever spent here and then permanent. A preference, not an
    entitlement, so it is the user's to change. */}<SettingRow label="What you're training for" detail="Steers who you meet, your field challenges, and the technique on your brief"><select className="setting-select" aria-label="What you're training for" value={focus} disabled={loading} onChange={(event) => { const next = event.target.value as FocusArea; if (!next) return; setFocus(next); save(saveFocusArea(next), 'Focus saved.') }}>{focus ? null : <option value="">Not set</option>}{FOCUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></SettingRow><ToggleRow label="Show warmth number during reps" detail="Removed automatically at Level 4" value={warmth} onChange={(next) => { setWarmth(next); save(saveTrainingWheels(next), next ? 'Warmth number on.' : 'Warmth number off.') }} /><ToggleRow label="Rep sounds" detail="The countdown, the thirty-second mark and the score reveal" value={sound} onChange={(next) => { setSound(next); setSoundEnabled(next); toast.push(next ? 'Rep sounds on.' : 'Rep sounds off.', 'volt') }} /><ToggleRow label="Room ambience" detail="Keep the scene present between turns" value={room && ambience} disabled={!room} onChange={(next) => { setAmbience(next); save(saveAudioPreferences({ ambience: next }), next ? 'Ambience on.' : 'Ambience off.') }} /></SettingsGroup><SettingsGroup label="Data"><SettingRow label="Character memory" detail="One line each, about the encounter — never about how you did"><Button size="sm" variant="secondary" disabled={forgetting} onClick={() => setForgetOpen(true)}><RotateCcw size={16} strokeWidth={1.5} /> Clear all</Button></SettingRow><div className="setting-row setting-row--stacked"><div><strong>Shared cards</strong><span>Every card you have published, and the link that kills it</span></div><SharedCards /></div><SettingRow label="Export my data" detail="Sessions, scores, and transcript"><Button size="sm" variant="secondary" disabled><Download size={16} strokeWidth={1.5} /> Export</Button></SettingRow><SettingRow label="Delete account" detail="Permanent and immediate"><Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={16} strokeWidth={1.5} /> Delete</Button></SettingRow></SettingsGroup>{/* §16.2 — the permanent signpost, in settings as well as on /legal/safety.
    Quiet, always there, and phrased so it never becomes a clinical claim of
    its own (§16.1): it says what this is not, and points at the people who do
    the thing it is not. */}<SettingsGroup label="Safety"><div className="setting-row setting-row--stacked"><div><strong>Training, not care</strong><span>Nerve is confidence training. It is not therapy, treatment or clinical care, and it does not diagnose anything. If you are working with a clinician on social anxiety, keep working with them — this is not a substitute for that and is not offered as one.</span></div></div><SettingRow label="Acceptable use and safety"><Link href="/legal/safety" className="text-action">Read</Link></SettingRow><SettingRow label="Report a problem" detail="On the result screen of any rep" /></SettingsGroup><SettingsGroup label="About"><SettingRow label="Version" detail="1.0.0 · Arena" /><SettingRow label="Terms"><Link href="/legal/terms" className="text-action">Read</Link></SettingRow><SettingRow label="Privacy"><Link href="/legal/privacy" className="text-action">Read</Link></SettingRow><SettingRow label="Support" detail={SUPPORT_EMAIL}><a href={`mailto:${SUPPORT_EMAIL}`} className="text-action">Email</a></SettingRow></SettingsGroup></div><Sheet open={micOpen} onClose={() => setMicOpen(false)} title="Test microphone"><MicTest /></Sheet><Sheet open={forgetOpen} onClose={() => setForgetOpen(false)} title="Clear character memory"><div className="sheet-stack"><p>Every character forgets the line she was carrying, and the next rep opens cold.</p><p className="muted">This clears that line and nothing else. Your reps, transcripts, scores, streak and everything you have unlocked stay exactly where they are.</p><Button variant="danger" fullWidth disabled={forgetting} onClick={() => { setForgetting(true); setForgetOpen(false); void forgetAllMemory().then((result) => toast.push(result.ok ? 'Every character has forgotten.' : result.message ?? 'That did not clear.', result.ok ? 'volt' : 'red')).finally(() => setForgetting(false)) }}>Clear it</Button><Button variant="ghost" fullWidth onClick={() => setForgetOpen(false)}>Keep it</Button></div></Sheet><Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete account"><div className="sheet-stack"><div className="danger-list"><span>All session recordings and transcripts</span><span>Your scores, streaks, and progression</span><span>Your account and billing access</span></div><p className="muted">Deletion is handled by support until the account-deletion path is built. Email <a className="text-action" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and it happens within a day.</p><Input label="Type DELETE to confirm" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /><Button variant="danger" fullWidth disabled>Delete everything</Button><Button variant="ghost" fullWidth onClick={() => setDeleteOpen(false)}>Keep my account</Button></div></Modal></AppShell>
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) { return <section><span className="label settings-label">{label}</span><div className="settings-card">{children}</div></section> }
function SettingRow({ label, detail, children }: { label: string; detail?: string; children?: React.ReactNode }) { return <div className="setting-row"><div><strong>{label}</strong>{detail ? <span>{detail}</span> : null}</div>{children ?? <ChevronRight size={17} strokeWidth={1.5} />}</div> }
/**
 * The real device list, and the choice is stored.
 *
 * Labels are blank until microphone permission has been granted once — that is
 * the browser's rule, not ours — so the list says so rather than showing a
 * column of empty options. The live rep does not yet open the chosen device;
 * that is the audio-graph binding, and it reads this column when it lands.
 */
function DeviceSelect({ label, kind, value, onChange }: { label: string; kind: MediaDeviceKind; value: string | null; onChange: (deviceId: string | null) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    let cancelled = false
    const read = () => navigator.mediaDevices?.enumerateDevices()
      .then((list) => { if (!cancelled) setDevices(list.filter((device) => device.kind === kind)) })
      .catch(() => undefined)
    void read()
    navigator.mediaDevices?.addEventListener('devicechange', read)
    return () => { cancelled = true; navigator.mediaDevices?.removeEventListener('devicechange', read) }
  }, [kind])
  const named = devices.filter((device) => device.label)
  return <label className="setting-row"><strong>{label}</strong><select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}><option value="">System default</option>{named.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Device ${index + 1}`}</option>)}</select></label>
}
function ToggleRow({ label, detail, value, disabled = false, onChange }: { label: string; detail: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) { return <SettingRow label={label} detail={detail}><button className="toggle" role="switch" aria-label={label} aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}><i /></button></SettingRow> }

function MicTest() {
  const [level, setLevel] = useState(0)
  const [status, setStatus] = useState<'idle' | 'testing' | 'denied'>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const frameRef = useRef<number | null>(null)
  const release = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close()
    contextRef.current = null
  }, [])
  const stop = () => {
    release()
    setLevel(0)
    setStatus('idle')
  }
  useEffect(() => release, [release])
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const values = new Uint8Array(analyser.frequencyBinCount)
      streamRef.current = stream
      contextRef.current = context
      setStatus('testing')
      const read = () => {
        analyser.getByteTimeDomainData(values)
        const energy = Math.sqrt(values.reduce((sum, value) => sum + Math.pow((value - 128) / 128, 2), 0) / values.length)
        setLevel(Math.min(1, energy * 5.5))
        frameRef.current = window.requestAnimationFrame(read)
      }
      read()
    } catch {
      setStatus('denied')
    }
  }
  const active = Math.round(level * 12)
  return <div className="sheet-stack"><Headphones size={34} strokeWidth={1.5} className="volt" /><p>{status === 'denied' ? 'Microphone access is blocked. Allow it in Site settings, then try again.' : 'Speak normally. The meter should move without touching the end.'}</p><div className="mic-meter" aria-label={`Microphone level ${Math.round(level * 100)} percent`}>{Array.from({ length: 12 }, (_, index) => <i key={index} className={index < active ? 'active' : ''} />)}</div>{status === 'testing' ? <Button variant="secondary" fullWidth onClick={stop}>Stop test</Button> : <Button fullWidth onClick={() => void start()}>{status === 'denied' ? 'Try again' : 'Start mic test'}</Button>}</div>
}

/**
 * `/profile/subscription` — the buy button, the trial, and the way out.
 *
 * Every one of those three is a §14 survival requirement rather than a feature.
 * A card-required trial converts far better than a card-free one and buys part
 * of that conversion with people who forget they subscribed; a
 * merchant-of-record account that accumulates those disputes is an account that
 * gets closed. So the countdown is visible, the renewal date and price are
 * stated before the card is entered, and cancelling is a button on this screen
 * that cancels the subscription outright, without anybody emailing us.
 *
 * Two answers about a plan are on this screen and only this screen: what the
 * app ENFORCES (`useUserState().plan`, the number the paywall reads) and what
 * the provider says was BOUGHT (`useSubscription()`, the webhook's mirror).
 * They can legitimately differ for a few seconds while a webhook is in flight,
 * which is exactly the moment somebody is staring at this page after paying —
 * so the copy names the lag instead of pretending the two are one number.
 *
 * `checkoutOpen` is false when this deployment has no merchant-of-record
 * configuration yet, which is the state the product is in until the account is
 * approved (`docs/PAYMENTS-APPROVAL.md`). The screen falls back to the
 * notify-me list it had before checkout existed rather than showing a button
 * that errors — the demand is worth keeping either way.
 */
function SubscriptionScreen({ checkoutOpen, testMode, bought }: { checkoutOpen: boolean; testMode: boolean; bought: boolean }) {
  const { data: user, loading } = useUserState()
  const { data: subscription, reload: reloadSubscription } = useSubscription()
  const current = user?.plan ?? 'free'
  const { data: waitlisted, reload: reloadWaitlist } = usePlanWaitlist()
  const toast = useToast()
  const [asking, setAsking] = useState<'pro' | 'elite' | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<Plan | 'cancel' | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  /**
   * A checkout that has landed but whose webhook has not.
   *
   * The provider returns the buyer here with `?bought=1` the moment the payment
   * clears, and the plan moves in `/api/webhooks/whop` a second or two later.
   * Reloading once after a short pause is what turns "you are on Free" into the
   * truth without the user having to refresh — and the banner says what is
   * happening either way, because a page that silently disagrees with a receipt
   * is how a support ticket starts.
   */
  useEffect(() => {
    if (!bought) return
    const timer = window.setTimeout(() => { reloadSubscription() }, 2500)
    return () => window.clearTimeout(timer)
  }, [bought, reloadSubscription])

  const buy = async (plan: 'pro' | 'elite') => {
    setBusy(plan)
    const result = await startCheckout(plan)
    if (result.ok && result.url) {
      window.location.assign(result.url)
      return
    }
    setBusy(null)
    toast.push(result.message ?? 'Could not open checkout.', 'red')
  }

  /**
   * Cancelling, which under this provider is a call rather than a redirect.
   *
   * Optimistic per §02 — the sheet closes and the toast lands immediately —
   * and then reloaded, because the truth arrives by webhook a second later and
   * the screen should end up showing what the provider actually recorded rather
   * than what we hoped. A confirm step first, because it is destructive from
   * the user's side even though nothing is lost until the period ends.
   */
  const cancel = async () => {
    setConfirmCancel(false)
    setBusy('cancel')
    const result = await cancelSubscription()
    setBusy(null)
    if (!result.ok) {
      toast.push(result.message ?? 'Could not cancel.', 'red')
      return
    }
    toast.push(result.message ?? 'Cancelled. Nothing more is charged.', 'volt')
    window.setTimeout(() => { reloadSubscription() }, 2000)
  }

  /**
   * Records the ask, then says so.
   *
   * The fallback for a deployment with no merchant of record yet. Until
   * checkout is open, the honest button is the one that admits what it does and
   * keeps the demand.
   */
  const join = async (plan: 'pro' | 'elite') => {
    setSaving(true)
    await markUiFlag(planWaitlistFlag(plan))
    await reloadWaitlist()
    setSaving(false)
  }

  const joined = asking ? waitlisted.includes(asking) : false
  return <AppShell title="Subscription">
    <div className="screen-heading compact"><span className="label">Training access</span><h1 className="display-lg">Subscription</h1></div>
    {/* Said plainly, above everything, and never dressed as a feature. A
        visitor who finds this site while the rehearsal flag is on must not be
        able to believe they have bought anything. Amber rather than volt: this
        is a warning, and volt is for the primary action (Arena). */}
    {checkoutOpen && testMode ? <Card className="billing-banner billing-banner--test"><FlaskConical size={18} strokeWidth={1.5} className="amber" /><p><strong>Test mode.</strong> Checkout here is a rehearsal against our payment provider&apos;s sandbox. No card is charged and no real subscription is created, whatever the receipt says.</p></Card> : null}
    {bought ? <Card className="billing-banner"><Check size={18} strokeWidth={1.5} className="volt" /><p>Payment received. Your plan updates here within a few seconds — the receipt is already on its way to your inbox.</p></Card> : null}
    <CurrentPlan user={user} loading={loading} subscription={subscription} onCancel={() => setConfirmCancel(true)} busy={busy === 'cancel'} />
    <section className="plan-section">
      <span className="label">Compare plans</span>
      <div className="plan-grid">
        {PUBLIC_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={current}
            checkoutOpen={checkoutOpen}
            busy={busy === plan.id}
            waitlisted={waitlisted.includes(plan.id as 'pro' | 'elite')}
            trialAvailable={subscription === null}
            onBuy={plan.id === 'free' ? undefined : () => void buy(plan.id as 'pro' | 'elite')}
            onNotify={plan.id === 'free' ? undefined : () => setAsking(plan.id as 'pro' | 'elite')}
          />
        ))}
      </div>
    </section>
    <p className="billing-note">{checkoutOpen ? TRIAL_NOTE : CHECKOUT_UNCONFIGURED_NOTE} {CHECKOUT_NOTE} {BILLING_NOTE} <Link href="/pricing" className="text-action">Full comparison</Link></p>
    {/* Destructive from the user's side, so it asks — and the copy is the one
        that matters most on this screen: cancelling does not take anything away
        today. Somebody who believes it does will not cancel, they will charge
        back, and §14 is blunt about which of those closes the account. */}
    <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel subscription">{(() => {
      const endsOn = subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
        : null
      return <div className="sheet-stack">
        <p>{subscription?.status === 'trialing'
          ? `Your card is never charged. The trial runs to ${endsOn ?? 'the end of the seven days'} and voice stays open until then.`
          : `Nothing more is charged. Voice stays open until ${endsOn ?? 'the end of the period you have paid for'}, then this drops to Free.`}</p>
        <p className="muted">Your reps, transcripts, scores, streak and everything you have unlocked stay exactly where they are. You can start again any time.</p>
        <Button variant="danger" fullWidth loading={busy === 'cancel'} onClick={() => void cancel()}>Cancel it</Button>
        <Button variant="ghost" fullWidth onClick={() => setConfirmCancel(false)}>Keep it</Button>
      </div>
    })()}</Sheet>
    <Sheet open={asking !== null} onClose={() => setAsking(null)} title={joined ? "You're on the list" : `${asking === 'elite' ? 'Elite' : 'Pro'} isn't open yet`}>{joined ? <div className="sheet-stack"><Check size={34} strokeWidth={1.5} className="volt" /><p>We&apos;ll email you at <strong>{user?.email}</strong> the day {asking === 'elite' ? 'Elite' : 'Pro'} opens, and founding members keep the launch price.</p><Button fullWidth onClick={() => setAsking(null)}>Back to training</Button></div> : <div className="sheet-stack"><p>Checkout is not open yet. Put your name down and we&apos;ll email you at <strong>{user?.email}</strong> the day it is — founding members keep the launch price.</p><Button fullWidth loading={saving} onClick={() => { if (asking) void join(asking) }}>Tell me when it opens</Button><Button variant="ghost" fullWidth onClick={() => setAsking(null)}>Not now</Button></div>}</Sheet>
  </AppShell>
}

/**
 * What this account has right now, and when it changes.
 *
 * `renewsAt` on `UserState` is the enforced answer and comes off
 * `entitlements`; the mirror carries the status and the cancel flag. Both are
 * drawn, because "trialing until the 7th" and "active, renews the 7th" are the
 * same date and completely different sentences — and the one people need to see
 * before the first charge is the first one.
 */
function CurrentPlan({ user, loading, subscription, onCancel, busy }: {
  user: ReturnType<typeof useUserState>['data']
  loading: boolean
  subscription: SubscriptionState | null
  onCancel: () => void
  busy: boolean
}) {
  if (loading || !user) return <Card className="current-plan"><Skeleton height={72} /></Card>

  const day = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null
  const periodEnd = day(subscription?.currentPeriodEnd ?? user.renewsAt)

  // Hand-authored per state rather than assembled from fragments (§02 rule 12).
  // The trial line is the one that has to be unambiguous: it names the day the
  // card is charged, because a trial that ends quietly is the pattern §14 says
  // closes a merchant account.
  const detail = (() => {
    if (subscription?.status === 'trialing') {
      return periodEnd
        ? `Free trial — your card is charged on ${periodEnd} unless you cancel first.`
        : `Free trial, ${TRIAL_DAYS} days. Cancel any time before it ends and you are not charged.`
    }
    if (subscription?.cancelAtPeriodEnd) {
      return periodEnd ? `Cancelled. Voice stays open until ${periodEnd}, then this drops to Free.` : 'Cancelled. Voice stays open until the end of the period you paid for.'
    }
    if (subscription?.status === 'past_due') {
      return 'A payment did not go through. Your access is untouched while the provider retries — update the card to be sure.'
    }
    if (periodEnd) return `Renews ${periodEnd}.`
    return 'No card on file. Nothing renews and nothing is charged.'
  })()

  return <Card className="current-plan">
    <div>
      <Chip tone="volt">Current plan</Chip>
      <h2 className="display-lg">{user.plan}</h2>
      <p>
        {user.repsPerDay === 0
          ? 'No voice reps'
          : <><span className="data">{user.repsPerDay}</span> voice rep{user.repsPerDay === 1 ? '' : 's'} per day</>}
      </p>
      <span className="label mute">{detail}</span>
    </div>
    {/* The way out, one tap, on our own screen. §8 of the payments plan: a
        cancel that needs an email becomes a chargeback, and chargebacks are
        what close the account. Drawn only when there is something to cancel and
        it is not already cancelled — an already-ending subscription needs the
        date, which the line above it has, not a second button.

        The card and the invoices still live at the provider, so the link beside
        it is the honest division of labour rather than a loose end. */}
    <div className="plan-actions">
      {subscription && !subscription.cancelAtPeriodEnd
        ? <Button variant="secondary" loading={busy} onClick={onCancel}>Cancel</Button>
        : null}
      {subscription?.manageUrl
        ? <a href={subscription.manageUrl} target="_blank" rel="noreferrer noopener" className="text-action">Card and invoices</a>
        : null}
    </div>
  </Card>
}

/**
 * One plan, drawn from `lib/site/plans.ts`.
 *
 * The price, the rep count and the feature list used to be written out here by
 * hand, and `/pricing` on the public site was about to write them out again.
 * Two copies of a price is how a product ends up charging one number and
 * advertising another — and §14 has a merchant-of-record reviewer reading the
 * public page. One record, both surfaces.
 *
 * Four button states, and each of them is a different truth:
 *
 *   current       this is what you have.
 *   free          not something to buy. It is what you drop back to, and a
 *                 "downgrade" button here would be a second cancel beside the
 *                 one already on the current-plan card.
 *   buy           checkout is configured. Says trial rather than price when the
 *                 trial is still available, because the first thing that
 *                 happens is seven free days and a button that says $19 would
 *                 be describing the second thing.
 *   notify        checkout is not configured yet. The honest button.
 */
function PlanCard({ plan, current, checkoutOpen, busy = false, waitlisted = false, trialAvailable = false, onBuy, onNotify }: {
  plan: PublicPlan
  current: Plan
  checkoutOpen: boolean
  busy?: boolean
  waitlisted?: boolean
  /** No subscription has ever existed on this account, so the trial is unused. */
  trialAvailable?: boolean
  onBuy?: () => void
  onNotify?: () => void
}) {
  const active = plan.id === current
  const action = (() => {
    if (active) return <Button variant="secondary" fullWidth disabled>Current plan</Button>
    if (plan.id === 'free') return <Button variant="secondary" fullWidth disabled>Included</Button>
    if (checkoutOpen) {
      return <Button fullWidth loading={busy} onClick={onBuy}>{trialAvailable ? `Start ${TRIAL_DAYS} days free` : `Switch to ${plan.name}`}</Button>
    }
    if (waitlisted) return <Button variant="secondary" fullWidth onClick={onNotify}><Check size={15} strokeWidth={1.5} /> On the list</Button>
    return <Button fullWidth onClick={onNotify}>Notify me</Button>
  })()

  return <Card className={`plan-card${active ? ' plan-card--current' : ''}`}>
    <div className="plan-card__head">
      <div>{active ? <Chip tone="volt">Current</Chip> : <span className="label">Plan</span>}<h2 className="display-md">{plan.name}</h2></div>
      <span className="data">{plan.price ? `${plan.price} / mo` : '$0'}</span>
    </div>
    <Stat label="Voice reps" value={repsLine(plan)} />
    <ul>{plan.features.map((feature) => <li key={feature}><Check size={15} strokeWidth={1.5} /> {feature}</li>)}</ul>
    {action}
  </Card>
}
