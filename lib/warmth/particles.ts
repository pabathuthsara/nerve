/**
 * The small sound in front of her reply (PERSONA-REALISM-REPORT R4).
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────
 *
 * A person who has heard you makes a noise before they have composed an
 * answer. "Oh." is a change of state (Heritage 1984) — something he said
 * landed. "Mm." is receipt. "Well…" and "Hm." go in front of an answer the
 * speaker would rather not give (Pomerantz 1984), which is what reluctance
 * sounds like from the inside. None of those needs a language model: they are
 * the same handful of sounds from everybody, and they come out while the
 * sentence is still being built.
 *
 * So they are rendered ONCE per voice, at casting time
 * (`scripts/render-particles.ts`), and played by the browser a beat after he
 * stops, while the writer is still working. On the turns that get one, the
 * silence between him and her is filled by her — which is the difference
 * between a stranger thinking and a machine loading.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────
 *
 * Not `HUMANNESS-PLAN.md` item 10's backchannel. That one is a noise made
 * DURING his turn, and it waits until echo cancellation has been proven on
 * laptop speakers, because her "mm-hm" leaking into the microphone would read
 * as a barge-in. This plays only after he has conceded the turn.
 *
 * Not an instruction. The writer is never asked for fillers (report §12: "Do
 * not ask the model for fillers in the directive") — a particle is audio, and
 * the writer never hears it. What it does get is the particle's text, so it can
 * take its own "Mm," off the front of the line (`withoutParticle`).
 *
 * ── THE RULES, AND WHY EACH ONE ──────────────────────────────────────────
 *
 *   at most one turn in three     a tic is worse than none
 *   never two turns running       same reason, closer together
 *   never on his opener           a hello is answered with a hello
 *   never on the closing turn     the wind-down is one decision, alone
 *   never on a dead end           her reply there is already a grunt
 *   never on a misheard turn      she did not hear anything to react to
 *   never when she may ask        "Oh." in front of a question she then asks
 *                                 is the assistant's "Great question!"
 *
 * Pure. The session holds the counters and the adapter holds the audio.
 */

import { bandFor, type WarmthBand } from './bands'

/** A particle, as the adapter plays it and the transcript records it. */
export interface Particle {
  /** Stable id, and the file name under `public/particles/<voice>/`. */
  id: ParticleId
  /** What the transcript records, and what `withoutParticle` strips. */
  text: string
}

export type ParticleId = 'oh' | 'mm' | 'yeah' | 'hm' | 'well'

/**
 * The whole catalogue. Rendered for every dating voice; five syllables in
 * all. There is no "Ha." on purpose: in front of a line that is not a response
 * to something funny it is a laugh at nothing, and her laugh is a separate,
 * rationed permission (`WarmthSession.decideExpression`).
 *
 * `text` is also the exact string sent for synthesis, which is why it is
 * spelled the way the synthesiser says it best rather than the way a
 * transcript would — "Mm." and not "Mhm." (which v3 reads as a word).
 */
export const PARTICLES: Record<ParticleId, Particle> = {
  oh: { id: 'oh', text: 'Oh.' },
  mm: { id: 'mm', text: 'Mm.' },
  yeah: { id: 'yeah', text: 'Yeah.' },
  hm: { id: 'hm', text: 'Hm.' },
  well: { id: 'well', text: 'Well…' },
}

/** Every text a request may carry. `parseTurnRequest` refuses anything else. */
export const PARTICLE_TEXTS: ReadonlySet<string> = new Set(Object.values(PARTICLES).map((p) => p.text))

/**
 * Which sounds each band makes.
 *
 * Warm: change-of-state and appreciation. OPEN: receipt. Cold: the preface to
 * a dispreferred answer. HOSTILE gets nothing — she wants this over, and a
 * considered "Hm." is more attention than she is giving him.
 */
export const PARTICLES_BY_BAND: Record<WarmthBand, readonly ParticleId[]> = {
  HOSTILE: [],
  CLOSED: ['hm', 'well'],
  GUARDED: ['hm', 'well'],
  OPEN: ['mm', 'yeah', 'hm'],
  ENGAGED: ['oh', 'mm'],
  INVESTED: ['oh', 'mm'],
}

/** At most one turn in this many. */
export const PARTICLE_SPACING = 3

/**
 * When it plays, measured from him stopping. Inside the 250-400 ms the report
 * names: late enough not to step on the end of his sentence, early enough to
 * land well before the writer does.
 */
export const PARTICLE_ONSET_MS = { low: 250, high: 400 }

export interface ParticleContext {
  warmth: number
  /** Her turns since she last opened with a particle. Infinity if never. */
  turnsSinceParticle: number
  /** This is her reply to his first turn. */
  firstExchange: boolean
  /** The wind-down has been handed over, or she has decided to go. */
  closing: boolean
  /** His last turn was a dead end. */
  deadEnd: boolean
  /** His last turn was misheard (`unclear`). */
  unclear: boolean
  /**
   * She may ask a question this turn. A particle in front of a question is the
   * assistant register, so only turns where the question gate is SHUT get one.
   */
  mayAsk: boolean
  /** She is silent this turn. */
  silent: boolean
}

/**
 * The particle for this turn, or null.
 *
 * `rng` decides WHETHER a turn that is eligible gets one (a coin, so eligible
 * turns are not all filled) and WHICH of the band's sounds. Injected so the
 * session is reproducible under a seed.
 */
export function particleFor(context: ParticleContext, rng: () => number): Particle | null {
  if (context.silent || context.firstExchange || context.closing) return null
  if (context.deadEnd || context.unclear || context.mayAsk) return null
  if (context.turnsSinceParticle < PARTICLE_SPACING) return null
  const choices = PARTICLES_BY_BAND[bandFor(Number.isFinite(context.warmth) ? context.warmth : 0)]
  if (choices.length === 0) return null
  // Half of the eligible turns. Every eligible turn filled would put one on
  // every third reply like clockwork, and a person is not a metronome.
  if (rng() >= 0.5) return null
  const id = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))]
  return id ? PARTICLES[id] : null
}

/** The onset, drawn. Uniform inside the window: this is not a band signal. */
export function particleOnsetMs(rng: () => number): number {
  const { low, high } = PARTICLE_ONSET_MS
  return Math.round(low + (high - low) * Math.max(0, Math.min(1, rng())))
}
