/**
 * The sound kit (§02, `M3-PLAN.md` Phase D).
 *
 * Six sounds, and they are **synthesised rather than sampled**. That is a
 * content decision as much as a technical one: rule 8 says content is authored
 * in the repo and reviewed in a pull request, and a table of frequencies and
 * envelopes is reviewable in a diff in a way that six binary files are not.
 * It also means the kit ships at zero bytes over the wire, which matters on a
 * screen that is already opening a WebRTC session.
 *
 * ── WHAT MAKES THEM ONE KIT ──────────────────────────────────────────────
 *
 * Every voice in it is built from the same two ingredients — a sine partial
 * and a short exponential decay — and every pitch is drawn from one interval
 * set: a root at 392 Hz (G4) with its fifth, octave and minor third. Nothing
 * here is a click sample or a UI "pop". The rep is a conversation with a
 * person, and a kit made of pitched tones sits under that without sounding
 * like a phone notification arriving in the middle of it.
 *
 * The countdown is the clearest case. `tick` is the root; `go` is the octave
 * above it. Three ticks and a resolution is a phrase, and a phrase is what
 * makes 3·2·1 feel like a start rather than three identical beeps.
 *
 * ── EVERY SOUND IS UNDER 400 ms ──────────────────────────────────────────
 *
 * §02's rule, asserted in `kit.test.ts` rather than trusted. A rep is three
 * minutes of somebody straining to hear a stranger, and a sound that rings on
 * over her first syllable is worse than no sound at all.
 */

/** One partial of one sound. */
export interface Partial {
  /** Hz. */
  frequency: number
  /** Peak gain, 0-1, before the kit's master level. */
  gain: number
  /** Seconds. When this partial starts, relative to the sound. */
  delay: number
  /** Seconds. Exponential decay to silence. */
  decay: number
  type: OscillatorType
}

export interface SoundSpec {
  /** What it is for, in the product's own words. */
  role: string
  partials: readonly Partial[]
}

/** G4. Everything else is an interval from here. */
const ROOT = 392

/** §02: nothing in the kit may ring for longer than this. */
export const MAX_DURATION_SECONDS = 0.4

export type SoundName = 'tick' | 'go' | 'wrap' | 'exit' | 'reveal' | 'land'

export const KIT: Record<SoundName, SoundSpec> = {
  /**
   * One count of the armed countdown. Dry, short, unmistakably a clock.
   */
  tick: {
    role: 'One count of 3·2·1, before a rep opens.',
    partials: [{ frequency: ROOT, gain: 0.16, delay: 0, decay: 0.07, type: 'sine' }],
  },
  /**
   * The resolution the three ticks were leading to. An octave above the tick,
   * with the fifth under it so it lands rather than merely sounding.
   */
  go: {
    role: 'The rep opens. She can hear you now.',
    partials: [
      { frequency: ROOT * 2, gain: 0.2, delay: 0, decay: 0.26, type: 'sine' },
      { frequency: ROOT * 1.5, gain: 0.1, delay: 0.012, decay: 0.3, type: 'sine' },
    ],
  },
  /**
   * Thirty seconds out (§03's wrap-up). Deliberately the quietest thing in the
   * kit and deliberately not urgent — §05 forbids coaching mid-rep, and a
   * sound that says "hurry" is coaching. It marks time and nothing else.
   */
  wrap: {
    role: 'Thirty seconds left. A marker, never a warning.',
    partials: [{ frequency: ROOT * 1.5, gain: 0.075, delay: 0, decay: 0.2, type: 'sine' }],
  },
  /**
   * She has gone. A minor third below the root, falling — the only interval in
   * the kit that resolves downward, because it is the only moment that should.
   */
  exit: {
    role: 'The rep is over.',
    partials: [
      { frequency: ROOT * 0.84, gain: 0.15, delay: 0, decay: 0.34, type: 'sine' },
      // 0.05 + 0.36 was 410ms and `kit.test.ts` refused it. The rule is §02's,
      // not a preference, so the sound moved rather than the bound.
      { frequency: ROOT * 0.5, gain: 0.09, delay: 0.05, decay: 0.34, type: 'sine' },
    ],
  },
  /** One sub-score arriving on the scorecard. Almost subliminal by design. */
  reveal: {
    role: 'One sub-score lands during the staged reveal.',
    partials: [{ frequency: ROOT * 2, gain: 0.05, delay: 0, decay: 0.05, type: 'sine' }],
  },
  /** The composite, once it has finished counting. The kit's only chord. */
  land: {
    role: 'The composite finishes counting up.',
    partials: [
      { frequency: ROOT, gain: 0.13, delay: 0, decay: 0.32, type: 'sine' },
      { frequency: ROOT * 1.5, gain: 0.1, delay: 0.02, decay: 0.34, type: 'sine' },
      { frequency: ROOT * 2, gain: 0.07, delay: 0.04, decay: 0.3, type: 'sine' },
    ],
  },
}

/** How long a sound rings, start to silence. */
export function durationOf(spec: SoundSpec): number {
  return Math.max(...spec.partials.map((partial) => partial.delay + partial.decay))
}

/**
 * The kit, playing.
 *
 * One `AudioContext`, created on the first sound rather than at import — a
 * context constructed before a user gesture starts suspended, and a suspended
 * context that nobody resumes is a kit that is silent for the whole session.
 *
 * Nothing here throws. A browser with no Web Audio, a context that will not
 * resume, an autoplay policy that refuses — all of them mean the rep happens
 * without sound, which is a rep. §05 does not allow a decoration to interrupt
 * a conversation.
 */
export class SoundKit {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private enabled = true

  constructor(enabled = true) {
    this.enabled = enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Build the context. Safe to call repeatedly; only the first does work.
   *
   * Call it from inside a click handler once per session — pressing Start is
   * the natural one — so the context is unlocked before the countdown needs it.
   */
  prime(): void {
    if (!this.enabled || this.ctx || typeof window === 'undefined') return
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = 1
      master.connect(ctx.destination)
      this.ctx = ctx
      this.master = master
    } catch {
      this.ctx = null
      this.master = null
    }
  }

  /**
   * The context, once primed, so the room bed can share it.
   *
   * Two `AudioContext`s on one page is how a phone runs out of them, and the
   * kit is always built first — it plays the countdown that the bed waits for.
   * Null until `prime()` has succeeded.
   */
  context(): AudioContext | null {
    return this.ctx
  }

  play(name: SoundName): void {
    if (!this.enabled) return
    this.prime()
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    try {
      if (ctx.state === 'suspended') void ctx.resume()
      const now = ctx.currentTime
      for (const partial of KIT[name].partials) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = partial.type
        osc.frequency.value = partial.frequency
        const start = now + partial.delay
        // Ramp up over 4ms rather than starting at full gain: a step in the
        // waveform is a click, and a click is the one sound in a kit nobody
        // chose to put there.
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(partial.gain, start + 0.004)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + partial.decay)
        osc.connect(gain)
        gain.connect(master)
        osc.start(start)
        osc.stop(start + partial.decay + 0.02)
      }
    } catch {
      // As above: a missing sound is never worth an exception.
    }
  }

  dispose(): void {
    try {
      void this.ctx?.close()
    } catch {
      // Nothing to do; the page is going away regardless.
    }
    this.ctx = null
    this.master = null
  }
}
