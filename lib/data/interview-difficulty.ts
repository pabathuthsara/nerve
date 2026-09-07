/**
 * How hard the questions are (INTERVIEW-TECHNICAL-PLAN §5).
 *
 * ── IT IS A SECOND AXIS, NOT A RENAME OF THE FIRST ───────────────────────
 *
 * There are two dials on this track and conflating them is how it gets
 * confusing:
 *
 *   **Interviewer** (Dan → Aisha → Marcus → Elena) moves her TEMPERAMENT — how
 *   warm, how patient, how hard to please. It lives in `lib/personas/interview/`
 *   and `lib/warmth/interview/trajectory.ts` and it is already built.
 *
 *   **Difficulty** (1-5) moves how hard the QUESTIONS are. Nothing about her
 *   mood. It lives here.
 *
 * They are genuinely orthogonal and both directions are real: a warm
 * interviewer can ask brutal questions, and a cold one can ask easy ones.
 * Keeping them apart is what lets a nervous candidate practise hard questions
 * with a friendly interviewer, which is a legitimate and probably common thing
 * to want.
 *
 * ── AND THIS FILE GETS NO WARMTH OPINION (§5.3) ──────────────────────────
 *
 * The same separation `lib/warmth/reciprocity.ts` had to learn the hard way.
 * That file was given a warmth opinion of its own — every gate hung on ENGAGED,
 * twenty points above the band table it was gating — and it won every argument
 * silently for a day. So: **`interviewTrajectory` is not imported here and must
 * not be.** Difficulty does not touch warmth, gain, decay, patience or the band
 * table. A hard question asked by Dan is still asked warmly, and he is still
 * pleased by a good answer at exactly the same rate.
 *
 * ── DERIVED, THEN OVERRIDABLE ────────────────────────────────────────────
 *
 * The default comes off the role title, because "Senior Backend Engineer"
 * already says what it wants and asking somebody to pick a number they have no
 * calibration for is a setup step they will get wrong. Deriving it is a
 * CONVENIENCE and never a lock: a candidate who wants to be beaten up sets it
 * to 5 regardless of what their title says.
 */

/** Five levels, authored against seniority. Never zero, never six. */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5

export interface DifficultySpec {
  level: DifficultyLevel
  /** The word the picker shows. Seniority, because that is the vocabulary. */
  label: string
  /** What this level tests, in one noun phrase. */
  tests: string
  /**
   * The one line the interviewer is given about how hard to pitch a probe.
   *
   * A description of the KIND of question, never a question. Rule 10 survives
   * this feature because the domain is authored and the wording is hers
   * (§6.1), and that holds at every level of this table too.
   */
  directive: string
  /**
   * One worked example, for the SETUP SCREEN and for nowhere else.
   *
   * It is never sent to a model. A candidate choosing a number needs to know
   * what the number buys, and five abstract nouns do not tell them; the
   * interviewer needs the directive above and must not be handed a question to
   * read out. `interview-difficulty.test.ts` asserts the split.
   */
  example: string
}

export const DIFFICULTY_LEVELS: readonly DifficultySpec[] = [
  {
    level: 1,
    label: 'Intern',
    tests: 'Definitions',
    directive:
      'Pitch probes at somebody who has just learned this. Ask what a thing IS and what it does'
      + ' for them. Accept a plain definition as a complete answer.',
    example: 'What is an API? What does it do for you?',
  },
  {
    level: 2,
    label: 'Junior',
    tests: 'Usage',
    directive:
      'Pitch probes at somebody who has used this but not designed with it. Ask how they would DO'
      + ' the ordinary thing, end to end, in the order it happens.',
    example: 'How do you authenticate a request to your API?',
  },
  {
    level: 3,
    label: 'Mid',
    tests: 'Trade-offs',
    directive:
      'Pitch probes at somebody who has made choices and lived with them. Ask why this and not the'
      + ' obvious alternative, and what it costs them.',
    example: 'Why a token rather than a session cookie? What does that cost you?',
  },
  {
    level: 4,
    label: 'Senior',
    tests: 'Failure modes',
    directive:
      'Pitch probes at somebody who has been on call. Break the happy path in the question itself'
      + ' and ask what happens next — to the system, and to the person using it.',
    example: 'The token expires mid-request. What does your client do, and what does the user see?',
  },
  {
    level: 5,
    label: 'Staff',
    tests: 'Ambiguity',
    directive:
      'Pitch probes at somebody who is expected to decide with the requirements missing. Remove a'
      + ' guarantee they are assuming and ask what they give up. Do not fill the gap for them.',
    example: 'Design auth for a service with no reliable clock. What do you give up?',
  },
]

