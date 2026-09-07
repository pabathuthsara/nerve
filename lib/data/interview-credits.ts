/**
 * What an interview costs, and which credit pays for it.
 *
 * ── WHY A BALANCE AND NOT A DAILY RATE ───────────────────────────────────
 *
 * `entitlements.reps_per_day` is a **rate**, and Pro is 3/day. An interview is
 * twenty minutes; three of them a day is about $45/month of voice against a $19
 * price before the merchant of record takes its cut. The daily meter cannot
 * hold a twenty-minute item, and lowering the rate to compensate would break
 * the dating plan it was sized for — which rule 19 forbids anyway
 * (`INTERVIEW-PLAN.md` §5.2, §5.3).
 *
 * So interviews are sold as credits, and this file is the arithmetic of them.
 * Pure functions with tests, the `rep-rules.ts` pattern: change the rules here,
 * never in the ledger module or the action.
 *
 * ── THE TWO EXPIRY RULES, AND WHY THEY DIFFER ────────────────────────────
 *
 * **A purchase never expires and survives cancellation. A grant dies at the end
 * of the period that handed it out.** That split is what the whole category
 * does, and it is coherent rather than merely conventional: a grant is part of
 * the month you paid for, and a pack is a thing you bought outright. §5.5 has
 * the survey.
 *
 * Two consequences are load-bearing and neither is optional. Every lot records
 * WHICH KIND it is, because the two behave differently at a period boundary.
 * And a spend takes the **expiring** credits first — any other ordering quietly
 * burns the credits somebody paid cash for while the free ones evaporate
 * beside them.
 *
 * The terms have to say all of this before a card is entered, which is why D1
 * moves `components/site/legal-pages.tsx` in the same commit.
 */

/**
 * Where a credit came from, which is also how it dies.
 *
 * `screener` is the free five-minute recruiter screen (§5.6). It is a credit
 * rather than a stamp on this side of the seam so that one balance answers
 * "may this person start an interview", but it is spent LAST and it only ever
 * buys the five-minute round — see `SCREENER_ROUND`.
 */
export type CreditSource = 'grant' | 'purchase' | 'screener'

/**
 * The order a spend draws in: expiring first, free-and-limited last.
 *
 * Grants die at the period boundary, so spending them first is the only
 * ordering that is not quietly hostile. Purchases never expire and can wait.
 * The screener is last because it is worth a quarter of a real credit and can
 * only buy the shortest round — spending it on a twenty-minute interview
 * somebody has credits for would be throwing it away.
 */
export const SPEND_ORDER: readonly CreditSource[] = ['grant', 'purchase', 'screener']

/** One issuance, as the balance reads it. */
export interface CreditLot {
  source: CreditSource
  /** Credits left in this lot, after everything already spent against it. */
  remaining: number
  /** When it dies. Null for a purchase, which never does. */
  expiresAt: string | null
}

export interface CreditBalance {
  /** Everything unexpired and unheld, by source. */
  bySource: Record<CreditSource, number>
  /** The number a screen shows. Sum of the three. */
  total: number
  /** Held by a rep that has connected and has not been graded yet. */
  held: number
  /** What a new interview may draw on. `total` minus `held`, floored at zero. */
  available: number
}

const EMPTY: Record<CreditSource, number> = { grant: 0, purchase: 0, screener: 0 }

/**
 * The balance, from the lots and the holds.
 *
 * A hold is money already promised to a rep that is running. Counting it as
 * spendable is how one account opens two twenty-minute interviews on one
 * credit, which is the same failure `voice_sessions` reserves against and the
 * same fix.
 */
export function creditBalance(input: {
  lots: readonly CreditLot[]
  holds: number
  now?: Date
}): CreditBalance {
  const now = input.now ?? new Date()
  const bySource = { ...EMPTY }
  for (const lot of input.lots) {
    if (lot.remaining <= 0) continue
    if (expired(lot, now)) continue
    bySource[lot.source] += lot.remaining
  }
  const total = bySource.grant + bySource.purchase + bySource.screener
  const held = Math.max(0, input.holds)
  return { bySource, total, held, available: Math.max(0, total - held) }
}

export function expired(lot: Pick<CreditLot, 'expiresAt'>, now: Date = new Date()): boolean {
  if (!lot.expiresAt) return false
  const at = Date.parse(lot.expiresAt)
  return Number.isFinite(at) && at <= now.getTime()
}

/**
 * Which lot pays for the next interview, or null when nothing can.
 *
 * Within a source the soonest expiry goes first, for the same reason the
 * sources are ordered at all. A lot with no expiry sorts last, which for a
 * purchase is every lot and therefore a stable oldest-first ordering by the
 * ledger's own insertion order.
 */
