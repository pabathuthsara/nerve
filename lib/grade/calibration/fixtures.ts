/**
 * GRADE CALIBRATION — the hand-scored half (§07, §17 — the M2 gate).
 *
 * ── THIS IS THE FILE YOU EDIT ────────────────────────────────────────────
 *
 * §07 asks for "twenty hand-scored golden transcripts re-run nightly; drift
 * beyond five points on any dimension fires an alert. Without this the scoring
 * silently rots as models update." §19 lists that rot as a high risk, because
 * progression stops meaning anything once the number moves underneath it.
 *
 * The transcripts are in `transcripts.ts`, collected from real reps by
 * `npm run grade:collect` and never hand-edited. **Every expectation below is
 * `null`, and that is deliberate: ground truth a model wrote is not ground
 * truth.** Read each transcript, score it yourself, fill the numbers in, then:
 *
 *     npm run grade:calibrate
 *
 * The runner drives the DEPLOYED `/api/grade` over HTTP with
 * `INTERNAL_API_SECRET`, so it measures the route rather than a
 * re-implementation of it.
 *
 * ── THE RUBRIC, restated so you are not aiming at a moving target ────────
 *
 *     OPENING          did he get a conversation started at all, and how
 *     CURIOSITY        did he ask about her, and go past the first answer
 *     LISTENING        did he use what she gave him
 *     SIGNAL READING   did he read her interest correctly and adjust
 *     COMPOSURE        did he stay steady; recovery counts for more than
 *                      never having wobbled
 *     CLOSE            how it ended — leaving warmly without pushing scores
 *                      high, INCLUDING when he was turned down
 *
 * **Score the process, never the outcome.** A clean rep that ends in rejection
 * can score 92; a sloppy one that got lucky scores 54. If you catch yourself
 * marking a transcript up because it went well, stop and score how he played.
 *
 * The composite is 60% deterministic and 40% judgement (§07), so it is not the
 * mean of your six. Put down the number you would defend as the overall
 * reading of the rep; the runner compares it to what the route produced.
 */

import { CALIBRATION_TRANSCRIPTS, type CollectedTranscript } from './transcripts'
import type { SubScores } from '../types'

export type ExpectedScores = SubScores & { composite: number }

/**
 * Drift beyond this on any dimension fails the suite (§07).
 *
 * Five points is tight enough to catch a model update that has quietly changed
 * its mind about what a 70 is, and loose enough that ordinary sampling noise
 * at temperature zero does not cry wolf every night.
 */
export const MAX_DRIFT = 5

/** How many §07 asks for. The suite refuses to call itself green below this. */
export const REQUIRED_FIXTURES = 20

/**
 * ── HAND-SCORE THESE ─────────────────────────────────────────────────────
 *
 * Keyed by transcript id. Replace a `null` with, for example:
 *
 *     'nadia-2026-08-23-de1911': {
 *       opening: 72, curiosity: 68, listening: 74,
 *       signalReading: 65, composure: 80, close: 58,
 *       composite: 71,
 *     },
 *
 * Ten of the twenty are collected. The rest need reps run and collected.
 */
export const EXPECTED: Record<string, ExpectedScores | null> = {
  'maya-2026-08-23-390137': null,
  'maya-2026-08-23-48b7e6': null,
  'maya-2026-08-23-ad169e': null,
  'jules-2026-08-23-5c3d6d': null,
  'priya-2026-08-23-f7859f': null,
  'priya-2026-08-23-7b27ad': null,
  'priya-2026-08-23-5862f0': null,
  'nadia-2026-08-23-de1911': null,
  'nadia-2026-08-23-4e84c3': null,
  'nadia-2026-08-23-0a9b9c': null,
}

export interface GradeFixture extends CollectedTranscript {
  /** Null until somebody has actually read it. */
  expected: ExpectedScores | null
}

/** The golden set: collected transcripts joined to whatever has been scored. */
export const GRADE_FIXTURES: GradeFixture[] = CALIBRATION_TRANSCRIPTS.map((collected) => ({
  ...collected,
  expected: EXPECTED[collected.id] ?? null,
}))
