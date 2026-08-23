/**
 * Nerve domain vocabulary for voice sessions.
 *
 * Nothing in this file may name a provider, a transport, or a model. Adapters
 * translate into and out of these types; the application layer sees only these.
 * (§04 — "Nothing in the application layer may import a provider SDK directly.")
 */

export type ProviderId = 'openai' | 'elevenlabs'

/* ------------------------------------------------------------------ *
 * The persona schema — four layers
 * ------------------------------------------------------------------ */

/**
 * Round 10 split what used to be one flat bag of dials into four layers,
 * because they answer four different questions and were previously fighting.
 *
 *   1. TRAJECTORY   how warmth MOVES. This is what "level" means.
 *   2. PERSONALITY  WHO she is. Constants. Never rise or fall with warmth.
 *   3. GATED        what warmth UNLOCKS. Ceiling and threshold, no base value.
 *   4. ROOM         where it happens.
 *
 * The rule that makes the split work: **there is no friendliness dial.**
 * Friendliness IS warmth. A separate parameter for it creates two systems
 * arguing over the same behaviour, which is how round 6 produced a character
 * who obeyed neither.
 *
 * One engine serves every character, level and track because only layer 1
 * changes with difficulty and only layer 2 changes with who she is.
 */

/** LAYER 1 — how warmth moves. Difficulty lives here and nowhere else. */
export interface Trajectory {
  /** Opening warmth, before jitter. */
  start: number
  /** Plus or minus this much, rolled once per session (§05). */
  startJitter: number
  /** Multiplier on positive raw deltas. */
  gain: number
  /** Multiplier on negative raw deltas. Warmth rises slow and falls fast. */
  decay: number
  /**
   * Applied warmth lost on every user turn, before that turn is scored.
   * Standing still has to lose ground or the meter only ratchets up.
   */
  decayPerTurn: number
  /** Maximum applied gain from any single turn, after gain and falloff. */
  maxGainPerTurn: number
  /** Maximum reachable within a SINGLE session. */
  sessionCeiling: number
  /**
   * Maximum reachable EVER, across every encounter. Below 100 this makes the
   * character unwinnable by design — the point of the level, not a limitation
   * of it. Alex sits at 45 and therefore never reaches ENGAGED.
   */
  hardCeiling: number
}

/** How the words come out. Independent of how much she is giving. */
export type Expression = 'playful' | 'dry' | 'earnest' | 'flat'

/**
 * LAYER 2 — who she is. Constants.
 *
 * These change HOW each warmth band is expressed, never where she sits on the
 * scale. A sharp character at OPEN and a gentle one at OPEN give the same
 * amount; they just sound nothing alike doing it.
 */
export interface Personality {
  /** 0-100. How cutting when displeased. */
  sharpness: number
  /** Added to sharpness as warmth falls. See `effectiveSharpness`. */
  sharpnessLowWarmthBoost: number
  /** 0-100. Teasing versus earnest. */
  humour: number
  /**
   * 0-100. Natural verbosity, independent of interest.
   *
   * Deliberately NOT part of the per-turn steering item: reply length belongs
   * to the warmth band and nothing else may argue with it (§bands). This feeds
   * the character contract instead, where it describes disposition rather than
   * word count.
   */
  talkativeness: number
  /** 0-100. Tolerance for fumbling and long pauses. */
  patience: number
  expression: Expression
  /** 0-100. Phone, friends, in a hurry, wearing headphones. */
  distraction: number
  /** 0-100. How plainly disinterest is expressed. Low is Level 7+ only. */
  signalClarity: number
}

/**
 * The sharpness curve.
 *
 * A stranger who is already cold is sharper than a neutral one — the same
 * clumsy line lands very differently at warmth 5 and at warmth 40. The boost
 * fades linearly to zero at warmth 30 and contributes nothing above it, so a
 * warm character is never retrospectively made cutting.
 */
