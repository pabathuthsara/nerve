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
  /** Level in dBFS. Bookshop bed sits around -40, far quieter than a cafe. */
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
  levelDb: number
}

export interface AmbientBed {
  /** Continuous, featureless layers. */
  layers: AmbientLayer[]
  /** Distinctive events, scheduled randomly so they never form a pattern. */
  oneShots: OneShot[]
  /** Seconds. A one-shot fires at a uniform random point in this range. */
  oneShotIntervalSeconds: [min: number, max: number]
  /** Master trim for the whole bed, dB. Exposed for tuning by ear. */
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
  /** dB trim on the whole ambient bed. */
  setAmbientLevelDb(db: number): void
  /** Seconds, [min, max], between randomly scheduled one-shots. */
  setOneShotInterval(range: [number, number]): void
  /** 0-1 wet share on her voice. */
  setWetMix(wet: number): void
}
