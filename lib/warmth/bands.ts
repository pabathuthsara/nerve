/**
 * Warmth bands and the behavioural directive each one carries.
 *
 * The band is the only thing the character is ever told. She never sees a
 * number, never sees a delta, and never learns that a meter exists.
 *
 * THE BAND OWNS HOW MUCH SHE GIVES. The persona contract owns who she is —
 * her history, her opinions, her voice, what she will not do. It must not also
 * specify reply length or question rate, because those are exactly what warmth
 * modulates. Round 6 had both: the contract fixed her at "four to ten words,
 * a question one turn in three" while the band said something different, and
 * the result was neither — 16.5 median words and a question on 83% of turns.
 * Two sets of numbers fighting produce a third answer nobody asked for.
 *
 * So directives here are blunt, short, and imperative. At low warmth they
 * forbid questions outright rather than rationing them, because "occasionally"
 * is not a thing a model reliably counts.
 *
 * ## What the cold bands are allowed to be
 *
 * They used to be a word cap and almost nothing else — CLOSED was "one to four
 * words", GUARDED "three to eight". On the lower rungs that is correct-ish; on
 * levels 5 and up the meter never leaves those bands inside three minutes, so
 * an entire rep was a stranger who could not form a sentence. "What?" does not
 * read as a distracted commuter. It reads as a broken character, and it was the
 * single loudest reason the personas did not feel human.
 *
 * The fix is not to make her warmer. It is to stop expressing coldness as
 * syllables. A cold band now withholds the things coldness actually withholds —
 * curiosity, volunteering, softening, follow-ups — while leaving her enough
 * words to sound like a person who simply is not interested. The caps still
 * climb monotonically across the ladder.
 *
 * ## A CEILING IS NOT A TARGET, AND THIS TABLE USED TO ASSUME IT WAS
 *
 * Every number here was authored against a speech-to-speech model, which ran
 * at roughly half of whatever it was allowed: measured across 51 realtime reps,
 * median agent turn 7 words, p90 11, 5% over twelve, 1% of turns three
 * sentences or more. The cap was a guardrail nobody touched, and her brevity
 * came from the medium.
 *
 * The writer on the shipping arm is a text model, and a text model reads
 * "twelve words at most" as a specification and delivers eleven. Measured
 * across the ElevenLabs reps of 5 September: median 14, p90 25, 62% over
 * twelve, 48% three sentences or more — and her FIRST line, before any
 * conversation exists to dilute anything, went from 4 words to 12. That is not
 * drift. That is the number being met exactly.
 *
 * So each band now states a TYPICAL first and a ceiling second. The typical is
 * what she is being asked to write; the ceiling is what `maxWords` enforces in
 * code (see `wordCapFor`), because a stated maximum that is only ever hoped for
 * is not a maximum. Both numbers moved down, and the ceiling is the smaller
 * change of the two — the target is what she actually obeys.
 *
 * ## PERMISSION IS NOT LENGTH, AND IT IS RATIONED SEPARATELY
 *
 * The warm bands used to carry their invitations inside the directive itself —
 * "You may volunteer one small thing", "Ask about him, tease him, swap names".
 * On a provider that retains instructions those arrive a handful of times in a
 * rep. On a stateless one they are re-issued immediately before every single
 * reply, at maximum recency, and a permission restated that often stops reading
 * as "you may" and starts reading as "do this now" — the same failure
 * PERSONA-AUDIT §11 found in the want clause and fixed for that clause alone.
 * One real line carried four of them at once.
 *
 * `permission` is therefore split out of `directive`. The directive — length
 * and the question rule — ships on every turn, because nothing else owns reply
 * length. The permission is a standing order and rides the same cadence as the
 * agenda and the gates. See `SteeringContext.includeStanding`.
 */

export type WarmthBand =
  | 'HOSTILE'
  | 'CLOSED'
  | 'GUARDED'
  | 'OPEN'
  | 'ENGAGED'
  | 'INVESTED'

export interface BandSpec {
  band: WarmthBand
  /** Inclusive lower bound. */
  min: number
  /**
   * Inclusive upper bound, for display only.
   *
   * NOT used to select a band. Warmth is a continuous value and these bounds
   * are integers, so matching on `value <= max` leaves a gap in every seam —
   * see `bandFor`.
   */
  max: number
  /**
   * Length and the question rule. Ships on EVERY turn, on every arm, because
   * nothing else owns reply length and a stateless request carries no memory
   * of the last one.
   */
  directive: string
  /**
   * What she is invited to do at this band, if anything.
   *
   * A standing order rather than a description of how to respond, so it is
   * rationed with the agenda and the gates rather than restated before every
   * reply. Absent in the cold bands, which invite nothing by definition.
   */
  permission?: string
  /**
   * What she is being asked to write, in words. The number the prose leads
   * with, because that is the one a text model actually aims at.
   */
  typicalWords: number
  /**
   * The ceiling, in words, machine-readable.
   *
   * Stated in the prose AND enforced in code (`wordCapFor`), because the whole
   * argument in this file's header is that a ceiling nobody enforces is a
   * ceiling that becomes a target. `bands.test.ts` asserts the prose and this
   * number cannot drift apart.
   */
  maxWords: number
}

