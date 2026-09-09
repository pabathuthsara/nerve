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

/**
 * THE SPEND, ACROSS AS MANY LOTS AS IT TAKES (§5.7, LAUNCH-GAP B3).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Until 8 September every paid round cost exactly one credit, so `nextLotToSpend`
 * — one lot, one credit — was the whole spender. A deep technical is twenty-five
 * minutes against a recruiter screen's ten and was earning the same revenue, so
 * a rational buyer never spent a credit on the cheapest, friendliest and most
 * convertible round in the product. A round costs more than one credit now,
 * which means a spend can be **two credits drawn from two lots**, and the ledger
 * has to be able to say which. The arithmetic is deliberately written for an
 * arbitrary cost rather than for two: the ladder has already moved once.
 *
 * The ordering is unchanged and is still the whole point: expiring first, within
 * a source soonest-expiry first, screener last and only for the round it buys.
 * This walks that same order and takes what it needs from each lot in turn.
 *
 * **All or nothing.** Null when the lots cannot cover the cost — a partial spend
 * would take somebody's credits and give them no interview, which is the one
 * outcome worse than refusing on the brief.
 */
export interface CreditDraw {
  source: CreditSource
  /** Credits taken from this source. Always at least one. */
  amount: number
}

export function planSpend(
  lots: readonly CreditLot[],
  options: { round: RoundTypeId; cost?: number; now?: Date },
): CreditDraw[] | null {
  const now = options.now ?? new Date()
  let owed = Math.max(0, options.cost ?? creditCost(options.round))
  if (owed === 0) return []

  const draws: CreditDraw[] = []
  for (const source of SPEND_ORDER) {
    // The screener buys the screener round and nothing else. It is a sample of
    // the product, not a discount on it.
    if (source === 'screener' && options.round !== SCREENER_ROUND) continue
    const candidates = lots
      .filter((lot) => lot.source === source && lot.remaining > 0 && !expired(lot, now))
      .sort((a, b) => expiryRank(a) - expiryRank(b))
    for (const lot of candidates) {
      if (owed === 0) break
      const take = Math.min(owed, lot.remaining)
      owed -= take
      const existing = draws.find((draw) => draw.source === source)
      if (existing) existing.amount += take
      else draws.push({ source, amount: take })
    }
    if (owed === 0) break
  }

  return owed === 0 ? draws : null
}

/** What this round costs, from the one authored table. */
export function creditCost(round: string | null | undefined): number {
  return roundType(round).credits
}

/**
 * Can this balance start this round?
 *
 * The gate every screen asks, so that no screen invents its own arithmetic. It
 * was `spendable > 0` in three places, which was right while every round cost
 * one and is a rep sent to the microphone to be refused now that they do not.
 */
export function canAfford(spendable: number, round: string | null | undefined): boolean {
  return spendable >= creditCost(round)
}

/**
 * The round a setup opens on (LAUNCH-GAP B1).
 *
 * ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * Every account is granted one `screener` credit at sign-up, and a screener
 * credit buys the five-minute Screener round and nothing else. `DEFAULT_ROUND`
 * is `recruiter`, so a brand-new account walked the whole setup, arrived at
 * `/interview`, and read *"a recruiter screen costs one credit, and there are
 * none in the account"* — while the pill in the chrome said **1 credit**, which
 * is the account total. Two numbers on one screen disagreeing, at the exact
 * moment the landing page's promise of a free interview should have been paying
 * off. The one giveaway on every account in the database failed silently at the
 * moment of redemption.
 *
 * So the opening round is the one the account can actually pay for. It is a
 * default and never a lock: the picker still offers every round, and a saved
 * setup always wins over this.
 */
export function openingRound(hasScreener: boolean): RoundTypeId {
  return hasScreener ? SCREENER_ROUND : DEFAULT_ROUND
}

/**
 * Why this balance cannot open this round, in a sentence a person can act on.
 *
 * Null when it can. One function because three surfaces say it — the interview
 * home, the brief and the live page — and they were three hand-written strings,
 * two of which only knew about the screener case. Since B3 there is a second
 * shape they all have to handle: an account with two credits looking at a
 * three-credit deep technical is not empty, and "you have no interview credits"
 * would be plainly false.
 */
