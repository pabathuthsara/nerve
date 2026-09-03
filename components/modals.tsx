'use client'

import Link from 'next/link'
import { Check, LifeBuoy, LockKeyhole, Mic, MicOff, Radio, Trophy, WifiOff } from 'lucide-react'
import { Mark, fieldTierMark, tierMark } from '@/components/marks'
import { useEffect, useState } from 'react'
import { Button, Modal, Sheet, Stat } from './ui'
import type { PendingUnlock } from '@/lib/data/types'
import { FIELD_TIER_COPY, LEVEL_COPY } from '@/lib/data/level-copy'
import { detectBrowser, micRecovery, type Browser } from '@/lib/data/mic'
import { DISTRESS_COPY, DISTRESS_RESOURCES } from '@/lib/safety/resources'
import { TRIAL_DAYS, planById, repsLine } from '@/lib/site/plans'

interface OpenProps { open: boolean; onClose: () => void }

export function EndRepModal({ open, onClose, onEnd }: OpenProps & { onEnd: () => void }) { return <Modal open={open} onClose={onClose} title="End this rep?"><div className="sheet-stack"><p>It counts as an attempt.</p><Button variant="danger" fullWidth onClick={onEnd}>End rep</Button><Button fullWidth onClick={onClose}>Keep going</Button></div></Modal> }

/**
 * The upgrade moment (§14, docs/PAYMENTS-NEW-INTEGRATION.md §5.2).
 *
 * Two refusals arrive here and they are not the same screen.
 *
 * `locked` is an account with no voice on its plan at all. Nothing resets at
 * midnight for these people, so a countdown would be a lie and "maybe later"
 * would be the only true thing on the sheet. This is the highest-value screen
 * in the funnel and it has one job: say what voice costs, say the trial is free
 * and cancellable, and offer the thing that still works tonight.
 *
 * Not `locked` is a paying account at the end of its day. That one genuinely
 * does reset, so it keeps the countdown and the softer framing — pushing Elite
 * at somebody who is already paying and already trained today is how a plan
 * limit turns into an advert.
 *
 * The plan names, prices and rep counts come from `lib/site/plans.ts` rather
 * than being written out here, for the reason that file exists: two copies of a
 * price is how a product ends up charging one number and advertising another.
 *
 * `personaId` is optional and worth passing. Text mode costs no quota and no
 * money, so on the locked sheet it is a real second option rather than a
 * consolation — §14's rule is that running out must never read as losing the
 * account, and the way to prove that is to offer something that still works.
 */
export function PaywallSheet({
  open,
  onClose,
  reset = '04:12',
  reason,
  locked = false,
  personaId = null,
}: OpenProps & { reset?: string; reason?: string; locked?: boolean; personaId?: string | null }) {
  const pro = planById('pro')
  const elite = planById('elite')
  const body = reason ?? (locked
    ? 'Voice reps are part of Pro. Your streak, your field log and text mode stay exactly where they are.'
    : 'Your voice reps for today are done.')
  return (
    <Sheet open={open} onClose={onClose} title={locked ? 'Voice is on Pro' : 'Keep training'}>
      <div className="sheet-stack">
        <p>{body}</p>
        <div className="plan-mini">
          <Stat label={pro.name} value={repsLine(pro)} detail={pro.price ?? undefined} />
          <Stat label={elite.name} value={repsLine(elite)} detail={elite.price ?? undefined} />
        </div>
        {locked
          ? <span className="label">{TRIAL_DAYS} days free, then <span className="data">{pro.price}</span> a month. Cancel any time.</span>
          : <span className="label">Resets in <span className="data">{reset}</span></span>}
        <Link className="arena-button arena-button--primary arena-button--full" href="/profile/subscription">
          {locked ? `Start the ${TRIAL_DAYS}-day trial` : 'Upgrade'}
        </Link>
        {locked && personaId
          ? <Link className="arena-button arena-button--ghost arena-button--full" href={`/text/${personaId}`}>Type to her instead — always free</Link>
          : null}
        <Button variant="ghost" fullWidth onClick={onClose}>Maybe later</Button>
      </div>
    </Sheet>
  )
}

