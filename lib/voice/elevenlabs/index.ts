/**
 * ElevenLabs adapter — stubbed at M0 (§04, §17).
 *
 * The interface, the persona compiler and the factory wiring are real. Only the
 * WebSocket transport is missing, and it gets filled in before M3 so the blind
 * A/B can run against the same application code.
 *
 * It exists in this state on purpose: the stub is what proves the application
 * layer never reaches for a provider SDK. If wiring VOICE_PROVIDER=elevenlabs
 * breaks anything other than connect(), the abstraction has already leaked.
 */

import { VoiceEmitter } from '../emitter'
import type { VoiceProvider } from '../provider'
import {
  VoiceError,
  type Analysers,
  type Calibration,
  type Persona,
  type ProviderId,
  type Rate,
  type SessionSummary,
  type TransportStats,
  type VoiceEventHandler,
  type VoiceEventName,
} from '../types'
import { ElevenLabsPersonaCompiler, type ElevenLabsAgentConfig } from './persona'

const PROVIDER: ProviderId = 'elevenlabs'

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id: ProviderId = PROVIDER
  readonly model = 'eleven-agents'

  /** Budget the tier caps against $0.095/min, not $0.065 (§04). */
  readonly rate: Rate = { currency: 'USD', perMinute: 0.095 }

  private readonly emitter = new VoiceEmitter()
  private readonly compiler = new ElevenLabsPersonaCompiler()
  private config: ElevenLabsAgentConfig | null = null

  /**
   * Compiles the persona — which works today and is covered by the conformance
   * suite — and then refuses, because there is no transport behind it yet.
   */
  async connect(persona: Persona, calibration: Calibration): Promise<void> {
    this.config = this.compiler.compile(persona, calibration)
    throw new VoiceError(
      'not_implemented',
      PROVIDER,
      'The ElevenLabs adapter is a stub at M0. Its transport lands before the blind A/B in M3. Set VOICE_PROVIDER=openai.',
    )
  }

  /** Exposed so the compiler can be inspected without a live session. */
  peekConfig(): ElevenLabsAgentConfig | null {
    return this.config
  }

  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): () => void {
    return this.emitter.on(event, handler)
  }

  reinforce(_text: string): void {
    // Prompt update over the WebSocket, once there is one.
  }

  setInterruptible(_interruptible: boolean): void {
    // Maps to their turn model, once there is one.
  }

  getAnalyser(): Analysers {
    return { user: null, agent: null }
  }

  /** No transport yet, so no audio graph to hang a room on. */
  getRoom(): null {
    return null
  }

  async getTransportStats(): Promise<TransportStats> {
    return { rttMs: null, jitterMs: null, packetsLost: null }
  }

  async end(reason: SessionSummary['reason'] = 'user'): Promise<SessionSummary> {
    return {
      seconds: 0,
      provider: PROVIDER,
      model: this.model,
      rate: this.rate,
      turns: [],
      usage: null,
      reason,
    }
  }
}
