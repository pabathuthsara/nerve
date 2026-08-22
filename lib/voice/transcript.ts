/**
 * Transcript normalisation, shared by every adapter.
 *
 * This exists so INVARIANT 1 (§04) is enforced in one place rather than trusted
 * twice. Adapters hand raw text and clock readings to this assembler; it is the
 * only thing that constructs a TranscriptTurn.
 */

import type { Speaker, TranscriptTurn } from './types'

/** Rounds to milliseconds so turn boundaries compare cleanly across providers. */
function seconds(value: number): number {
  return Math.max(0, Math.round(value * 1000) / 1000)
}

export function makeTurn(
  speaker: Speaker,
  text: string,
  tStart: number,
  tEnd: number,
): TranscriptTurn {
  const start = seconds(tStart)
  const end = seconds(Math.max(tStart, tEnd))
  return { speaker, text: text.trim(), t_start: start, t_end: end }
}

/**
 * Both providers deliver a speaker's text and that speaker's speech boundaries
 * on separate channels, and out of order: transcription lands after the speech
 * it describes. This holds the open boundary until text arrives.
 */
export class TurnAssembler {
  private readonly speaker: Speaker
  private openStart: number | null = null
  private lastEnd = 0
  private pending = ''

  constructor(speaker: Speaker) {
    this.speaker = speaker
  }

  /** Speech started at `at` seconds since connect. */
  openAt(at: number): void {
    if (this.openStart === null) this.openStart = at
    this.lastEnd = Math.max(this.lastEnd, at)
  }

  /** Speech stopped at `at` seconds since connect. */
  closeAt(at: number): void {
    this.lastEnd = at
  }

  /** Streaming partial text for the turn currently open. */
  append(delta: string): void {
    this.pending += delta
  }

  /** A partial turn for live display. Never persisted, never scored. */
  peek(now: number): TranscriptTurn | null {
    if (!this.pending.trim()) return null
    const start = this.openStart ?? this.lastEnd
    return makeTurn(this.speaker, this.pending, start, Math.max(this.lastEnd, now))
  }

  /**
   * Seals the turn. `text` overrides anything accumulated by `append`, because
   * a provider's final transcription is authoritative over its own deltas.
   */
  commit(text: string | null, now: number): TranscriptTurn | null {
    const body = (text ?? this.pending).trim()
    const start = this.openStart ?? this.lastEnd
    const end = Math.max(this.lastEnd, start)
    this.reset()
    if (!body) return null
    return makeTurn(this.speaker, body, start, end === start ? now : end)
  }

  reset(): void {
    this.openStart = null
    this.pending = ''
  }
}

/** Turns must be in ascending time order for scoring to read them as a dialogue. */
export function sortTurns(turns: readonly TranscriptTurn[]): TranscriptTurn[] {
  return [...turns].sort((a, b) => a.t_start - b.t_start || a.t_end - b.t_end)
}