export function nextLotToSpend(
  lots: readonly CreditLot[],
  options: { round?: RoundTypeId; now?: Date } = {},
): CreditLot | null {
  const now = options.now ?? new Date()
  const round = options.round ?? 'recruiter'
  for (const source of SPEND_ORDER) {
    // The screener buys the screener round and nothing else. It is a sample of
    // the product, not a discount on it.
    if (source === 'screener' && round !== SCREENER_ROUND) continue
    const candidates = lots
      .filter((lot) => lot.source === source && lot.remaining > 0 && !expired(lot, now))
      .sort((a, b) => expiryRank(a) - expiryRank(b))
    const first = candidates[0]
    if (first) return first
  }
  return null
}

/**
 * How many credits can actually pay for THIS round.
 *
 * ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * `creditBalance().available` is the sum of every source, and a screener credit
 * only ever buys the five-minute screener — `nextLotToSpend` skips it for any
 * other round, which is the rule and is correct. The two numbers disagree for
 * exactly one account shape, and it is a shape the dev grant produces by
 * default: **one screener credit and no purchases.**
 *
 * Measured on 7 September, on a real account. The pill said one credit, the
 * brief let the rep start, the live screen let it connect, and
 * `/api/voice/token` answered 402 three times — surfaced as *"Connection lost"*,
 * with a Retry that could never succeed. Every gate in the UI was asking a
 * question whose answer had nothing to do with whether the rep could run.
 *
 * So the gate asks the same question the spender does. A round nobody can pay
 * for is refused on the brief, in a sentence, before the microphone opens.
 */
export function spendableFor(
  lots: readonly CreditLot[],
  options: { round: RoundTypeId; holds?: number; now?: Date },
): number {
  const now = options.now ?? new Date()
  const usable = lots.filter((lot) => {
    if (lot.remaining <= 0 || expired(lot, now)) return false
    // The one asymmetry, and it is the whole reason this function exists.
    return lot.source !== 'screener' || options.round === SCREENER_ROUND
  })
  const total = usable.reduce((sum, lot) => sum + lot.remaining, 0)
  return Math.max(0, total - Math.max(0, options.holds ?? 0))
}

/** Does this account hold the free screener? Decides whether to offer it. */
export function hasScreenerCredit(lots: readonly CreditLot[], now: Date = new Date()): boolean {
  return lots.some((lot) => lot.source === 'screener' && lot.remaining > 0 && !expired(lot, now))
}

function expiryRank(lot: CreditLot): number {
  if (!lot.expiresAt) return Number.POSITIVE_INFINITY
  const at = Date.parse(lot.expiresAt)
  return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY
}

/* ------------------------------------------------------------------ *
 * Rounds
 * ------------------------------------------------------------------ */

/**
 * LENGTH IS A PROPERTY OF THE ROUND (§5.7).
 *
 * `INTERVIEW_DURATION_MS` was one number for the whole track and
 * `rep-screens.tsx` hardcoded a second copy of it, so the two could already
 * disagree. A round is what actually decides how long this is: a recruiter
 * screen is ten minutes and a deep technical is twenty-five, and pretending
 * they are the same item is how a pack of five gets spent on tutorials.
 *
 * Authored here and seeded, never generated (rule 10). The dating rep's
 * `DATING_DURATION_MS` is untouched and is not in this table.
 */
export type RoundTypeId = 'screener' | 'recruiter' | 'technical' | 'deep_technical' | 'final'

/**
 * WHAT KIND OF INTERVIEW THIS IS (INTERVIEW-TECHNICAL-PLAN §4).
 *
 * Until 7 September a round carried a length and nothing else, so `technical`
 * and `final` differed by the wind-down alone and both asked the same six
 * experiential questions. Four reps on a real microphone found the
 * consequence: **not one question in any of them asked whether the candidate
 * KNEW anything.** The shape is what fixes that — it decides which opener she
 * gets and which ladder the probe beat climbs.
 */
export type RoundShape = 'behavioural' | 'mixed_technical' | 'system_design'

/**
 * What her FIRST TURN is about.
 *
 * She still answers rather than opens — the unprompted opening turn was cut on
 * 7 September and is not in this plan (§9) — so this is what her first reply
 * is steered toward, not a line she says into silence.
 */
export type RoundOpener = 'project' | 'brief' | 'background'