export const DEFAULT_DIFFICULTY: DifficultyLevel = 3

export function difficultySpec(level: DifficultyLevel): DifficultySpec {
  return DIFFICULTY_LEVELS.find((spec) => spec.level === level)
    ?? DIFFICULTY_LEVELS.find((spec) => spec.level === DEFAULT_DIFFICULTY)!
}

export function isDifficultyLevel(value: unknown): value is DifficultyLevel {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

/**
 * Clamp anything into the ladder rather than refusing it.
 *
 * A stored 9 from a hand-edited row or an old client is a setup somebody
 * cannot open, and a setup somebody cannot open is a rep they cannot run.
 */
export function toDifficultyLevel(value: unknown): DifficultyLevel {
  const numeric = typeof value === 'number' ? Math.round(value) : Number.NaN
  if (!Number.isFinite(numeric)) return DEFAULT_DIFFICULTY
  return Math.min(5, Math.max(1, numeric)) as DifficultyLevel
}

/**
 * Seniority words, longest phrase first so "senior staff" reads as staff and
 * "junior engineer" does not match "senior".
 *
 * Word-boundary matched rather than substring matched, because "intern" is
 * inside "internal", "international" and "internship coordinator" — and an
 * "Internal Tools Engineer" defaulting to level 1 is exactly the kind of quiet
 * wrongness a derived default has to avoid to stay a convenience.
 */
const TITLE_RUNGS: readonly { level: DifficultyLevel; patterns: readonly RegExp[] }[] = [
  {
    level: 5,
    patterns: [/\bstaff\b/, /\bprincipal\b/, /\bdistinguished\b/, /\bfellow\b/, /\barchitect\b/],
  },
  {
    level: 4,
    patterns: [/\bsenior\b/, /\bsnr\b/, /\bsr\.?\b/, /\blead\b/, /\bhead of\b/, /\bmanager\b/, /\bdirector\b/],
  },
  {
    level: 2,
    patterns: [/\bjunior\b/, /\bjnr\b/, /\bjr\.?\b/, /\bassociate\b/, /\bentry[ -]level\b/, /\bgraduate\b/, /\bgrad\b/, /\btrainee\b/, /\bapprentice\b/],
  },
  {
    level: 1,
    patterns: [/\bintern\b/, /\binternship\b/, /\bplacement\b/, /\bwork experience\b/, /\bstudent\b/],
  },
  {
    level: 3,
    patterns: [/\bmid[ -]level\b/, /\bmid\b/, /\bii\b/, /\biii\b/],
  },
]

/**
 * The level a role title implies.
 *
 * Highest rung wins on a title carrying two — "Senior Staff Engineer" is staff,
 * and reading it as senior would under-pitch every probe in the rep. Falls back
 * to mid, which is the honest answer for a title that says nothing: it is the
 * middle of the ladder, so being wrong costs two levels in either direction
 * rather than four in one.
 */
export function difficultyFromRoleTitle(roleTitle: string | null | undefined): DifficultyLevel {
  const title = (roleTitle ?? '').toLowerCase()
  if (!title.trim()) return DEFAULT_DIFFICULTY
  let found: DifficultyLevel | null = null
  for (const rung of TITLE_RUNGS) {
    if (!rung.patterns.some((pattern) => pattern.test(title))) continue
    if (found === null || rung.level > found) found = rung.level
  }
  return found ?? DEFAULT_DIFFICULTY
}

/**
 * The level this rep runs at: the stored choice, or the derived default.
 *
 * Null is the ordinary state for an account that has never touched the slider,
 * and it means "follow my title" rather than "level 3" — so a candidate who
 * edits their role title from Junior to Senior and never opens the slider gets
 * harder questions, which is what they asked for by editing the title.
 */
export function difficultyFor(input: {
  stored: number | null | undefined
  roleTitle: string | null | undefined
}): DifficultyLevel {
  if (input.stored === null || input.stored === undefined) {
    return difficultyFromRoleTitle(input.roleTitle)
  }
  return toDifficultyLevel(input.stored)
}
