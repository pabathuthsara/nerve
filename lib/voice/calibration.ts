/**
 * Measuring how long this person pauses in the middle of a sentence.
 *
 * §05's first problem, specified since M0 and never built. `profiles.vad_offset_ms`
 * had a column, a check constraint and a read path on the live rep page, and
 * **nothing in the codebase ever wrote it** — the onboarding mic step showed a
 * level meter and a hard-coded "testing, one two three" that it never
 * transcribed and never timed. So every user ran at a flat 600ms silence window.
 *
 * Six hundred milliseconds is a confident speaker's pause. Our user is defined
 * as nervous and hesitant, which means the turn detector cut their sentences in
 * half and handed the character two fragments to answer separately — the
 * "Hello." / "weird day today, right?" pattern, each drawing its own one-word
 * reply. It is the cheapest lever on how human the whole thing feels, because
 * it decides whether she waits for you to finish a thought.
 *
 * Pure and clock-injected. No DOM, no audio graph.
 */

import { clamp } from './types'

/** Below this, a gap is a breath inside a word rather than a pause. */
const MIN_GAP_MS = 90
/**
 * Above this, they stopped talking rather than paused.
 *
 * The measurement is of the pause INSIDE a sentence, which is the thing the
 * turn detector has to sit through. A two-second gap is somebody who finished.
 */
const MAX_GAP_MS = 1400
/** Fewer gaps than this and there is nothing to take a median of. */
const MIN_GAPS = 2

export class PauseMeter {
  private readonly gaps: number[] = []
  private speaking = false
  private silentSince: number | null = null
  private everSpoke = false

  /**
   * One frame of the level meter.
   *
   * `speaking` is whatever the caller's threshold says. The meter only cares
   * about the shape of the alternation, not the absolute level, which is what
   * keeps it independent of microphone gain.
   */
  sample(atMs: number, speaking: boolean): void {
    if (speaking) {
      if (!this.speaking && this.silentSince !== null && this.everSpoke) {
        const gap = atMs - this.silentSince
        if (gap >= MIN_GAP_MS && gap <= MAX_GAP_MS) this.gaps.push(gap)
      }
      this.speaking = true
      this.everSpoke = true
      this.silentSince = null
      return
    }

    if (this.speaking) this.silentSince = atMs
    this.speaking = false
  }

  get sampleCount(): number {
    return this.gaps.length
  }

  /**
   * Their natural inter-clause pause, or null when there was not enough to go on.
   *
   * Median rather than mean: one long think while they remembered the next word
   * should not widen the window for the whole conversation, and one clipped gap
   * should not narrow it.
   */
  measuredPauseMs(): number | null {
    if (this.gaps.length < MIN_GAPS) return null
    const sorted = [...this.gaps].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median =
      sorted.length % 2 === 1
        ? (sorted[middle] as number)
        : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    return Math.round(median)
  }
}

/**
 * The stored offset, relative to the confident-user default.
 *
 * An offset rather than an absolute so that retuning the default does not
 * silently retune everybody who has already been measured.
 *
 * The window has to be comfortably LONGER than the measured pause — sitting
 * through a pause of exactly its own length means cutting people off half the
 * time — so the measurement is padded before the default is subtracted. The
 * bounds match the column's check constraint.
 */
export const CALIBRATION_HEADROOM_MS = 250
export const OFFSET_MIN_MS = -400
export const OFFSET_MAX_MS = 2000

export function offsetFromPause(
  measuredPauseMs: number | null,
  defaultSilenceMs: number,
): number {
  if (measuredPauseMs === null) return 0
  const wanted = measuredPauseMs + CALIBRATION_HEADROOM_MS
  return Math.round(clamp(wanted - defaultSilenceMs, OFFSET_MIN_MS, OFFSET_MAX_MS))
}
