/**
 * The interface every adapter satisfies (§04).
 *
 * Transport is the adapter's business. The application layer never learns it.
 */

import type { RoomControls } from '@/lib/audio/types'
import type { ReplyShape } from '@/lib/warmth/timing'
import type {
  Analysers,
  Calibration,
  Persona,
  ProviderId,
  Rate,
  SessionSummary,
  TransportStats,
  VoiceEventHandler,
  VoiceEventName,
} from './types'

/**
 * Everything a stateless turn needs, read once, immediately before it is bought.
 *
 * Named rather than written inline because three files hold it — the interface,
 * the binder that produces it and the adapter that consumes it — and an inline
 * literal in three places is three things that can drift apart.
 */
export interface ReplyState {
  steering: string
  warmth: number
  /** Posture and turn kind, for the timing layer. `lib/warmth/timing.ts`. */
  shape?: ReplyShape
  /**
   * Her ceiling this turn, already mirrored against his last turn.
   *
   * Sent rather than derived because only the caller knows what HE just did —
   * see `mirrorCapFor` in `lib/warmth/reciprocity.ts`. Absent falls back to the
   * band alone.
   */
  wordCap?: number
  /**
   * Her sentence ceiling this turn, off the same band.
   *
   * Sent beside `wordCap` because the two fail differently and the band table
   * states both: a long single sentence blows the word cap, and "Hello. Not a
   * bad morning for sitting still." blows "never two" while sitting well inside
   * any word count. Absent falls back to the band alone.
   */
  sentenceCap?: number
  /**
   * She says nothing this turn.
   *
   * Enforced by making no request at all, rather than by asking a model to
   * produce nothing — a model told to say nothing says something short instead,
   * the same reason the word cap is enforced rather than stated. See
   * `mayStaySilentFor`.
   */
  silent?: boolean
}

export interface VoiceProvider {
  readonly id: ProviderId
  readonly model: string
  readonly rate: Rate

  /** Opens a session. Resolves once media is flowing both ways. */
  connect(persona: Persona, calibration: Calibration): Promise<void>

  /** Server-owned rep opened during mint, when the adapter supports it. */
  getSessionId?(): string | null
  /** Identifies only this credential attempt, for safe setup cancellation. */
  getStartupAttemptId?(): string | null
  /** Pause microphone ingress without pausing the scene clock or her voice. */
  setMuted?(muted: boolean): void

  /** Subscribe to a domain event. Returns an unsubscribe function. */
  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): () => void

  /** Fresh state for stateless replies, read after all pending speech is scored. */
  setReplyState?(read: () => ReplyState): void

  /**
   * Character re-injection (§05 — countermeasure 3). Session update on OpenAI,
   * prompt update on ElevenLabs. Cheap; drift is cumulative.
   */
  reinforce(text: string): void

  /**
   * The Level 5 difficulty dial, expressed once and mapped per provider.
   * Levels 1–4 never interrupt the user, ever.
   */
  setInterruptible(interruptible: boolean): void

  /**
   * Where the meter stands, for the two things that live at transport level.
   *
   * The adapter owns no warmth engine and the character is still never told a
   * number. But how long she sits before answering, and whether she takes the
   * turn when he talks over her, are decided below the application — and both
   * of them are how a listener actually tells interest from politeness.
   *
   * `shape` is the rest of what timing reads: the posture the three axes are
   * in, and what kind of turn she is answering (`lib/warmth/timing.ts`). It is
   * optional so a caller with no warmth session — the audition bench, a test —
   * still gets the band's own beat. Absent means level and ordinary.
   *
   * Idempotent. Safe to call on every turn.
   */
  setWarmth(warmth: number, shape?: ReplyShape): void

  /** AnalyserNodes for both streams, so the visualiser never knows the provider. */
  getAnalyser(): Analysers

  /** Closes cleanly and resolves with the row the usage ledger needs. */
  end(reason?: SessionSummary['reason']): Promise<SessionSummary>

  /** Diagnostics only. M0 latency instrumentation; not product surface. */
  getTransportStats(): Promise<TransportStats>

  /**
   * The room her voice is playing into, if this adapter renders one.
   *
   * Provider-neutral by construction: the acoustics are ours, not a vendor's.
   * Null when the scene has no acoustics configured or the adapter cannot host
   * an audio graph.
   */
  getRoom(): RoomControls | null
}

/** A persona compiler turns the provider-neutral schema into provider config. */
export interface PersonaCompiler<TConfig> {
  /**
   * `rng` decides the one authored thing that varies between reps: which of
   * her `moods` she is having today (`moodFor`). Injected rather than read off
   * `Math.random` because a stateless arm recompiles this every turn and must
   * reach the same answer each time — see `lib/voice/seed.ts`.
   */
  compile(persona: Persona, calibration: Calibration, options?: { rng?: () => number }): TConfig
}
