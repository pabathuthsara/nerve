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


/**
 * LAUNDERETTE — small, tiled, and never quiet (Tess, rung 1).
 *
 * The opposite problem to the bookshop: there is always a machine running, so
 * the bed is a genuine floor rather than a hint of one. What it must not do is
 * turn over audibly — a drum has a rhythm, and a rhythm is the one thing a loop
 * cannot have. So the tumble is band-limited noise with a body and the
 * character lives in the coins and the end-of-cycle buzzer.
 */
export const LAUNDERETTE: SceneAcoustics = {
  id: 'launderette',
  label: 'Launderette, Sunday afternoon',
  ambient: {
    layers: [
      { kind: 'machine-tumble', levelDb: 0, lowCutHz: 50, highCutHz: 420 },
      { kind: 'hvac-hum', levelDb: -6, lowCutHz: 40, highCutHz: 200 },
    ],
    oneShots: [
      { kind: 'coin-drop', weight: 2, levelDb: 8 },
      { kind: 'machine-buzzer', weight: 1, levelDb: 6 },
      { kind: 'distant-door', weight: 2, levelDb: 8 },
      { kind: 'chair-scrape', weight: 1, levelDb: 6 },
    ],
    oneShotIntervalSeconds: [16, 34],
    // Eight dB above the bookshop. A machine running is not a library.
    masterDb: -32,
  },
  reverb: {
    // Small and tiled: short, but nothing absorbs, so it is not dead either.
    rt60Seconds: 0.55,
    preDelayMs: 8,
    earlyReflectionRatio: 0.7,
    dampingHz: 9000,
    wetMix: 0.14,
  },
}

/**
 * COFFEE SHOP — the busiest quiet room on the roster (Maya, rung 3).
 *
 * Chatter she is not part of, and a machine that punctuates. Her rung is about
 * not running dry at ninety seconds, so the room has to supply things to look
 * at without ever competing with what she says.
 */
export const COFFEE_SHOP: SceneAcoustics = {
  id: 'coffee-shop',
  label: 'Coffee shop, Sunday morning',
  ambient: {
    layers: [
      { kind: 'crowd-wash', levelDb: 0, lowCutHz: 200, highCutHz: 2200 },
      { kind: 'hvac-hum', levelDb: -7, lowCutHz: 40, highCutHz: 220 },
    ],
    oneShots: [
      { kind: 'cup-on-saucer', weight: 3, levelDb: 8 },
      { kind: 'steam-hiss', weight: 2, levelDb: 4 },
      { kind: 'chair-scrape', weight: 2, levelDb: 6 },
      { kind: 'distant-door', weight: 1, levelDb: 5 },
    ],
    oneShotIntervalSeconds: [12, 26],
    masterDb: -30,
  },
  reverb: {
    rt60Seconds: 0.7,
    preDelayMs: 14,
    earlyReflectionRatio: 0.55,
    dampingHz: 9000,
    wetMix: 0.16,
  },
}

/**
 * HOTEL LOBBY — big, hard, and almost empty (Robin, rung 4).
 *
 * The quietest bed here and the longest tail, which is the combination that
 * makes a space read as large. Her rung is reading whether a no is a no, and a
 * room where every footstep carries is the right room for it: there is nothing
 * to hide a pause behind.
 */
export const HOTEL_LOBBY: SceneAcoustics = {
  id: 'hotel-lobby',
  label: 'Hotel lobby, early evening',
  ambient: {
    layers: [
      { kind: 'hall-air', levelDb: 0, lowCutHz: 60, highCutHz: 900 },
      { kind: 'room-rumble', levelDb: -9, lowCutHz: 30, highCutHz: 150 },
    ],
    oneShots: [
      { kind: 'heel-on-stone', weight: 3, levelDb: 10 },
      { kind: 'lift-chime', weight: 1, levelDb: 6 },
      { kind: 'distant-door', weight: 2, levelDb: 8 },
    ],
    oneShotIntervalSeconds: [14, 30],
    masterDb: -38,
  },
  reverb: {
    rt60Seconds: 1.6,
    preDelayMs: 30,
    earlyReflectionRatio: 0.3,
    dampingHz: 10000,
    wetMix: 0.2,
  },
}

/**
 * GALLERY — a crowd in a hard white box (Alex, retired rung 8).
 *
 * Louder than the bar in the mid-range and much brighter, because there is no
 * music to mask anything and every surface is plaster or glass.
 */
export const GALLERY: SceneAcoustics = {
  id: 'gallery',
  label: 'Gallery opening, early evening',
  ambient: {
    layers: [
      { kind: 'crowd-wash', levelDb: 0, lowCutHz: 250, highCutHz: 4000 },
      { kind: 'hall-air', levelDb: -8, lowCutHz: 60, highCutHz: 800 },
    ],
    oneShots: [
      { kind: 'glass-clink', weight: 3, levelDb: 4 },
      { kind: 'heel-on-stone', weight: 2, levelDb: 3 },
      { kind: 'distant-door', weight: 1, levelDb: 2 },
    ],
    oneShotIntervalSeconds: [6, 15],
    masterDb: -26,
  },
  reverb: {
    rt60Seconds: 1.3,
    preDelayMs: 22,
    earlyReflectionRatio: 0.35,
    dampingHz: 12000,
    wetMix: 0.22,
  },
}

