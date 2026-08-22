/**
 * Scene acoustic presets.
 *
 * Every number here is meant to be tuned by ear — that is why they are config
 * and not constants inside the audio graph. The comments record the reasoning
 * so a later change is a decision rather than a guess.
 */

import type { SceneAcoustics } from './types'

/**
 * BOOKSHOP — quiet and acoustically dead.
 *
 * Two things make this scene harder than a cafe, not easier:
 *
 * 1. Quiet is not silence. Digital silence is the giveaway that there is no
 *    room, so the bed is a noise FLOOR rather than an atmosphere: featureless
 *    hum and muffled traffic, around -40dB, with nothing in the loop that the
 *    ear can latch onto and recognise on its second pass.
 *
 * 2. Because there is no background masking her, a dry voice is MORE obvious
 *    here, not less. This is the scenario where the processing matters most.
 */
export const BOOKSHOP: SceneAcoustics = {
  id: 'bookshop',
  label: 'Second-hand bookshop, Saturday afternoon',
  ambient: {
    layers: [
      // Building services. Almost sub-audible; you notice it when it stops.
      { kind: 'hvac-hum', levelDb: -44, lowCutHz: 40, highCutHz: 220 },
      // Street through glass. The glass is why there is no high end.
      { kind: 'traffic-through-glass', levelDb: -46, lowCutHz: 60, highCutHz: 700 },
    ],
    // Everything with character lives here, never in the loop.
    oneShots: [
      { kind: 'page-turn', weight: 3, levelDb: -34 },
      { kind: 'floorboard-creak', weight: 2, levelDb: -32 },
      { kind: 'book-set-down', weight: 2, levelDb: -30 },
      { kind: 'shelf-shift', weight: 1, levelDb: -36 },
      { kind: 'distant-door', weight: 1, levelDb: -38 },
    ],
    // Sparse. One every 20-40s, randomised, so no rhythm ever emerges.
    oneShotIntervalSeconds: [20, 40],
    masterDb: -40,
  },
  reverb: {
    // Packed paper is a broadband absorber. This is a dead room.
    rt60Seconds: 0.3,
    // ~4 feet away across a rug: a short pre-delay, not a distant one.
    preDelayMs: 12,
    // Almost all early reflections, essentially no tail.
    earlyReflectionRatio: 0.85,
    // Paper eats treble.
    dampingHz: 6000,
    // Enough to place her in a room, not enough to notice as an effect.
    wetMix: 0.1,
  },
}

/**
 * BAR — loud and reflective. Stubbed to prove the schema generalises (§1c).
 *
 * The opposite of the bookshop in every field: a loud crowd wash that masks
 * detail, hard surfaces, a long bright tail and a much higher wet mix. Not
 * tuned; it exists so that the second scenario is a config row.
 */
export const BAR: SceneAcoustics = {
  id: 'bar',
  label: 'Bar, late evening',
  ambient: {
    layers: [
      { kind: 'crowd-wash', levelDb: -22, lowCutHz: 120, highCutHz: 5000 },
      { kind: 'room-rumble', levelDb: -30, lowCutHz: 40, highCutHz: 250 },
    ],
    oneShots: [
      { kind: 'glass-clink', weight: 3, levelDb: -24 },
      { kind: 'chair-scrape', weight: 2, levelDb: -26 },
      { kind: 'distant-door', weight: 1, levelDb: -28 },
    ],
    oneShotIntervalSeconds: [6, 15],
    masterDb: -24,
  },
  reverb: {
    rt60Seconds: 1.1,
    preDelayMs: 25,
    earlyReflectionRatio: 0.4,
    dampingHz: 11000,
    wetMix: 0.22,
  },
}

export const SCENES: Record<string, SceneAcoustics> = {
  [BOOKSHOP.id]: BOOKSHOP,
  [BAR.id]: BAR,
}

export function sceneFor(id: string): SceneAcoustics | null {
  return SCENES[id] ?? null
}
