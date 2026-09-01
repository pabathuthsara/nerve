/**
 * The cue rail — text mode's guided warm-up (`docs/site-audit-openai.md` P1).
 *
 * The audit's wording is the whole specification, and it is careful:
 *
 *   > Preserve authorship but add cue chips such as "Notice the room," "Use
 *   > what she remembered," and "Offer an opinion." These direct attention
 *   > without writing the user's line.
 *
 * ── WHY THIS DOES NOT CONTRADICT THE COMMENT IT SITS BESIDE ──────────────
 *
 * `text-screens.tsx` says, above its empty state: *"No coaching, and no
 * examples to copy. Saying the first thing is the skill being trained —
 * handing over an opening line would be training the wrong one."* That comment
 * is right and it stays. The distinction it is drawing is between a **line**
 * and a **direction**, and only the first one does the work for you:
 *
 *   a line       "So what got you into that?"      — you say it, you learned
 *                                                    nothing
 *   a direction  Go deeper, not wider              — you still have to find
 *                                                    the words, which is the
 *                                                    part that transfers
 *
 * The empty state is untouched for the same reason. The first thing you say is
 * still yours with no help at all; the rail appears once a conversation exists.
 *
 * ── THEY ARE THE MISSION'S OWN CUES ──────────────────────────────────────
 *
 * Nothing new is authored here. Every cue comes from `lib/data/mission.ts`, so
 * the thing text mode points at is the same objective the scorecard set, Train
 * shows and the brief restates. That is the connective tissue the audit says
 * the product lacks, extended to the mode somebody opens on a bad night.
 *
 * `assertNoScript` already refuses a cue that is quoted, first-person, or long
 * enough to read out loud — so the boundary is enforced in code rather than
 * trusted to whoever writes the next mission.
 */

import type { Mission } from '@/lib/data/mission'

/**
 * Which cue is being pointed at right now.
 *
 * Attention moves through a conversation and a rail that says all three things
 * equally loudly says nothing. The thresholds are about where a conversation
 * actually is rather than about pacing:
 *
 *   0-1 of your turns   you have barely started; the first cue is about
 *                       arriving — noticing, opening, saying it early
 *   2-3                 she has given you something. The middle cue is about
 *                       using it
 *   4+                  the conversation exists and the third cue is about
 *                       what you do with it: go deeper, or leave well
 *
 * Deliberately driven by the user's own turn count, not the total. A character
 * who replies twice to one message must not advance somebody's cue for them.
 */
export function activeCueIndex(userTurns: number, cueCount = 3): number {
  if (cueCount <= 0) return 0
  const step = userTurns <= 1 ? 0 : userTurns <= 3 ? 1 : 2
  return Math.min(step, cueCount - 1)
}

export interface Cue {
  text: string
  /** The one being pointed at now. Exactly one is ever true. */
  active: boolean
  /** Already passed. Shown, but quietly. */
  done: boolean
}

/** The rail, for a mission and a point in the conversation. */
export function cueRail(mission: Mission, userTurns: number): Cue[] {
  const active = activeCueIndex(userTurns, mission.cues.length)
  return mission.cues.map((text, index) => ({
    text,
    active: index === active,
    done: index < active,
  }))
}

/**
 * Whether the rail should be drawn at all.
 *
 * Not before the first thing is said, and not after she has gone. The first is
 * the authorship rule above; the second is that a direction on a finished
 * conversation is advice about a thing that cannot be done any more.
 */
export function railVisible(started: boolean, ended: boolean): boolean {
  return started && !ended
}
