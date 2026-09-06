/**
 * A deterministic random source, seeded from a string.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * A character's authored `moods` are rolled once, at the moment she comes into
 * existence for a rep. On the Realtime arm that moment is obvious: the token is
 * minted once, the compiler runs once, `Math.random()` is fine.
 *
 * The pipeline arm has no such moment. It is stateless by construction — every
 * turn sends `[contract, exit rule, history, steering]` and throws the request
 * away — so the character contract is recompiled on **every single turn**. An
 * unseeded roll there would give her a different afternoon every time she
 * opened her mouth, and it would change the cached prompt prefix on every turn,
 * which is the one thing `handleLlmRequest` is written to avoid.
 *
 * So the roll is seeded from the rep's own session id. Stable for the life of
 * the rep, different in the next one, and identical on every turn of it.
 *
 * FNV-1a for the hash and mulberry32 for the stream. Neither is cryptographic
 * and neither needs to be: the only thing this decides is which of three
 * hand-authored sentences she is having today.
 */

/** FNV-1a, 32-bit. Stable across runtimes, which a hash used as a seed must be. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * A uniform [0, 1) stream from a string seed.
 *
 * The empty string is a legitimate seed and produces a legitimate stream — a
 * caller with no session id to hand (the compatibility LLM route) gets one
 * consistent answer rather than a fresh one per turn.
 */
export function seededRandom(seed: string): () => number {
  let state = (hashSeed(seed) + 0x6d2b79f5) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
