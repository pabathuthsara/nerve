/**
 * The interface every adapter satisfies (§04).
 *
 * Transport is the adapter's business. The application layer never learns it.
 */

import type { RoomControls } from '@/lib/audio/types'
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
  setReplyState?(read: () => { steering: string; warmth: number }): void

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
   * Idempotent. Safe to call on every turn.
   */
  setWarmth(warmth: number): void

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
  compile(persona: Persona, calibration: Calibration): TConfig
}