export function HowItWorksSheet({ open, onClose }: OpenProps) { return <Sheet open={open} onClose={onClose} title="How a rep works"><div className="how-list">{['Talk out loud.', 'You have three minutes.', 'Her form shows how she feels.', 'She decides at the end whether you get her number.'].map((item, index) => <div key={item}><span className="data">0{index + 1}</span><p>{item}</p></div>)}</div><div className="ring-illustration" aria-hidden="true"><i /><i /><i /></div></Sheet> }

/**
 * The unlock moment (§12). Fires once ever, off a row in `unlocks`.
 *
 * Two kinds through one sheet: a roster tier, and a field tier that opens
 * because the sim level did (§09). The copy is hand-written per tier rather
 * than assembled — it used to name Jules and Samara for every level, including
 * the ones they are not on.
 *
 * It now reads that copy from `lib/data/level-copy.ts` rather than owning it,
 * because the roster shows the same words **before** the gate (R9) and a tier
 * that argues one thing on the way up and another on arrival is a tier nobody
 * believes.
 */
export function LevelUnlockedSheet({ open, onClose, unlock }: OpenProps & { unlock: PendingUnlock | null }) {
  if (!unlock) return null
  const copy = unlock.kind === 'tier' ? FIELD_TIER_COPY[unlock.ref] : LEVEL_COPY[unlock.ref]
  const href = unlock.kind === 'tier' ? '/field' : '/roster'
  // V37. A stock trophy stood for both a roster tier and a field tier — two
  // different ladders, one glyph. Each now shows the rung actually opened.
  const mark = unlock.kind === 'tier' ? fieldTierMark(unlock.ref) : tierMark(unlock.ref)
  return <Sheet open={open} onClose={onClose} title={copy.title}><div className="sheet-stack"><Mark name={mark} size={34} current /><p>{copy.body}</p>{copy.names.length ? <div className="mini-personas">{copy.names.map((name) => <span key={name}>{name}</span>)}</div> : null}<Link className="arena-button arena-button--primary arena-button--full" href={href}>{copy.action}</Link><Button variant="ghost" fullWidth onClick={onClose}>Not now</Button></div></Sheet>
}

export function TrainingWheelsOffModal({ open, onClose }: OpenProps) { return <Modal open={open} onClose={onClose} title="Read her, not the meter"><div className="sheet-stack"><Radio size={34} strokeWidth={1.5} className="volt" /><p>From here, no numbers. Read the way her form moves, along with her timing and tone.</p><Button fullWidth onClick={onClose}>Understood</Button></div></Modal> }

export function FirstWinSheet({ open, onClose }: OpenProps) { return <Sheet open={open} onClose={onClose} title="That&apos;s the loop"><div className="sheet-stack"><Check size={34} strokeWidth={1.5} className="volt" /><p>Do it again tomorrow. One completed rep keeps the streak alive.</p><Button fullWidth onClick={onClose}>Got it</Button></div></Sheet> }

/**
 * The first rejection (R5). Once ever, and the counterpart that was missing.
 *
 * Statistically the most likely outcome of rep one and the highest-churn
 * moment in the product: there was a `FirstWinSheet` for the outcome that
 * mostly does not happen and nothing at all for the one that mostly does.
 *
 * **It is also the right home for the scorecard explainer**, which §12 calls
 * load-bearing for retention. That sheet used to wait for a scorecard the user
 * might only reach after a win they might never get — so the sentence that
 * makes this whole product make sense ("a clean rep that ends in rejection can
 * score 92") arrived, if at all, as a footnote to a victory. A user who learns
 * it *at the moment they were rejected* has learned the product.
 *
 * Whichever of the two fires first stamps both keys, so nobody is told the
 * same thing twice — see `markScoringExplained` in `session-screens.tsx`.
 *
 * The tone is the whole job. No consolation, no encouragement to try again
 * right now, nothing that reads as the app being kind about a failure: this is
 * a statement that the thing that just happened is the exercise.
 */
