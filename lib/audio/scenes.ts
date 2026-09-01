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
    // RELATIVE to masterDb, which carries the absolute level. Two absolute dB
    // values in series is what put this bed at -95 dBFS and made it inaudible.
    layers: [
      // Building services. Almost sub-audible; you notice it when it stops.
      { kind: 'hvac-hum', levelDb: 0, lowCutHz: 40, highCutHz: 220 },
      // Street through glass. The glass is why there is no high end. Sits just
      // under the hum so neither is separately identifiable.
      { kind: 'traffic-through-glass', levelDb: -2, lowCutHz: 60, highCutHz: 700 },
    ],
    // Everything with character lives here, never in the loop. Above the floor,
    // because an event at the same level as the bed is not an event.
    oneShots: [
      { kind: 'page-turn', weight: 3, levelDb: 10 },
      { kind: 'floorboard-creak', weight: 2, levelDb: 12 },
      { kind: 'book-set-down', weight: 2, levelDb: 14 },
      { kind: 'shelf-shift', weight: 1, levelDb: 8 },
      { kind: 'distant-door', weight: 1, levelDb: 6 },
    ],
    // Sparse. One every 20-40s, randomised, so no rhythm ever emerges.
    oneShotIntervalSeconds: [20, 40],
    // The one absolute number. A quiet room, well below her voice.
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
      { kind: 'crowd-wash', levelDb: 0, lowCutHz: 120, highCutHz: 5000 },
      { kind: 'room-rumble', levelDb: -8, lowCutHz: 40, highCutHz: 250 },
    ],
    oneShots: [
      { kind: 'glass-clink', weight: 3, levelDb: 4 },
      { kind: 'chair-scrape', weight: 2, levelDb: 2 },
      { kind: 'distant-door', weight: 1, levelDb: 0 },
    ],
    oneShotIntervalSeconds: [6, 15],
    // Loud room. Twenty-four dB above the bookshop, which is about right for
    // the difference between a bar and a shop with carpet.
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

/**
 * Procedural room acoustics are OFF.
 *
 * The convolution reverb placed her in a room, and on a lot of hardware what
 * it actually did was make her harder to understand — a smeared, echoey voice
 * over a laptop speaker, at the exact moment the user is straining to hear a
 * stranger. Intelligibility beats atmosphere: a rep the user cannot follow is
 * not a rep. Recorded room beds arrive as audio files later and are a
 * different mechanism from this one.
 *
 * The scene presets and every persona's `room` layer are left exactly as
 * authored. This is the one switch, read by both adapters, so turning the
 * procedural room back on is a single flag rather than an archaeology
 * exercise: set `NEXT_PUBLIC_ROOM_ACOUSTICS=on`.
 */
export function roomAcousticsEnabled(): boolean {
  return process.env['NEXT_PUBLIC_ROOM_ACOUSTICS'] === 'on'
}

/**
 * Whether the room can make a sound of its own — a different question.
 *
 * `roomAcousticsEnabled` asks whether HER VOICE goes through a convolver, and
 * the answer is no because that hurt intelligibility. One flag was answering
 * both questions, so the ambient bed went silent with the reverb even though
 * AUDIO.md's own graph shows them as independent chains and the settings
 * toggle sat disabled reading "rooms are silent while the new sound is
 * recorded".
 *
 * `lib/audio/room-tone.ts` is that new sound, synthesised rather than
 * recorded, and it has no voice input node at all — there is physically
 * nothing for her audio to be routed through. So it is available regardless of
 * the convolver, and whether it actually plays is the user's `ambience`
 * preference rather than a build flag.
 */
export function roomToneAvailable(): boolean {
  return true
}

/**
 * The scene an adapter should build for a persona, or null for a dry voice.
 *
 * Null is a supported answer everywhere: both adapters already route her
 * straight to the sink when there is no room, exactly once, which is the path
 * that plays now.
 */
export function sceneForRoom(reverbIr: string): SceneAcoustics | null {
  if (!roomAcousticsEnabled()) return null
  return sceneFor(reverbIr)
}
