/**
 * Rejection milestones (§09).
 *
 * "Rejections collected is the headline counter, not successes." Milestones at
 * 10, 25, 50 and 100, each with hand-written copy — four moments in the
 * product, so four pieces of writing rather than one template with a number
 * substituted into it (§02 rule 12).
 *
 * The tone is the whole point. These celebrate having been turned down, and
 * they have to do it without irony and without congratulating anybody on
 * failure — the user has not failed, they have collected the thing they came
 * for. Nothing here promises an outcome, diagnoses anything, or uses a word a
 * clinician would recognise (§16).
 */

export interface Milestone {
  /** Rejections needed. Also the stable id: `rejections:10`. */
  at: number
  title: string
  body: string
  /** The line under it. Short, and never a promise about what happens next. */
  note: string
}

export const REJECTION_MILESTONES: readonly Milestone[] = [
  {
    at: 10,
    title: 'Ten no',
    body: 'Ten times you asked for something and did not get it. Nothing happened. '
      + 'No one told anyone. You went home and had dinner.',
    note: 'That is the entire lesson. The rest is repetition.',
  },
  {
    at: 25,
    title: 'Twenty-five no',
    body: 'Twenty-five is past the point where you can call any of them a fluke. '
      + 'You have a habit now, and the habit is asking.',
    note: 'Look at what you predicted for the first few. Then at what they cost.',
  },
  {
    at: 50,
    title: 'Fifty no',
    body: 'Fifty refusals is more than most people collect in a decade, because '
      + 'most people arrange their lives so they never have to hear one.',
    note: 'You went and got them on purpose. That is the difference.',
  },
  {
    at: 100,
    title: 'One hundred no',
    body: 'A hundred. At this point being turned down is a thing that happens on a '
      + 'Tuesday, not a thing that happens to you.',
    note: 'Nothing left to prove here. Go and ask for something that matters.',
  },
] as const

/** `rejections:25` — the `unlocks.ref` for a milestone. */
export function milestoneRef(at: number): string {
  return `rejections:${at}`
}

export function milestoneFor(ref: string): Milestone | null {
  return REJECTION_MILESTONES.find((milestone) => milestoneRef(milestone.at) === ref) ?? null
}

/**
 * Every milestone crossed by going from `before` to `after`.
 *
 * A list rather than one, because a backfill or a repaired count can cross two
 * at once and silently swallowing the first would lose a moment the user
 * earned. In the ordinary case — one ask at a time — it holds exactly one.
 */
export function milestonesCrossed(before: number, after: number): Milestone[] {
  return REJECTION_MILESTONES.filter((milestone) => before < milestone.at && after >= milestone.at)
}
