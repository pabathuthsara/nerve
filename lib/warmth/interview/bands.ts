/**
 * The interview band table.
 *
 * A NEW FILE BESIDE `lib/warmth/bands.ts`, WHICH IS NOT OPENED (rule 19, §0).
 * The shared table is Tier 0: every number in it was tuned against Nadia, it is
 * most of what makes her good, and `PERSONA-AUDIT.md` already records what
 * happened the last time somebody correctly diagnosed a problem with it and
 * edited it. This is the parallel set, and the dating characters never read it.
 *
 * ── WHY THE CURVE IS DIFFERENT IN BOTH DIRECTIONS ────────────────────────
 *
 * The dating table runs 3 to 15 words, because a stranger in a shop who owes
 * you nothing answers in a sentence. An interviewer is not a stranger who owes
 * you nothing; she is a person doing a job, and the job is to **ask a
 * two-sentence question and then be quiet**. That is longer than 15 words at
 * every band, and the cold end is longer than the dating cold end rather than
 * shorter: a recruiter who is unconvinced does not answer in four words, she
 * moves briskly to the next question.
 *
 * What coldness withholds here is not syllables. It is *reaction* — she stops
 * following up, stops reacting to the content, stops offering anything about
 * the role, and starts working through her list. That is what a candidate
 * actually feels when they are losing an interviewer, and it is exactly what
 * signal-reading is supposed to teach them to notice.
 *
 * ── THE TYPICAL LEADS AND THE CEILING IS ENFORCED (PERSONA-AUDIT §12) ─────
 *
 * The same lesson, and it is not optional here either: a text model reads
 * "thirty words at most" as a specification and delivers twenty-eight. So each
 * band states a TYPICAL first and a ceiling second, and `interviewWordCapFor`
 * is what `capToBudget` actually enforces. `bands.test.ts`'s equivalent below
 * asserts the prose and the number cannot drift apart.
 *
 * ── THE VERBOSITY MEDIAN IS OURS ─────────────────────────────────────────
 *
 * `lib/metrics/stability.ts`'s `DEFAULT_VERBOSITY_MEDIAN` is derived from the
 * DATING table and is not touched. `INTERVIEW_VERBOSITY_MEDIAN` is the same
 * arithmetic over this one, and each interviewer carries it as her own
 * `verbosityMedian` — which is the per-persona escape hatch that already
 * exists, so the drift alarm needs no change to serve two tracks.
 */

import { bandFor, type DirectiveContext, type WarmthBand } from '../bands'

export interface InterviewBandSpec {
  band: WarmthBand
  /** What she is being asked to write, in words. The number she aims at. */
  typicalWords: number
  /** The ceiling, enforced in code by `capToBudget`. */
  maxWords: number
  /** Length and the question rule. Ships on EVERY turn. */
  directive: string
  /**
   * What she is invited to DO at this band, if anything.
   *
   * A standing order, rationed with the agenda and the gates — the same split
   * and for the same reason as the dating table. On a stateless arm a
   * permission at maximum recency reads as an instruction.
   */
  permission?: string
}

/**
 * Ordered low to high, on the same six band names the engine produces.
 *
 * The engine is unchanged and unforked: it still computes one number and
 * `bandFor` still selects on `min` alone. Only what each band MEANS is
 * different, which is the whole design — one engine, two judgement tables.
 */
export const INTERVIEW_BANDS: readonly InterviewBandSpec[] = [
  {
    band: 'HOSTILE',
    typicalWords: 8,
    maxWords: 16,
    directive:
      'Eight or nine words. Sixteen at the very most. You have decided. Ask the next question flatly and do not follow up on the answer.',
  },
  {
    band: 'CLOSED',
    typicalWords: 10,
    maxWords: 18,
    directive:
      'Ten or eleven words. Eighteen at the very most. Acknowledge in two words at most, then move to your next question. Do not follow up and do not react to what they said.',
  },
  {
    band: 'GUARDED',
    typicalWords: 13,
    maxWords: 22,
    directive:
      'One or two sentences, thirteen or fourteen words. Twenty-two at the very most. Ask, then stop. At most one follow-up, and only if the answer named something concrete.',
  },
  {
    band: 'OPEN',
    typicalWords: 16,
    maxWords: 26,
    directive:
      'One or two sentences, sixteen or seventeen words. Twenty-six at the very most. You may follow up once on what they actually said.',
    permission: 'You may pick up a detail from their answer and ask about it.',
  },
  {
    band: 'ENGAGED',
    typicalWords: 19,
    maxWords: 30,
    directive:
      'Two sentences, nineteen or twenty words. Thirty at the very most. No filler, no praise, never "great answer" or "that makes sense".',
    permission: 'You may follow the thread rather than your list, and say something short about the team.',
  },
  {
    band: 'INVESTED',
    typicalWords: 21,
    maxWords: 34,
    directive:
      'Two sentences, twenty-one or twenty-two words. Thirty-four at the very most. No filler, and never praise the answer.',
    permission: 'You may say what the role actually needs, and test them against it.',
  },
]

export const INTERVIEW_MAX_BAND_WORDS: number = INTERVIEW_BANDS.reduce(
  (widest, spec) => Math.max(widest, spec.maxWords),
  0,
)

/**
 * The drift alarm's threshold for this arm.
 *
 * The same arithmetic `DEFAULT_VERBOSITY_MEDIAN` uses over the dating table —
 * the widest band plus a margin — computed over this one instead. Set on every
 * interviewer as `verbosityMedian`, so `lib/metrics/stability.ts` serves both
 * tracks without being edited.
 */
