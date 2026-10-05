/**
 * The first `/start` screen's copy for paid traffic (START-FIRST-SCREEN-PLAN
 * Part B, 5 October 2026).
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 *
 * 0 of 55 Meta visitors answered the first question between 3 and 5 October.
 * The ad they tapped tells a story (a library study group, six hours on voice
 * chat) and the page they landed on started a different one: a kicker in
 * caps, then *What's the hard part?*. The scene line picks up the ad's story
 * where the video left it, keyed on the link's `utm_content`, so the first
 * thing a visitor reads is the same moment they just watched.
 *
 * ── RULE 10: AUTHORED, NEVER GENERATED ───────────────────────────────────
 *
 * Every line is written here and reviewed in a pull request. A new ad gets a
 * new line by adding a key; an unknown or missing tag keeps today's kicker, so
 * a typo in a link costs a scene line and never shows somebody nothing.
 *
 * ── NOT CLOAKING ─────────────────────────────────────────────────────────
 *
 * The same link shows the same page to everybody who opens it, an ad
 * platform's reviewer included. It is the `?track=` mechanism one level down,
 * and `/` is untouched (`LAUNCH-GAP.md` B1).
 *
 * No statistic (D21), no clinical claim (rule 12), US spelling.
 */

/** Today's kicker, kept for every link without a known scene. */
export const START_KICKER = 'Practice out loud with an AI'

/**
 * One line per ad, keyed on the `utm_content` value the ad's link carries.
 * Keys are the allow-listed tag shape (`normaliseTag`): lower-case, `._-`.
 */
export const START_SCENES: Readonly<Record<string, string>> = {
  library: 'Study group. She just sat down next to you.',
  gaming: 'Six hours on voice chat. Now it’s in person.',
}

/**
 * The scene line for a link's `utm_content`, or null for anything not
 * authored above — including `constructor`, `__proto__` and the other keys
 * every object inherits, which a plain lookup would happily return.
 */
export function startScene(content: string | null | undefined): string | null {
  if (typeof content !== 'string') return null
  const key = content.trim().toLowerCase()
  return Object.hasOwn(START_SCENES, key) ? START_SCENES[key] ?? null : null
}

/**
 * The first question's sub-line on `/start` only (B2). The signed-in run
 * keeps *Pick one. Your first rep is built around it.*: somebody who has
 * made an account has been told what a rep is, and a cold visitor four
 * seconds off a video has not.
 */
export const START_FOCUS_SUB =
  'Practice it out loud first: 3 minutes with an AI character who can lose interest. Pick what’s hard and your first practice is built around it.'
