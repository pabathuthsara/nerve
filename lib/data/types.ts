export type Track = 'dating' | 'interview'
export type Level = 1 | 2 | 3 | 4
export type Band = 'CLOSED' | 'GUARDED' | 'OPEN' | 'ENGAGED' | 'INVESTED'
export type Plan = 'free' | 'pro' | 'elite'

export interface UserState {
  id: string
  email: string
  displayName: string
  activeTrack: Track
  unlockedTracks: Track[]
  currentLevel: Level
  repsRemainingToday: number
  repsPerDay: number
  repsResetAt: string
  streakDays: number
  plan: Plan
  trainingWheels: boolean
  onboardingComplete: boolean
  focusArea: 'opening' | 'sustaining' | 'flirting' | 'rejection' | null
  /** Null on free, and on any plan a merchant of record has not renewed yet. */
  renewsAt: string | null
  ambience: boolean
  ambienceVolume: number
  inputDevice: string | null
  outputDevice: string | null
}

export interface Persona {
  id: string
  name: string
  level: Level
  setting: string
  settingShort: string
  hook: string
  blurb: string
  respondsTo: string[]
  shutsDownOn: string[]
  portraitUrl: string
  locked: boolean
  unlockRequirement: string | null
}

export interface PersonaProgress {
  personaId: string
  attempts: number
  wins: number
  bestTimeMs: number | null
  bestWarmth: number
  lastAttemptAt: string | null
}

export interface SessionSummary {
  id: string
  track: Track
  personaId: string
  personaName: string
  personaSettingShort: string
  startedAt: string
  durationMs: number
  won: boolean
  finalWarmth: number
  finalBand: Band
  /** Null until the grade lands. A rep is stored before it is scored. */
  compositeScore: number | null
}

/** The profile header. Every figure is derived from stored reps. */
export interface LifetimeStats {
  totalReps: number
  winRate: number | null
  bestTimeMs: number | null
  averageWarmthGain: number | null
  currentStreak: number
  longestStreak: number
}

export type BandVerdict = 'LOW' | 'GOOD' | 'HIGH'

export interface MetricBand {
  key: 'talk_ratio' | 'question_rate' | 'open_closed' | 'longest_monologue' | 'response_latency' | 'callbacks' | 'star_structure' | 'specificity' | 'filler_words' | 'answer_length' | 'evidence_given' | 'questions_asked_back'
  label: string
  displayValue: string
  numericValue: number
  targetLabel: string
  targetMin: number
  targetMax: number
  verdict: BandVerdict
  points: number
  maxPoints: number
  note: string
}

export interface Moment {
  turnIndex: number
  quote: string
  delta: number
  warmthAfter: number
  note: string
}

/**
 * The 40% of the composite that is a model's judgement rather than a measured
 * value (§07). One row, so the visible rows still add up to the composite.
 */
export interface JudgementBand {
  label: string
  points: number
  maxPoints: number
  subScores: { key: string; label: string; value: number }[]
  wentWell: string | null
}

export interface Scorecard {
  sessionId: string
  composite: number
  metrics: MetricBand[]
  judgement: JudgementBand | null
  bestMoment: Moment | null
  worstMoment: Moment | null
  tryNext: string
}

export interface TranscriptTurn {
  index: number
  speaker: 'user' | 'persona'
  text: string
  tStart: number
  tEnd: number
  warmthAfter: number | null
  delta: number | null
  reason: string | null
}

export interface FieldChallenge {
  id: string
  slug: string
  tier: 1 | 2 | 3 | 4
  title: string
  /** What to do. */
  brief: string
  /** What counts as done. Generous: the ask is the rep. */
  doneWhen: string
  /** Shown on the first Tier 3 and the first Tier 4 (§12). */
  safetyNote: string | null
  setting: string
}

export type FieldStatus = 'pending' | 'accepted' | 'done' | 'skipped' | 'swapped'

/** Today's challenge, and where in the flow it is. */
export interface FieldAssignment {
  id: string
  challenge: FieldChallenge
  assignedOn: string
  status: FieldStatus
  /** 0-10, captured at accept and never afterwards. Null until then. */
  anxietyPre: number | null
}

export type FieldOutcome = 'accepted' | 'declined' | 'mixed' | 'not_asked'

export interface FieldLogEntry {
  id: string
  challengeTitle: string
  tier: number
  /** Streaks run on asks made, never on asks accepted (§09). */
  asked: boolean
  outcome: FieldOutcome
  anxietyPre: number | null
  anxietyPost: number | null
  note: string | null
  loggedOn: string
  loggedAt: string
}

/** The counters. Rejections is the headline one, not successes (§09). */
export interface FieldStats {
  asksMade: number
  rejectionsCollected: number
  tier: 1 | 2 | 3 | 4
  /** Distinct challenges logged at the current tier, and how many there are. */
  tierDone: number
  tierTotal: number
  nextTierAt: string | null
}

export interface Interviewer {
  id: string
  name: string
  style: 'friendly_hr' | 'technical' | 'distracted_exec' | 'panel_lead'
  styleLabel: string
  gender: 'male' | 'female'
  blurb: string
  portraitUrl: string
  level: Level
  locked: boolean
}

export interface InterviewSetup {
  roleTitle: string
  company: string
  jobDescription: string
  cvFileName: string | null
  cvUploadedAt: string | null
  customQuestions: string[]
  complete: boolean
}

