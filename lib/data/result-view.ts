/**
 * What the result and scorecard screens say about a graded rep, as values.
 *
 * Pure, and in `lib/` rather than in the screen, for the reason
 * `resultReading` is: "you missed Level 02 by six" and "Level 02 opened" are
 * decisions, and a decision that lives in a component's arithmetic is one
 * nobody can test. Nothing here reads the database or touches a persona; it
 * only arranges numbers the screens already have (27 Sep, START-AUDIT §5).
 */

import { LEVEL_NAMES, UNLOCK_SCORE, type UnlockProgress } from './progression'
import type { Level, MetricBand, JudgementBand, SessionSummary } from './types'

/* ------------------------------------------------------------------ *
 * The score rail on the result screen
 * ------------------------------------------------------------------ */

export type ProgressReading =
  /** The grade has not landed. The rail draws its outline and says so. */
  | { kind: 'pending' }
  /** This rep was the one that opened the tier. */
  | { kind: 'unlocked'; level: Level; name: string }
  /** It counted, and the tier wants more than one. */
  | { kind: 'counted'; level: Level; name: string; have: number; need: number }
  /** It was at the right tier and fell short of the line. */
  | { kind: 'short'; level: Level; name: string; by: number }
  /** It was at a tier that does not feed the next unlock. */
  | { kind: 'elsewhere'; level: Level; name: string; fromLevel: Level }
  /** Nothing left to open, or not a dating rep. */
  | { kind: 'none' }

/**
 * The one line under the score rail.
 *
 * `before` is the next unlock computed from every earlier rep, `after` the
 * same with this rep included. They differ in level exactly when this rep
 * finished a gate — which is the only honest way to say "this opened it":
 * inferring it from the score alone would announce an unlock for a 72 on a
 * tier that needs two.
 *
 * The line exists because the old meter said "0 of 1 rep at 70+ on Level 01"
 * under "She gave you her number" whenever the grade had not arrived, and it
 * could not tell somebody which of "still scoring" or "under 70" was true.
 */
export function progressReading(input: {
  composite: number | null
  repLevel: Level | null
  before: UnlockProgress | null
  after: UnlockProgress | null
}): ProgressReading {
  const { composite, repLevel, before, after } = input
  if (!before && !after) return { kind: 'none' }
  if (composite === null) return { kind: 'pending' }
  if (before && (!after || after.level !== before.level)) {
    return { kind: 'unlocked', level: before.level, name: LEVEL_NAMES[before.level] }
  }
  if (!after) return { kind: 'none' }
  const name = LEVEL_NAMES[after.level]
  if (repLevel !== after.fromLevel) return { kind: 'elsewhere', level: after.level, name, fromLevel: after.fromLevel }
  if (composite >= UNLOCK_SCORE) return { kind: 'counted', level: after.level, name, have: after.have, need: after.need }
  return { kind: 'short', level: after.level, name, by: UNLOCK_SCORE - composite }
}

export function progressSentence(reading: ProgressReading): string | null {
  const tier = (level: Level, name: string) => `Level ${String(level).padStart(2, '0')} — ${name}`
  switch (reading.kind) {
    case 'pending': return 'Scoring your rep…'
    case 'unlocked': return `${tier(reading.level, reading.name)} is open.`
    case 'counted': {
      const left = reading.need - reading.have
      return left <= 0
        ? `${tier(reading.level, reading.name)} is open.`
        : `That one counted. ${left} more at ${UNLOCK_SCORE}+ opens ${tier(reading.level, reading.name)}.`
    }
    case 'short': return `${reading.by} ${reading.by === 1 ? 'point' : 'points'} short of ${tier(reading.level, reading.name)}.`
    case 'elsewhere': return `${tier(reading.level, reading.name)} opens with ${UNLOCK_SCORE}+ on Level ${String(reading.fromLevel).padStart(2, '0')}.`
    case 'none': return null
  }
}

/* ------------------------------------------------------------------ *
 * The scorecard
 * ------------------------------------------------------------------ */

/**
 * The parts the composite is made of, in the order the audit line adds them.
 * `lost` is what each part left on the table, so the bar can draw the gap.
 */
