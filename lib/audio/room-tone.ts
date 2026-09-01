/**
 * Room tone, without the convolver (§02, `M3-PLAN.md` Phase D — "room tone,
 * once the beds from Phase C exist").
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM `engine.ts` ─────────────────────
 *
 * `docs/AUDIO.md` records that the procedural room was switched off because
 * convolution made her harder to understand on laptop speakers, and that
 * intelligibility beats atmosphere. That decision is right and this file does
 * not touch it.
 *
 * But the switch is coarser than the decision was. `sceneForRoom` returns null
 * when acoustics are off, both adapters then skip building a `Room` at all,
 * and the ambient bed goes silent with the convolver — even though AUDIO.md's
 * own graph diagram shows them as **two independent chains** and says the only
 * thing her voice does to the bed is duck it. The bed was collateral damage.
 *
 * So: the bed, on its own. No convolver, no wet send, and — the important part —
 * **no voice input node at all**. There is nothing here her audio can be routed
 * through, which is what makes it impossible for this to undo the
 * intelligibility fix. AUDIO.md already anticipated this shape: *"Recorded room
 * beds arrive as audio files later and are a different mechanism from this
 * one."* This is that mechanism, synthesised rather than recorded.
 *
 * ── IT REUSES THE AUTHORED BEDS ──────────────────────────────────────────
 *
 * Nothing is re-specified. `SCENES` in `scenes.ts` already carries a tuned
 * `AmbientBed` per scenario — layer kinds, band limits, relative levels,
 * one-shot weights and the master dBFS — reviewed in a pull request the way
 * rule 8 requires. This plays those numbers. A new scene is still a config row.
 */

import { dbToGain } from './impulse'
import { nextIntervalSeconds, pickOneShot } from './schedule'
import { sceneFor } from './scenes'
import type { AmbientBed, AmbientLayer, OneShot } from './types'

/**
 * Band limits per layer kind, for the synthesised version.
 *
 * The authored `lowCutHz`/`highCutHz` win wherever they are given; these are
 * the fallbacks for a layer that did not bother, and they are what makes a
 * `crowd-wash` sound unlike a `hvac-hum` when neither states a band.
 */
const LAYER_BANDS: Record<AmbientLayer['kind'], { low: number; high: number }> = {
  'hvac-hum': { low: 40, high: 220 },
  'traffic-through-glass': { low: 60, high: 700 },
  'room-rumble': { low: 30, high: 160 },
  'crowd-wash': { low: 180, high: 2600 },
  'platform-wind': { low: 80, high: 1400 },
}

/**
 * One-shots, as short synthesised gestures rather than samples.
 *
 * Each is a centre frequency, a decay and a noisiness — enough for a page turn
 * to read as paper and a glass clink to read as glass, without eight audio
 * files. They are deliberately impressionistic: AUDIO.md's own rule is that
 * anything too distinctive becomes obvious on the second pass.
 */
const ONE_SHOT_VOICES: Record<OneShot['kind'], { centre: number; decay: number; noise: number }> = {
  'page-turn': { centre: 2400, decay: 0.18, noise: 1 },
  'floorboard-creak': { centre: 320, decay: 0.26, noise: 0.6 },
  'distant-door': { centre: 160, decay: 0.34, noise: 0.5 },
  'book-set-down': { centre: 220, decay: 0.2, noise: 0.45 },
  'shelf-shift': { centre: 480, decay: 0.3, noise: 0.7 },
  'glass-clink': { centre: 3200, decay: 0.24, noise: 0.15 },
  'chair-scrape': { centre: 700, decay: 0.32, noise: 0.85 },
  'distant-announcement': { centre: 900, decay: 0.4, noise: 0.55 },
}

/** Seconds. The bed fades in rather than snapping on with her first word. */
const FADE_SECONDS = 1.6

export interface RoomToneOptions {
  /** 0-1, from the profile. Multiplies the bed's authored master level. */
  volume?: number
  rng?: () => number
  destination?: AudioNode
}

