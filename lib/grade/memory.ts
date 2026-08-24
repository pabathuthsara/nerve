/**
 * The memory filter (§08).
 *
 * A character who remembers the blue book is continuity. A character who is
 * pleased to see you is a companion app — which §01 rules out and §14 says
 * gets our payment account declined by every merchant of record on the
 * shortlist. That is not a style note, so it is not enforced with one: the
 * model is asked for a line and then the line is checked here, and anything
 * that fails is dropped.
 *
 * **Dropping is the safe failure and the filter is biased hard towards it.** A
 * false positive costs one memory — she simply does not bring anything up,
 * which is what happens most of the time between strangers anyway. A false
 * negative puts affection in a character's mouth and moves the product into a
 * category that cannot be sold. Those are not comparable, so the reject lists
 * are deliberately broader than strictly necessary.
 *
 * The rule in one line: **the memory is about her and about the encounter, and
 * it never addresses him, judges him, or wants anything from him.**
 */

/** Why a line was dropped. Named so a test can assert the reason, not just the outcome. */
export type MemoryRejection =
  | 'empty'
  | 'not-a-line'
  | 'too-long'
  | 'too-short'
  | 'too-many-sentences'
  | 'second-person'
  | 'affection'
  | 'performance'

export type MemoryVerdict =
  | { ok: true; line: string }
  | { ok: false; reason: MemoryRejection }

/**
 * The hard cap, from the plan.
 *
 * Long enough for "Still looking for the blue one. Sister's birthday is
 * Thursday.", short enough that it cannot become a paragraph about him.
 */
export const MAX_MEMORY_WORDS = 14

/**
 * Two, not one.
 *
 * The plan's rule reads "one sentence" and the plan's own example of a good
 * line is two — "Still looking for the blue one. Sister's birthday is
 * Thursday." The example is the more specific statement of intent and the word
 * cap already does the real work of keeping this short, so two it is.
 */
export const MAX_MEMORY_SENTENCES = 2

/** Below this it is a fragment, not something she would have in mind. */
const MIN_MEMORY_WORDS = 3

/** A model declining to answer, in the various ways models decline to answer. */
const NOTHING_TO_SAY = /^(none|n\/?a|null|nil|nothing|no memory|unknown|-+|\.+)$/i

/** Anything that is not a spoken sentence: markup, stage directions, lists. */
const NOT_PROSE = /[\n\r*_#`\[\]{}<>|]|^\s*[-•]\s/

/**
 * Second person, in any form.
 *
 * The bluntest rule here and the most valuable one: a memory that addresses him
 * is a memory about him. `\b` sits between the `u` and the apostrophe, so this
 * catches "you'd", "you're" and "you've" without listing them.
 *
 * It is what rejects "You were doing well until you asked about work."
 */
const SECOND_PERSON = /\byou\b|\byour\b|\byours\b|\byourself\b/i

/**
 * Affection, and its quieter cousin, anticipation.
 *
 * Wanting to see him again is the single thing this filter exists to stop, and
 * it hides in mild words — "hoping", "next time", "again soon" — far more often
 * than in obvious ones. It is what rejects "I've been hoping you'd come back."
 */
const AFFECTION = new RegExp(
  [
    /\bhop(e|ed|es|ing)\b/,
    /\bmiss(ed|es|ing)?\b/,
    /\b(glad|pleased|delighted|thrilled|excited|eager|keen)\b/,
    /\b(lovely|fond|sweet|charming|charmed|cute|handsome|attractive|gorgeous)\b/,
    /\bflirt\w*\b/,
    /\benjoy(ed|s|ing)?\b/,
    /\blook(ing|ed)?\s+forward\b/,
    /\bcan'?t\s+wait\b/,
    /\b(again\s+soon|next\s+time|come\s+back|see\s+him\s+again)\b/,
  ].map((pattern) => pattern.source).join('|'),
  'i',
)

/**
 * Judgement about how he played.
 *
 * §07's rule that outcome is never scored has a counterpart here: the memory is
 * not a second scorecard delivered in her voice. She may remember what happened;
 * she may not remember how he did.
 */
const PERFORMANCE = new RegExp(
  [
    /\b(did|do|does|doing)\s+(well|badly|fine|great|ok|okay|better|worse)\b/,
    /\bimpress\w*\b/,
    /\b(nervous\w*|awkward\w*|confiden\w*|composed|composure)\b/,
    /\b(brave|shy|stammer\w*|fumbl\w*|rambl\w*|hesitan\w*|struggl\w*)\b/,
    /\b(handled|performance|graded?|score[ds]?|rating)\b/,
  ].map((pattern) => pattern.source).join('|'),
  'i',
)

/** Wrapping quotes a model adds around a line it was asked to return bare. */
function unquote(value: string): string {
  return value.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
}

function wordCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).length
}

/** Terminal punctuation followed by a space or the end. An apostrophe is not one. */
function sentenceCount(line: string): number {
  return (line.match(/[.!?]+(?=\s|$)/g) ?? []).length || 1
}

/**
 * Check a candidate line.
 *
 * Order matters only for which reason is reported, not for whether a line
 * passes — a line has to clear every rule.
 */
export function checkMemoryLine(raw: unknown): MemoryVerdict {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' }

  const line = unquote(raw.trim()).replace(/\s+/g, ' ')
  if (!line) return { ok: false, reason: 'empty' }
  if (NOTHING_TO_SAY.test(line)) return { ok: false, reason: 'empty' }
  if (NOT_PROSE.test(raw)) return { ok: false, reason: 'not-a-line' }

  const words = wordCount(line)
  if (words > MAX_MEMORY_WORDS) return { ok: false, reason: 'too-long' }
  if (words < MIN_MEMORY_WORDS) return { ok: false, reason: 'too-short' }
  if (sentenceCount(line) > MAX_MEMORY_SENTENCES) {
    return { ok: false, reason: 'too-many-sentences' }
  }

  if (SECOND_PERSON.test(line)) return { ok: false, reason: 'second-person' }
  if (AFFECTION.test(line)) return { ok: false, reason: 'affection' }
  if (PERFORMANCE.test(line)) return { ok: false, reason: 'performance' }

  return { ok: true, line }
}

/** The filter, for callers that do not care why. Null means she says nothing. */
export function memoryLineFrom(raw: unknown): string | null {
  const verdict = checkMemoryLine(raw)
  return verdict.ok ? verdict.line : null
}
