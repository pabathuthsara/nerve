/**
 * OUTCOME INVARIANCE — rule 2, tested (PERSONA-REALISM S1).
 *
 * "Outcome is never scored. A clean rep that ends in rejection can score 92."
 * The rubric says it in capitals, the scorecard explainer says it, the first-
 * rejection sheet says it — and nothing had ever checked that the grader
 * believes it. The data says it might not: composite and peak warmth
 * correlate at 0.67–0.80 on rungs 2–4, and `close` averages 38–45 there
 * against 60 on Cass, where she offers her number 89% of the time. Some of
 * that is correct (good process warms her). Some of it would be exactly what
 * outcome leaking into the grade looks like, and until now there was no way to
 * tell the two apart.
 *
 * This is the way. Each pair is ONE real collected rep, cut before its own
 * ending, and finished twice — identically on his side, differently on hers:
 *
 *   offer   she winds it down herself, and either offers her number or leaves
 *   ask     he asks for her number, the same words both times, and she either
 *           says yes or turns him down
 *
 * Same words from him, same timestamps on every turn, so the deterministic
 * 60% is byte-identical by construction (and the test asserts it). Whatever
 * moves between the two grades moved because of what SHE did, which is the
 * outcome, which is worth zero.
 *
 * ── THE TOLERANCE ─────────────────────────────────────────────────────────
 *
 * Derived, not chosen. The calibration suite already states what noise is on
 * one dimension: `MAX_DRIFT`, five points. With the measured half identical,
 * the composite can only move by the judged half's weight times the judged
 * mean's move — so five points of honest noise on the judged mean is two on
 * the composite, and one more for rounding. Three.
 *
 * Three gates, because a leak can hide from any one of them:
 *
 *   per pair, composite     |Δ| ≤ OUTCOME_TOLERANCE
 *   per pair, dimension     |Δ| ≤ MAX_DRIFT on each of the six — `close` is
 *                           the one the report suspects, and a 15-point leak
 *                           on `close` alone moves the composite by one
 *   across pairs, direction the mean signed composite Δ within half the
 *                           tolerance, once there are three pairs: noise
 *                           cancels, a leak does not
 *
 * Δ is always (she gave her number) − (she did not), so a positive number is
 * the direction a leak would push.
 *
 * Pure. The runners are `scripts/grade-invariance.ts` (in-process, no server)
 * and `scripts/grade-calibrate.ts` (the deployed route).
 */

import { CALIBRATION_TRANSCRIPTS, type CollectedTranscript } from './transcripts'
import { MAX_DRIFT } from './fixtures'
import { gradeEligibility } from '../eligibility'
import { JUDGEMENT_WEIGHT, SUB_SCORE_KEYS, type SubScores } from '../types'

type Turn = CollectedTranscript['transcript'][number]

export type EndingKind = 'offer' | 'ask'

/** Composite points a pair may move by. See the header for the derivation. */
export const OUTCOME_TOLERANCE = Math.round(JUDGEMENT_WEIGHT * MAX_DRIFT) + 1

/** The largest mean signed composite Δ across pairs that is still noise. */
export const OUTCOME_BIAS_TOLERANCE = OUTCOME_TOLERANCE / 2

/** Pairs needed before the direction gate means anything. */
export const MIN_PAIRS_FOR_BIAS = 3

/**
 * Where the real rep is cut: ten seconds before the thirty-second wind-down,
 * or four fifths of a shorter one. Either way before its own ending, so the
 * appended one does not argue with a real one.
 */
export const CUT_SECONDS = 140
const CUT_FRACTION = 0.8

/** The gap between turns, and how long each appended line runs. */
const GAP = 0.7
const HER_LINE = 3.4
const HIS_LINE = 3.2

/**
 * The endings. Hers are written in the register the wind-down directives in
 * `lib/data/rep.ts` ask for — warm and brief with no digits when she offers,
 * the product's own exit line when she leaves — and his ask is a clean one: a
 * specific plan, no pressure, so `planQuality` is the same full marks both
 * times and there is nothing about HIM for a grader to prefer.
 */
export const ENDINGS = {
  offer: {
    number: "I have to run, but I'd like to hear from you. Let me give you my number. Message me.",
    leaves: 'I have to run. I should get back to it. Take care.',
  },
  ask: {
    his: "I've really enjoyed this. Could I get your number, and take you for a coffee on Thursday?",
    number: "I'd like that. Here, let me put my number in your phone.",
    leaves: "That's kind, but I'll pass. I should get back to it. Take care.",
  },
} as const

