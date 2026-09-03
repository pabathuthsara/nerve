'use client'

/**
 * The rejection milestone (§09, §12).
 *
 * A designed beat, not a toast — which is why it is a sheet and why dismissing
 * it is what marks it seen. It fires once ever; the guarantee lives in
 * `unlocks`, not here.
 *
 * There is no volt on this sheet except the count itself. The number is the
 * thing being celebrated and it is the only thing that should read as the
 * hero, so the dismiss control is deliberately secondary.
 */

import { useState } from 'react'
import { acknowledgeMilestone } from '@/app/field/actions'
import type { Milestone } from '@/lib/field/milestones'
import { Button, Sheet } from '@/components/ui'
import { Mark, milestoneMark } from '@/components/marks'
import { ShareButton } from '@/components/share/share-button'

export function MilestoneSheet({ milestone, onClose }: { milestone: Milestone | null; onClose: () => void }) {
  const [closing, setClosing] = useState(false)

  const dismiss = () => {
    if (!milestone || closing) return
    setClosing(true)
    // Optimistic, like every other write here (§02 rule 8). A stamp that fails
    // shows the sheet once more, which is a far smaller cost than making
    // somebody wait on a round trip to close a celebration.
    onClose()
    void acknowledgeMilestone(milestone.at).finally(() => setClosing(false))
  }

  return (
    <Sheet open={milestone !== null} onClose={dismiss} title={milestone?.title ?? ''}>
      {milestone ? (
        <div className="sheet-stack">
          {/* V38. One ring per milestone reached, beside the count. The
              number stays the hero — it is the thing being celebrated — so
              the mark is Ink-2 and never competes with it. */}
          <div className="milestone-count"><Mark name={milestoneMark(milestone.at)} size={38} /><div><span className="composite data">{milestone.at}</span><span className="label">Rejections collected</span></div></div>
          <p>{milestone.body}</p>
          <p className="muted">{milestone.note}</p>
          {/* Opt-in, never automatic (§08). The moment fires on its own; the
              artefact only exists if they ask for it. */}
          <ShareButton kind="rejections" label="Make a card" size="md" />
          <Button variant="ghost" fullWidth onClick={dismiss}>Keep going</Button>
        </div>
      ) : null}
    </Sheet>
  )
}