export function FirstLossSheet({ open, onClose }: OpenProps) {
  return (
    <Sheet open={open} onClose={onClose} title="That&apos;s the rep">
      <div className="sheet-stack">
        <Mark name="state-session" size={34} />
        <p><strong>This one is supposed to happen.</strong> Most reps end with her leaving. That is not the failure state — it is the thing you came here to get used to.</p>
        <p>Whether she gave you her number is worth nothing. It is recorded, and it contributes zero points.</p>
        <p>What is scored is how you played: how much of the talking was yours, whether you asked real questions, whether you used what she gave you, whether you read her, and how you left.</p>
        <p className="muted">A clean rep that ends in rejection can score 92. A sloppy one that got lucky scores 54. That is on purpose — you own the process, and nobody owns the result.</p>
        <Button fullWidth onClick={onClose}>Got it</Button>
      </div>
    </Sheet>
  )
}



/**
 * The first scorecard, explained. Once ever (§12).
 *
 * §12 calls this "load-bearing for retention", and it is the only overlay in
 * the product with that note against it. The reason is §07: outcome is worth
 * zero points, and a user who does not know that reads their first 78 after a
 * rejection as the app being kind to them. Once they know, the same number is
 * the whole product working.
 *
 * Shown after the score is on screen rather than before it. The number is the
 * emotional beat; explaining the rules over the top of it would flatten the one
 * moment the scorecard has.
 */
export function ScorecardExplainerSheet({ open, onClose }: OpenProps) {
  return <Sheet open={open} onClose={onClose} title="How this is scored"><div className="sheet-stack"><Trophy size={34} strokeWidth={1.5} className="volt" /><p><strong>Whether she gave you her number is worth nothing.</strong> It is recorded, and it contributes zero points.</p><p>What is scored is how you played: how much of the talking was yours, whether you asked real questions, whether you used what she gave you, whether you read her, and how you left.</p><p className="muted">A clean rep that ends in rejection can score 92. A sloppy one that got lucky scores 54. That is on purpose — you own the process, and nobody owns the result.</p><Button fullWidth onClick={onClose}>Understood</Button></div></Sheet>
}

/**
 * The primer (§12, B10). Shown BEFORE the browser prompt, never after.
 *
 * "Skipping this step is the single biggest cause of permanent permission
 * denial." A prompt with no explanation gets dismissed, and on most browsers a
 * dismissal is permanent for the origin — so this sheet is the difference
 * between a user who trains and a user who cannot, and it is one second long.
 *
 * It says what we do with the microphone and what we do not, because the honest
 * answer is reassuring: the audio goes to the voice provider and to a private
 * bucket that purges itself, and §16 makes the recording the user's.
 */
export function MicPrimerSheet({ open, onClose, onAllow }: OpenProps & { onAllow: () => void }) {
  return <Sheet open={open} onClose={onClose} title="We need your microphone"><div className="sheet-stack"><Mic size={34} strokeWidth={1.5} className="volt" /><p>This is a talking exercise, so the next thing you see is your browser asking for the microphone. Say yes and the rep starts.</p><p className="muted">Your audio goes to the voice model and to your own private recording, which deletes itself after thirty days. You can delete it sooner, and turn recordings off entirely, in Settings.</p><Button fullWidth onClick={onAllow}>Got it — ask me</Button><Button variant="ghost" fullWidth onClick={onClose}>Not now</Button></div></Sheet>
}

/**
 * The recovery (§12). Shown when permission was actually refused.
 *
 * Deliberately separate from `MicLostModal`, which is for a microphone that was
 * working and stopped — a cable, a device switch, another tab taking it. Those
 * are different situations with different fixes, and telling somebody whose
 * headset unplugged to go and edit their site settings is how a fixable problem
 * becomes an abandoned session.
 */