export interface RoundType {
  id: RoundTypeId
  label: string
  /** One line on the brief. What this round actually is. */
  description: string
  durationMs: number
  /** How many questions the agenda plans for. See `lib/data/interview-agenda.ts`. */
  questions: number
  /** Credits it costs. The screener costs none and is its own lot. */
  credits: number
  /** Extra beat at the wind-down, past "any questions for me?". */
  nextSteps: boolean
  /** What KIND of interview this is. Decides the opener and the ladder. */
  shape: RoundShape
  /**
   * How much of the round is knowledge probing rather than experience. 0-1.
   *
   * **A TARGET AND NEVER A QUOTA.** `INTERVIEW-PLAN.md` §14 records what a hard
   * per-turn quota did the first time: the 40% question share gagged an
   * interviewer on four turns in five, the directive was ignored every time,
   * and a directive disobeyed every turn teaches the model that the bracketed
   * line is optional. So this drives how often the probe beat is DUE
   * (`dueProbeBeat`) and refuses nothing.
   */
  probeShare: number
  /** What her first turn is about. */
  opener: RoundOpener
}

/** The free five-minute round, and the only thing a screener credit buys. */
export const SCREENER_ROUND: RoundTypeId = 'screener'

export const ROUND_TYPES: readonly RoundType[] = [
  {
    id: 'screener',
    label: 'Screener',
    description: 'Five minutes. Two or three questions and one back to them.',
    durationMs: 300_000,
    questions: 3,
    credits: 0,
    nextSteps: false,
    // Five minutes, and it is free. There is no room in it for a probe ladder,
    // and spending the one free sample on a fundamentals test would misdescribe
    // the product to the person least able to tell.
    shape: 'behavioural',
    probeShare: 0,
    opener: 'background',
  },
  {
    id: 'recruiter',
    label: 'Recruiter screen',
    description: 'Ten minutes. Motivation, background, and whether you can say what you did.',
    durationMs: 600_000,
    questions: 5,
    credits: 1,
    nextSteps: false,
    // A recruiter does not test fundamentals. Real ones do not, and pretending
    // otherwise teaches the wrong thing about who is in the room.
    shape: 'behavioural',
    probeShare: 0,
    opener: 'background',
  },
  {
    id: 'technical',
    label: 'Technical',
    description: 'Twenty minutes. Your projects, and the fundamentals underneath them.'
      + ' Expect to be asked how things work, not only what you built.',
    durationMs: 1_200_000,
    questions: 6,
    credits: 1,
    nextSteps: true,
    // Their own work is the RAW MATERIAL, not the subject: she opens on a
    // project, mines it for a hook and tests the fundamental underneath it.
    shape: 'mixed_technical',
    probeShare: 0.5,
    opener: 'project',
  },
  {
    id: 'deep_technical',
    label: 'Deep technical',
    description: 'Twenty-five minutes. A system design problem, taken all the way down.'
      + ' Not about your CV.',
    durationMs: 1_500_000,
    questions: 5,
    credits: 1,
    nextSteps: true,
    // A DIFFERENT INTERVIEW, and it needs saying clearly: the candidate's own
    // projects do not come up at all. The old description — "one problem, taken
    // all the way down" — drove her further INTO a single project rather than
    // out of it, which is how rep `e9c74f80` became eleven consecutive
    // questions about one web app.
    shape: 'system_design',
    probeShare: 0.7,
    opener: 'brief',
  },
  {
    id: 'final',
    label: 'Final round',
    description: 'Twenty minutes of behavioural questions and the ones you ask back.',
    durationMs: 1_200_000,
    questions: 6,
    credits: 1,
    nextSteps: true,
    // Behavioural by definition, plus the questions they ask back.
    shape: 'behavioural',
    probeShare: 0,
    opener: 'background',
  },
]

export const DEFAULT_ROUND: RoundTypeId = 'recruiter'

export function roundType(id: string | null | undefined): RoundType {
  return ROUND_TYPES.find((round) => round.id === id)
    ?? ROUND_TYPES.find((round) => round.id === DEFAULT_ROUND)!
}

export function isRoundTypeId(value: unknown): value is RoundTypeId {
  return typeof value === 'string' && ROUND_TYPES.some((round) => round.id === value)
}

/**
 * The word the picker shows for a shape.
 *
 * §4.4: two of the first four reps ran on `recruiter` because it is
 * `DEFAULT_ROUND` and nothing on the screen said "this one is not technical".
 * A round that changes what the interview IS cannot be a quiet dropdown
 * default, so the shape is a visible property rather than an inferred one.
 */
export const ROUND_SHAPE_LABEL: Record<RoundShape, string> = {
  behavioural: 'Behavioural',
  mixed_technical: 'Projects + fundamentals',
  system_design: 'System design',
}

/** Does this round probe what the candidate knows, rather than what they did? */
export function roundProbes(id: string | null | undefined): boolean {
  return roundType(id).probeShare > 0
}
