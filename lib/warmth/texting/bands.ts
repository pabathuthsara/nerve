/**
 * The texting band table.
 *
 * A NEW FILE BESIDE `lib/warmth/bands.ts`, WHICH IS NOT OPENED (rule 19,
 * `TEXTING-PLAN.md` §0). The shared table is Tier 0: every number in it was
 * tuned against Nadia, it is most of what makes her good, and
 * `PERSONA-AUDIT.md` records what happened the last time somebody correctly
 * diagnosed a problem with it and edited it anyway. This is the parallel set,
 * and no dating character ever reads it.
 *
 * ── WHY THE CURVE IS DIFFERENT AT BOTH ENDS ──────────────────────────────
 *
 * The dating table runs 3 to 15 words because a stranger answers out loud, in
 * a sentence, while standing in front of you. Typed messages are not that
 * shape at either end:
 *
 *   the cold end is SHORTER. "ok" is a complete, ordinary, devastating text
 *   message. Speech has no equivalent — a spoken "ok" still carries a tone, a
 *   pause and a face, and the dating table's four-word floor exists because a
 *   one-word spoken turn reads as a broken character. In text it reads as a
 *   person who is not that interested, which is exactly the signal this
 *   section is built to teach.
 *
 *   the warm end is LONGER. Somebody enjoying a conversation types two or
 *   three lines at once and sends them as one message. A fifteen-word ceiling
 *   at INVESTED would make her permanently clipped at the one band where being
 *   clipped is wrong.
 *
 * ── WHAT COLDNESS WITHHOLDS HERE ─────────────────────────────────────────
 *
 * Not only words. The dating table's header makes the point that coldness is
 * badly expressed as syllables, and texting has three channels speech does not:
 *
 *   1. **Punctuation.** A full stop on a short reply is cold, and everybody who
 *      has ever been texted knows it. "ok" is neutral; "ok." is a verdict. The
 *      cold bands ask for the full stop and the warm bands forbid it, which is
 *      a tone control that costs no words at all.
 *   2. **Capitalisation.** Sentence case at the cold end reads as effort
 *      withheld deliberately; lower case reads as ease.
 *   3. **How long she takes.** That is `lib/texting/presence.ts` and it is not
 *      this file's business. Stated here only so the next person does not add
 *      a timing clause to a band directive.
 *
 * ── THE TYPICAL LEADS AND THE CEILING IS ENFORCED (PERSONA-AUDIT §12) ────
 *
 * The same lesson as both other tables, and it is not optional here: a text
 * model reads "eight words at most" as a specification and delivers seven. So
 * each band states a TYPICAL first and a ceiling second, and `textingWordCapFor`
 * is what `capToBudget` actually enforces. `bands.test.ts` asserts the prose and
 * the number cannot drift apart.
 *
 * ── AND NO BAND HERE EVER MENTIONS LEAVING ───────────────────────────────
 *
 * The dating table carries "You are not going yet" at 20-59, and
 * `lib/warmth/leaving.ts` is the write-up of what that cost: on the turn after
 * "just fuck off" the most recent instruction she had was that she was staying,
 * so she stayed, three times. Going is a STATE here (`lib/texting/exit.ts`) and
 * never a band's opinion, so no directive below refers to it in either
 * direction.
 */

import { bandFor, type DirectiveContext, type WarmthBand } from '../bands'

export interface TextingBandSpec {
  band: WarmthBand
  /** What she is being asked to write, in words. The number she aims at. */
  typicalWords: number
  /** The ceiling, enforced in code by `capToBudget`. */
  maxWords: number
  /** The most sentences this band allows, enforced by the same call. */
  maxSentences: number
  /**
   * Length, register and the question rule. Ships on EVERY turn, because
   * nothing else owns reply length and every request here is stateless.
   */
  directive: string
  /**
   * What she is invited to DO at this band, if anything.
   *
   * A standing order, rationed by `includeStanding` — the same split and the
   * same reason as both other tables. On a stateless arm a permission restated
   * before every generation stops reading as "you may" and starts reading as
   * "do this now", and they compose: one real dating line carried four at once.
   */
  permission?: string
}

/**
 * Ordered low to high. Selection is `bandFor` from the shared file, which
 * scans on `min` alone over half-open intervals — READ, never edited.
 *
 * The band boundaries are deliberately the shared ones. They are the seams the
 * whole engine, the posture reading and the reciprocity gates are written
 * against, and a second set of thresholds here would mean two files disagreeing
 * about what GUARDED means.
 */
