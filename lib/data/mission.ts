/**
 * The training mission — one objective, carried across the whole loop.
 *
 * ── THE PROBLEM IT IS FOR ────────────────────────────────────────────────
 *
 * `docs/site-audit-openai.md`: the product "feels like a performance dashboard
 * without a coach… The user sees characters, scores, charts, and lessons, but
 * nobody ties them into a personal journey." That is a fair reading of what was
 * built. The scorecard names your two weakest sub-scores and links technique
 * cards, and then Train, the brief and the next rep say nothing about them. The
 * recommendation and the next attempt were never introduced to each other.
 *
 * A mission is that introduction, and it is deliberately **one**. Two
 * objectives is a to-do list, and somebody about to talk to a stranger for
 * three minutes can hold exactly one thing in their head.
 *
 * It appears in four places and says the same thing in each:
 *
 *   scorecard    "next rep: …", set from the rep just graded
 *   Train        the standing objective, above the day's character
 *   brief        restated in the last screen before the microphone opens
 *   live         one line, and §05 explicitly allows it — rule 6 permits
 *                "timer, waveform, mission" and nothing else
 *
 * ── IT IS DERIVED, NOT STORED ────────────────────────────────────────────
 *
 * `Scorecard.focus` is already "the two weakest, surfaced as the focus for the
 * next rep", and `useLatestFocus` already reads it. The mission is
 * `focus[0]` plus authored copy, so there is no new column, no migration, and
 * no way for the mission to disagree with the scorecard that produced it. It
 * changes when your weakest dimension changes, which is exactly when it should.
 *
 * ── THE RULE THAT MAKES IT SAFE ──────────────────────────────────────────
 *
 * **A mission may never contain a line to say.** The landing page's second
 * boundary is "not a reply generator — we never write your lines", and a
 * mission is the one surface in the product positioned to break that, because
 * it is the thing you read immediately before speaking. `assertNoScript` below
 * refuses rather than sanitises, the same way `assertPublishable` does for
 * share cards and `lib/grade/memory.ts` does for a character's memory line —
 * and for the same reason: the failure mode is the product quietly becoming
 * the thing it argues against.
 */

import type { SubScores } from '@/lib/grade/types'

export type MissionKey = keyof SubScores

export interface Mission {
  key: MissionKey
  /** The sub-score this mission moves, in the scorecard's own words. */
  target: string
  /**
   * The objective. Imperative, second person, one action.
   *
   * Never a sentence the user could say out loud — see `assertNoScript`.
   */
  objective: string
  /**
   * What counts as done, and never an outcome (§07).
   *
   * Every one of these is countable by the person doing it, because "did I do
   * the thing" has to be answerable in the moment without a score.
   */
  doneWhen: string
  /** The live-rep line. Short enough to read at a glance mid-conversation. */
  inRep: string
  /**
   * Attention cues for text mode.
   *
   * Directions to look somewhere, never words to send. "Notice the room" is a
   * cue; "Ask her about the book" is nearly one; anything in quotes is a
   * script and is refused.
   */
  cues: readonly string[]
}

