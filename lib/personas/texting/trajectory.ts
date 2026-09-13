/**
 * The two numbers that are a property of the MEDIUM rather than of a character.
 *
 * Kept here rather than repeated in four persona files for the reason
 * `lib/personas/shared.ts` gives about craft rules: four copies is four places
 * for one number to be worded slightly differently.
 */

import { MAX_TEXTING_BAND_WORDS } from '@/lib/warmth/texting/bands'

/**
 * The margin between the widest band and the drift alarm.
 *
 * `lib/metrics/stability.ts` derives `DEFAULT_VERBOSITY_MEDIAN` from the DATING
 * table and that file is not opened (rule 19). Every texting character carries
 * this as her own `verbosityMedian` instead, which is the per-persona escape
 * hatch the metric already supports — so a third track needs no change to the
 * alarm at all.
 *
 * The margin is the shared one's reasoning, not a new opinion: an alarm set at
 * exactly the widest band fires continuously on a character who is obeying it.
 */
export const TEXTING_VERBOSITY_MARGIN_WORDS = 4

export const TEXTING_VERBOSITY_MEDIAN = MAX_TEXTING_BAND_WORDS + TEXTING_VERBOSITY_MARGIN_WORDS

/**
 * Roughly how many exchanges a texting thread runs.
 *
 * Measured against nothing yet — it is the authored budget in
 * `lib/texting/exit.ts` rather than an observation, and it is written down here
 * so that a persona author sizing `maxGainPerTurn` is sizing it against the
 * same number the exit layer uses. `TEXTING-PLAN.md` §18 owes the real figure
 * off the first ten threads.
 */
export const TEXTING_EXCHANGES = 18
