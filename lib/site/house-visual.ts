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
 * ── WHAT IT LOOKS LIKE, AND WHY IT IS THE PAGE'S OWN GREY ────────────────
 *
 * It shipped cool — a slate blue at hue 215° — and read as a foreign object
 * dropped onto the landing page. The measurement says exactly why:
 *
 *     Ground   #0B0C0A    90.0°     Ink-3   #6A7062    85.7°
 *     Surface  #131511    90.0°     Ink-2   #9DA396    87.7°
 *     Line     #242820    90.0°     Volt    #C4F82A    75.1°
 *
 * **Every neutral in Arena is a warm yellow-green grey in the 77–90° band**,
 * the same family Volt sits at the saturated end of. A blue-grey is 130° away
 * from literally everything else on the screen, so it could not look like it
 * was made of the same material as the page — because it was not.
 *
 * So it is now the page's own grey, at the chroma of `Line` rather than of a
 * character: warmth 0 is barely lifted off Surface and warmth 100 lands near
 * Ink-3. It reads as smoke or brushed metal — the product clearing its
 * throat — rather than as somebody being introduced.
 *
 * ── AND WHY IT MAY SIT IN THE BAND THE ROSTER MAY NOT ────────────────────
 *
 * `lib/personas/visual.test.ts` keeps every CHARACTER out of 60–115°,
 * because that is where Volt lives and an avatar with real chroma there
 * would compete with the one accent the system is built on. This object has
 * no chroma to compete with: at 0.16 against Volt's 0.83 it cannot read as an
 * accent at any size, which is the thing the rule is actually protecting.
 *
 * `house-visual.test.ts` therefore asserts the RULE rather than the band —
 * inside the band only if the chroma is low enough that it cannot be mistaken
 * for one. That is a stricter statement than "not 60–115", not a loophole,
 * and it is the reason this file is allowed to be the page's colour.
 *
 * `mode: 7` and eight petals stay: the most folded, least open form in the
 * shader's range, which is the roster's own vocabulary for "closed" — right
 * for something that is not offering a conversation.
 */

import type { PersonaVisual } from '@/lib/personas/visual'

export const HOUSE_VISUAL: PersonaVisual = {
  mode: 7,
  petals: 8,
  layers: 4,
  tube: 0.20,
  tilt: [-0.18, 0.22, -0.10],
  /** Warmth 0. A breath above Surface, in Surface's own hue. */
  deep: '#202219',
  /** Warmth 100. Ink-3's family, a little more present. Nobody's colour. */
  core: '#77806b',
  /** Rim and specular, desaturated like every other one. */
  sheen: '#cdd1c6',
  /** Fixed, not hashed: this is one object, not a character being derived. */
  seed: 11,
}