export const MISSIONS: Record<MissionKey, Mission> = {
  opening: {
    key: 'opening',
    target: 'Opening',
    objective: 'Say the first thing within ten seconds, before you have a good version of it.',
    doneWhen: 'You spoke first and you did it early. Whether it landed is not the test.',
    inRep: 'Open early. Rough is fine.',
    // "Use what is in front of you" was seven words and `assertNoScript`
    // refused it. The bound is the point — a cue that runs to a sentence is a
    // sentence somebody can read out.
    cues: ['Say it before it is ready', 'Start with what is here', 'Shorter than you think'],
  },
  curiosity: {
    key: 'curiosity',
    target: 'Curiosity',
    objective: 'Ask one open follow-up, then go a second layer down on the same answer.',
    doneWhen: 'You followed one of her answers twice instead of changing the subject.',
    inRep: 'Follow one answer twice.',
    cues: ['Go deeper, not wider', 'Ask about the part she chose', 'Resist the new topic'],
  },
  listening: {
    key: 'listening',
    target: 'Listening',
    objective: 'Use one detail she gave you in your next turn, out loud, so she hears it land.',
    doneWhen: 'Something she said reappeared in your mouth at least twice.',
    inRep: 'Say her detail back.',
    cues: ['Use what she remembered', 'Repeat the word she chose', 'Build on her last line'],
  },
  signalReading: {
    key: 'signalReading',
    target: 'Signal reading',
    objective: 'Name to yourself, once, whether she is warming or cooling — then act on that answer.',
    doneWhen: 'You changed something after reading her, in either direction.',
    inRep: 'Read her, then adjust.',
    cues: ['Notice her last two replies', 'Shorter if she is cooling', 'Let a pause sit'],
  },
  composure: {
    key: 'composure',
    target: 'Composure',
    objective: 'Let one silence run to three full seconds without filling it.',
    doneWhen: 'You sat through a pause instead of talking into it.',
    inRep: 'Let the pause sit.',
    cues: ['Notice the room', 'Slow the next line down', 'Do not fill the gap'],
  },
  close: {
    key: 'close',
    target: 'Close',
    objective: 'Leave on purpose — say a warm goodbye before the clock makes it for you.',
    doneWhen: 'You ended it yourself, warmly, whatever she said.',
    inRep: 'Leave warmly, on purpose.',
    cues: ['Offer an opinion before you go', 'Say the warm thing', 'Leave it clean'],
  },
}

/**
 * The default when nobody has been graded yet.
 *
 * Opening, because the first rep's only real failure is not speaking, and
 * because a first mission that mentions signal reading is asking somebody to
 * do the fifth thing before the first.
 */
export const FIRST_MISSION: Mission = MISSIONS.opening

const MISSION_KEYS = Object.keys(MISSIONS) as MissionKey[]

export function isMissionKey(value: unknown): value is MissionKey {
  return typeof value === 'string' && (MISSION_KEYS as string[]).includes(value)
}

/**
 * The standing mission, from the weakest sub-score of the last graded rep.
 *
 * `focus` arrives weakest-first. An empty list — no graded rep yet, or a grade
 * that failed — is the ordinary first answer, not an error.
 */
export function missionFor(focus: readonly string[] | null | undefined): Mission {
  const first = focus?.find(isMissionKey)
  return first ? MISSIONS[first] : FIRST_MISSION
}

/**
 * Refuse a mission that hands the user a line.
 *
 * Three tests, and each one is a way the boundary has actually been crossed by
 * products in this category:
 *
 *   quotation      anything in quotes reads as "say this"
 *   first person   "I noticed you were reading…" is a script wearing a hint's
 *                  clothes, and it is the exact failure the landing page's
 *                  "we never write your lines" is about
 *   length         a cue long enough to be a sentence is long enough to be
 *                  read out
 *
 * Throws rather than trimming. A sanitised script is still a script that
 * somebody wrote and nobody caught.
 */
export function assertNoScript(mission: Mission): void {
  const lines: [string, string][] = [
    ['objective', mission.objective],
    ['doneWhen', mission.doneWhen],
    ['inRep', mission.inRep],
    ...mission.cues.map((cue, index) => [`cues[${index}]`, cue] as [string, string]),
  ]
  for (const [field, text] of lines) {
    if (/["“”']/.test(text)) {
      throw new Error(`mission ${mission.key}.${field} contains a quotation — a mission never hands over a line.`)
    }
    if (/\b(I|I'm|I’m|my|me)\b/.test(text)) {
      throw new Error(`mission ${mission.key}.${field} is in the first person, which makes it a line to say rather than a direction.`)
    }
  }
  for (const [index, cue] of mission.cues.entries()) {
    if (cue.split(/\s+/).length > 6) {
      throw new Error(`mission ${mission.key}.cues[${index}] is long enough to be read out loud. A cue points; it does not speak.`)
    }
  }
}
