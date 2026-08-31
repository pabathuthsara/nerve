export type Track = 'dating' | 'interview'
import type { Rank } from './rank'

/**
 * A roster tier — one per shipped rung (§06, `lib/data/progression.ts`).
 *
 * Four of them since Tess took rung 1 and the ladder became contiguous. It
 * matched `FieldTier` once, split from it when the roster shrank to three, and
 * happens to have the same arity again — the two are still different ladders
 * and still deliberately different types.
 */
export type Level = 1 | 2 | 3 | 4

/**
 * A field tier (§09). Four of them, and NOT the same ladder as `Level`.
 *
 * These two rode the same type until the roster went to three characters, at
 * which point the compiler pointed out that the field's tier 4 no longer
 * existed. It always existed: the field ladder is authored content with a
 * `tier between 1 and 4` constraint in the database, and it does not move when
 * the persona roster does. One type for two ladders meant a change to either
 * one silently retyped the other.
 */
export type FieldTier = 1 | 2 | 3 | 4
export type Band = 'CLOSED' | 'GUARDED' | 'OPEN' | 'ENGAGED' | 'INVESTED'
export type Plan = 'free' | 'pro' | 'elite'

export interface UserState {
  id: string
  email: string
  displayName: string
  activeTrack: Track
  unlockedTracks: Track[]
  currentLevel: Level
  /**
   * The §08 rail. Read from the `profiles` mirror that `syncLevel` maintains;
   * `lib/data/rank.ts` is what decides it.
   */
  rank: Rank
  repsRemainingToday: number
  /**
   * What today is worth — the plan's number, plus the sign-up rep if it is
   * still unspent.
   *
   * Not `entitlements.reps_per_day`: the one free voice rep an account gets
   * sits on top of the plan (`lib/data/allowance.ts`), so this is the figure
   * every screen counts down from and the same one `consumeRep` enforces.
   */
  repsPerDay: number
  repsResetAt: string
  /** True until the one sign-up voice rep has been spent. Once, ever. */
  signupRepAvailable: boolean
  /**
   * No voice on the plan, and the sign-up rep already spent.
   *
   * The upgrade moment, and deliberately NOT the same thing as
   * `repsRemainingToday === 0`: a Pro account at three of three is out for
   * today and has three more at midnight, and telling those two people the
   * same sentence is what makes a paywall read as a bug.
   */
  voiceLocked: boolean
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

/**
 * The one line she carries into the next rep (§08).
 *
 * Scene continuity, never affection — enforced in `lib/grade/memory.ts` rather
 * than asked for politely, because a character who is pleased to see you is a
 * companion app and §14 says that is a payment account waiting to be closed.
 */
export interface PersonaMemory {
  line: string
  lastSeenAt: string | null
  /** True until the first-time explainer has been shown. Once, ever (§12). */
  firstEver: boolean
}

/**
 * A moment that has been earned and not yet shown (§12).
 *
 * `level` is a roster tier, `tier` is a field tier. Both fire once ever, off a
 * row in `unlocks` rather than off anything the screen remembers.
 */
export type PendingUnlock =
  | { kind: 'level'; ref: Level }
  | { kind: 'tier'; ref: FieldTier }

/**
 * Where an account stands against its own first rep (§08).
 *
 * `due` is the week-four offer; `retestSessionId` is the rep that answered it.
 * Both are derived from history rather than stored — see `lib/data/baseline.ts`.
 */
export interface BaselineState {
  baseline: { sessionId: string; personaId: string; score: number; takenAt: string }
  personaName: string
  retestSessionId: string | null
  due: boolean
  daysSince: number
}

/**
 * What the merchant of record says this account has bought (§14).
 *
 * A read of the `subscriptions` mirror, which is the table the webhook writes
 * and nobody else does. It is separate from `UserState.plan` on purpose: the
 * plan is what the app ENFORCES and this is what was BOUGHT, and the whole
 * reason the mirror exists is that those two can legitimately disagree for a
 * few seconds while a webhook is in flight — or for longer, if a product id is
 * misconfigured and a purchase records without granting.
 *
 * Null means nobody has ever bought anything on this account, which is not the
 * same as a cancelled subscription and must not be drawn as one.
 */
export interface SubscriptionState {
  plan: Plan
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  /** When the current period (or the trial) ends. ISO, null if unknown. */
  currentPeriodEnd: string | null
  /** Already cancelled, still inside the period they paid for. */
  cancelAtPeriodEnd: boolean
}

/** The stored Sunday letter (§09, §11). */
export interface WeeklyReview {
  /** Monday of the week under review, `YYYY-MM-DD`. */
  weekStart: string
  copy: string
  stats: {
    reps: number
    wins: number
    asksMade: number
    rejections: number
    streak: number
    meanScore: number | null
    previousMeanScore: number | null
  }
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
  /**
   * The warmth the ending was decided on (§05).
   *
   * Null for reps recorded before this was kept. Not the same as
   * `finalWarmth`: the decision is taken at the wind-down and cannot change
   * afterwards, so the meter can finish well above the threshold on a rep that
   * was already going to end with her leaving.
   */
  decisionWarmth: number | null
  finalBand: Band
  /** Null until the grade lands. A rep is stored before it is scored. */
  compositeScore: number | null
}

/** The profile header. Every figure is derived from stored reps. */
export interface LifetimeStats {
  totalReps: number
  /**
   * Mean composite across every graded rep (§07).
   *
   * This slot used to hold a win rate, which is the one thing the product is
   * explicit about never scoring: "a clean rep that ends in rejection can score
   * 92." A headline figure that counted numbers-given taught exactly the lesson
   * the reps exist to unteach, and read 0% to anybody on their first day.
   */
  averageScore: number | null
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
  /**
   * The two weakest sub-scores, in order (§07). Carried so the screen can link
   * each one to its technique — the sentence in §07 is "each links to the
   * matching technique in the library", and a focus with nowhere to go is
   * advice the user cannot act on.
   */
  focus: string[]
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
  /**
   * Predicted against actual, summarised — the figure `/profile` shows without
   * drawing the whole chart. Null until anything has been logged with both
   * numbers on it.
   */
  anxiety: {
    meanPredicted: number
    meanActual: number
    /** Predicted minus actual. Positive means easier than feared. */
    meanGap: number
    points: number
  } | null
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

/**
 * A library card, as the screens read it (§10 D).
 *
 * The database row plus nothing: the library is content, seeded from
 * `lib/techniques/library.ts` by `npm run db:content`, and the shape it is
 * authored in is the shape it is read in.
 */
export interface LibraryCard {
  slug: string
  kind: 'technique' | 'opener' | 'ladder' | 'recovery' | 'exit'
  title: string
  summary: string
  body: string
  /** Which of the six sub-scores this card moves. */
  targets: string[]
  setting: string | null
  examples: string[]
  drill: string | null
}

/**
 * One graded rep, reduced to the numbers the trend screens plot (§10 E).
 *
 * Deliberately thin. `/progress` draws lines through many reps, so anything it
 * does not draw is bytes over the wire and a column that has to keep meaning
 * the same thing next month.
 */
export interface ProgressPoint {
  sessionId: string
  gradedAt: string
  personaSlug: string
  composite: number
  /** The six §07 names, absent when the judge did not return one. */
  subScores: Partial<Record<string, number>>
  /** Per minute of his speaking time. Null when he barely spoke. */
  fillerRate: number | null
  /** Share of speaking time that was his, 0-1. */
  talkRatio: number | null
}
