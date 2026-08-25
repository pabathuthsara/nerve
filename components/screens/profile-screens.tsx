'use client'

import Link from 'next/link'
import { Check, ChevronRight, Download, Headphones, LogOut, Mic, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldStats, useLifetimeStats, usePlanWaitlist, useSessionHistory, useUserState } from '@/lib/data'
import type { FieldStats, Plan, SessionSummary } from '@/lib/data/types'
import { signOut } from '@/app/auth/actions'
import { forgetAllMemory, markUiFlag, saveAudioPreferences, saveDisplayName, saveTrainingWheels } from '@/app/profile/actions'
import { planWaitlistFlag } from '@/lib/data/ui-flags'
import { forgetCurrentUser } from '@/lib/data/session'
import { roomAcousticsEnabled } from '@/lib/audio/scenes'
import { AppShell } from '@/components/app-shell'
import { Avatar, Button, Card, Chip, EmptyState, Input, Modal, Sheet, Skeleton, Stat, Tabs, useToast } from '@/components/ui'
import { SessionRow } from './train-screen'
import { SharedCards } from '@/components/share/shared-cards'
import { ShareButton } from '@/components/share/share-button'

export type ProfileRoute = '/profile' | '/profile/history' | '/profile/settings' | '/profile/subscription'

export function ProfileScreen({ route }: { route: ProfileRoute }) {
  if (route === '/profile/history') return <HistoryScreen />
  if (route === '/profile/settings') return <SettingsScreen />
  if (route === '/profile/subscription') return <SubscriptionScreen />
  return <ProfileHome />
}