export function effectiveSharpness(personality: Personality, warmth: number): number {
  const boost = personality.sharpnessLowWarmthBoost * Math.max(0, (30 - warmth) / 30)
  return clamp(personality.sharpness + boost, 0, 100)
}

/** A behaviour warmth unlocks, with a cap on how far it can go. */
export interface GatedBehaviour {
  /** 0-100. How far this behaviour may go once unlocked. */
  ceiling: number
  /** Warmth at which it becomes available at all. */
  unlocksAt: number
}

/** A behaviour that is simply on or off. */
export interface GateOnly {
  unlocksAt: number
}

/**
 * LAYER 3 — what warmth unlocks.
 *
 * Threshold and ceiling, never a base value. A base value would be a second
 * warmth system, which is the thing this refactor exists to remove.
 */
export interface Gated {
  flirtiness: GatedBehaviour
  personalDisclosure: GatedBehaviour
  initiatesTopics: GateOnly
  usesYourName: GateOnly
}

export type GateName = keyof Gated

export const GATE_NAMES: readonly GateName[] = [
  'flirtiness',
  'personalDisclosure',
  'initiatesTopics',
  'usesYourName',
]

/** Which gated behaviours are open at this warmth. */
export function unlockedGates(gated: Gated, warmth: number): GateName[] {
  return GATE_NAMES.filter((name) => warmth >= gated[name].unlocksAt)
}

/** LAYER 4 — the room. */
export interface RoomConfig {
  /**
   * Scene id in lib/audio/scenes.ts, driving the ambient bed and its one-shots.
   *
   * **Null means no ambient bed at all** — no continuous layers, no scheduled
   * one-shots. The reverb below is unaffected: acoustics are the shape of the
   * space and are applied to her voice, while the bed is sound playing INTO
   * the room, and only the second one can be mistaken for someone speaking.
   *
   * Synthesised beds are off while the room re-renders as recorded audio.
   */
  bed: string | null
  /** dB trim on the whole bed. Bookshop sits near -40. */
  bedDb: number
  /** Scene id whose reverb profile is used. Usually the same as the bed. */
  reverbIr: string
  /** 0-1 wet share on her voice. Bookshop 0.08-0.12. */
  reverbWet: number
  /** Milliseconds, [min, max], between randomly scheduled one-shots. */
  oneShotIntervalMs: [min: number, max: number]
}

/**
 * The scene's name, for prose that has to say where this is happening.
 *
 * `bed` used to serve as both the ambient scene id and the word the persona
 * compiler drops into "a stranger in a bookshop". Making the bed switchable
 * separated those: turning the ambient off must not make her forget what room
 * she is standing in.
 */
export function sceneId(room: RoomConfig): string {
  return room.bed ?? room.reverbIr
}

export interface OutcomeWeights {
  receptive: number
  neutral: number
  rejecting: number
}

/**
 * Per-provider voice selection.
 *
 * The brief sketched this as a single `voiceId`. It stays a per-provider record
 * because the two arms have entirely different voice catalogues and flattening
 * it would break whichever one did not own the string.
 */
export interface VoiceSelection {
  /** Perceived gender of the voice, used when mapping across catalogues. */
  timbre: 'feminine' | 'masculine' | 'neutral'
  ids: Partial<Record<ProviderId, string>>
  /** Relative speaking rate. 1.0 is the provider default. */
  pace?: number
}

export interface Persona {
  slug: string
  name: string
  /** One line of scene setting, shown to the user and given to the model. */
  scene: string
  /** Level in the ladder, 1-8. */
  level: number
  /** Which track this character belongs to. Decides the display label only. */
  track: TrackId
  voice: VoiceSelection

  trajectory: Trajectory
  personality: Personality
  gated: Gated
  room: RoomConfig

  /**
   * The character prompt. Hand-authored prose, one string.
   *
   * It owns who she is: her history, her opinions, what she will not do. It
   * must NOT specify reply length or question rate — those are the warmth
   * band's, and having them in both places is what produced 16.5 median words
   * against a contract asking for four to ten.
   */
  contract: string