/**
 * HOUSE PARTY — a kitchen with the music in the next room (Sam, retired 6).
 *
 * The bed is mostly what comes through the wall, which is why a music layer is
 * allowed here at all: everything recognisable about a track is above 180Hz and
 * the wall has already removed it.
 */
export const HOUSE_PARTY: SceneAcoustics = {
  id: 'house-party',
  label: 'House party, in the kitchen',
  ambient: {
    layers: [
      { kind: 'muffled-music', levelDb: 0, lowCutHz: 40, highCutHz: 180 },
      { kind: 'crowd-wash', levelDb: -5, lowCutHz: 200, highCutHz: 2000 },
    ],
    oneShots: [
      { kind: 'glass-clink', weight: 3, levelDb: 6 },
      { kind: 'distant-door', weight: 2, levelDb: 4 },
      { kind: 'chair-scrape', weight: 1, levelDb: 4 },
    ],
    oneShotIntervalSeconds: [7, 16],
    masterDb: -26,
  },
  reverb: {
    rt60Seconds: 0.6,
    preDelayMs: 10,
    earlyReflectionRatio: 0.65,
    dampingHz: 8000,
    wetMix: 0.15,
  },
}

/**
 * TRAIN PLATFORM — outdoors, so almost no reverb at all (Erin, retired 5).
 *
 * The one scene on the roster with no room. Wind and open air, a canopy that
 * gives back a single slap and nothing else, and the announcements that are
 * the reason `distant-announcement` was authored in the first place.
 */
export const TRAIN_PLATFORM: SceneAcoustics = {
  id: 'train-platform',
  label: 'Train platform, evening',
  ambient: {
    layers: [
      { kind: 'platform-wind', levelDb: 0, lowCutHz: 80, highCutHz: 1400 },
      { kind: 'room-rumble', levelDb: -6, lowCutHz: 30, highCutHz: 140 },
    ],
    oneShots: [
      { kind: 'distant-announcement', weight: 3, levelDb: 8 },
      { kind: 'rail-squeal', weight: 1, levelDb: 4 },
      { kind: 'heel-on-stone', weight: 2, levelDb: 6 },
    ],
    oneShotIntervalSeconds: [8, 18],
    masterDb: -30,
  },
  reverb: {
    // Outdoors under a canopy: a long pre-delay and a thin, early-dominated
    // return. The wet share is the lowest here for the same reason.
    rt60Seconds: 0.9,
    preDelayMs: 40,
    earlyReflectionRatio: 0.25,
    dampingHz: 6000,
    wetMix: 0.08,
  },
}

/**
 * GYM — a large hard box with machinery in it (Priya, retired rung 2).
 *
 * Quiet for its size, because the noise is intermittent rather than continuous:
 * the bed is the air handling and the character is entirely in the plates.
 */
export const GYM: SceneAcoustics = {
  id: 'gym',
  label: 'Gym floor, weekday evening',
  ambient: {
    layers: [
      { kind: 'machine-tumble', levelDb: 0, lowCutHz: 60, highCutHz: 380 },
      { kind: 'hall-air', levelDb: -5, lowCutHz: 80, highCutHz: 900 },
    ],
    oneShots: [
      { kind: 'weight-clank', weight: 4, levelDb: 12 },
      { kind: 'machine-buzzer', weight: 1, levelDb: 4 },
      { kind: 'distant-door', weight: 1, levelDb: 6 },
    ],
    oneShotIntervalSeconds: [10, 22],
    masterDb: -32,
  },
  reverb: {
    rt60Seconds: 1.5,
    preDelayMs: 26,
    earlyReflectionRatio: 0.35,
    dampingHz: 11000,
    wetMix: 0.18,
  },
}

/**
 * One row per room a character actually stands in.
 *
 * Nine authored personas, two authored scenes: for seven of them `sceneId`
 * fell through to `reverbIr` and they were handed somebody else's room. Erin
 * stood on a train platform listening to glasses being put down; Maya and
 * Robin — both of them live rungs — were handed the near-silent bookshop AND
 * were told in their Absolute rules to react "the way a stranger in a bookshop
 * would", from a coffee shop and a hotel lobby respectively. That second half
 * is PERSONA-AUDIT §3.6 exactly, the defect that was fixed for Tess alone and
 * left running for everybody else.
 *
 * A scene was always meant to be a config row (§1c). These are those rows.
 */
export const SCENES: Record<string, SceneAcoustics> = {
  [BOOKSHOP.id]: BOOKSHOP,
  [BAR.id]: BAR,
  [LAUNDERETTE.id]: LAUNDERETTE,
  [COFFEE_SHOP.id]: COFFEE_SHOP,
  [HOTEL_LOBBY.id]: HOTEL_LOBBY,
  [GALLERY.id]: GALLERY,
  [HOUSE_PARTY.id]: HOUSE_PARTY,
  [TRAIN_PLATFORM.id]: TRAIN_PLATFORM,
  [GYM.id]: GYM,
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
