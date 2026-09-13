/**
 * The ceiling, which is a product rule and not a limitation to apologise for.
 *
 * ── WHAT IT WAS, AND WHAT IT NOW MEANS ───────────────────────────────────
 *
 * `lib/text/warmth.ts` carried this constant and a meter that could not reach
 * it for any reason other than persistence: warmth was `start + turns × gain`,
 * so the only way to the ceiling was to keep typing. The wall was real and
 * nothing about arriving at it meant anything.
 *
 * The meter reads meaning now (`./meter.ts`), so the ceiling has become the
 * interesting part of the section rather than its floor: she can be genuinely
 * won up to ENGAGED and no further, and a user who gets there has done
 * everything the medium can measure.
 *
 * ── WHY IT IS NOT NEGOTIABLE ─────────────────────────────────────────────
 *
 * Texting never reaches `ARM_THRESHOLD`. She cannot be armed, so she never
 * offers contact details and there is no win to take. That is what keeps the
 * two sections from competing: the number is the VOICE rep's payoff, and a
 * payoff that can be farmed in a section with no microphone, no clock and a
 * daily allowance measured in conversations is a payoff worth nothing.
 *
 * It is also the reason `lib/warmth/texting/steering.ts` has no warm leaving
 * branch. The dating arm's is `closing === 'number'`; there is no such state
 * here, by construction, and adding one would be the same mistake twice.
 *
 * Five points of daylight rather than one, so that no rounding, no future
 * retune of a texting persona's gain, and no off-by-one in a comparison can put
 * a thread on the threshold by accident.
 */

import { ARM_THRESHOLD } from '@/lib/data/rep-rules'

export const TEXTING_WARMTH_CEILING = ARM_THRESHOLD - 5