export function MicBlockedSheet({ open, onClose, onRetry }: OpenProps & { onRetry: () => void }) {
  const [browser, setBrowser] = useState<Browser>('other')
  // Read in an effect rather than at render: the user agent does not exist on
  // the server, and a mismatch here would be a hydration error on the one
  // screen a user is already having trouble with.
  useEffect(() => { setBrowser(detectBrowser(navigator.userAgent)) }, [])
  return <Sheet open={open} onClose={onClose} title="Microphone blocked"><div className="sheet-stack"><MicOff size={34} strokeWidth={1.5} className="danger" /><p>Your browser is refusing the microphone for this site. Nothing is wrong with your account.</p><p className="muted">{micRecovery(browser)}</p><Button fullWidth onClick={onRetry}>Try again</Button></div></Sheet>
}

/**
 * The rep stopped being an exercise (§16.8).
 *
 * A modal rather than a sheet, and not dismissible by tapping past it: this is
 * the one moment in the product where continuing to be an app that gets out of
 * your way is the wrong behaviour. The training frame is gone — no persona, no
 * score, no meter, no "run it back", nothing that reads as a game — and the
 * only thing on the screen besides the words is a list of places to call.
 *
 * The resources and the copy are authored in `lib/safety/resources.ts`. They
 * are not written here, because a helpline number buried in a component is a
 * helpline number nobody reviews.
 */
export function DistressModal({ open, onClose }: OpenProps) {
  return <Modal open={open} onClose={onClose} title={DISTRESS_COPY.title}><div className="sheet-stack distress-sheet"><LifeBuoy size={34} strokeWidth={1.5} className="amber" /><p>{DISTRESS_COPY.body}</p><p className="distress-offer">{DISTRESS_COPY.offer}</p><ul className="distress-list">{DISTRESS_RESOURCES.map((resource) => <li key={resource.name}><a href={resource.href} target="_blank" rel="noreferrer"><strong>{resource.name}</strong><span className="data">{resource.contact}</span></a><small>{resource.detail}</small></li>)}</ul><Button fullWidth onClick={onClose}>{DISTRESS_COPY.close}</Button></div></Modal>
}

export function MicLostModal({ open, onResume, onEnd }: { open: boolean; onResume: () => void; onEnd: () => void }) { return <Modal open={open} onClose={onResume} title="We can&apos;t hear you"><div className="sheet-stack"><MicOff size={34} strokeWidth={1.5} className="amber" /><p>The clock is paused. Restore microphone access to keep going.</p><Button fullWidth onClick={onResume}>Resume</Button><Button variant="danger" fullWidth onClick={onEnd}>End rep</Button></div></Modal> }

export function ConnectionLostModal({ open, attempt, onRetry, onEnd }: { open: boolean; attempt: number; onRetry: () => void; onEnd: () => void }) { return <Modal open={open} onClose={onRetry} title="Connection lost"><div className="sheet-stack"><WifiOff size={34} strokeWidth={1.5} className="amber" /><p className="data">{attempt < 3 ? `Reconnecting — ${Math.max(1, attempt)}/3` : 'Could not reconnect'}</p>{attempt < 3 ? <Button fullWidth onClick={onRetry}>Retry now</Button> : null}<Button variant="danger" fullWidth onClick={onEnd}>End rep</Button></div></Modal> }





export function CVReplaceSheet({ open, onClose, fileName, onReplace, onRemove }: OpenProps & { fileName: string; onReplace: () => void; onRemove: () => void }) { return <Sheet open={open} onClose={onClose} title="Replace CV"><div className="sheet-stack"><div className="locked-action"><LockKeyhole size={18} strokeWidth={1.5} /><span>{fileName}</span></div><Button fullWidth onClick={onReplace}>Replace</Button><Button variant="danger" fullWidth onClick={onRemove}>Remove</Button></div></Sheet> }
