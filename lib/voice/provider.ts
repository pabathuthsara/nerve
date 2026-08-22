/**
 * The interface every adapter satisfies (§04).
 *
 * Transport is the adapter's business — WebRTC for OpenAI, WebSocket for
 * ElevenLabs. The application layer never learns which.
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

  /** Subscribe to a domain event. Returns an unsubscribe function. */
  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): () => void

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
