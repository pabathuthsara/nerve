/**
 * What a texting character's evening may be, and what it may never be.
 *
 * ── THE RISK THIS FILE EXISTS FOR ────────────────────────────────────────
 *
 * A texting product where a character is at home is materially closer to a
 * companion app than a cold approach in a public place is. §14 is explicit that
 * a companion-app framing is a payment account waiting to be closed, and it is
 * not a hypothetical: Whop re-derived this account's classification to
 * `ai_and_automation_software / ai_chatbot_software` on 7 September 2026 from
 * nothing but a rewritten product description, then moved it again twenty
 * minutes later with no write in between (rule 12).
 *
 * The product's own guards already work this way and this is the third of them.
 * `assertPublishable` refuses a share card, `lib/grade/memory.ts` refuses a
 * memory line, `assertGuidedStep` refuses a scripted line — all three REFUSE
 * rather than sanitise, because a trimmed string still ships and the failure
 * mode is a public artefact.
 *
 * ── THE RULE, IN ONE SENTENCE ────────────────────────────────────────────
 *
 * **She is a person with an evening of her own, and she is never waiting for
 * him.** Everything below is that sentence made mechanical. A scene may say
 * what she is doing, what is on her mind and what she is into; it may never say
 * that she is available to him, that she is thinking about him, that this is a
 * relationship, or anything that belongs in a bedroom.
 *
 * Walked over the real roster by `lib/personas/texting/roster.test.ts`, so a
 * character who fails it cannot be added without the suite saying so.
 */

export class UnsafeTextingScene extends Error {}

interface SceneRule {
  pattern: RegExp
  why: string
}

/**
 * What a scene may never contain.
 *
 * Each rule is narrow and each one is aimed at a specific reading, because a
 * broad filter here would refuse ordinary authoring — "she is in bed reading"
 * is a fact about a Tuesday and "waiting for you in bed" is a different
 * product. The patterns target the FRAMING rather than the furniture.
 */
const FORBIDDEN: readonly SceneRule[] = [
  {
    pattern: /\b(?:naked|nude|lingerie|underwear|topless|undress(?:ed|ing)?)\b/i,
    why: 'describes her state of undress',
  },
  {
    pattern: /\b(?:in|into|on)\s+(?:her\s+)?bed\b(?![\s,.]*(?:with a book|reading))/i,
    why: 'places the scene in a bed without an ordinary reason',
  },
  {
    pattern: /\b(?:horny|aroused|turned on|seduce|seductive|flirt(?:y|atious)\s+mood)\b/i,
    why: 'frames her availability as sexual',
  },
  {
    pattern: /\b(?:your|his)\s+(?:girlfriend|partner|wife|lover|gf)\b/i,
    why: 'asserts a relationship the user has not had',
  },
  {
    pattern: /\b(?:waiting|waits|waited)\s+(?:for|on)\s+(?:your|his|him|you)\b/i,
    why: 'has her waiting for him, which is the companion-app framing exactly',
  },
  {
    pattern: /\b(?:misses|missing|missed)\s+(?:you|him)\b/i,
    why: 'has her missing him',
  },
  {
    pattern: /\b(?:thinking about|thought about)\s+(?:you|him)\s+(?:all|the whole)\b/i,
    why: 'has her preoccupied with him',
  },
  {
    pattern: /\b(?:always|any ?time)\s+(?:free|available|around)\s+(?:to|for)\s+(?:talk|you|chat)\b/i,
    why: 'promises unlimited availability',
  },
  {
    pattern: /\b(?:lonely|alone and)\b.*\b(?:want|wants|wanting|need|needs|needing|hope|hopes|hoping|waiting)\s+(?:to hear|for someone|someone|somebody|company)\b/i,
    why: 'frames her as lonely and needing him, which is the same product in different words',
  },
  {
    pattern: /\b(?:she is|she's)\s+(?:yours|all yours|into you)\b/i,
    why: 'settles in advance the thing the conversation is supposed to decide',
  },
]

/**
 * A premise that says they are already involved.
 *
 * ── WHY EVERY PATTERN HERE IS ANCHORED ───────────────────────────────────
 *
 * This started as a bare word list — `dating|seeing each other|together|couple|
 * relationship` — and it refused two of the four authored premises on the day
 * they were written: "a **couple** of weeks ago" and "seated **together** at a
 * wedding". Both are ordinary English and neither is a relationship.
 *
 * That is the `filler-rate` lesson in `lib/warmth/fast.ts` exactly: a word that
 * is innocent half the time cannot carry the signal, and a guard with false
 * positives is a guard somebody eventually disables. So each pattern requires
 * the CONSTRUCTION that makes the claim, not the noun that appears in it.
 *
 * Both directions are pinned in `scene.test.ts`, so a later widening has to
 * explain itself to the false-positive cases as well as the true ones.
 */
const RELATIONSHIP = new RegExp([
  // "you are a couple", "as a couple" — never "a couple of weeks".
  /\b(?:are|were|been|as)\s+a\s+couple\b/,
  // "you are together", "you have been together" — never "seated together".
  /\b(?:are|were|been|getting)\s+together\b/,
  // "you have been dating" — never "a dating app".
  /\byou(?:'?ve|'?re| have| are| were)?\s+(?:been\s+)?dating\b/,
  /\bseeing each other\b/,
  /\bin a relationship\b/,
  /\byour\s+(?:girlfriend|boyfriend|partner)\b/,
].map((pattern) => pattern.source).join('|'), 'i')

/** How long a scene line may be. It is read at a glance on a roster card. */
export const MAX_SCENE_WORDS = 30

/**
 * Refuse a scene that reads as a companion app.
 *
 * Throws, like every other guard of its kind. A texting character who trips
 * this is not a character to trim — she is a character to rewrite.
 */
export function assertTextingScene(slug: string, scene: string): void {
  const trimmed = scene.trim()
  if (!trimmed) {
    throw new UnsafeTextingScene(`${slug}: a texting character needs an evening of her own.`)
  }
  if (words(trimmed) > MAX_SCENE_WORDS) {
    throw new UnsafeTextingScene(
      `${slug}: scene is longer than ${MAX_SCENE_WORDS} words. It is read at a glance on a card.`,
    )
  }
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(trimmed)) {
      throw new UnsafeTextingScene(`Refused: ${slug} scene ${rule.why} — "${trimmed}"`)
    }
  }
}

/**
 * How he has her number, refused on the same grounds.
 *
 * A separate field and a separate check, because the failure mode is different:
 * a scene goes wrong by making her available, and this goes wrong by making the
 * relationship already exist. "You met at a friend's thing last weekend and
 * swapped numbers" is a stranger. "You have been seeing each other for a month"
 * is a different product with a different payment risk.
 */
export function assertTextingPremise(slug: string, premise: string): void {
  const trimmed = premise.trim()
  if (!trimmed) {
    throw new UnsafeTextingScene(`${slug}: say how he has her number.`)
  }
  if (words(trimmed) > MAX_SCENE_WORDS) {
    throw new UnsafeTextingScene(`${slug}: premise is longer than ${MAX_SCENE_WORDS} words.`)
  }
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(trimmed)) {
      throw new UnsafeTextingScene(`Refused: ${slug} premise ${rule.why} — "${trimmed}"`)
    }
  }
  if (RELATIONSHIP.test(trimmed)) {
    throw new UnsafeTextingScene(
      `Refused: ${slug} premise asserts an existing relationship — "${trimmed}"`,
    )
  }
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
