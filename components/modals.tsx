'use client'

import Link from 'next/link'
import { Check, LockKeyhole, MicOff, Radio, Trash2, Trophy, WifiOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, Chip, Input, Modal, Sheet, Stat } from './ui'
import type { FieldTier, Level, PendingUnlock } from '@/lib/data/types'

interface OpenProps { open: boolean; onClose: () => void }

export function EndRepModal({ open, onClose, onEnd }: OpenProps & { onEnd: () => void }) { return <Modal open={open} onClose={onClose} title="End this rep?"><div className="sheet-stack"><p>It counts as an attempt.</p><Button variant="danger" fullWidth onClick={onEnd}>End rep</Button><Button fullWidth onClick={onClose}>Keep going</Button></div></Modal> }

export function PaywallSheet({ open, onClose, reset = '04:12', reason = 'Your voice reps for today are done.' }: OpenProps & { reset?: string; reason?: string }) { return <Sheet open={open} onClose={onClose} title="Keep training"><div className="sheet-stack"><p>{reason}</p><div className="plan-mini"><Stat label="Pro" value="3 / day" /><Stat label="Elite" value="6 / day" /></div><span className="label">Resets in <span className="data">{reset}</span></span><Link className="arena-button arena-button--primary arena-button--full" href="/profile/subscription">Upgrade</Link><Button variant="ghost" fullWidth onClick={onClose}>Maybe later</Button></div></Sheet> }

export function HowItWorksSheet({ open, onClose }: OpenProps) { return <Sheet open={open} onClose={onClose} title="How a rep works"><div className="how-list">{['Talk out loud.', 'You have three minutes.', 'Her form shows how she feels.', 'She decides at the end whether you get her number.'].map((item, index) => <div key={item}><span className="data">0{index + 1}</span><p>{item}</p></div>)}</div><div className="ring-illustration" aria-hidden="true"><i /><i /><i /></div></Sheet> }

/**
 * The unlock moment (§12). Fires once ever, off a row in `unlocks`.
 *
 * Two kinds through one sheet: a roster tier, and a field tier that opens
 * because the sim level did (§09). The copy is hand-written per tier rather
 * than assembled — it used to name Jules and Samara for every level, including
 * the ones they are not on.
 */
export function LevelUnlockedSheet({ open, onClose, unlock }: OpenProps & { unlock: PendingUnlock | null }) {
  if (!unlock) return null
  const copy = unlock.kind === 'tier' ? FIELD_TIER_COPY[unlock.ref] : LEVEL_COPY[unlock.ref]
  const href = unlock.kind === 'tier' ? '/field' : '/roster'
  return <Sheet open={open} onClose={onClose} title={copy.title}><div className="sheet-stack"><Trophy size={34} strokeWidth={1.5} className="volt" /><p>{copy.body}</p>{copy.names.length ? <div className="mini-personas">{copy.names.map((name) => <span key={name}>{name}</span>)}</div> : null}<Link className="arena-button arena-button--primary arena-button--full" href={href}>{copy.action}</Link><Button variant="ghost" fullWidth onClick={onClose}>Not now</Button></div></Sheet>
}

interface UnlockCopy { title: string; body: string; names: string[]; action: string }

/** Roster tiers. Tiers 1 and 2 are open from the start and never fire. */
const LEVEL_COPY: Record<Level, UnlockCopy> = {
  1: { title: 'Level 01 unlocked', body: 'Open from the start.', names: [], action: 'See the roster' },
  2: { title: 'Level 02 unlocked', body: 'Open from the start.', names: [], action: 'See the roster' },
  3: {
    title: 'Level 03 unlocked',
    body: 'The last one. Robin is polite the whole way through and never says anything cutting, and that is the hard part — the work is deciding whether this is a no while she is still being perfectly nice about it. The warmth number is gone from here. You read her, or you guess.',
    names: ['Robin'],
    action: 'See her',
  },
}

/** Field tiers (§09). T1 is day one and never fires. */
const FIELD_TIER_COPY: Record<FieldTier, UnlockCopy> = {
  1: { title: 'Tier 1 unlocked', body: 'Open from the start.', names: [], action: 'See the field' },
  2: {
    title: 'Tier 2 unlocked',
    body: 'Low stakes, outside the app. Asking for a discount, a free refill, something that is not on the menu. No social risk at all — the only thing at stake is hearing the word no out loud.',
    names: [],
    action: 'See today’s',
  },
  3: {
    title: 'Tier 3 unlocked',
    body: 'Real interaction now, and still nothing romantic. Complimenting a stranger and walking on, asking to join a table. The worst realistic outcome is still a polite no.',
    names: [],
    action: 'See today’s',
  },
  4: {
    title: 'Tier 4 unlocked',
    body: 'The real thing. Asking for a name, a number, someone out with a specific plan. Everything you have been practising, with nobody grading it but you.',
    names: [],
    action: 'See today’s',
  },
}

export function TrainingWheelsOffModal({ open, onClose }: OpenProps) { return <Modal open={open} onClose={onClose} title="Read her, not the meter"><div className="sheet-stack"><Radio size={34} strokeWidth={1.5} className="volt" /><p>From here, no numbers. Read the way her form moves, along with her timing and tone.</p><Button fullWidth onClick={onClose}>Understood</Button></div></Modal> }

