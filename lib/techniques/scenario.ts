/**
 * Which rep a library card sends you into.
 *
 * The single most natural conversion in the product — read the technique, go
 * and try it — did not exist. A card gave three worked examples and then the
 * page ended: no practice link, no next card, no read state, nothing.
 *
 * The rule, in order:
 *
 *   1. **The room, if the card names one.** An openers card set in a cafe
 *      belongs in Maya's coffee shop and nowhere else. This is the half that
 *      makes the link feel deliberate rather than generated.
 *   2. **The skill.** Every other card is about a sub-score, and each
 *      sub-score has a character it is genuinely trained against — the same
 *      claims their own `respondsTo` copy makes.
 *   3. **Whatever is unlocked.** A preference for a character somebody has not
 *      reached yet is a dead link, so the walk falls through the list and then
 *      through the roster.
 *
 * Authored content in the repo, reviewed in a pull request, asserted in tests
 * against the real registries so a roster change cannot leave a card pointing
 * at nobody (§16).
 *
 * Pure — it takes the unlocked slugs rather than reading them, so the same
 * function answers on the server and in the browser.
 */

import type { SubScore } from './library'

/**
 * A card's authored `setting` to the character whose scene it is.
 *
 * Only the honest matches. `gym`, `transit`, `party` and `work` are settings
 * with no character on the roster, and inventing one for them would make the
 * link worse than not having it: the point of rule 1 is that the room the card
 * describes is the room the rep happens in.
 */
const PERSONA_BY_SETTING: Record<string, string> = {
  cafe: 'maya',
  bookshop: 'nadia',
  'hotel lobby': 'robin',
}

/**
 * Who trains each sub-score, best first.
 *
 * These are the claims the roster already makes about itself. Nadia's bar is
 * saying anything at all, which is opening. Maya is the rung authored around
 * not running dry at ninety seconds, which is curiosity and listening. Robin
 * is reading whether a no is a no and leaving cleanly, which is signal
 * reading, composure and the close.
 */
const PERSONA_BY_SUB_SCORE: Record<SubScore, readonly string[]> = {
  opening: ['nadia', 'maya', 'robin'],
  curiosity: ['maya', 'nadia', 'robin'],
  listening: ['maya', 'nadia', 'robin'],
  signalReading: ['robin', 'maya', 'nadia'],
  composure: ['robin', 'maya', 'nadia'],
  close: ['robin', 'maya', 'nadia'],
}

export interface ScenarioCard {
  targets: readonly string[]
  setting?: string | null
}

/**
 * The character this card should be practised against, or null if nothing is
 * reachable.
 *
 * `unlocked` is the slugs of characters this account can actually start a rep
 * with. Empty means a brand-new account whose roster has not loaded, and the
 * caller draws no link at all rather than one that bounces.
 */
export function personaForCard(
  card: ScenarioCard,
  unlocked: readonly string[],
): string | null {
  if (unlocked.length === 0) return null
  const open = new Set(unlocked)

  const bySetting = card.setting ? PERSONA_BY_SETTING[card.setting.toLowerCase()] : undefined
  if (bySetting && open.has(bySetting)) return bySetting

  for (const target of card.targets) {
    for (const slug of PERSONA_BY_SUB_SCORE[target as SubScore] ?? []) {
      if (open.has(slug)) return slug
    }
  }

  // Nothing preferred is reachable. The link still has to go somewhere real.
  return unlocked[0] ?? null
}