export const TEXTING_BANDS: readonly TextingBandSpec[] = [
  {
    band: 'HOSTILE',
    typicalWords: 1,
    maxWords: 4,
    maxSentences: 1,
    directive:
      'One or two words. Four at the very most. Full stop at the end. You are done with this conversation. Do not ask anything and do not soften it.',
  },
  {
    band: 'CLOSED',
    typicalWords: 2,
    maxWords: 5,
    maxSentences: 1,
    directive:
      'Two or three words. Five at the very most. Sentence case and a full stop at the end — it should read as closed. Answer and stop. Do not ask him anything, do not volunteer, do not warm it up.',
  },
  {
    band: 'GUARDED',
    typicalWords: 3,
    maxWords: 8,
    maxSentences: 1,
    directive:
      'Three or four words. Eight at the very most. A fragment, not a sentence. Answer only what he asked. Do not ask him anything back.',
  },
  {
    band: 'OPEN',
    typicalWords: 6,
    maxWords: 14,
    maxSentences: 2,
    directive:
      'Six or seven words. Fourteen at the very most. Lower case, no full stop at the end. Type it how it comes out, not tidily. Do not ask a question this turn unless he asked you one first.',
    permission: 'You may volunteer one small thing.',
  },
  {
    band: 'ENGAGED',
    typicalWords: 9,
    maxWords: 18,
    maxSentences: 2,
    directive:
      'Nine or ten words. Eighteen at the very most. Lower case, no full stop at the end. Type it how it comes out, not tidily. No reassurance, never "no rush" or "take your time".',
    permission: 'Ask about him, tease him, pick up something he said earlier.',
  },
  {
    band: 'INVESTED',
    typicalWords: 13,
    maxWords: 24,
    maxSentences: 3,
    directive:
      'Thirteen or fourteen words. Twenty-four at the very most. Lower case, no full stop at the end. Two short lines run together is normal here. No reassurance.',
    permission: 'Start a topic, or come back to something he said a while ago.',
  },
]

/**
 * The widest reply any texting band permits.
 *
 * The texting equivalent of `MAX_BAND_WORDS`, and it exists for the same reason:
 * a drift alarm set below the rules the character is actually being given fires
 * continuously on a character who is behaving. Each texting persona carries this
 * plus the shared margin as her own `verbosityMedian`, which is the per-persona
 * escape hatch that already exists — so `lib/metrics/stability.ts` serves a
 * third track without being opened.
 */
export const MAX_TEXTING_BAND_WORDS: number = TEXTING_BANDS.reduce(
  (widest, spec) => Math.max(widest, spec.maxWords),
  0,
)

export function textingSpecFor(band: WarmthBand): TextingBandSpec {
  const found = TEXTING_BANDS.find((spec) => spec.band === band)
  if (!found) throw new Error(`No texting spec for band ${band}`)
  return found
}

/** Length and the question rule, unbracketed. Ships every turn. */
export function textingBandParts(
  warmth: number,
  context: DirectiveContext = {},
): string[] {
  const band = bandFor(warmth)
  const parts = [textingSpecFor(band).directive]
  // The cold bands already forbid questions outright; saying it twice reads as
  // emphasis on the wrong thing.
  if (context.suppressQuestion && TEXTING_BANDS_ALLOWING_QUESTIONS.has(band)) {
    parts.push('Do not ask him anything this turn.')
  }
  return parts
}

/** The bands whose directive does not already forbid a question. */
const TEXTING_BANDS_ALLOWING_QUESTIONS: ReadonlySet<WarmthBand> = new Set<WarmthBand>([
  'OPEN',
  'ENGAGED',
  'INVESTED',
])

/** The band's invitation, when it has one and standing orders ride this turn. */
export function textingPermissionParts(
  warmth: number,
  context: DirectiveContext = {},
): string[] {
  if (context.includeStanding === false) return []
  const permission = textingSpecFor(bandFor(warmth)).permission
  return permission ? [permission] : []
}

/** The word ceiling this warmth allows. Enforced by `capToBudget`. */
export function textingWordCapFor(warmth: number): number {
  return textingSpecFor(bandFor(warmth)).maxWords
}

/** The sentence ceiling this warmth allows. Enforced by the same call. */
export function textingSentenceCapFor(warmth: number): number {
  return textingSpecFor(bandFor(warmth)).maxSentences
}