/** The lowest warmth can go. Below zero she actively wants out. */
export const WARMTH_MIN = -20
export const WARMTH_MAX = 100

/**
 * Ordered low to high, as contiguous half-open intervals `[min, nextMin)`.
 *
 * The `max` values are for display. Selection uses `min` alone, because that is
 * the only formulation with no gaps — see `bandFor`.
 */
export const BANDS: readonly BandSpec[] = [
  {
    band: 'HOSTILE',
    min: -20,
    max: -1,
    typicalWords: 3,
    maxWords: 6,
    directive:
      'Three or four words. Six at the very most. You want this over. Do not ask anything, and do not soften it.',
  },
  {
    band: 'CLOSED',
    min: 0,
    max: 19,
    typicalWords: 4,
    maxWords: 8,
    directive:
      'Four or five words. Eight at the very most. Answer, then stop. Do not ask him anything, do not volunteer anything, and do not warm it up.',
  },
  {
    band: 'GUARDED',
    min: 20,
    max: 39,
    typicalWords: 6,
    maxWords: 10,
    directive:
      'One sentence, six or seven words. Ten at the very most. Answer only what he asked. Do not ask him anything back.',
  },
  {
    band: 'OPEN',
    min: 40,
    max: 59,
    typicalWords: 7,
    maxWords: 12,
    directive:
      'One sentence, seven or eight words. Twelve at the very most. Do not ask a question this turn unless he asked you one first.',
    permission: 'You may volunteer one small thing.',
  },
  {
    band: 'ENGAGED',
    min: 60,
    max: 79,
    typicalWords: 8,
    maxWords: 14,
    directive:
      'One sentence, eight or nine words. Fourteen at the very most. No filler, no reassurance, never "take your time" or "no rush".',
    permission: 'Ask about him, tease him, swap names.',
  },
  {
    band: 'INVESTED',
    min: 80,
    max: 100,
    typicalWords: 9,
    maxWords: 15,
    directive:
      'Nine or ten words. Fifteen at the very most. No filler, never "take your time".',
    permission: 'Start a topic or bring back something he said. Open to a concrete plan.',
  },
]

/**
 * The widest reply any band permits.
 *
 * Read by `lib/metrics/stability.ts` so the drift detector cannot be set below
 * the rules the character is actually being given — it was 12 against a table
 * whose widest band was 15, so it fired continuously on a character who was
 * behaving, and what it fired injected an identity reminder that measurably
 * made her longer. The two are one setting and this is the seam that makes
 * them one.
 */
export const MAX_BAND_WORDS: number = BANDS.reduce(
  (widest, spec) => Math.max(widest, spec.maxWords),
  0,
)

export const BAND_NAMES: readonly WarmthBand[] = BANDS.map((spec) => spec.band)

/**
 * The band a warmth value sits in.
 *
 * ROUND 10 BUG FIX, and a bad one. This used to test `value >= min && value <=
 * max` against integer bounds, then fall back to `'OPEN'` if nothing matched.
 * Warmth is continuous, so EVERY fractional value in a seam missed all six
 * bands and was reported as OPEN: 19.5, 39.5, 59.5, 79.5 and -0.5 all came back
 * OPEN, and -0.5 is as cold as the meter goes.
 *
 * That was not a display problem. `bandDirective` reads this, so a character
 * sitting at 19.5 — CLOSED, "one to four words" — was handed the OPEN
 * directive: one sentence, twelve words, volunteer something. It is a strong
 * candidate for the round-6 symptom where she gave 16.5 median words against a
 * contract asking for four to ten.
 *
 * Bands are now half-open intervals selected on `min` alone, scanning downward,
 * which covers the range with no gaps by construction and cannot fall through.
 */
export function bandFor(warmth: number): WarmthBand {
  const clamped = Math.max(WARMTH_MIN, Math.min(WARMTH_MAX, warmth))
  for (let i = BANDS.length - 1; i >= 0; i -= 1) {
    const spec = BANDS[i]
    if (spec && clamped >= spec.min) return spec.band
  }
  // Below the lowest band's floor. The coldest band, never an arbitrary one.
  return BANDS[0]?.band ?? 'HOSTILE'
}

export function specFor(band: WarmthBand): BandSpec {
  const found = BANDS.find((spec) => spec.band === band)
  if (!found) throw new Error(`No spec for band ${band}`)
  return found
}