function ProfileHome() {
  const { data: user, loading: userLoading } = useUserState()
  const { data: sessions, loading: sessionLoading } = useSessionHistory()
  const { data: stats, loading: statsLoading } = useLifetimeStats()
  const { data: field, loading: fieldLoading } = useFieldStats()
  const [signOutOpen, setSignOutOpen] = useState(false)
  return <AppShell title="Profile"><div className="profile-head">{userLoading || !user ? <><Skeleton width={64} height={64} style={{ borderRadius: '50%' }} /><div style={{ flex: 1 }}><Skeleton width={170} height={34} /><Skeleton width={210} height={14} style={{ marginTop: 8 }} /></div></> : <><Avatar name={user.displayName} size={64} /><div><h1 className="display-lg">{user.displayName}</h1><span className="muted">{user.email}</span></div><Chip tone="volt">{user.plan}</Chip></>}</div><section><span className="label">Lifetime stats</span>{statsLoading || !stats ? <div className="profile-stats">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} height={92} />)}</div> : <div className="profile-stats"><Stat label="Total reps" value={stats.totalReps} /><Stat label="Avg score" value={stats.averageScore === null ? '—' : stats.averageScore} /><Stat label="Best time" value={stats.bestTimeMs === null ? '—' : formatTime(stats.bestTimeMs)} /><Stat label="Avg warmth gain" value={stats.averageWarmthGain === null ? '—' : `${stats.averageWarmthGain > 0 ? '+' : ''}${stats.averageWarmthGain}`} /><Stat label="Current streak" value={`${stats.currentStreak} days`} /><Stat label="Longest streak" value={`${stats.longestStreak} days`} /></div>}{stats && stats.currentStreak >= 7 ? <div style={{ margin: '-8px 0 24px' }}><ShareButton kind="streak" label={`Share ${stats.currentStreak} days`} /></div> : null}</section><FieldSummary stats={field} loading={fieldLoading} /><Card className="profile-chart-card"><div className="card-heading"><div><span className="label">Last 20 sessions</span><h2 className="display-md">Warmth over time</h2></div><div className="chart-legend"><span><i /> Warmth</span><span><i className="cool" /> Score</span></div></div>{sessionLoading ? <Skeleton height={150} /> : <WarmthChart sessions={sessions} />}</Card><nav className="profile-links"><ProfileLink href="/progress" label="Progress" /><ProfileLink href="/profile/history" label="Session history" /><ProfileLink href="/profile/subscription" label="Subscription" /><ProfileLink href="/profile/settings" label="Settings" /></nav><Button variant="ghost" onClick={() => setSignOutOpen(true)}><LogOut size={18} strokeWidth={1.5} /> Sign out</Button><Sheet open={signOutOpen} onClose={() => setSignOutOpen(false)} title="Sign out?"><div className="sheet-stack"><p>Your saved reps stay exactly where they are.</p><form action={signOut} onSubmit={() => forgetCurrentUser()}><Button type="submit" fullWidth>Sign out</Button></form><Button variant="ghost" fullWidth onClick={() => setSignOutOpen(false)}>Stay here</Button></div></Sheet></AppShell>
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
  const [volume, setVolume] = useState(60)
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
  const room = roomAcousticsEnabled()

  // Seed the controls once the profile arrives. Uncontrolled-then-controlled
  // is a React warning; controlled-from-nothing is a field that wipes what the
  // user already has the moment it renders.
  useEffect(() => {
    if (!user) return
    setName(user.displayName)
    setWarmth(user.trainingWheels)
    setAmbience(user.ambience)
    setVolume(user.ambienceVolume)
  }, [user])

  const save = (result: Promise<{ ok: boolean; message: string | null }>, success: string) => {
    void result.then((outcome) => toast.push(outcome.ok ? success : outcome.message ?? 'Not saved.', outcome.ok ? 'volt' : 'red'))
  }

  return <AppShell title="Settings"><div className="screen-heading compact"><span className="label">System preferences</span><h1 className="display-lg">Settings</h1></div><div className="settings-groups"><SettingsGroup label="Account"><SettingRow label="Display name" detail="Shown on your profile"><input className="inline-edit" aria-label="Display name" value={name} disabled={loading} onChange={(event) => setName(event.target.value)} onBlur={() => { if (user && name.trim() && name !== user.displayName) save(saveDisplayName(name), 'Name saved.') }} /></SettingRow><SettingRow label="Email" detail={user?.email ?? '—'} /><SettingRow label="Password"><Link href="/forgot-password" className="text-action">Change password</Link></SettingRow></SettingsGroup><SettingsGroup label="Audio"><DeviceSelect label="Input device" kind="audioinput" value={user?.inputDevice ?? null} onChange={(device) => save(saveAudioPreferences({ inputDevice: device }), 'Input device saved.')} /><DeviceSelect label="Output device" kind="audiooutput" value={user?.outputDevice ?? null} onChange={(device) => save(saveAudioPreferences({ outputDevice: device }), 'Output device saved.')} /><SettingRow label="Test microphone" detail="Check level and device"><Button size="sm" variant="secondary" onClick={() => setMicOpen(true)}><Mic size={16} strokeWidth={1.5} /> Test mic</Button></SettingRow><div className="setting-slider"><div><strong>Room ambience volume</strong><span className="data">{room ? `${volume}%` : 'Off'}</span></div><input aria-label="Room ambience volume" type="range" min={0} max={100} value={volume} disabled={!room} onChange={(event) => setVolume(Number(event.target.value))} onPointerUp={() => save(saveAudioPreferences({ ambienceVolume: volume }), 'Volume saved.')} onKeyUp={() => save(saveAudioPreferences({ ambienceVolume: volume }), 'Volume saved.')} /></div></SettingsGroup><SettingsGroup label="Training"><ToggleRow label="Show warmth number during reps" detail="Removed automatically at Level 4" value={warmth} onChange={(next) => { setWarmth(next); save(saveTrainingWheels(next), next ? 'Warmth number on.' : 'Warmth number off.') }} /><ToggleRow label="Room ambience" detail={room ? 'Keep the scene present between turns' : 'Rooms are silent while the new sound is recorded'} value={room && ambience} disabled={!room} onChange={(next) => { setAmbience(next); save(saveAudioPreferences({ ambience: next }), next ? 'Ambience on.' : 'Ambience off.') }} /></SettingsGroup><SettingsGroup label="Data"><SettingRow label="Character memory" detail="One line each, about the encounter — never about how you did"><Button size="sm" variant="secondary" disabled={forgetting} onClick={() => setForgetOpen(true)}><RotateCcw size={16} strokeWidth={1.5} /> Clear all</Button></SettingRow><div className="setting-row setting-row--stacked"><div><strong>Shared cards</strong><span>Every card you have published, and the link that kills it</span></div><SharedCards /></div><SettingRow label="Export my data" detail="Sessions, scores, and transcript"><Button size="sm" variant="secondary" disabled><Download size={16} strokeWidth={1.5} /> Export</Button></SettingRow><SettingRow label="Delete account" detail="Permanent and immediate"><Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={16} strokeWidth={1.5} /> Delete</Button></SettingRow></SettingsGroup><SettingsGroup label="About"><SettingRow label="Version" detail="1.0.0 · Arena" /><SettingRow label="Terms"><Link href="/terms" className="text-action">Read</Link></SettingRow><SettingRow label="Privacy"><Link href="/privacy" className="text-action">Read</Link></SettingRow><SettingRow label="Support" detail="support@nerve.training"><a href="mailto:support@nerve.training" className="text-action">Email</a></SettingRow></SettingsGroup></div><Sheet open={micOpen} onClose={() => setMicOpen(false)} title="Test microphone"><MicTest /></Sheet><Sheet open={forgetOpen} onClose={() => setForgetOpen(false)} title="Clear character memory"><div className="sheet-stack"><p>Every character forgets the line she was carrying, and the next rep opens cold.</p><p className="muted">This clears that line and nothing else. Your reps, transcripts, scores, streak and everything you have unlocked stay exactly where they are.</p><Button variant="danger" fullWidth disabled={forgetting} onClick={() => { setForgetting(true); setForgetOpen(false); void forgetAllMemory().then((result) => toast.push(result.ok ? 'Every character has forgotten.' : result.message ?? 'That did not clear.', result.ok ? 'volt' : 'red')).finally(() => setForgetting(false)) }}>Clear it</Button><Button variant="ghost" fullWidth onClick={() => setForgetOpen(false)}>Keep it</Button></div></Sheet><Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete account"><div className="sheet-stack"><div className="danger-list"><span>All session recordings and transcripts</span><span>Your scores, streaks, and progression</span><span>Your account and billing access</span></div><p className="muted">Deletion is handled by support until the account-deletion path is built. Email <a className="text-action" href="mailto:support@nerve.training">support@nerve.training</a> and it happens within a day.</p><Input label="Type DELETE to confirm" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /><Button variant="danger" fullWidth disabled>Delete everything</Button><Button variant="ghost" fullWidth onClick={() => setDeleteOpen(false)}>Keep my account</Button></div></Modal></AppShell>
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

