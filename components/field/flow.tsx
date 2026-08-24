'use client'

/**
 * The field flow, shared by the Field screen and the Train card.
 *
 * Both screens can assign, accept and log, and they must behave identically
 * when they do — so the state machine and the three sheets live here once
 * rather than being written twice and drifting.
 *
 * Writes are optimistic (§02 rule 8). Accepting a challenge, logging an ask
 * and rating anxiety all land instantly and reconcile in the background; a
 * failure reverts and says so. Nobody standing outside a shop with their
 * phone out should be watching a spinner.
 */

import { useCallback, useState, type ReactNode } from 'react'
import { Check, Shuffle, X } from 'lucide-react'
import { acceptChallenge, logAsk, swapChallenge } from '@/app/field/actions'
import type { FieldAssignment, FieldOutcome, FieldStatus } from '@/lib/data/types'
import { Button, Chip, Sheet, useToast } from '@/components/ui'

type SheetKind = 'accept' | 'did' | 'couldnt' | null

export interface FieldFlow {
  /** The status as the user sees it — optimistic until the write lands. */
  status: FieldStatus | null
  sheet: SheetKind
  busy: boolean
  open: (sheet: Exclude<SheetKind, null>) => void
  close: () => void
  accept: (anxietyPre: number) => void
  swap: () => void
  logDid: (input: { outcome: FieldOutcome; anxietyPost: number; note: string }) => void
  logCouldNot: (reason: string) => void
}

interface FlowCallbacks {
  /** Called after a write lands, so the screen can refetch. */
  onChanged?: () => void
  /**
   * Called when the ask just logged crossed 10 / 25 / 50 / 100 rejections.
   *
   * The screen owns the sheet rather than this hook, because the Train card
   * and `/field` want the same moment in different places — and because the
   * row in `unlocks` is what actually makes it fire. This only decides when.
   */
  onMilestone?: (at: number) => void
}

/**
 * @param assignment today's challenge, or null while it loads
 * @param callbacks what to do once a write lands
 */
export function useFieldFlow(assignment: FieldAssignment | null, callbacks: FlowCallbacks = {}): FieldFlow {
  const [override, setOverride] = useState<FieldStatus | null>(null)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const { onChanged, onMilestone } = callbacks

  const status = override ?? assignment?.status ?? null

  const run = useCallback(
    (
      optimistic: FieldStatus,
      action: () => Promise<{ ok: boolean; message: string | null; milestone?: number }>,
      success: string,
    ) => {
      const previous = override
      setOverride(optimistic)
      setSheet(null)
      setBusy(true)
      void action()
        .then((result) => {
          if (result.ok) {
            toast.push(success, 'volt')
            onChanged?.()
            if (result.milestone !== undefined) onMilestone?.(result.milestone)
            return
          }
          // It did not land. Put the screen back where it was and say why —
          // an optimistic write that quietly loses is worse than a slow one.
          setOverride(previous)
          toast.push(result.message ?? 'That did not save.', 'red')
        })
        .catch(() => {
          setOverride(previous)
          toast.push('That did not save — you may be offline.', 'red')
        })
        .finally(() => setBusy(false))
    },
    [onChanged, onMilestone, override, toast],
  )

  return {
    status,
    sheet,
    busy,
    open: setSheet,
    close: () => setSheet(null),
    accept: (anxietyPre) => {
      if (!assignment) return
      run('accepted', () => acceptChallenge(assignment.id, anxietyPre), 'Accepted. Go and do it.')
    },
    swap: () => {
      if (!assignment) return
      // No optimistic status: a swap replaces the challenge itself, so the
      // screen has to wait for the new one rather than guess at it.
      setBusy(true)
      void swapChallenge(assignment.id)
        .then((result) => {
          if (!result.ok) toast.push(result.message ?? 'Could not swap that.', 'red')
          else onChanged?.()
        })
        .finally(() => setBusy(false))
    },
    logDid: ({ outcome, anxietyPost, note }) => {
      if (!assignment) return
      run(
        'done',
        () => logAsk({ assignmentId: assignment.id, asked: true, outcome, anxietyPost, note }),
        outcome === 'declined' ? 'Rejection collected. That is the rep.' : 'Logged. That is the rep.',
      )
    },
    logCouldNot: (reason) => {
      if (!assignment) return
      run(
        'skipped',
        () => logAsk({ assignmentId: assignment.id, asked: false, outcome: 'not_asked', note: reason }),
        'Logged honestly. It stays on your list.',
      )
    },
  }
}

/**
 * Zero to ten.
 *
 * The same control before and after, deliberately: the whole instrument
 * depends on the two numbers being comparable, and a slider before and a
 * five-point scale after would not be.
 */