/**
 * The bed for a scene id, whatever the convolver switch says.
 *
 * Deliberately not `sceneForRoom`, which answers null while acoustics are off.
 * That function is about whether her voice goes through a room; this is about
 * whether the room makes any sound of its own, and they are different
 * questions that were being answered by one flag.
 */
export function bedFor(sceneId: string): AmbientBed | null {
  return sceneFor(sceneId)?.ambient ?? null
}

export class RoomTone {
  private readonly ctx: AudioContext
  private readonly rng: () => number
  private readonly destination: AudioNode
  private readonly bed: AmbientBed
  private readonly master: GainNode
  private readonly volume: number
  private sources: AudioBufferSourceNode[] = []
  private timer: number | null = null
  private stopped = false

  constructor(ctx: AudioContext, bed: AmbientBed, options: RoomToneOptions = {}) {
    this.ctx = ctx
    this.bed = bed
    this.rng = options.rng ?? Math.random
    this.destination = options.destination ?? ctx.destination
    this.volume = Math.max(0, Math.min(1, options.volume ?? 1))
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(this.destination)
  }

  /** Two seconds of band-limited noise, looped. Long enough not to pulse. */
  private noiseBuffer(seconds = 2): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = this.rng() * 2 - 1
    return buffer
  }

  start(): void {
    if (this.stopped) return
    const masterGain = dbToGain(this.bed.masterDb) * this.volume
    for (const layer of this.bed.layers) {
      const band = LAYER_BANDS[layer.kind]
      const source = this.ctx.createBufferSource()
      source.buffer = this.noiseBuffer()
      source.loop = true

      const high = this.ctx.createBiquadFilter()
      high.type = 'highpass'
      high.frequency.value = layer.lowCutHz ?? band.low

      const low = this.ctx.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.value = layer.highCutHz ?? band.high

      const gain = this.ctx.createGain()
      gain.gain.value = dbToGain(layer.levelDb)

      source.connect(high)
      high.connect(low)
      low.connect(gain)
      gain.connect(this.master)
      source.start()
      this.sources.push(source)
    }

    // Fade in. A bed that snaps on is a bed the user notices, and a room tone
    // that gets noticed has failed at the only thing it does.
    const now = this.ctx.currentTime
    this.master.gain.setValueAtTime(0, now)
    this.master.gain.linearRampToValueAtTime(masterGain, now + FADE_SECONDS)

    this.scheduleOneShot()
  }

  private scheduleOneShot(): void {
    if (this.stopped || this.bed.oneShots.length === 0) return
    const seconds = nextIntervalSeconds(this.bed.oneShotIntervalSeconds, this.rng)
    this.timer = (globalThis.setTimeout as typeof setTimeout)(() => {
      this.fireOneShot()
      this.scheduleOneShot()
    }, seconds * 1000) as unknown as number
  }

  private fireOneShot(): void {
    if (this.stopped) return
    const shot = pickOneShot(this.bed.oneShots, this.rng)
    if (!shot) return
    const voice = ONE_SHOT_VOICES[shot.kind]
    try {
      const now = this.ctx.currentTime
      const source = this.ctx.createBufferSource()
      source.buffer = this.noiseBuffer(voice.decay + 0.05)

      const band = this.ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = voice.centre
      // A noisier gesture is a wider band. A clink is nearly a tone; a chair
      // scraping is nearly all noise.
      band.Q.value = 0.6 + (1 - voice.noise) * 7

      const gain = this.ctx.createGain()
      const peak = dbToGain(this.bed.masterDb + shot.levelDb) * this.volume
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.decay)

      source.connect(band)
      band.connect(gain)
      gain.connect(this.master)
      source.start(now)
      source.stop(now + voice.decay + 0.05)
    } catch {
      // A missed one-shot is a quieter room, not a broken rep.
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.timer !== null) {
      ;(globalThis.clearTimeout as typeof clearTimeout)(this.timer)
      this.timer = null
    }
    try {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.linearRampToValueAtTime(0, now + 0.4)
      for (const source of this.sources) source.stop(now + 0.45)
    } catch {
      // The context is already gone. Nothing to wind down.
    }
    this.sources = []
  }
}