function SubscriptionScreen() {
  const { data: user, loading } = useUserState()
  const current = user?.plan ?? 'free'
  const { data: waitlisted, reload: reloadWaitlist } = usePlanWaitlist()
  const [asking, setAsking] = useState<'pro' | 'elite' | null>(null)
  const [saving, setSaving] = useState(false)
  const renews = user?.renewsAt ? new Date(user.renewsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null

  /**
   * Records the ask, then says so.
   *
   * Both Upgrade buttons used to be inert — no navigation, no message, nothing
   * — on the one screen where a user is deciding whether this product can be
   * trusted with a card. Until billing is wired, the honest button is the one
   * that admits what it does and keeps the demand.
   */
  const join = async (plan: 'pro' | 'elite') => {
    setSaving(true)
    await markUiFlag(planWaitlistFlag(plan))
    await reloadWaitlist()
    setSaving(false)
  }

  const joined = asking ? waitlisted.includes(asking) : false
  return <AppShell title="Subscription"><div className="screen-heading compact"><span className="label">Training access</span><h1 className="display-lg">Subscription</h1></div><Card className="current-plan">{loading || !user ? <Skeleton height={72} /> : <><div><Chip tone="volt">Current plan</Chip><h2 className="display-lg">{current}</h2><p><span className="data">{user.repsPerDay}</span> voice rep{user.repsPerDay === 1 ? '' : 's'} per day{renews ? <> · renews {renews}</> : null}</p></div><Button variant="secondary" disabled={current === 'free'}>Manage</Button></>}</Card><section className="plan-section"><span className="label">Compare plans</span><div className="plan-grid"><PlanCard plan="free" current={current} price="—" reps="1 / day" features={['Level 1 personas', 'Basic scorecards', 'Unlimited field work']} /><PlanCard plan="pro" current={current} price="$24 / mo" reps="3 / day" features={['Every persona', 'Full scorecards', 'Unlimited field work']} waitlisted={waitlisted.includes('pro')} onUpgrade={() => setAsking('pro')} /><PlanCard plan="elite" current={current} price="$39 / mo" reps="6 / day" features={['Every persona', 'Full transcript review', 'Priority access']} waitlisted={waitlisted.includes('elite')} onUpgrade={() => setAsking('elite')} /></div></section><p className="billing-note">Paid plans are not open yet. Billing will be handled by our merchant of record; cancel anytime, access stays open through the paid period.</p><Sheet open={asking !== null} onClose={() => setAsking(null)} title={joined ? "You're on the list" : `${asking === 'elite' ? 'Elite' : 'Pro'} isn't open yet`}>{joined ? <div className="sheet-stack"><Check size={34} strokeWidth={1.5} className="volt" /><p>We&apos;ll email you at <strong>{user?.email}</strong> the day {asking === 'elite' ? 'Elite' : 'Pro'} opens, and founding members keep the launch price.</p><Button fullWidth onClick={() => setAsking(null)}>Back to training</Button></div> : <div className="sheet-stack"><p>Checkout is still being built. Put your name down and we&apos;ll email you at <strong>{user?.email}</strong> the day it opens — founding members keep the launch price.</p><Button fullWidth loading={saving} onClick={() => { if (asking) void join(asking) }}>Tell me when it opens</Button><Button variant="ghost" fullWidth onClick={() => setAsking(null)}>Not now</Button></div>}</Sheet></AppShell>
}

function PlanCard({ plan, current, price, reps, features, waitlisted = false, onUpgrade }: { plan: Plan; current: Plan; price: string; reps: string; features: string[]; waitlisted?: boolean; onUpgrade?: () => void }) { const active = plan === current; return <Card className={`plan-card${active ? ' plan-card--current' : ''}`}><div className="plan-card__head"><div>{active ? <Chip tone="volt">Current</Chip> : <span className="label">Plan</span>}<h2 className="display-md">{plan}</h2></div><span className="data">{price}</span></div><Stat label="Voice reps" value={reps} /><ul>{features.map((feature) => <li key={feature}><Check size={15} strokeWidth={1.5} /> {feature}</li>)}</ul>{active ? <Button variant="secondary" fullWidth disabled>Current plan</Button> : waitlisted ? <Button variant="secondary" fullWidth onClick={onUpgrade}><Check size={15} strokeWidth={1.5} /> On the list</Button> : <Button fullWidth onClick={onUpgrade}>Notify me</Button>}</Card> }