export function AnxietyScale({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return (
    <div className="anxiety-scale" role="group" aria-label="Zero to ten">
      {Array.from({ length: 11 }, (_, index) => (
        <button
          key={index}
          type="button"
          className={`anxiety-scale__dot data${value === index ? ' anxiety-scale__dot--on' : ''}`}
          aria-pressed={value === index}
          onClick={() => onChange(index)}
        >
          {index}
        </button>
      ))}
    </div>
  )
}

const OUTCOMES: { value: FieldOutcome; label: string }[] = [
  { value: 'declined', label: 'They said no' },
  { value: 'accepted', label: 'They said yes' },
  { value: 'mixed', label: 'Somewhere in between' },
]

const COULD_NOT_REASONS = ['Wrong moment', 'Lost my nerve', 'No one around']

/** The three sheets. Rendered by whichever screen is driving the flow. */
export function FieldSheets({ flow, title }: { flow: FieldFlow; title: string }) {
  const [pre, setPre] = useState<number | null>(null)
  const [post, setPost] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<FieldOutcome | null>(null)
  const [note, setNote] = useState('')

  return (
    <>
      <Sheet open={flow.sheet === 'accept'} onClose={flow.close} title="Before you go">
        <div className="sheet-stack">
          <p><strong>{title}</strong></p>
          <div>
            <span className="label">How hard does this feel right now?</span>
            <AnxietyScale value={pre} onChange={setPre} />
            <div className="anxiety-scale__ends label"><span>Nothing</span><span>Unthinkable</span></div>
          </div>
          <p className="muted">
            Answer before you go. Afterwards you will say what it actually felt like, and the
            gap between the two is the thing worth watching.
          </p>
          <Button fullWidth disabled={pre === null || flow.busy} onClick={() => pre !== null && flow.accept(pre)}>
            I&apos;m doing it
          </Button>
        </div>
      </Sheet>

      <Sheet open={flow.sheet === 'did'} onClose={flow.close} title="How did it go?">
        <div className="sheet-stack">
          <div>
            <span className="label">What happened</span>
            <div className="chip-row" style={{ marginTop: 10 }}>
              {OUTCOMES.map((option) => (
                <button key={option.value} type="button" className="chip-button" onClick={() => setOutcome(option.value)}>
                  <Chip tone={outcome === option.value ? 'volt' : 'neutral'}>{option.label}</Chip>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">How did it actually feel?</span>
            <AnxietyScale value={post} onChange={setPost} />
            <div className="anxiety-scale__ends label"><span>Nothing</span><span>Unthinkable</span></div>
          </div>
          <label className="field">
            <span className="label">Anything worth remembering</span>
            <textarea
              className="arena-input arena-textarea"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional."
            />
          </label>
          <Button
            fullWidth
            disabled={outcome === null || post === null || flow.busy}
            onClick={() => outcome !== null && post !== null && flow.logDid({ outcome, anxietyPost: post, note })}
          >
            Log it
          </Button>
        </div>
      </Sheet>

      <Sheet open={flow.sheet === 'couldnt'} onClose={flow.close} title="Logging it counts">
        <div className="sheet-stack">
          <p>Logging it honestly is worth doing. It stays on your list for tomorrow.</p>
          <div className="chip-row">
            {COULD_NOT_REASONS.map((reason) => (
              <button key={reason} type="button" className="chip-button" onClick={() => setNote(reason)}>
                <Chip tone={note === reason ? 'volt' : 'neutral'}>{reason}</Chip>
              </button>
            ))}
          </div>
          <Button fullWidth disabled={flow.busy} onClick={() => flow.logCouldNot(note)}>Log it</Button>
        </div>
      </Sheet>
    </>
  )
}

/** The two buttons, shared so Train and Field cannot disagree about them. */
export function FieldActions({ flow, size = 'md' }: { flow: FieldFlow; size?: 'sm' | 'md' | 'lg' }) {
  if (flow.status === 'pending') {
    return (
      <div className="field-card__actions">
        <Button size={size} disabled={flow.busy} onClick={() => flow.open('accept')}>I&apos;m doing it</Button>
        <Button size={size} variant="secondary" disabled={flow.busy} onClick={flow.swap}>
          <Shuffle size={16} strokeWidth={1.5} /> Swap
        </Button>
      </div>
    )
  }
  if (flow.status === 'accepted') {
    return (
      <div className="field-card__actions">
        <Button size={size} disabled={flow.busy} onClick={() => flow.open('did')}>
          <Check size={16} strokeWidth={1.5} /> Did it
        </Button>
        <Button size={size} variant="secondary" disabled={flow.busy} onClick={() => flow.open('couldnt')}>
          <X size={16} strokeWidth={1.5} /> Couldn&apos;t
        </Button>
      </div>
    )
  }
  return null
}

/** What the card says once the day is logged. */
export function FieldLogged({ status, children }: { status: FieldStatus | null; children?: ReactNode }) {
  const done = status === 'done'
  return (
    <div className="field-complete">
      {done ? <Check size={44} strokeWidth={1.25} className="volt" /> : <X size={44} strokeWidth={1.25} className="muted" />}
      <span className="label">Logged for today</span>
      <h2 className="display-md">{done ? 'You made the move.' : 'You told the truth.'}</h2>
      {children}
    </div>
  )
}
