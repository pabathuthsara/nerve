'use client'

import Link from 'next/link'
import { Check, LockKeyhole, MicOff, Radio, Trash2, Trophy, WifiOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, Chip, Input, Modal, Sheet, Stat } from './ui'

interface OpenProps { open: boolean; onClose: () => void }

export function EndRepModal({ open, onClose, onEnd }: OpenProps & { onEnd: () => void }) { return <Modal open={open} onClose={onClose} title="End this rep?"><div className="sheet-stack"><p>It counts as an attempt.</p><Button variant="danger" fullWidth onClick={onEnd}>End rep</Button><Button fullWidth onClick={onClose}>Keep going</Button></div></Modal> }

export function PaywallSheet({ open, onClose, reset = '04:12', reason = 'Your voice reps for today are done.' }: OpenProps & { reset?: string; reason?: string }) { return <Sheet open={open} onClose={onClose} title="Keep training"><div className="sheet-stack"><p>{reason}</p><div className="plan-mini"><Stat label="Pro" value="3 / day" /><Stat label="Elite" value="6 / day" /></div><span className="label">Resets in <span className="data">{reset}</span></span><Link className="arena-button arena-button--primary arena-button--full" href="/profile/subscription">Upgrade</Link><Button variant="ghost" fullWidth onClick={onClose}>Maybe later</Button></div></Sheet> }

export function HowItWorksSheet({ open, onClose }: OpenProps) { return <Sheet open={open} onClose={onClose} title="How a rep works"><div className="how-list">{['Talk out loud.', 'You have three minutes.', 'The ring shows how she feels.', 'She decides at the end whether you get her number.'].map((item, index) => <div key={item}><span className="data">0{index + 1}</span><p>{item}</p></div>)}</div><div className="ring-illustration" aria-hidden="true"><i /><i /><i /></div></Sheet> }

export function LevelUnlockedSheet({ open, onClose, level = 3 }: OpenProps & { level?: number }) { return <Sheet open={open} onClose={onClose} title={`Level ${String(level).padStart(2, '0')} unlocked`}><div className="sheet-stack"><Trophy size={34} strokeWidth={1.5} className="volt" /><p>You are an interruption. Jules and Samara are now on the roster.</p><div className="mini-personas"><span>Jules</span><span>Samara</span></div><Link className="arena-button arena-button--primary arena-button--full" href="/roster">See them</Link><Button variant="ghost" fullWidth onClick={onClose}>Not now</Button></div></Sheet> }

export function TrainingWheelsOffModal({ open, onClose }: OpenProps) { return <Modal open={open} onClose={onClose} title="Read her, not the meter"><div className="sheet-stack"><Radio size={34} strokeWidth={1.5} className="volt" /><p>From here, no numbers. The ring goes neutral; her timing and tone are the signal.</p><Button fullWidth onClick={onClose}>Understood</Button></div></Modal> }

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

