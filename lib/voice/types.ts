/**
 * Nerve domain vocabulary for voice sessions.
 *
 * Nothing in this file may name a provider, a transport, or a model. Adapters
 * translate into and out of these types; the application layer sees only these.
 * (§04 — "Nothing in the application layer may import a provider SDK directly.")
 */

export type ProviderId = 'openai' | 'elevenlabs'

/** Every character is a config record, not code. (§05 — persona schema.) */
export interface Persona {
  id: string
  /** Display name. Nadia, Priya, Maya... */
  name: string
  /** Level this persona sits at in the ladder, 1–8. */
  level: number
  /** One line of scene setting: "Bookshop, mid-afternoon, browsing fiction." */
  scene: string

  /** 0–100. Starting warmth and how fast it moves. */
  receptiveness: number
  /** 0–100. How much the character carries the conversation vs making the user lead. */
  effort: number
  /** 0–100. Phone, friends, in a hurry, wearing headphones. */
  distraction: number
  /** 0–100. How plainly disinterest is expressed. Low is Level 7+ only. */
  signal_clarity: number
  /** Whether the model may cut across the user. Levels 1–4: never. */
  interrupts: boolean

  /** Explicit triggers that end the scene. */
  exit_conditions: string[]
  /** Probability distribution over how this rep is allowed to go. */
  outcome_weights: OutcomeWeights
  /** Abstract delivery descriptor. Each adapter realises this in its own idiom. */
  delivery: Delivery
  /** Provider-neutral voice selection; adapters map to their own voice catalogue. */
  voice: VoiceSelection
  /**
   * Ambient audio bed keyed to the scenario.
   *
   * Retained as the human-readable label; the acoustics themselves live in
   * `acoustics`, which is a per-scenario record rather than a global preset —
   * a bar is loud and reflective, this bookshop is quiet and dead (§1c).
   */
  room_tone: string
  /** Id into lib/audio/scenes.ts. Null leaves the scene dry. */
  acoustics?: string
  /** One line about the user's last attempt, injected on return visits. */
  memory_summary?: string

  /** The character contract itself. (§05 — countermeasure 1.) */
  contract: CharacterContract
}

export interface OutcomeWeights {
  receptive: number
  neutral: number
  rejecting: number
}

/**
 * The leakiest seam in the abstraction, named honestly (§04).
 *
 * Under native speech-to-speech, flat delivery is *emergent* — it falls out of
 * the character contract. Under tagged TTS it is *forced* by explicit markers.
 * The schema carries the intent; each compiler realises it its own way.
 */
export interface Delivery {
  /** 0–100. 0 is affectless, 100 is animated. */
  warmth: number
  /** 0–100. 0 is clipped, 100 is expansive. */
  expansiveness: number
  /** Relative speaking pace. 1.0 is the provider default. */
  pace: number
  /** Free-text delivery notes an adapter may use as tags or as instruction prose. */
  notes: string[]
}

export interface VoiceSelection {
  /** Perceived gender of the voice, used when mapping across catalogues. */
  timbre: 'feminine' | 'masculine' | 'neutral'
  /** Per-provider voice id overrides, keyed by provider. */
  ids: Partial<Record<ProviderId, string>>
}

export interface CharacterContract {
  identity: string
  situation: string
  mood: string
  /**
   * How the words come out, as opposed to what they are.
   *
   * Separate from `Delivery`, which is numeric and drives provider voice
   * parameters. This is prose the model reads, and it exists because under
   * native speech-to-speech prosody is emergent from the character contract —
   * there is no tag to set (§04).
   */
  delivery_notes?: string[]
  /**
   * Punctuation constraints.
   *
   * Punctuation is prosody under speech-to-speech: the model performs what it
   * writes. Em-dashes in particular produce an unnatural clipped pause.
   */
  punctuation?: string[]
  /** What the character is trying to do independently of the user. */
  agenda?: string
  /** Concrete spoken-language constraints that keep the character human. */
  speech?: string[]
  /** How the character preserves facts and state across a live conversation. */
  continuity?: string[]
  /** How this person responds when a stranger asks something personal. */
  personal_questions?: string
  /** How this person responds to rudeness or attempts to test the prompt. */
  rude_or_testing?: string
  /** Persona-specific negative constraints, in addition to the global register. */
  never?: string[]
  earns_warmth: string[]
  loses_warmth: string[]
}

/**
 * The user's calibrated turn-taking numbers (§05 — problem one).
 *
 * We store one number: the natural inter-clause pause measured on the mic-check
 * screen. The adapter maps it to whatever its platform's turn model wants. The
 * application never sees the provider-side value.
 */
export interface Calibration {
  /**
   * Milliseconds of silence before the character may take the turn.
   * Confident-user M0 default is 600. Per-user calibration may widen it for a
   * hesitant speaker; patience can widen it further.
   */
  silenceMs: number
  /** Patience preference, added on top. Widens the threshold, never narrows it. */
  patienceOffsetMs?: number
}

