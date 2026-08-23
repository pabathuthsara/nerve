/**
 * The room.
 *
 * Builds the ambient bed and the reverb send in WebAudio, entirely
 * procedurally — no sample assets, so a scene is a config row and tuning is a
 * number rather than a trip to a sound library.
 *
 * ROUND 10 REBUILD. The bed used to be mixed into her output bus, which meant
 * it was only audible while she was talking. That is backwards: the bed exists
 * to fill the silence BETWEEN turns, where dead air reads as "the app is
 * broken". The two chains are now completely independent —
 *
 *     ambient layers -> ambientBus -> ambientDuck ------------> destination
 *     one-shots ------> shotBus ----^         \-> reverbSend --\
 *     her voice -> input -> dry ------------------------------> destination
 *                       \-> wetSend -> convolver -> reverbOut -> destination
 *
 * — and the ambient sources are started once when the session ARMS and stopped
 * once when it ENDS. Nothing in the agent speech path can start, stop, gate or
 * mute them. The only thing her speech does is DUCK the bed by a couple of dB,
 * which is a gain ramp on a chain that keeps running throughout.
 *
 * One-shots share the convolver because they genuinely happen in the room, but
 * they reach the destination through the ambient chain, not through hers.
 */

import { buildImpulseResponse, dbToGain } from './impulse'
import { nextIntervalSeconds, pickOneShot } from './schedule'
import type { AmbientLayer, OneShot, RoomControls, SceneAcoustics } from './types'

export interface RoomHandles {
  /**
   * Connect her voice here.
   *
   * There is deliberately no `output`. The room wires itself to the
   * destination, because an ambient bed that a caller has to remember to
   * connect is an ambient bed that eventually stops being connected — which is
   * precisely the bug this rebuild fixes.
   */
  input: GainNode
}

export interface RoomOptions {
  scene: SceneAcoustics
  /** Defaults to `ctx.destination`. Injected for tests and offline rendering. */
  destination?: AudioNode
  rng?: () => number
  /**
   * Whether to play the ambient bed and its one-shots. Default true.
   *
   * False builds the reverb path and nothing else, so her voice still sits in
   * the room while the room itself stays silent. Wired from
   * `persona.room.bed === null`.
   */
  ambient?: boolean
}

/** Duck depth while she speaks. Deep enough to clear her voice, shallow
 *  enough that the room is plainly still there. Never a mute. */
const DUCK_DB = -2.5
/** Fast enough not to collide with her first syllable. */
const DUCK_ATTACK_SECONDS = 0.15
/** Slower than the attack, so the room swells back rather than snapping. */
const DUCK_RELEASE_SECONDS = 0.4

/** How much of a one-shot goes to the reverb. They are in the room with her. */
const ONE_SHOT_REVERB_SEND = 0.35

export class Room implements RoomControls {
  private readonly ctx: AudioContext
  private readonly rng: () => number
  private readonly destination: AudioNode
  private scene: SceneAcoustics

  /** Her voice. */
  private readonly input: GainNode
  private readonly dryGain: GainNode
  private readonly wetSend: GainNode
  private readonly convolver: ConvolverNode
  private readonly reverbOut: GainNode

  /** The bed, on its own path to the speakers. */
  private readonly ambientBus: GainNode
  private readonly ambientDuck: GainNode
  private readonly shotBus: GainNode
  private readonly shotReverbSend: GainNode

  private readonly ambientSources: AudioBufferSourceNode[] = []
  private readonly ambientEnabled: boolean
  private oneShotTimer: ReturnType<typeof setTimeout> | null = null
  private noiseBuffer: AudioBuffer | null = null
  private running = false
  private duckedNow = false

  constructor(ctx: AudioContext, options: RoomOptions) {
    this.ctx = ctx
    this.scene = options.scene
    this.rng = options.rng ?? Math.random
    this.destination = options.destination ?? ctx.destination

    this.input = ctx.createGain()
    this.dryGain = ctx.createGain()
    this.wetSend = ctx.createGain()
    this.convolver = ctx.createConvolver()
    this.reverbOut = ctx.createGain()

    this.ambientEnabled = options.ambient ?? true
    this.ambientBus = ctx.createGain()
    this.ambientDuck = ctx.createGain()
    this.shotBus = ctx.createGain()
    this.shotReverbSend = ctx.createGain()

    this.convolver.normalize = false
    this.loadImpulse()

    // HER CHAIN. Dry straight out; wet through the shared convolver.
    this.input.connect(this.dryGain).connect(this.destination)
    this.input.connect(this.wetSend).connect(this.convolver)
    this.convolver.connect(this.reverbOut).connect(this.destination)

    // THE BED. Its own path to the speakers, touching nothing of hers.
    this.ambientBus.connect(this.ambientDuck).connect(this.destination)

    // One-shots sit in the bed's chain but also feed the room, because a page
    // turn four feet away really does have the room on it.
    this.shotBus.connect(this.ambientBus)
    this.shotBus.connect(this.shotReverbSend).connect(this.convolver)
    this.shotReverbSend.gain.value = ONE_SHOT_REVERB_SEND

    this.reverbOut.gain.value = 1
    this.ambientDuck.gain.value = 1
    this.setWetMix(this.scene.reverb.wetMix)
    this.ambientBus.gain.value = dbToGain(this.scene.ambient.masterDb)
  }