export interface OutcomePair {
  /** `<transcript id>:<kind>`. */
  id: string
  kind: EndingKind
  /** The collected rep it was cut from. */
  source: string
  personaName: string
  sessionSeconds: number
  /** She gives her number. */
  number: Turn[]
  /** She does not. */
  leaves: Turn[]
}

const round1 = (value: number): number => Math.round(value * 10) / 10

/**
 * One collected rep, cut and finished both ways. Null when the cut leaves too
 * little to grade — the pair would be refused by the route before it reached
 * a model, and a pair that measures nothing is not a pair.
 */
export function outcomePair(fixture: CollectedTranscript, kind: EndingKind): OutcomePair | null {
  const turns = fixture.transcript
  const lastEnd = turns.reduce((latest, turn) => Math.max(latest, turn.t_end), 0)
  const cut = Math.min(CUT_SECONDS, lastEnd * CUT_FRACTION)
  const prefix = turns.filter((turn) => turn.t_end <= cut).map((turn) => ({ ...turn }))

  // `offer` ends on his line so hers answers it; `ask` ends on hers so his
  // question follows something she said.
  const endsOn: Turn['speaker'] = kind === 'offer' ? 'user' : 'agent'
  while (prefix.length > 0 && prefix[prefix.length - 1]?.speaker !== endsOn) prefix.pop()
  const last = prefix[prefix.length - 1]
  if (!last) return null

  let at = round1(last.t_end + GAP)
  const lead: Turn[] = []
  if (kind === 'ask') {
    lead.push({ speaker: 'user', text: ENDINGS.ask.his, t_start: at, t_end: round1(at + HIS_LINE) })
    at = round1(at + HIS_LINE + GAP)
  }
  // Her last line, at the same timestamps both times: the measured half reads
  // durations and gaps, and it must see nothing but the words change.
  const herTurn = (text: string): Turn => ({ speaker: 'agent', text, t_start: at, t_end: round1(at + HER_LINE) })
  const number = [...prefix, ...lead, herTurn(ENDINGS[kind].number)]
  const leaves = [...prefix, ...lead, herTurn(ENDINGS[kind].leaves)]
  const sessionSeconds = round1(at + HER_LINE + 0.5)

  for (const transcript of [number, leaves]) {
    if (!gradeEligibility({ sessionSeconds, transcript }).ok) return null
  }
  return {
    id: `${fixture.id}:${kind}`,
    kind,
    source: fixture.source,
    personaName: fixture.personaName,
    sessionSeconds,
    number,
    leaves,
  }
}

/**
 * Every collected rep, one pair each, the two kinds alternating — so any
 * prefix of this list (`--limit`) tests both endings rather than one twice.
 */
export const OUTCOME_PAIRS: OutcomePair[] = CALIBRATION_TRANSCRIPTS.flatMap((fixture, index) => {
  const pair = outcomePair(fixture, index % 2 === 0 ? 'offer' : 'ask')
  return pair ? [pair] : []
})

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

export interface GradedVariant {
  composite: number
  subScores: SubScores
}

export interface PairOutcome {
  id: string
  kind: EndingKind
  number: GradedVariant
  leaves: GradedVariant
}

export interface PairDelta {
  id: string
  kind: EndingKind
  /** (she gave her number) − (she did not). */
  composite: number
  dimensions: Record<keyof SubScores, number>
  worst: { dimension: keyof SubScores; delta: number }
  ok: boolean
}

export interface InvarianceReport {
  pairs: PairDelta[]
  /** Mean signed Δ across pairs. Noise centres on zero; a leak does not. */
  meanComposite: number
  meanDimensions: Record<keyof SubScores, number>
  ok: boolean
  /** Why it failed, one line each. Empty when it passed. */
  failures: string[]
}

