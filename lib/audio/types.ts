import type { RoomConfig } from '@/lib/voice/types'

/**
 * Per-scenario acoustic configuration (§1c).
 *
 * A bar, a house party and a train platform each need their own bed and their
 * own reverb profile. A bar is loud and reflective; this bookshop is quiet and
 * acoustically dead. These are therefore persona fields, not globals — the
 * bookshop is simply the first one, and the second scenario would otherwise
 * force a rewrite rather than a config row.
 */

export interface AmbientLayer {
  /**
   * Featureless continuous layer only.
   *
   * Anything distinctive in a loop becomes obvious on the second pass and
   * actively breaks immersion — a page turn heard twice is worse than silence.
   * Character goes in one-shots.
   */
  kind: 'hvac-hum' | 'traffic-through-glass' | 'room-rumble' | 'crowd-wash' | 'platform-wind'
  /**
   * Level in dB RELATIVE to the bed master, which carries the absolute level.
   *
   * Relative, not absolute: an absolute value here multiplied by an absolute
   * `masterDb` put the bookshop bed at -95 dBFS, roughly 56 dB below its target
   * and comprehensively inaudible. One place owns the absolute level.
   */
  levelDb: number
  /** Band limits in Hz. A hum is low, traffic through glass is low-mid. */
  lowCutHz?: number
  highCutHz?: number
}

export interface OneShot {
  kind:
    | 'page-turn'
    | 'floorboard-creak'
    | 'distant-door'
    | 'book-set-down'
    | 'shelf-shift'
    | 'glass-clink'
    | 'chair-scrape'
    | 'distant-announcement'
  /** Relative likelihood when a one-shot fires. Weights need not sum to 1. */
  weight: number
  /** dB relative to the bed master. Positive: events sit above the floor. */
  levelDb: number
}

export interface AmbientBed {
  /** Continuous, featureless layers. */
  layers: AmbientLayer[]
  /** Distinctive events, scheduled randomly so they never form a pattern. */
  oneShots: OneShot[]
  /** Seconds. A one-shot fires at a uniform random point in this range. */
  oneShotIntervalSeconds: [min: number, max: number]
  /**
   * The bed's absolute level in dBFS, and the ONLY absolute number here.
   * Everything else in this bed is relative to it. Exposed for tuning by ear.
   */
  masterDb: number
}

/**
 * Reverb profile.
 *
 * A bookshop is NOT a reverberant space. Shelves packed with paper are
 * excellent broadband absorbers, so a hall or room preset is actively wrong
 * here — the target is short, early-reflection-dominated and dark.
 */
export interface ReverbProfile {
  /** Seconds to -60dB. Bookshop ~0.3; a tiled bar is several times that. */
  rt60Seconds: number
  /** Milliseconds before the first reflection. Distance cue. */
  preDelayMs: number
  /**
   * 0-1. How much of the energy sits in discrete early reflections versus a
   * diffuse tail. Near 1 in a dead, cluttered room.
   */
  earlyReflectionRatio: number
  /** Hz. Paper eats treble, so the tail rolls off early. */
  dampingHz: number
  /** 0-1. Wet share of the output. Bookshop 0.08-0.12. */
  wetMix: number
}

export interface SceneAcoustics {
  id: string
  /** Human label for the tuning UI. */
  label: string
  ambient: AmbientBed
  reverb: ReverbProfile
}

/**
 * Live tuning surface, exposed through the VoiceProvider so the application can
 * adjust the room by ear without knowing which provider built it.
 */
export interface RoomControls {
  readonly sceneId: string
  readonly ambientLevelDb: number
  readonly wetMix: number
  readonly oneShotIntervalSeconds: readonly [number, number]
  /** True once the bed is running. It runs from arm to end, nothing between. */
  readonly isRunning: boolean
  readonly ducked: boolean
  /** dB trim on the whole ambient bed. */
  setAmbientLevelDb(db: number): void
  /** Seconds, [min, max], between randomly scheduled one-shots. */
  setOneShotInterval(range: [number, number]): void
  /** 0-1 wet share on her voice. */
  setWetMix(wet: number): void
  /**
   * Duck the bed under her voice, by a couple of dB. Never a mute.
   *
   * The only influence agent speech is permitted over the ambient chain. The
   * sources themselves start when the session arms and stop when it ends (§1).
   */
  duck(active: boolean): void
}

/**
 * Layer 4 of the persona, applied to the graph.
 *
 * The scene preset carries the physics of the space; the persona's room layer
 * is the per-character trim on top, which is what the dev panel edits live.
 */
export function applyRoomConfig(room: RoomControls, config: RoomConfig): void {
  room.setAmbientLevelDb(config.bedDb)
  room.setWetMix(config.reverbWet)
  room.setOneShotInterval([
    config.oneShotIntervalMs[0] / 1000,
    config.oneShotIntervalMs[1] / 1000,
  ])
}