  get handles(): RoomHandles {
    return { input: this.input }
  }

  /* ------------------------------------------------------------ *
   * Reverb
   * ------------------------------------------------------------ */

  private loadImpulse(): void {
    const { left, right, frames } = buildImpulseResponse(
      this.scene.reverb,
      this.ctx.sampleRate,
      this.rng,
    )
    const buffer = this.ctx.createBuffer(2, frames, this.ctx.sampleRate)
    buffer.getChannelData(0).set(left)
    buffer.getChannelData(1).set(right)
    this.convolver.buffer = buffer
  }

  /** 0-1. Bookshop wants 0.08-0.12; past that it reads as an effect. */
  setWetMix(wet: number): void {
    const clamped = Math.max(0, Math.min(1, wet))
    this.wetSend.gain.value = clamped
    // Constant-power-ish: keeps perceived level steady while tuning by ear.
    this.dryGain.gain.value = Math.sqrt(1 - clamped * clamped)
    this.scene = { ...this.scene, reverb: { ...this.scene.reverb, wetMix: clamped } }
  }

  get wetMix(): number {
    return this.scene.reverb.wetMix
  }

  /* ------------------------------------------------------------ *
   * Ambient bed
   * ------------------------------------------------------------ */

  /**
   * Ten seconds of noise, looped. Featureless, so looping is inaudible.
   *
   * NORMALISED TO UNITY RMS, and that matters more than it looks. Brownian
   * noise has no predictable level — it comes out of a leaky integrator whose
   * amplitude depends on the step size and the smoothing constant, and it
   * measured -13.8 dBFS here. Without normalisation that unknown offset sits
   * underneath every dB value in `scenes.ts`, so none of those numbers mean
   * what they say and tuning one by ear moves the others.
   *
   * With it, `dbToGain(levelDb)` produces exactly `levelDb` dBFS.
   */
  private ensureNoise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const seconds = 10
    const frames = Math.floor(this.ctx.sampleRate * seconds)
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)

    // Brownian-ish noise: much closer to HVAC and traffic than white noise,
    // which sounds like tape hiss and reads instantly as fake.
    let last = 0
    let sumSquares = 0
    for (let i = 0; i < frames; i += 1) {
      const white = this.rng() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last
      sumSquares += last * last
    }

    const rms = Math.sqrt(sumSquares / frames)
    if (rms > 0) {
      const scale = 1 / rms
      for (let i = 0; i < frames; i += 1) data[i] = (data[i] ?? 0) * scale
    }

    this.noiseBuffer = buffer
    return buffer
  }

  private buildLayer(layer: AmbientLayer): void {
    const source = this.ctx.createBufferSource()
    source.buffer = this.ensureNoise()
    source.loop = true

    let node: AudioNode = source

    if (layer.lowCutHz !== undefined) {
      const highpass = this.ctx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = layer.lowCutHz
      node = node.connect(highpass)
    }
    if (layer.highCutHz !== undefined) {
      const lowpass = this.ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      // Traffic heard through glass has essentially no high end; this is what
      // makes it read as "outside" rather than "in the room".
      lowpass.frequency.value = layer.highCutHz
      node = node.connect(lowpass)
    }

    // Relative to the bed master, which carries the absolute level. Two
    // absolute dB values in series is what put the bed at -95 dBFS.
    const gain = this.ctx.createGain()
    gain.gain.value = dbToGain(layer.levelDb)
    node.connect(gain).connect(this.ambientBus)

    // Stagger start offsets so two layers never correlate.
    source.start(0, this.rng() * 8)
    this.ambientSources.push(source)
  }

  /**
   * Arm the room.
   *
   * Called once, when the session arms — NOT when she starts speaking. From
   * here the bed runs continuously until `stop()`, whatever the conversation
   * does. Idempotent, so a second call cannot restart the sources and produce
   * the phasing that a restarted loop causes.
   */
  arm(): void {
    if (this.running) return
    this.running = true
    // No sources and no timer when the bed is off — not silent sources. A
    // muted layer is still a graph that can be un-muted by a stray dB trim,
    // and a scheduled one-shot is still a timer that eventually fires.
    if (!this.ambientEnabled) return
    for (const layer of this.scene.ambient.layers) this.buildLayer(layer)
    this.scheduleOneShot()
  }

  /** Retained name for existing callers. Same thing. */
  start(): void {
    this.arm()
  }

  get isRunning(): boolean {
    return this.running
  }

  /* ------------------------------------------------------------ *
   * Ducking
   * ------------------------------------------------------------ */

  /**
   * Duck the bed under her voice. Never mute it.
   *
   * This is the ONLY thing agent speech is allowed to do to the ambient chain.
   * Muting would reintroduce the original bug in a subtler form — the room
   * would vanish every time she spoke, which is the opposite of what the bed
   * is for.
   */
  duck(active: boolean): void {
    if (active === this.duckedNow) return
    this.duckedNow = active

    const now = this.ctx.currentTime
    const target = active ? dbToGain(DUCK_DB) : 1
    const seconds = active ? DUCK_ATTACK_SECONDS : DUCK_RELEASE_SECONDS
    const param = this.ambientDuck.gain

    // Ramp from wherever it actually is, so a duck landing mid-release does not
    // jump. `value` is the rendered value, which is what the ear last heard.
    try {
      param.cancelScheduledValues(now)
      param.setValueAtTime(param.value, now)
      param.linearRampToValueAtTime(target, now + seconds)
    } catch {
      // Some environments reject scheduling on a closed context. The bed
      // staying un-ducked is a far smaller problem than a thrown exception
      // tearing down the session.
      param.value = target
    }
  }

  get ducked(): boolean {
    return this.duckedNow
  }

  /* ------------------------------------------------------------ *
   * One-shots
   * ------------------------------------------------------------ */

  private scheduleOneShot(): void {
    if (!this.running) return
    const seconds = nextIntervalSeconds(this.scene.ambient.oneShotIntervalSeconds, this.rng)
    this.oneShotTimer = setTimeout(() => {
      if (!this.running) return
      const shot = pickOneShot(this.scene.ambient.oneShots, this.rng)
      if (shot) this.playOneShot(shot)
      this.scheduleOneShot()
    }, seconds * 1000)
  }

  /**
   * Procedural one-shots. Each is a short noise burst shaped by a filter and an
   * envelope — enough to read as "something happened over there" without any
   * sample being recognisable on repeat.
   *
   * Never in the loop. A page turn heard twice stops being scenery and starts
   * being a recording, which is worse for immersion than having no page turn.
   */
  private playOneShot(shot: OneShot): void {
    const now = this.ctx.currentTime
    const spec = ONE_SHOT_SHAPES[shot.kind]

    const source = this.ctx.createBufferSource()
    source.buffer = this.ensureNoise()

    const filter = this.ctx.createBiquadFilter()
    filter.type = spec.filter
    filter.frequency.value = spec.frequencyHz
    filter.Q.value = spec.q

    const gain = this.ctx.createGain()
    const peak = dbToGain(shot.levelDb)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + spec.attack)
    gain.gain.exponentialRampToValueAtTime(peak * 0.001, now + spec.attack + spec.decay)

    // Into the bed's chain, never hers.
    source.connect(filter).connect(gain).connect(this.shotBus)
    source.start(now, this.rng() * 5, spec.attack + spec.decay + 0.05)
  }

  /** Live tuning. Seconds, [min, max]. */
  setOneShotInterval(range: [number, number]): void {
    this.scene = {
      ...this.scene,
      ambient: { ...this.scene.ambient, oneShotIntervalSeconds: range },
    }
  }

  get oneShotIntervalSeconds(): readonly [number, number] {
    return this.scene.ambient.oneShotIntervalSeconds
  }

  /** Live tuning. dB trim on the whole bed. */
  setAmbientLevelDb(db: number): void {
    this.ambientBus.gain.value = dbToGain(db)
    this.scene = { ...this.scene, ambient: { ...this.scene.ambient, masterDb: db } }
  }

  get ambientLevelDb(): number {
    return this.scene.ambient.masterDb
  }

  get sceneId(): string {
    return this.scene.id
  }

  /** Ends with the session, and only with the session. */
  stop(): void {
    this.running = false
    if (this.oneShotTimer) clearTimeout(this.oneShotTimer)
    this.oneShotTimer = null
    for (const source of this.ambientSources) {
      try {
        source.stop()
      } catch {
        /* already stopped */
      }
    }
    this.ambientSources.length = 0
  }
}