export const DEFAULT_CALIBRATION: Calibration = {
  silenceMs: 600,
  patienceOffsetMs: 0,
}

/** Resolved threshold. One place, so both adapters agree. */
export function resolveSilenceMs(calibration: Calibration): number {
  const offset = Math.max(0, calibration.patienceOffsetMs ?? 0)
  return Math.round(clamp(calibration.silenceMs + offset, 200, 3000))
}

/* ------------------------------------------------------------------ *
 * Transcripts
 * ------------------------------------------------------------------ */

export type Speaker = 'user' | 'agent'

/**
 * INVARIANT 1 (§04). Both adapters emit exactly this shape. Scoring reads only
 * this. Break it and scores stop being comparable across a provider switch,
 * which silently corrupts every user's progression history.
 *
 * `t_start` / `t_end` are seconds elapsed since the session connected.
 */
export interface TranscriptTurn {
  speaker: Speaker
  text: string
  t_start: number
  t_end: number
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export interface VoiceEventMap {
  'user.speech.start': { at: number }
  'user.speech.stop': { at: number }
  'user.transcript': { turn: TranscriptTurn; final: boolean }
  'agent.speech.start': { at: number }
  'agent.speech.stop': { at: number }
  /** A second response was cancelled/dropped before it could become a turn. */
  'agent.overlap': { at: number }
  /** Tool-call syntax was suppressed from a spoken transcript. */
  'agent.tool-leak': { at: number }
  /** The character chose a genuine exit and the live scene must now close. */
  'character.exit': { at: number }
  'agent.transcript': { turn: TranscriptTurn; final: boolean }
  'session.end': { summary: SessionSummary }
  error: { error: VoiceError }
}

export type VoiceEventName = keyof VoiceEventMap
export type VoiceEventHandler<E extends VoiceEventName> = (
  payload: VoiceEventMap[E],
) => void

/** `at` on every event is seconds elapsed since connect, monotonic. */

/* ------------------------------------------------------------------ *
 * Session lifecycle
 * ------------------------------------------------------------------ */

/**
 * INVARIANT 2 (§04). Provider, model and rate are stamped on the summary so the
 * usage ledger stays auditable across a provider switch.
 */
export interface SessionSummary {
  seconds: number
  provider: ProviderId
  model: string
  rate: Rate
  turns: TranscriptTurn[]
  /** Provider-reported token usage. Null when an adapter cannot supply it. */
  usage: SessionUsage | null
  /** Why the session ended. `cap` is the 8-minute hard stop (§05). */
  reason: 'user' | 'character' | 'cap' | 'error'
}

/** One provider-reported response usage sample, normalised for cost auditing. */
export interface UsageSample {
  at: number
  responseId: string | null
  inputTextTokens: number
  cachedInputTextTokens: number
  inputAudioTokens: number
  cachedInputAudioTokens: number
  outputTextTokens: number
  outputAudioTokens: number
  totalTokens: number
  /** Calculated from token usage and the rate card, not dashboard billing. */
  pricedCostUsd: number | null
}

export interface SessionUsage {
  samples: UsageSample[]
  inputTextTokens: number
  cachedInputTextTokens: number
  inputAudioTokens: number
  cachedInputAudioTokens: number
  outputTextTokens: number
  outputAudioTokens: number
  totalTokens: number
  /** Sum of priced samples; still requires dashboard reconciliation. */
  pricedCostUsd: number | null
  pricedCostPerMinuteUsd: number | null
}

export interface Rate {
  currency: 'USD'
  /** Blended cost per minute of session audio, as billed. */
  perMinute: number
}

export interface Analysers {
  /** The user's microphone. */
  user: AnalyserNode | null
  /** The character's voice. */
  agent: AnalyserNode | null
}

/**
 * Diagnostics, not product surface. M0 uses this to answer the Colombo latency
 * question; nothing downstream of M0 may depend on it being populated.
 */
export interface TransportStats {
  /** Network round trip to the provider edge, milliseconds. */
  rttMs: number | null
  jitterMs: number | null
  packetsLost: number | null
}

export type VoiceErrorCode =
  | 'not_implemented'
  /** Our own misconfiguration — a missing key, not a provider failure. */
  | 'not_configured'
  | 'token_mint_failed'
  | 'mic_denied'
  | 'transport_failed'
  | 'session_failed'
  | 'provider_error'

export class VoiceError extends Error {
  readonly code: VoiceErrorCode
  readonly provider: ProviderId
  readonly fatal: boolean

  constructor(
    code: VoiceErrorCode,
    provider: ProviderId,
    message: string,
    options?: { fatal?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'VoiceError'
    this.code = code
    this.provider = provider
    this.fatal = options?.fatal ?? true
  }
}

/** Hard cap of 8 minutes (§05). Protects margin and keeps this out of companionship. */
export const SESSION_CAP_SECONDS = 8 * 60

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
