/**
 * The judgement seam, on the grading side (INTERVIEW-PLAN B2, B6).
 *
 * One selector reading `persona.track`, dating as the default branch, and
 * `lib/grade/prompt.ts` never opened. The route resolves a character by NAME
 * because that is what the client sends it — the same lookup `scorerPlaceFor`
 * already does, and for the same reason: a name is interpolated as a name and
 * is harmless, while the rubric decides what the score means and therefore
 * comes from the repo.
 */

import { PERSONAS, RETIRED_PERSONAS } from '@/lib/personas'
import type { TrackId, TranscriptTurn } from '@/lib/voice/types'
import { buildGradeSystemPrompt, renderMetrics, renderTranscript } from './prompt'
import { METRIC_BANDS, type DeterministicMetrics, type MetricBand } from './metrics'
import {
  buildInterviewGradeSystemPrompt,
  normaliseInterviewScores,
  renderInterviewMetrics,
  renderInterviewTranscript,
} from './interview/rubric'
import { INTERVIEW_METRIC_BANDS } from './interview/metrics'

export interface GradeRubric {
  track: TrackId
  systemPrompt(): string
  renderTranscript(transcript: readonly TranscriptTurn[], name: string): string
  /**
   * The model's reply, in the shape everything downstream reads.
   *
   * Identity on the dating arm. On the interview arm it renames `structure` and
   * `specificity` onto `opening` and `curiosity` and clears the memory line, so
   * the composite, the scorecard, the `scores` insert and `/progress` are all
   * untouched by the second rubric existing.
   */
  normalise(raw: Record<string, unknown>): Record<string, unknown>
  /**
   * The deterministic band table — sixty percent of the composite.
   *
   * **Four of the eight dating bands score correct interview behaviour at
   * zero**, which is the single largest thing that was wrong with an interview
   * grade: talk ratio targets 40–55% and a candidate should be holding the
   * floor. `lib/grade/interview/metrics.ts` is the argument in full.
   */
  metricBands: readonly MetricBand[]
  /** The measured block, in this track's own targets. */
  renderMetrics(metrics: DeterministicMetrics): string
}

const DATING: GradeRubric = {
  track: 'dating',
  systemPrompt: buildGradeSystemPrompt,
  renderTranscript,
  normalise: (raw) => raw,
  metricBands: METRIC_BANDS,
  renderMetrics,
}

const INTERVIEW: GradeRubric = {
  track: 'interview',
  systemPrompt: buildInterviewGradeSystemPrompt,
  renderTranscript: renderInterviewTranscript,
  normalise: normaliseInterviewScores,
  metricBands: INTERVIEW_METRIC_BANDS,
  renderMetrics: renderInterviewMetrics,
}

const BY_TRACK: Record<TrackId, GradeRubric> = {
  dating: DATING,
  interview: INTERVIEW,
  // Specified and unbuilt (§01). It reads the dating rubric until it has one.
  language: DATING,
}

/** The track a character belongs to, resolved from the authored roster. */
export function trackForPersonaName(personaName: string): TrackId {
  const match = [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)].find(
    (persona) => persona.name.toLowerCase() === personaName.trim().toLowerCase(),
  )
  return match?.track ?? 'dating'
}

export function rubricForTrack(track: TrackId): GradeRubric {
  return BY_TRACK[track] ?? DATING
}

export function rubricForPersonaName(personaName: string): GradeRubric {
  return rubricForTrack(trackForPersonaName(personaName))
}