interface ShotShape {
  filter: BiquadFilterType
  frequencyHz: number
  q: number
  attack: number
  decay: number
}

/** Rough physical intuition per event; all meant to be tuned by ear. */
const ONE_SHOT_SHAPES: Record<OneShot['kind'], ShotShape> = {
  // Dry paper: bright, very short, no body.
  'page-turn': { filter: 'bandpass', frequencyHz: 3200, q: 1.2, attack: 0.004, decay: 0.09 },
  // Timber under load: low, resonant, slower.
  'floorboard-creak': { filter: 'bandpass', frequencyHz: 320, q: 6, attack: 0.02, decay: 0.35 },
  // A dull knock with some room behind it.
  'distant-door': { filter: 'lowpass', frequencyHz: 500, q: 0.8, attack: 0.005, decay: 0.28 },
  'book-set-down': { filter: 'lowpass', frequencyHz: 900, q: 0.9, attack: 0.003, decay: 0.14 },
  'shelf-shift': { filter: 'bandpass', frequencyHz: 700, q: 3, attack: 0.01, decay: 0.2 },
  'glass-clink': { filter: 'bandpass', frequencyHz: 5200, q: 8, attack: 0.002, decay: 0.25 },
  'chair-scrape': { filter: 'bandpass', frequencyHz: 1400, q: 2, attack: 0.02, decay: 0.4 },
  'distant-announcement': { filter: 'bandpass', frequencyHz: 900, q: 1.5, attack: 0.05, decay: 0.8 },
}
