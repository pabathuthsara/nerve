/**
 * What a moderation result means for a rep (§16.3, §16.8).
 *
 * The classifier is somebody else's. This file is the part that is ours: the
 * mapping from a provider's category flags onto the four things this product
 * is willing to do about them, and the reason each mapping is what it is. It
 * is pure so that the mapping can be argued with in a test rather than in
 * production — a moderation layer nobody can reason about is worse than none,
 * because it will end reps and nobody will know why.
 *
 * THE VERDICTS, AND WHY THERE ARE FOUR.
 *
 *   ok        nothing happened; the overwhelming majority of turns
 *   boundary  the rep went somewhere PG-13 does not go. Recoverable: she
 *             declines in frame, and the rep continues (§16.3)
 *   stop      not recoverable and never negotiated. One category only
 *   distress  this stopped being an exercise (§16.8)
 *
 * `stop` exists as its own verdict rather than as a boundary strike because
 * there is exactly one thing that must never receive an in-frame decline, a
 * second chance, or a character's answer of any kind — and a state machine
 * that could ever reach "she declines" on that input is a state machine with a
 * bug waiting in it. It is separated here, at the classification, so the
 * escalation rules downstream cannot be the thing that gets it wrong.
 *
 * SPEAKER MATTERS, and this is the subtle half. Distress is a fact about the
 * person, not about a string: the same words from the character are a
 * character break, not a person in trouble. Sending her own line through the
 * distress path would drop the training frame and offer a helpline to a user
 * whose only mistake was talking to a model that wandered. So her stream is
 * classified on a different table, where everything is a boundary on her.
 */

/** The four things a turn can be. See the header. */
export type SafetyVerdict = 'ok' | 'boundary' | 'stop' | 'distress'

/** Whose turn was classified. The same words mean different things (§16.8). */
export type SafetySpeaker = 'user' | 'agent'

/**
 * The shape of a moderation response, reduced to what we read.
 *
 * Deliberately not the provider's type. Category names are the provider's
 * vocabulary and this is the one file allowed to know them; everything
 * downstream sees a `SafetyVerdict` and nothing else, the same way nothing
 * outside `lib/voice/` knows what a Realtime session is (§04).
 */
export interface ModerationResult {
  flagged: boolean
  categories: Record<string, boolean | undefined>
  scores: Record<string, number | undefined>
}

/**
 * The one category that ends a rep on sight.
 *
 * Not a judgement call and not a strike. Every merchant of record on §14's
 * list treats this as the difference between an account and no account, and
 * the product's answer to it has to be the same every time.
 */
const STOP_CATEGORIES = ['sexual/minors'] as const

/** The person is in trouble. Only ever read on the user's stream. */
const DISTRESS_CATEGORIES = [
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
] as const

/**
 * PG-13, in the provider's words (§16.3, §16.11).
 *
 * Threats and hate are in here beside sexual content, which is wider than
 * "PG-13" sounds. That is on purpose: the rule the payment account actually
 * lives under is that nothing ugly happens in our product, and a user
 * threatening a character is the same class of thing as a user undressing one.
 */
const BOUNDARY_CATEGORIES = [
  'sexual',
  'harassment',
  'harassment/threatening',
  'hate',
  'hate/threatening',
  'violence',
  'violence/graphic',
  'illicit',
  'illicit/violent',
] as const

/**
 * How sure the classifier has to be before a rep is interrupted.
 *
 * The provider's own `flagged` boolean is tuned for a content platform that
 * would rather over-block than host something. A three-minute conversation
 * about flirting is not that: a false positive here costs somebody their one
 * rep of the day and tells them they did something wrong when they did not.
 * So `flagged` opens the question and a score decides it, and the floors below
 * are deliberately above the provider's.
 *
 * The two that are not raised are the two where a miss is worse than a false
 * positive, and the asymmetry is the whole point of having separate numbers.
 */
export const THRESHOLDS = {
  /** Ends a rep with no second chance. Low on purpose: a miss is unthinkable. */
  stop: 0.2,
  /** Ends the exercise and offers help. A wrong guess here costs an apology. */
  distress: 0.35,
  /** Costs a strike, so it is the one that has to be right. */
  boundary: 0.6,
} as const

function hit(result: ModerationResult, categories: readonly string[], floor: number): boolean {
  return categories.some((name) => {
    if (!result.categories[name]) return false
    const score = result.scores[name]
    // A flag with no score is still a flag. The scores are an extra signal the
    // provider happens to publish, not a thing we are entitled to require.
    return score === undefined || score >= floor
  })
}

/**
 * The mapping. Precedence is the argument here, not the categories.
 *
 * `stop` before `distress` before `boundary`, and the first of those is the
 * one worth stating out loud: a turn that trips both the unrecoverable
 * category and a distress category still ends the rep. We do not soften that
 * input for anybody, and the resource sheet is not a route around it.
 */
export function classifyModeration(
  result: ModerationResult,
  speaker: SafetySpeaker,
): SafetyVerdict {
  if (!result.flagged) return 'ok'

  if (hit(result, STOP_CATEGORIES, THRESHOLDS.stop)) return 'stop'

  // Her stream never produces distress, only a character who has wandered.
  // See the header: a helpline offered because a model said something bleak
  // would be the product diagnosing a user for the model's mistake.
  if (speaker === 'user' && hit(result, DISTRESS_CATEGORIES, THRESHOLDS.distress)) {
    return 'distress'
  }

  // Her stream carries one extra set. A character who says something bleak
  // about herself has broken character, not confided in us, and the answer to
  // it is the same silent correction any other drift gets — not a helpline
  // offered to the person she was talking to.
  const boundaries = speaker === 'agent'
    ? [...BOUNDARY_CATEGORIES, ...DISTRESS_CATEGORIES]
    : BOUNDARY_CATEGORIES

  if (hit(result, boundaries, THRESHOLDS.boundary)) return 'boundary'

  // Flagged, but under every floor we set. Recorded upstream as a `moderation`
  // event and otherwise ignored — this is the case the raised thresholds exist
  // to create, and losing it silently would hide how often they are doing work.
  return 'ok'
}

/**
 * Which category names actually drove the verdict.
 *
 * Written to `safety_events.detail` so an event can be read back and argued
 * with. Never the text of the turn — see the migration's note on that.
 */
export function firedCategories(result: ModerationResult): string[] {
  return Object.entries(result.categories)
    .filter(([, on]) => on === true)
    .map(([name]) => name)
    .sort()
}
