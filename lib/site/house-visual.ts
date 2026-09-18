/**
 * The orb the landing page speaks through, and it is not a character.
 *
 * ── WHY IT IS HERE AND NOT IN `lib/personas/visual.ts` ───────────────────
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * **It is not a persona.** The house voice reads an authored line, which no
 * character may do (rule 10), so it must not wear a character's identity
 * either. A hue from the roster table would quietly re-attach the sentence
 * to a person.
 *
 * **Adding a row to `PERSONA_VISUAL` would change the roster.** That table's
 * fallback is `keys[seed % keys.length]` — every unknown name in the product
 * is assigned a hue by its LENGTH. A tenth entry re-rolls that assignment
 * for every one of them, which is rule 19's exact shape: a shared judgement
 * file edited on the way to something else, changing characters nobody was
 * looking at. So this is a new file beside it, which is what §0 asks for.
 *
 * ── WHAT IT LOOKS LIKE, AND WHY ──────────────────────────────────────────
 *
 * Graphite with the faintest cool lift — the least character-like thing the
 * ramp allows. It is the product clearing its throat, not somebody being
 * introduced, so it reads as material rather than as a person: high layer
 * count and a tight tube give it structure instead of warmth.
 *
 * `mode: 7` and eight petals are the most folded, least open form in the
 * shader's range, which is the roster's own vocabulary for "closed" — right
 * for something that is not offering a conversation.
 *
 * The bounds it has to clear are the roster's, and they are asserted rather
 * than trusted: no Arena token, outside the 60–115° arc where Volt lives, a
 * real distance from Volt, Cool, Amber and Red, and the guarded end darker
 * than the warm end. `house-visual.test.ts` runs the same checks
 * `lib/personas/visual.test.ts` runs over every character.
 */

import type { PersonaVisual } from '@/lib/personas/visual'

export const HOUSE_VISUAL: PersonaVisual = {
  mode: 7,
  petals: 8,
  layers: 4,
  tube: 0.20,
  tilt: [-0.18, 0.22, -0.10],
  /** Warmth 0. Near-graphite, a hair cooler than neutral. */
  deep: '#33373d',
  /** Warmth 100. A slate blue-grey — present, and nobody's colour. */
  core: '#5c6b80',
  /** Rim and specular, desaturated like every other one. */
  sheen: '#c6cad1',
  /** Fixed, not hashed: this is one object, not a character being derived. */
  seed: 11,
}
