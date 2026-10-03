/**
 * Barge-in confirmation (`REP-FIXES-PLAN-2026-10-03.md` B3).
 *
 * While she is audible, ninety milliseconds of speech energy used to be a
 * barge-in. On the rep of 3 October that cut her first line ("Yeah") on a
 * 240ms "Mm." — which then became a TURN, priced as a dead end and answered
 * in two words — and cut her second ("I'm") on a sound with no words in it at
 * all. A backchannel is a listener saying "go on". Treating it as "stop" is
 * the opposite of what it means.
 *
 * So an onset while she is audible is now a QUESTION, not a verdict:
 *
 *   1. she is ducked at once (~-10 dB over ~40 ms), so he is heard;
 *   2. if he is still making speech energy `BARGE_CONFIRM_MS` after the onset,
 *      it was a barge-in and the old path runs unchanged — truncation by
 *      `playedText`, rule 17 and all;
 *   3. if he has gone quiet by then, it was a backchannel or a noise: she is
 *      restored, finishes her line, and the sound buys nothing — no turn, no
 *      reply, no score.
 *
 * When she is NOT audible nothing here runs: his onset starts his turn as it
 * always did, and a reply nobody heard is still superseded rather than
 * interrupted (rule 17).
 *
 * ── WHY THE VAD'S OWN STOP CANNOT DECIDE IT ──────────────────────────────
 *
 * The VAD concedes a turn only after the user's calibrated silence window —
 * ~600 ms — so a 240 ms "Mm." is still "speaking" in its eyes at 350 ms. The
 * gate therefore reads frame energy directly. Past the deadline a loud frame
 * confirms; quiet that outlasts `BARGE_TAIL_MS` releases her. A fixed "loud
 * within 150 ms of the deadline" rule was the first draft and its own test
 * caught it: the 3 October "Mm." ended 110 ms before the deadline and would
 * still have cut her off.
 *
 * Pure and clock-free: the caller passes the time and whether the frame was
 * loud. Shared on purpose (rule 1): the realtime arm's equivalent is recorded
 * in the plan's §B7, because that arm never cuts her client-side at all.
 */

/** How long he must keep talking over her before it counts. Owner-approved ~350 ms. */
export const BARGE_CONFIRM_MS = 350
/**
 * Past the deadline, quiet longer than this means he has stopped. Shorter is
 * the gap between two words, and the gate waits it out — so the slowest
 * verdict is `BARGE_CONFIRM_MS + BARGE_TAIL_MS`, about half a second.
 */
export const BARGE_TAIL_MS = 150
/** How far she is ducked while the question is open, and how fast. */
export const BARGE_DUCK_DB = -10
export const BARGE_DUCK_RAMP_MS = 40

export type BargeVerdict =
  /** He is talking over her. Run the barge-in. */
  | 'confirm'
  /** He made a short sound and stopped. Restore her; it is not a turn. */
  | 'backchannel'

export class BargeGate {
  private readonly confirmMs: number
  private readonly tailMs: number
  private onsetAtMs: number | null = null
  private lastLoudAtMs: number | null = null
  /**
   * A backchannel has been called but the VAD still thinks he is speaking
   * (its silence window has not run out). Anything he says now is either the
   * tail of that sound, to be thrown away, or the start of a real
   * interruption, which re-opens the question.
   */
  private releasedAtMs: number | null = null

  constructor(options: { confirmMs?: number; tailMs?: number } = {}) {
    this.confirmMs = options.confirmMs ?? BARGE_CONFIRM_MS
    this.tailMs = options.tailMs ?? BARGE_TAIL_MS
  }

  /** The question is open: she is ducked, waiting on him. */
  get pending(): boolean {
    return this.onsetAtMs !== null
  }

  /** A backchannel was called and the VAD has not yet conceded. */
  get released(): boolean {
    return this.releasedAtMs !== null
  }

  /** When the onset under question began, on the caller's clock. */
  get onsetAt(): number | null {
    return this.onsetAtMs
  }

  /** Speech began while she was audible. */
  open(atMs: number): void {
    this.onsetAtMs = atMs
    this.lastLoudAtMs = atMs
    this.releasedAtMs = null
  }

  /**
   * One microphone frame while the question is open — or after a backchannel
   * was called, when a new run of speech re-opens it. Returns the verdict the
   * moment there is one, and null until then.
   */
  frame(nowMs: number, loud: boolean): BargeVerdict | 'reopened' | null {
    if (this.releasedAtMs !== null) {
      if (!loud) return null
      this.open(nowMs)
      return 'reopened'
    }
    if (this.onsetAtMs === null) return null
    if (loud) this.lastLoudAtMs = nowMs
    if (nowMs - this.onsetAtMs < this.confirmMs) return null
    // Past the deadline, SPEECH decides it: a loud frame now is him still
    // talking. A quiet one is either the gap between two words — wait — or
    // the end of a short sound, once the quiet has outlasted that gap.
    if (loud) {
      this.reset()
      return 'confirm'
    }
    const quietFor = nowMs - (this.lastLoudAtMs ?? this.onsetAtMs)
    if (quietFor <= this.tailMs) return null
    this.onsetAtMs = null
    this.releasedAtMs = nowMs
    return 'backchannel'
  }

  /**
   * The VAD conceded before the deadline (a very short calibrated window), or
   * after a backchannel was released. Either way: not a turn.
   */
  stopped(): 'backchannel' | null {
    const was = this.onsetAtMs !== null || this.releasedAtMs !== null
    this.reset()
    return was ? 'backchannel' : null
  }

  reset(): void {
    this.onsetAtMs = null
    this.lastLoudAtMs = null
    this.releasedAtMs = null
  }
}