export function FirstWinSheet({ open, onClose }: OpenProps) { return <Sheet open={open} onClose={onClose} title="That&apos;s the loop"><div className="sheet-stack"><Check size={34} strokeWidth={1.5} className="volt" /><p>Do it again tomorrow. One completed rep keeps the streak alive.</p><Button fullWidth onClick={onClose}>Got it</Button></div></Sheet> }

export function ChickenedOutSheet({ open, onClose, onLog }: OpenProps & { onLog: () => void }) { return <Sheet open={open} onClose={onClose} title="Logging it counts"><div className="sheet-stack"><p>Logging it honestly is the rep. It stays on your list for tomorrow.</p><div className="chip-row"><Chip>Wrong moment</Chip><Chip>Lost my nerve</Chip><Chip>No one around</Chip></div><Button fullWidth onClick={onLog}>Log it</Button></div></Sheet> }

export function FieldDoneSheet({ open, onClose }: OpenProps) { return <Sheet open={open} onClose={onClose} title="Field rep logged"><div className="sheet-stack"><Check size={34} strokeWidth={1.5} className="volt" /><p>You made the move. That is the entire assignment.</p><Button fullWidth onClick={onClose}>Done</Button></div></Sheet> }

export function MicPermissionSheet({ open, onClose, onRetry }: OpenProps & { onRetry: () => void }) { return <Sheet open={open} onClose={onClose} title="Microphone blocked"><div className="sheet-stack"><MicOff size={34} strokeWidth={1.5} className="danger" /><p>Click the lock in your address bar, open Site settings, and set Microphone to Allow.</p><Button fullWidth onClick={onRetry}>Try again</Button><Button variant="ghost" fullWidth>How do I fix this?</Button></div></Sheet> }

export function MicLostModal({ open, onResume, onEnd }: { open: boolean; onResume: () => void; onEnd: () => void }) { return <Modal open={open} onClose={onResume} title="We can&apos;t hear you"><div className="sheet-stack"><MicOff size={34} strokeWidth={1.5} className="amber" /><p>The clock is paused. Restore microphone access to keep going.</p><Button fullWidth onClick={onResume}>Resume</Button><Button variant="danger" fullWidth onClick={onEnd}>End rep</Button></div></Modal> }

export function ConnectionLostModal({ open, attempt, onRetry, onEnd }: { open: boolean; attempt: number; onRetry: () => void; onEnd: () => void }) { return <Modal open={open} onClose={onRetry} title="Connection lost"><div className="sheet-stack"><WifiOff size={34} strokeWidth={1.5} className="amber" /><p className="data">{attempt < 3 ? `Reconnecting — ${Math.max(1, attempt)}/3` : 'Could not reconnect'}</p>{attempt < 3 ? <Button fullWidth onClick={onRetry}>Retry now</Button> : null}<Button variant="danger" fullWidth onClick={onEnd}>End rep</Button></div></Modal> }

export function MicTestSheet({ open, onClose, children }: OpenProps & { children?: ReactNode }) { return <Sheet open={open} onClose={onClose} title="Test microphone">{children ?? <div className="sheet-stack"><MicOff size={34} strokeWidth={1.5} /><p>Speak normally. Your level should move through the middle segments.</p></div>}</Sheet> }

export function DeleteAccountModal({ open, onClose }: OpenProps) { const [text, setText] = useState(''); return <Modal open={open} onClose={onClose} title="Delete account"><div className="sheet-stack"><Trash2 size={34} strokeWidth={1.5} className="danger" /><div className="danger-list"><span>Every session and transcript</span><span>Scores, streaks, and progression</span><span>Your account access</span></div><Input label="Type DELETE to confirm" value={text} onChange={(event) => setText(event.target.value)} /><Button variant="danger" fullWidth disabled={text !== 'DELETE'}>Delete everything</Button><Button variant="ghost" fullWidth onClick={onClose}>Keep my account</Button></div></Modal> }

export function SignOutSheet({ open, onClose }: OpenProps) { return <Sheet open={open} onClose={onClose} title="Sign out?"><div className="sheet-stack"><p>Your work stays saved.</p><Link className="arena-button arena-button--primary arena-button--full" href="/login">Sign out</Link><Button variant="ghost" fullWidth onClick={onClose}>Stay here</Button></div></Sheet> }

export function PersonaDetailSheet({ open, onClose, children }: OpenProps & { children: ReactNode }) { return <Sheet open={open} onClose={onClose} title="Persona detail">{children}</Sheet> }

export function CVReplaceSheet({ open, onClose, fileName, onReplace, onRemove }: OpenProps & { fileName: string; onReplace: () => void; onRemove: () => void }) { return <Sheet open={open} onClose={onClose} title="Replace CV"><div className="sheet-stack"><div className="locked-action"><LockKeyhole size={18} strokeWidth={1.5} /><span>{fileName}</span></div><Button fullWidth onClick={onReplace}>Replace</Button><Button variant="danger" fullWidth onClick={onRemove}>Remove</Button></div></Sheet> }
