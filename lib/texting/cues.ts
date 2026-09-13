/**
 * The cue rail — texting's attention rail.
 *
 * ── WHY THIS DOES NOT CONTRADICT THE EMPTY STATE ─────────────────────────
 *
 * `texting-screens.tsx` says, above its opener: *"No coaching and no examples
 * to copy. Sending the first message is the skill being trained; handing over
 * an opening line would be training the wrong one."* That is right and it
 * stays. The distinction it draws is between a **line** and a **direction**,
 * and only the first one does the work for you:
 *
 *   a line       "So what got you into that?"    you say it, you learned
 *                                                nothing
 *   a direction  Go deeper, not wider            you still have to find the
 *                                                words, which is the part that
 *                                                transfers
 *
 * The opener is untouched. The first thing you send is yours with no help at
 * all; the rail appears once a conversation exists.
 *
 * ── AND WHY THEY ARE NOT THE DATING MISSIONS ─────────────────────────────
 *
 * The old text mode read `lib/data/mission.ts`, so the thing it pointed at was
 * the objective the last VOICE scorecard set. That was right when text mode was
 * the same characters without a microphone. It is wrong now: texting is its own
 * section with its own roster and its own skills, and *"Notice the room"* is
 * not advice about a thread.
 *
 * What is reused is the DISCIPLINE. `assertNoScript` already refuses a cue that
 * is quoted, first-person, or long enough to read out loud, and it is applied
 * to these by `cues.test.ts` walking the real set — so the boundary is enforced
 * in code rather than trusted to whoever writes the next one.
 */

import { assertNoScript, type Mission } from '@/lib/data/mission'

/**
 * The three things a thread is actually about, in the order attention moves
 * through one.
 *
 * Each is a direction and none of them is a line. The third is the one this
 * section exists for: nothing else in the product teaches somebody to notice
 * that the other person has gone quiet, because nothing else in the product can
 * show them a delay.
 */
export const TEXTING_CUES: readonly string[] = [
  'Say the thing, not the greeting',
  'Give her something back',
  'Read the gap, not the words',
]

/**
 * The rail, as a mission-shaped record.
 *
 * Shaped like a `Mission` so `assertNoScript` can be run over it unchanged —
 * the guard is the point, and a second implementation of it for three strings
 * would be a second chance to get it wrong.
 */
export const TEXTING_MISSION: Mission = {
  key: 'opening',
  target: 'Read the room',
  objective: 'Keep her in the conversation without carrying it for her.',
  doneWhen: 'She asks something back.',
  inRep: 'Give her something to answer.',
  cues: [...TEXTING_CUES],
}

/**
 * Which cue is being pointed at now.
 *
 * Driven by HIS message count, never the total. A character who answers twice
 * must not advance somebody's cue for them — the same rule the guided rail
 * learned the hard way on 6 September, when advancing on his turns alone told
 * him to follow an answer that never arrived.
 *
 *   0-1 of his messages   he has barely started; the first cue is about
 *                         arriving with something rather than with "hey"
 *   2-3                   she has given him something. The middle cue is about
 *                         not turning it into an interview
 *   4+                    the conversation exists, and the only thing left to
 *                         learn is how to tell whether she is still in it
 */
export function activeCueIndex(userMessages: number, cueCount = TEXTING_CUES.length): number {
  if (cueCount <= 0) return 0
  const step = userMessages <= 1 ? 0 : userMessages <= 3 ? 1 : 2
  return Math.min(step, cueCount - 1)
}

export interface Cue {
  text: string
  /** The one being pointed at now. Exactly one is ever true. */
  active: boolean
  /** Already passed. Shown, but quietly. */
  done: boolean
}

export function textingCueRail(userMessages: number): Cue[] {
  const active = activeCueIndex(userMessages)
  return TEXTING_CUES.map((text, index) => ({
    text,
    active: index === active,
    done: index < active,
  }))
}

/**
 * Whether the rail is drawn at all.
 *
 * Not before the first message is sent — that is the authorship rule above —
 * and not after she has gone, because a direction about a conversation that
 * cannot be continued is advice about a thing that cannot be done.
 */
export function railVisible(started: boolean, ended: boolean): boolean {
  return started && !ended
}

/** Runs at module load in the test, so a bad cue cannot ship. */
export function assertTextingCues(): void {
  assertNoScript(TEXTING_MISSION)
}