export interface PointPart { key: string; label: string; points: number; max: number; lost: number }

export function pointParts(metrics: readonly MetricBand[], judgement: JudgementBand | null): PointPart[] {
  const parts: PointPart[] = metrics.map((metric) => ({
    key: metric.key,
    label: metric.label,
    points: metric.points,
    max: metric.maxPoints,
    lost: Math.max(0, metric.maxPoints - metric.points),
  }))
  if (judgement) {
    parts.push({
      key: 'judgement',
      label: judgement.label,
      points: judgement.points,
      max: judgement.maxPoints,
      lost: Math.max(0, judgement.maxPoints - judgement.points),
    })
  }
  return parts
}

/**
 * The metrics that cost points, and the ones that did not.
 *
 * "Cost" is losing more than a fifth of what the row was worth. A 9/10 is a
 * row the screen should not spend a paragraph on; a 2/10 is the paragraph.
 * Misses are ordered by what they cost, so the first thing read is the
 * biggest lever.
 */
export function splitMetrics(metrics: readonly MetricBand[]): { misses: MetricBand[]; held: MetricBand[] } {
  const missed = (metric: MetricBand) => metric.points < metric.maxPoints * 0.8
  return {
    misses: metrics.filter(missed).sort((a, b) => (b.maxPoints - b.points) - (a.maxPoints - a.points)),
    held: metrics.filter((metric) => !missed(metric)),
  }
}

/**
 * The graded rep before this one on the same track, for "+8 on your last".
 * History is newest-first; "before" is by start time, not by position, so an
 * old rep opened from history compares against the rep before IT.
 */
export function previousComposite(
  history: readonly Pick<SessionSummary, 'id' | 'track' | 'startedAt' | 'compositeScore'>[],
  session: Pick<SessionSummary, 'id' | 'track' | 'startedAt'>,
): number | null {
  const started = Date.parse(session.startedAt)
  const earlier = history
    .filter((row) => row.id !== session.id && row.track === session.track && row.compositeScore !== null && Date.parse(row.startedAt) < started)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  return earlier[0]?.compositeScore ?? null
}

/* ------------------------------------------------------------------ *
 * A moment's note, in words
 * ------------------------------------------------------------------ */

/**
 * The live scorer's reason codes, as sentences (27 Sep).
 *
 * A moment's note is whatever the meter recorded, and the fast scorer records
 * codes — so the scorecard printed "open-question" and "no signal" under the
 * two moments that are supposed to be the most human thing on the page. The
 * texting debrief solved the same problem for its own format
 * (`readableReasons`). A note that is already a sentence is passed through; an
 * unknown code is de-hyphenated rather than dropped, because a missing
 * explanation is worse than a plain one.
 */
const MOMENT_NOTES: Record<string, (p: { she: string; her: string }) => string> = {
  'open-question': ({ her }) => `An open question — it gave ${her} something to answer.`,
  'engaged-length': ({ her }) => `A real answer, long enough to give ${her} something back.`,
  callback: ({ she }) => `You used something ${she} had said earlier.`,
  contempt: () => 'It read as dismissive.',
  'dead-end': ({ her }) => `A short reply with nowhere for ${her} to go.`,
  'dead-end-streak': () => 'Several short replies in a row — the conversation stalled.',
  'filler-rate': () => 'Fillers crowded the point.',
  hesitation: () => 'A long pause before you answered.',
  overreach: ({ she }) => `It moved faster than ${she} was ready for.`,
  'no signal': ({ she }) => `${she.charAt(0).toUpperCase()}${she.slice(1)} did not react either way.`,
}

/** `interview` swaps the pronouns: an interviewer is "they", not "she". */
export function momentNote(note: string, interview = false): string {
  const trimmed = note.trim()
  const known = MOMENT_NOTES[trimmed]
  if (known) return known(interview ? { she: 'they', her: 'them' } : { she: 'she', her: 'her' })
  if (/\s/.test(trimmed)) return trimmed
  const words = trimmed.replace(/[-_]+/g, ' ').trim()
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}.` : ''
}