export function creditRefusal(input: {
  /** What can pay for this round, holds already taken off. */
  spendable: number
  round: string | null | undefined
  /** Whether the account is holding the free five-minute screener. */
  hasScreener: boolean
}): string | null {
  const spec = roundType(input.round)
  if (input.spendable >= spec.credits) return null

  if (spec.credits === 0) return 'Your free screener has already been used.'

  if (input.hasScreener && input.spendable === 0) {
    return 'Your free screener only pays for the five-minute screener round. Pick that one on your setup, or add credits for the longer rounds.'
  }

  if (spec.credits === 1) {
    return `A ${spec.label.toLowerCase()} costs one credit, and there are none in the account.`
  }

  return input.spendable === 0
    ? `A ${spec.label.toLowerCase()} costs ${spec.credits} credits, and there are none in the account.`
    : `A ${spec.label.toLowerCase()} costs ${spec.credits} credits and there ${input.spendable === 1 ? 'is one' : `are ${input.spendable}`} in the account. Add credits, or pick a shorter round on your setup.`
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
    credits: 2,
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
    // TWO, NOT THREE, AND THE REASON IS MEASURED (9 September).
    //
    // The ladder was authored off MINUTES — ten, twenty, twenty-five, twenty —
    // on the assumption that a longer round costs proportionally more to run.
    // It does not. Costed component by component off `voice_operations`, a
    // deep technical runs at ~$0.41 against a technical's ~$0.34: it is 1.2x
    // the cost and was 1.5x the price. What actually scales is her airtime,
    // and an interviewer talks LESS of a long round, not more.
    //
    // Three credits also put the product's best round out of reach of the
    // entry pack and of Pro entirely, which is the opposite of what a ladder
    // is for. The screener stays at one, so B3's finding — nobody spends a
    // credit on the cheapest, friendliest, most convertible round when
    // everything costs the same — is untouched: the screen is still half
    // price, and the three long rounds are now chosen on FIT rather than on
    // price, which is the only basis on which they differ.
    credits: 2,
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
    credits: 2,
    nextSteps: true,
    // Behavioural by definition, plus the questions they ask back.
    shape: 'behavioural',
    probeShare: 0,
    opener: 'background',
  },
]

/**
 * What each round costs, as a screen draws it rather than as a sentence.
 *
 * ── WHY A TABLE AND NOT ONLY `ROUND_COST_NOTE` ───────────────────────────
 *
 * The one string reads *"A ten-minute recruiter screen is one credit; every
 * longer round — technical, deep technical, final — is two."* That is exactly
 * right in a paywall sheet and on a marketing aside, where there is room for a
 * sentence and nothing else. On the credits card it was rendered as `.label`,
 * which is 11px uppercase mono — a tag style, wrapped over two lines and asked
 * to carry the one fact a buyer has to do arithmetic with. Somebody deciding
 * between eight credits and twenty has to know what a round costs, and they
 * were reading it in the typeface used for the word "AVAILABLE".
 *
 * So the same fact gets a second rendering with rows a reader can scan, and
 * **both are derived from `ROUND_TYPES`** — the credits column is not retyped
 * here, and `interview-credits.test.ts` asserts the sentence and this table
 * cannot come to disagree.
 *
 * The screener is included at zero. It is a real answer to "what does this
 * cost", it is what a new account is holding, and leaving it out would make the
 * table describe a product with no free round in it.
 */
export interface RoundCostRow {
  id: RoundTypeId
  label: string
  /** Whole minutes, which is how every round is authored and how one is sold. */
  minutes: number
  credits: number
}

export const ROUND_COST_ROWS: readonly RoundCostRow[] = ROUND_TYPES.map((round) => ({
  id: round.id,
  label: round.label,
  minutes: Math.round(round.durationMs / 60_000),
  credits: round.credits,
}))

/** What one row's price says. `Free` rather than `0 credits`, which reads as an error. */
export function roundCostLabel(row: RoundCostRow): string {
  if (row.credits === 0) return 'Free'
  return `${row.credits} credit${row.credits === 1 ? '' : 's'}`
}

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
