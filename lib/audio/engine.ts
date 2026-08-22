/**
 * The room.
 *
 * Builds the ambient bed and the reverb send in WebAudio, entirely
 * procedurally — no sample assets, so a scene is a config row and tuning is a
 * number rather than a trip to a sound library.
 *
 * Two jobs:
 *   1. AMBIENT BED — a featureless noise floor, plus randomly scheduled
 *      one-shots that carry all the character.
 *   2. REVERB SEND — places her voice in the room. Because the bookshop is
 *      quiet there is nothing masking a dry voice, so this matters MORE here
 *      than it would in a cafe, not less.
 *
 * Everything the brief asked to be tunable is a live setter: ambient level,
 * one-shot frequency, and reverb wet/dry.
 */

import { buildImpulseResponse, dbToGain } from './impulse'
import { nextIntervalSeconds, pickOneShot } from './schedule'
import type { AmbientLayer, OneShot, RoomControls, SceneAcoustics } from './types'

export interface RoomHandles {
  /** Connect her voice here. */
  input: GainNode
  /** Connect this to the destination. */
  output: GainNode
}

export interface RoomOptions {
  scene: SceneAcoustics
  rng?: () => number
}

export class Room implements RoomControls {
  private readonly ctx: AudioContext
  private readonly rng: () => number
  private scene: SceneAcoustics

  private readonly input: GainNode
  private readonly output: GainNode
  private readonly dryGain: GainNode
  private readonly wetGain: GainNode
  private readonly convolver: ConvolverNode

  private readonly ambientBus: GainNode
  private readonly ambientSources: AudioBufferSourceNode[] = []
  private readonly ambientGains: GainNode[] = []
  private oneShotTimer: ReturnType<typeof setTimeout> | null = null
  private noiseBuffer: AudioBuffer | null = null
  private running = false

  constructor(ctx: AudioContext, options: RoomOptions) {
    this.ctx = ctx
    this.scene = options.scene
    this.rng = options.rng ?? Math.random

    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.dryGain = ctx.createGain()
    this.wetGain = ctx.createGain()
    this.convolver = ctx.createConvolver()
    this.ambientBus = ctx.createGain()

    this.convolver.normalize = false
    this.loadImpulse()

    // Her voice splits dry/wet and recombines at the output.
    this.input.connect(this.dryGain).connect(this.output)
    this.input.connect(this.convolver).connect(this.wetGain).connect(this.output)

    // The bed sits alongside, never through the reverb: it is already the room.
    this.ambientBus.connect(this.output)

    this.setWetMix(this.scene.reverb.wetMix)
    this.ambientBus.gain.value = dbToGain(this.scene.ambient.masterDb)
  }

  get handles(): RoomHandles {
    return { input: this.input, output: this.output }
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
    buffer.copyToChannel(left, 0)
    buffer.copyToChannel(right, 1)
    this.convolver.buffer = buffer
  }

  /** 0-1. Bookshop wants 0.08-0.12; past that it reads as an effect. */
  setWetMix(wet: number): void {
    const clamped = Math.max(0, Math.min(1, wet))
    this.wetGain.gain.value = clamped
    // Constant-power-ish: keeps perceived level steady while tuning by ear.
    this.dryGain.gain.value = Math.sqrt(1 - clamped * clamped)
  }

  get wetMix(): number {
    return this.wetGain.gain.value
  }

  /* ------------------------------------------------------------ *
   * Ambient bed
   * ------------------------------------------------------------ */

  /** Ten seconds of noise, looped. Featureless, so looping is inaudible. */
  private ensureNoise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const seconds = 10
    const frames = this.ctx.sampleRate * seconds
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)

    // Brownian-ish noise: much closer to HVAC and traffic than white noise,
    // which sounds like tape hiss and reads instantly as fake.
    let last = 0
    for (let i = 0; i < frames; i += 1) {
      const white = this.rng() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
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

    const gain = this.ctx.createGain()
    gain.gain.value = dbToGain(layer.levelDb)
    node.connect(gain).connect(this.ambientBus)

    // Stagger start offsets so two layers never correlate.
    source.start(0, this.rng() * 8)
    this.ambientSources.push(source)
    this.ambientGains.push(gain)
  }

  start(): void {
    if (this.running) return
    this.running = true
    for (const layer of this.scene.ambient.layers) this.buildLayer(layer)
    this.scheduleOneShot()
  }

  /* ------------------------------------------------------------ *
   * One-shots
   * ------------------------------------------------------------ */

  private scheduleOneShot(): void {
    if (!this.running) return
    const seconds = nextIntervalSeconds(this.scene.ambient.oneShotIntervalSeconds, this.rng)
    this.oneShotTimer = setTimeout(() => {
      const shot = pickOneShot(this.scene.ambient.oneShots, this.rng)
      if (shot) this.playOneShot(shot)
      this.scheduleOneShot()
    }, seconds * 1000)
  }

  /**
   * Procedural one-shots. Each is a short noise burst shaped by a filter and an
   * envelope — enough to read as "something happened over there" without any
   * sample being recognisable on repeat.
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

    // One-shots go through the room, unlike the bed: they happen in here.
    source.connect(filter).connect(gain).connect(this.input)
    source.start(now, this.rng() * 5, spec.attack + spec.decay + 0.05)
  }

  /** Live tuning. Seconds, [min, max]. */
  setOneShotInterval(range: [number, number]): void {
    this.scene = {
      ...this.scene,
      ambient: { ...this.scene.ambient, oneShotIntervalSeconds: range },
    }
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
    this.ambientGains.length = 0
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
