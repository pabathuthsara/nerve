/**
 * Per-level warmth configuration.
 *
 * Warmth is asymmetric everywhere: it rises slowly and falls fast. That is not
 * a difficulty knob, it is how strangers actually work, and it is what makes
 * the meter teach anything. A user who can undo a bad turn by saying two nice
 * things has learned nothing.
 */

export interface WarmthLevelConfig {
  /** Opening warmth before jitter. */
  start: number
  /** Plus or minus this much, rolled once per session (§05 — outcome is rolled). */
  startJitter: number
  /** Multiplier on positive raw deltas. */
  gain: number
  /** Multiplier on negative raw deltas. */
  decay: number
  floor: number
  /**
   * Hard maximum across every encounter. Below 100 this makes the character
   * unwinnable by design — the point of the level, not a limitation of it.
   */
  ceiling: number
  /**
   * Maximum reachable within a *single* session. Reaching the absolute ceiling
   * should take several encounters, so one very good rep cannot take a stranger
   * all the way to INVESTED.
   */
  sessionCeiling: number
  /**
   * Applied warmth lost on every user turn, before that turn is scored.
   * Standing still has to lose ground or the meter only ever ratchets up.
   */
  naturalDecayPerTurn: number
  /** Maximum applied gain from any single turn, after gain and falloff. */
  maxGainPerTurn: number
}

export const WARMTH_LEVELS: Record<number, WarmthLevelConfig> = {
  // Nadia.
  //
  // Opens CLOSED or GUARDED. Round 6 briefed start:45, which measured OPEN on
  // 80.6% of rolls and produced a character who opened with an eighteen-word
  // question — the exact assistant-shaped behaviour the meter exists to stop.
  // 15 +/- 10 spans 5 to 25: mostly CLOSED, sometimes GUARDED, never OPEN.
  //
  // gain dropped 1.5 -> 0.6 after round 6 climbed 41 -> 58 in under a minute on
  // a conversation that was visibly dying. With diminishing returns on top, the
  // last twenty points cost roughly three times what the first twenty do.
  1: {
    start: 15,
    startJitter: 10,
    gain: 0.6,
    decay: 0.5,
    floor: -20,
    ceiling: 100,
    sessionCeiling: 85,
    naturalDecayPerTurn: 0.5,
    maxGainPerTurn: 4,
  },

  // Alex. Stubbed for M0 so the ceiling mechanic is exercised by the tests
  // before anyone builds level 8 for real. She starts nearly closed, barely
  // rewards effort, punishes missteps four times harder than Nadia, and cannot
  // be taken past the middle of OPEN no matter how well the rep goes. Being
  // told no and exiting well is the skill (§06); winning is not on offer.
  8: {
    start: 5,
    startJitter: 5,
    gain: 0.4,
    decay: 2.0,
    floor: -20,
    ceiling: 45,
    sessionCeiling: 45,
    naturalDecayPerTurn: 0.5,
    maxGainPerTurn: 4,
  },
}

/** The clamp that actually applies inside a session. */
export function effectiveCeiling(config: WarmthLevelConfig): number {
  return Math.min(config.ceiling, config.sessionCeiling)
}

export function levelConfig(level: number): WarmthLevelConfig {
  const found = WARMTH_LEVELS[level]
  if (found) return found
  // Levels 2-7 are not authored yet. Interpolating would invent a difficulty
  // curve nobody designed, so fall back to the one level that is real.
  const fallback = WARMTH_LEVELS[1]
  if (!fallback) throw new Error('Level 1 warmth config is missing')
  return fallback
}
