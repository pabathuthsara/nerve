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
  /**
   * The reply ceiling in SENTENCES, decided by the same layer for the same
   * reason. See `wordCap` above and `BandSpec.maxSentences`.
   *
   * Two ceilings rather than one because they fail differently: a long single
   * sentence blows the word cap and stays one sentence, and "Hello. Not a bad
   * morning for sitting still." blows the sentence rule while sitting inside
   * any reasonable word count. Both were stated in the band prose and neither
   * was enforced.
   */
  sentenceCap?: number
  /**
   * The session permitted a laugh on this turn (R3, `WarmthSession.decideExpression`).
   *
   * A permission the pipeline ENFORCES: `enforceDeliveryTags` removes a
   * `[laughs]` the writer produced on a turn this is not true, however funny
   * the writer thought he was. Absent is false, which is the safe direction —
   * an unpermitted laugh is a character laughing at nothing.
   */
  laughAllowed?: boolean
  /**
   * His last turn was a dead end (R7). The pipeline then replaces a first
   * sentence that is a rescue with one of her authored micro-replies
   * (`deadEndReply`). Absent is false.
   */
  deadEnd?: boolean
  /**
   * The turn-initial particle already playing in the browser (R4), e.g. "Mm."
   *
   * Sent so the pipeline can take the writer's own copy of it off the front of
   * the line before synthesis — said twice it is a stutter — and so the stored
   * turn is what the ear heard: the particle and then the line. A string the
   * browser chooses, from a list it cannot extend: `parseTurnRequest` refuses
   * anything that is not one of `PARTICLE_TEXTS`.
   */
  particle?: string
  /**
   * Proof this turn was reserved ahead of time (PERSONA-REALISM-REPORT L2).
   * See `./ticket.ts`. Absent, or anything that does not verify, is the
   * ordinary path.
   */
  ticket?: string
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

/** Transport bound on the sentence ceiling, for the same reason. */
export const MAX_REQUESTED_SENTENCE_CAP = 8

/**
 * How long a turn ticket may wait for its turn (PERSONA-REALISM-REPORT L2).
 *
 * A turn is reserved while her previous line plays and his next one is being
 * spoken, which is seconds. Two minutes covers a slow thinker; anything older
 * is a ticket nobody should still be holding, and the turn simply takes the
 * ordinary path. Here rather than in `./ticket.ts` so the browser can read it
 * without bundling the module that signs.
 */
export const TICKET_TTL_MS = 120_000
