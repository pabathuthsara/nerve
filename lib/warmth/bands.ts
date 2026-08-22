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
  /** Inclusive upper bound. */
  max: number
  directive: string
}

/** The lowest warmth can go. Below zero she actively wants out. */
export const WARMTH_MIN = -20
export const WARMTH_MAX = 100

/** Ordered low to high. The whole range is covered with no gaps. */
export const BANDS: readonly BandSpec[] = [
  {
    band: 'HOSTILE',
    min: -20,
    max: -1,
    directive:
      'You want this to end. One or two words, or nothing at all. Do not ask anything. Do not soften it.',
  },
  {
    band: 'CLOSED',
    min: 0,
    max: 19,
    directive:
      'One to four words. Do not ask him anything. Do not add anything he did not ask for.',
  },
  {
    band: 'GUARDED',
    min: 20,
    max: 39,
    directive:
      'Three to eight words. Answer only what he asked. Do not ask him anything back.',
  },
  {
    band: 'OPEN',
    min: 40,
    max: 59,
    directive:
      'One sentence, twelve words at most. You may volunteer one small thing. Do not ask a question this turn unless he asked you one first.',
  },
  {
    band: 'ENGAGED',
    min: 60,
    max: 79,
    directive:
      'Under fifteen words. Ask about him, tease him, swap names. No filler, no reassurance, never "take your time" or "no rush".',
  },
  {
    band: 'INVESTED',
    min: 80,
    max: 100,
    directive:
      'Under fifteen words. Start a topic or bring back something he said. Open to a concrete plan. No filler, never "take your time".',
  },
]

export const BAND_NAMES: readonly WarmthBand[] = BANDS.map((spec) => spec.band)

export function bandFor(warmth: number): WarmthBand {
  const clamped = Math.max(WARMTH_MIN, Math.min(WARMTH_MAX, warmth))
  for (const spec of BANDS) {
    if (clamped >= spec.min && clamped <= spec.max) return spec.band
  }
  return 'OPEN'
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
}

export function bandDirective(warmth: number, context: DirectiveContext = {}): string {
  const band = bandFor(warmth)
  const parts = [specFor(band).directive]
  // The low bands already forbid questions outright; saying it twice reads as
  // emphasis on the wrong thing.
  if (context.suppressQuestion && BANDS_ALLOWING_QUESTIONS.has(band)) {
    parts.push('Do not ask him anything this turn.')
  }
  return `[${parts.join(' ')}]`
}

/** Bands whose directive does not already forbid questions. */
const BANDS_ALLOWING_QUESTIONS = new Set<WarmthBand>(['OPEN', 'ENGAGED', 'INVESTED'])

export function bandIndex(band: WarmthBand): number {
  return BAND_NAMES.indexOf(band)
}