export const INTERVIEW_VERBOSITY_MARGIN_WORDS = 6
export const INTERVIEW_VERBOSITY_MEDIAN =
  INTERVIEW_MAX_BAND_WORDS + INTERVIEW_VERBOSITY_MARGIN_WORDS

export function interviewSpecFor(band: WarmthBand): InterviewBandSpec {
  const found = INTERVIEW_BANDS.find((spec) => spec.band === band)
  if (!found) throw new Error(`No interview spec for band ${band}`)
  return found
}

/**
 * The ceiling this impression allows, in words.
 *
 * Handed to the turn pipeline exactly as `wordCapFor` is, and enforced by the
 * same `capToBudget`. The transport is inherited unchanged (§0); what it is
 * handed is what differs.
 */
export function interviewWordCapFor(
  impression: number,
  turnKind: InterviewTurnKind = 'reply',
): number {
  if (turnKind === 'brief') return INTERVIEW_BRIEF_WORD_CAP
  return interviewSpecFor(bandFor(impression)).maxWords
}

/* ------------------------------------------------------------------ *
 * The one turn that is not a reply
 * ------------------------------------------------------------------ */

/**
 * WHAT KIND OF TURN THE CEILING IS FOR (INTERVIEW-TECHNICAL-PLAN §6.7).
 *
 * Every band above tops out at thirty-four words, because an interviewer asks a
 * two-sentence question and then is quiet. A **system design brief is forty to
 * seventy words** — it is the problem itself, not a question about an answer —
 * and a brief truncated at thirty-four is a round with no question in it.
 *
 * So the ceiling takes a turn kind, and everything that is not the brief gets
 * the band's number exactly as before. `'reply'` is the default at every call
 * site, which is what keeps this from being a loosening: a caller that says
 * nothing gets the table.
 */
export type InterviewTurnKind = 'reply' | 'brief'

/**
 * The ceiling for the turn that poses the problem.
 *
 * Ninety, against authored statements that run fifty-five to sixty-five words.
 * The headroom is for the sentence she puts in front of it — she is a person
 * starting a conversation, not a form field — and `capToBudget` keeps whole
 * sentences, so a tight ceiling would cut the last one of the brief rather than
 * trim it.
 *
 * Rule 4 applies here as much as anywhere: this is a runtime ceiling and it is
 * what customers hear. It is not a licence for a long turn — it is reachable on
 * exactly one turn of one round, and `INTERVIEW_VERBOSITY_MEDIAN` deliberately
 * does NOT move with it, because a drift alarm sized for the brief turn would
 * stop noticing a character who had started giving speeches.
 */
export const INTERVIEW_BRIEF_WORD_CAP = 90

/**
 * What she is told on the turn she poses the problem.
 *
 * It REPLACES the band's length rule rather than joining it. Two length rules
 * in one directive is round 6 exactly — the numbers fight and the model obeys
 * neither — and the band's "twenty-one or twenty-two words" would win, because
 * it is the specific number.
 */
export const INTERVIEW_BRIEF_DIRECTIVE =
  'This turn is the problem itself. Say it close to as it is written for you — sixty or seventy'
  + ' words is right, and the usual short-answer rule does not apply to this one turn. Do not'
  + ' summarise it, do not add requirements to it, and do not ask anything after it. Then stop and'
  + ' let them start.'

/** Bands whose directive does not already forbid a follow-up. */
const BANDS_ALLOWING_FOLLOW_UPS = new Set<WarmthBand>(['GUARDED', 'OPEN', 'ENGAGED', 'INVESTED'])

export function interviewBandDirectiveParts(
  impression: number,
  context: DirectiveContext = {},
): string[] {
  const band = bandFor(impression)
  const parts = [interviewSpecFor(band).directive]
  // ONE OWNER FOR THE QUESTION RULE, same as the dating arm. The cold bands
  // already say it in their own words; saying it twice reads as emphasis on
  // the wrong thing.
  if (context.suppressQuestion && BANDS_ALLOWING_FOLLOW_UPS.has(band)) {
    parts.push('Do not follow up this turn. Move to the next question.')
  }
  return parts
}

export function interviewBandPermissionParts(
  impression: number,
  context: DirectiveContext = {},
): string[] {
  if (context.includeStanding === false) return []
  const permission = interviewSpecFor(bandFor(impression)).permission
  return permission ? [permission] : []
}

/** The whole band, invitation included. For the engine's read-out and tests. */
export function interviewBandDirective(
  impression: number,
  context: DirectiveContext = {},
): string {
  return `[${[
    ...interviewBandDirectiveParts(impression, context),
    ...interviewBandPermissionParts(impression, context),
  ].join(' ')}]`
}

/**
 * The label a candidate sees, which is not the engine's word for it.
 *
 * `rep-screens.tsx` already carried this relabel inline. It lives here now so
 * the table and its names are one file, and so that a sixth band cannot appear
 * with no word for it.
 */
export const INTERVIEW_BAND_LABEL: Record<WarmthBand, string> = {
  HOSTILE: 'SKEPTICAL',
  CLOSED: 'SKEPTICAL',
  GUARDED: 'NEUTRAL',
  OPEN: 'INTERESTED',
  ENGAGED: 'IMPRESSED',
  INVESTED: 'CONVINCED',
}