  /** Explicit triggers that end the scene. */
  exitConditions: string[]
  /** Probability distribution over how this rep is allowed to go. */
  outcomeWeights: OutcomeWeights
  /** One line about the user's last attempt, injected on return visits. */
  memorySummary?: string
}

/* ------------------------------------------------------------------ *
 * Tracks
 * ------------------------------------------------------------------ */

/**
 * The engine variable is always `warmth`. Only the label changes.
 *
 * Renaming the variable per track would mean three engines; renaming only the
 * label means one engine and a lookup. The UI reads the label, the engine reads
 * the variable, and they never meet.
 */
export type TrackId = 'dating' | 'interview' | 'language'

export const TRACK_LABELS: Record<TrackId, string> = {
  dating: 'Warmth',
  interview: 'Impression',
  language: 'Engagement',
}

/**
 * The Level 5 dial, derived rather than stored.
 *
 * §05: levels 1-4 never interrupt the user, ever. That is a property of the
 * level, so keeping a separate `interrupts` boolean on every persona was a
 * second place for the same rule to be written down and disagreed with.
 */
export function mayInterrupt(persona: Persona): boolean {
  return persona.level >= 5
}

export function trackLabel(track: TrackId): string {
  return TRACK_LABELS[track] ?? TRACK_LABELS.dating
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
  /**
   * She spoke twice with no user turn between, and both were audible.
   *
   * Distinct from `agent.overlap`, which counts responses that were cancelled
   * BEFORE reaching the speakers. This one already reached them, so the turn
   * stays in the transcript and only the incident is reported.
   */
  'agent.double-turn': { at: number }
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
  /**
   * Per-stage latency and per-vendor cost, for adapters assembled out of
   * separate STT, LLM and TTS calls. Null on a native speech-to-speech adapter,
   * which has no stages to report.
   */
  pipeline?: PipelineTelemetry | null
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

/* ------------------------------------------------------------------ *
 * Assembled-pipeline telemetry
 * ------------------------------------------------------------------ */

/**
 * Per-stage latency, for adapters that are a pipeline rather than one model.
 *
 * Provider-neutral by construction: a native speech-to-speech adapter has no
 * stages to report and leaves this null. The application layer folds it into
 * the session JSON without knowing which adapter produced it.
 */
export interface StageStat {
  median: number
  p90: number
  /** How many samples the two numbers above were computed from. */
  count: number
}

export interface PipelineStages {
  /** Silence the VAD insisted on before conceding the turn. Our own dial. */
  vadSilenceMs: StageStat
  /** Last audio frame sent -> final transcript in hand. */
  sttMs: StageStat
  /** Transcript sent -> first token back. */
  llmFirstTokenMs: StageStat
  /** Transcript sent -> last token. */
  llmCompleteMs: StageStat
  /** Text sent -> first audio byte. */
  ttsFirstByteMs: StageStat
  /** User stopped speaking -> her audio starts playing. What the ear feels. */
  totalPerceivedMs: StageStat
}

/**
 * Cost, in the units each vendor actually bills.
 *
 * ElevenLabs bills characters; OpenAI bills tokens. Mixing them into one
 * "usage" number is how a pipeline's real cost gets lost, so both survive here
 * in their own units and only the USD figures are summed.
 */
export interface PipelineUsage {
  elevenlabs: {
    characters: number
    creditsUsed: number
    /** From the vendor's own subscription counter. Null when it could not be read. */
    creditsRemaining: number | null
    costUsd: number
  }
  openai: {
    sttTokens: number
    llmTokens: number
    costUsd: number
  }
  totalCostUsd: number
  costPerMinuteUsd: number
}

export interface PipelineTelemetry {
  ttsModel: string
  sttModel: string
  llmModel: string
  stages: PipelineStages
  /** Times the user spoke over her and playback was cut. */
  bargeIns: number
  /** Turns whose stored text was shortened to what actually reached the ear. */
  truncatedTurns: number
  usage: PipelineUsage
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
