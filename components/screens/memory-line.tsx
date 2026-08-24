'use client'

/**
 * What she remembers, on the brief screen (§08).
 *
 * The decision this shape encodes: the memory line lives here, with a one-tap
 * **start fresh** beside it, and there is no decision to make before every rep.
 * The moment before the microphone opens stays a single action — an extra
 * "remember me / forget me" choice at that moment is a moment to think better
 * of the whole thing.
 *
 * The copy is deliberately flat. She remembered a fact about the encounter; she
 * is not pleased to see anybody, and the framing here must not imply she is.
 */

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { forgetPersona, markUiFlag } from '@/app/profile/actions'
import { MEMORY_BEAT_FLAG } from '@/lib/data/ui-flags'
import type { PersonaMemory } from '@/lib/data/types'
import { Button, Sheet, useToast } from '@/components/ui'

export function MemoryLine({
  personaId,
  name,
  memory,
  onForgotten,
}: {
  personaId: string
  name: string
  memory: PersonaMemory | null
  onForgotten: () => void
}) {
  const toast = useToast()
  const [cleared, setCleared] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // DERIVED, never seeded into state. This component mounts before its own
  // fetch resolves, so a `useState` initialiser reads `memory` as null, latches
  // false and the beat never fires — it happened to work in a browser only
  // because that fetch won a race it is not guaranteed to win.
  //
  // Fires once ever, the first time any character remembers this user.
  const beat = !dismissed && memory?.firstEver === true

  if (!memory || cleared) return null

  const forget = () => {
    // Optimistic (§02 rule 8). Clearing a line is instant and reversible only
    // by living through another rep, so it says plainly what it did.
    setCleared(true)
    void forgetPersona(personaId)
      .then((result) => {
        if (result.ok) {
          toast.push(`${name} has forgotten it.`, 'volt')
          onForgotten()
          return
        }
        setCleared(false)
        toast.push(result.message ?? 'That did not clear.', 'red')
      })
      .catch(() => {
        setCleared(false)
        toast.push('That did not clear — you may be offline.', 'red')
      })
  }

  // Stamped as it closes, and the sheet is hidden locally the moment it is
  // dismissed rather than waiting for the write. `markUiFlag` is idempotent, so
  // a failed stamp costs one repeat of an explainer and nothing else.
  const closeBeat = () => {
    setDismissed(true)
    void markUiFlag(MEMORY_BEAT_FLAG)
  }

  return (
    <>
      <div className="memory-line">
        <span className="label">She remembers</span>
        <p>{memory.line}</p>
        <button type="button" className="memory-line__reset label" onClick={forget}>
          <RotateCcw size={13} strokeWidth={1.5} /> Start fresh
        </button>
      </div>

      <Sheet open={beat} onClose={closeBeat} title="She remembers you">
        <div className="sheet-stack">
          <p>
            {name} kept one thing from the last time you spoke, and she may bring it up.
            It is the encounter she remembers — what was going on, what she was looking
            for — never how you did.
          </p>
          <p className="muted">
            Start fresh clears that line and nothing else. Your reps, scores and record
            all stay exactly where they are.
          </p>
          <Button fullWidth onClick={closeBeat}>Got it</Button>
        </div>
      </Sheet>
    </>
  )
}