export function invarianceReport(outcomes: readonly PairOutcome[]): InvarianceReport {
  const failures: string[] = []
  const pairs = outcomes.map((outcome): PairDelta => {
    const dimensions = Object.fromEntries(
      SUB_SCORE_KEYS.map((key) => [key, outcome.number.subScores[key] - outcome.leaves.subScores[key]]),
    ) as Record<keyof SubScores, number>
    const worstKey = [...SUB_SCORE_KEYS].sort((a, b) => Math.abs(dimensions[b]) - Math.abs(dimensions[a]))[0] ?? 'close'
    const composite = outcome.number.composite - outcome.leaves.composite
    const compositeOk = Math.abs(composite) <= OUTCOME_TOLERANCE
    const dimensionsOk = Math.abs(dimensions[worstKey]) <= MAX_DRIFT
    if (!compositeOk) failures.push(`${outcome.id}: composite moved ${signed(composite)} (tolerance ±${OUTCOME_TOLERANCE})`)
    if (!dimensionsOk) failures.push(`${outcome.id}: ${worstKey} moved ${signed(dimensions[worstKey])} (tolerance ±${MAX_DRIFT})`)
    return {
      id: outcome.id,
      kind: outcome.kind,
      composite,
      dimensions,
      worst: { dimension: worstKey, delta: dimensions[worstKey] },
      ok: compositeOk && dimensionsOk,
    }
  })

  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
  const meanComposite = mean(pairs.map((pair) => pair.composite))
  const meanDimensions = Object.fromEntries(
    SUB_SCORE_KEYS.map((key) => [key, mean(pairs.map((pair) => pair.dimensions[key]))]),
  ) as Record<keyof SubScores, number>
  if (pairs.length >= MIN_PAIRS_FOR_BIAS && Math.abs(meanComposite) > OUTCOME_BIAS_TOLERANCE) {
    failures.push(`every pair together leaned ${signed(round1(meanComposite))} toward the ending (tolerance ±${OUTCOME_BIAS_TOLERANCE})`)
  }

  return { pairs, meanComposite, meanDimensions, ok: failures.length === 0, failures }
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

/* ------------------------------------------------------------------ *
 * The run, with the grader passed in
 * ------------------------------------------------------------------ */

/**
 * Grades one transcript however the caller grades — over HTTP against the
 * deployed route, or by calling the route handler in-process. Null is a grade
 * that did not come back, which fails the pair rather than skipping it: an
 * invariance check that quietly measured fewer pairs than it printed is the
 * failure this file exists to prevent, one level up.
 */
export type GradeOne = (input: {
  transcript: Turn[]
  sessionSeconds: number
  personaName: string
}) => Promise<GradedVariant | null>

export interface InvarianceRun {
  report: InvarianceReport
  /** Pairs where either grade did not come back. */
  unreadable: string[]
  lines: string[]
}

/**
 * Grade every pair both ways, in order, and say what moved.
 *
 * Sequential on purpose: two dozen concurrent calls to the strongest model on
 * the account is a rate-limit test, not a calibration.
 */
export async function runInvariance(pairs: readonly OutcomePair[], grade: GradeOne): Promise<InvarianceRun> {
  const outcomes: PairOutcome[] = []
  const unreadable: string[] = []
  const lines: string[] = [
    '  pair                                  kind    number  leaves     Δ   largest dimension Δ',
  ]
  for (const pair of pairs) {
    const number = await grade({ transcript: pair.number, sessionSeconds: pair.sessionSeconds, personaName: pair.personaName })
    const leaves = await grade({ transcript: pair.leaves, sessionSeconds: pair.sessionSeconds, personaName: pair.personaName })
    if (!number || !leaves) {
      unreadable.push(pair.id)
      lines.push(`  ${pair.id.padEnd(37)} ${pair.kind.padEnd(6)}  no grade came back`)
      continue
    }
    const outcome: PairOutcome = { id: pair.id, kind: pair.kind, number, leaves }
    outcomes.push(outcome)
    const delta = invarianceReport([outcome]).pairs[0]
    if (!delta) continue
    lines.push(
      `  ${pair.id.padEnd(37)} ${pair.kind.padEnd(6)} ${String(number.composite).padStart(7)} ${String(leaves.composite).padStart(7)} `
      + `${signed(delta.composite).padStart(5)}   ${delta.worst.dimension} ${signed(delta.worst.delta)}${delta.ok ? '' : '   FAIL'}`,
    )
  }
  const report = invarianceReport(outcomes)
  lines.push('')
  lines.push(`  mean Δ, composite ${signed(round1(report.meanComposite))} · `
    + SUB_SCORE_KEYS.map((key) => `${key} ${signed(round1(report.meanDimensions[key]))}`).join(' · '))
  return { report, unreadable, lines }
}
