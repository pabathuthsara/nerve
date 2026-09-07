/** Versioned HTTP turn stream. No vendor credentials cross this boundary. */
import type { LlmMessage } from './llm'
import type { AlignmentChunk } from './truncate'

export interface TurnRequest {
  sessionId: string
  turnId: string
  personaId: string
  history: LlmMessage[]
  steering: string | null
  warmth: number
  /**
   * The reply ceiling in words, decided by the warmth layer.
   *
   * Sent rather than derived because the caller is the only side that knows
   * whether the band is steering this turn at all — the closing decision stands
   * the directive down, and a turn with no band rule must not be held to a band
   * number (`UNSTEERED_WORD_CAP`). Absent falls back to the warmth-derived cap,
   * so a client minted before this field still gets one. It is no wider a trust
   * surface than `steering`, which the caller already writes in full.
   */
  wordCap?: number
}

export type TurnTimingStage = 'llmFirstTokenMs' | 'llmCompleteMs' | 'ttsFirstByteMs'

export type TurnEvent =
  | { type: 'clip'; id: string; text: string }
  | { type: 'audio'; clipId: string; audio_base64: string; alignment: AlignmentChunk | null }
  | { type: 'timing'; stage: TurnTimingStage; ms: number }
  | { type: 'usage'; llm: { input: number; output: number; cachedInput: number }; tts: { characters: number; costUsd: number } }
  | { type: 'done'; exit: boolean }
  | { type: 'error'; message: string }

export const TURN_ENDPOINT = '/api/voice/turn'
export const MAX_TURN_TTS_CHARACTERS = 600

/**
 * The widest ceiling a caller may ask for.
 *
 * A TRANSPORT BOUND, not a rule about how long she talks — the rule is the band
 * table's and is enforced by `capToBudget` against whatever the warmth layer
 * decided. This exists so a malformed request cannot ask for a five-hundred-word
 * turn, and it has to be at least as wide as the widest thing any track
 * legitimately asks for.
 *
 * It is `INTERVIEW_BRIEF_WORD_CAP` because a system design brief is the widest:
 * forty to seventy words of authored problem statement on one turn of one round
 * (`lib/warmth/interview/bands.ts` §6.7). `UNSTEERED_WORD_CAP` — the dating
 * closing turn's forty — used to be this number, and clamping to it silently
 * truncated the brief to a sentence and a half. **Nothing on the dating arm
 * asks for more than fifteen**, so widening the bound moves no dating
 * behaviour: `mirrorCapFor` cannot return above the band table's maximum.
 */
export const MAX_REQUESTED_WORD_CAP = 90