/**
 * The item injected into the conversation before each response.
 *
 * Second person and bracketed so it reads as stage direction rather than as
 * dialogue. Kept to one line: it is appended on every user turn and re-charged
 * as context on every turn after that.
 */
export interface DirectiveContext {
  /**
   * Suppress a question this turn.
   *
   * "Questions in at most 40% of turns" is not something a model can count, so
   * the *session* counts it and this flag carries the verdict. Without it the
   * warm bands read as blanket permission to interrogate, which is how round 6
   * reached a question on 83% of turns.
   */
  suppressQuestion?: boolean
  /**
   * Whether the standing orders ride along this turn. Default true.
   *
   * The band's own `permission` is one of them. See the header, and
   * `SteeringContext.includeStanding`, which is the switch the caller sets.
   */
  includeStanding?: boolean
}

/**
 * A character's own wording for one or more of her bands.
 *
 * THE BAND TABLE IS A PERSONALITY, AND IT IS NADIA'S (PERSONA-AUDIT §3.7).
 * Every directive above was tuned against her, and she is quiet, flat and
 * clipped — so for her the caps read as who she is rather than as a constraint
 * on it. A character authored against that grain is partially overwritten by
 * them, in proportion to how far she differs, and Tess is the maximum-distance
 * case: warm, quick, carries it, and told on every turn to say one sentence of
 * fourteen words and ask nothing.
 *
 * THE BAND STILL OWNS REPLY LENGTH. That rule is not weakened here and must
 * not be — round 6 had the contract and the band both specifying it, they
 * disagreed, and the model produced a third answer nobody asked for. What an
 * override changes is *which* band table this character is read from, not how
 * many systems are allowed to have an opinion. There is still exactly one
 * clause in the steering line that says how much she gives.
 *
 * Absent is the normal case and means the shared table, byte for byte.
 */
export type BandDirectives = Partial<Record<WarmthBand, string>>

/**
 * The band's own clauses, unbracketed.
 *
 * Split out so `composeSteering` can add the personality and gate clauses to
 * the same line rather than emitting a second bracketed block — two brackets in
 * a row read as two competing directions.
 */
export function bandDirectiveParts(
  warmth: number,
  context: DirectiveContext = {},
  overrides?: BandDirectives,
): string[] {
  const band = bandFor(warmth)
  const parts = [overrides?.[band] ?? specFor(band).directive]
  // The low bands already forbid questions outright; saying it twice reads as
  // emphasis on the wrong thing.
  if (context.suppressQuestion && BANDS_ALLOWING_QUESTIONS.has(band)) {
    parts.push('Do not ask him anything this turn.')
  }
  return parts
}

/**
 * The band's invitation, when it has one and the caller is sending standing
 * orders this turn. Separate from `bandDirectiveParts` because the two ride
 * different cadences — see the header.
 */
export function bandPermissionParts(
  warmth: number,
  context: DirectiveContext = {},
): string[] {
  if (context.includeStanding === false) return []
  const permission = specFor(bandFor(warmth)).permission
  return permission ? [permission] : []
}

/**
 * The ceiling this warmth allows, in words.
 *
 * Exported for the one place that enforces it rather than states it: the turn
 * pipeline stops synthesising at the first sentence boundary past this number
 * (`lib/voice/elevenlabs/combined.ts`). A cap that is only ever written down is
 * the cap this file's header is an argument about.
 */
export function wordCapFor(warmth: number): number {
  return specFor(bandFor(warmth)).maxWords
}

/**
 * The ceiling for a turn the band is not steering.
 *
 * `WarmthSession.handOverToClosing` stands the whole directive down for exactly
 * one turn, so that thirty seconds from the end she is told exactly one thing:
 * wind down and leave, or wind down and offer him her number. Enforcing a band
 * ceiling on that turn would enforce a rule she was not given, on the one
 * moment the product is built around — and the number offer is naturally two or
 * three sentences, so a fourteen-word cap could drop the goodbye or the offer
 * itself. Rule 3.
 *
 * Generous rather than absent: a runaway still has to stop somewhere, and
 * nothing she says in a closing line comes near forty words.
 */
export const UNSTEERED_WORD_CAP = 40

/** The whole band, invitation included. The steering line composes the two
 *  halves separately; this is for the engine's own read-out and for tests. */
export function bandDirective(warmth: number, context: DirectiveContext = {}): string {
  return `[${[...bandDirectiveParts(warmth, context), ...bandPermissionParts(warmth, context)].join(' ')}]`
}

/** Bands whose directive does not already forbid questions. */
const BANDS_ALLOWING_QUESTIONS = new Set<WarmthBand>(['OPEN', 'ENGAGED', 'INVESTED'])

export function bandIndex(band: WarmthBand): number {
  return BAND_NAMES.indexOf(band)
}
