/**
 * Serialises server-VAD turns into exactly one Realtime response at a time.
 *
 * `turn_detection.create_response` is disabled. VAD still commits user audio,
 * but this gate owns `response.create`, coalescing any extra commits that land
 * while the current response is generating or playing.
 *
 * ## Why there is a watchdog
 *
 * The gate is only as correct as the settle signal it is given, and the cost
 * of one missed signal is total: `inFlight` never clears, every later user
 * turn is folded into `pending`, and the character goes silent for the rest of
 * the session while everything around her — VAD, warmth, steering — carries on
 * as though the rep were healthy. Round 11 hit exactly that, from a response
 * cancelled before its first audio frame reached the speakers.
 *
 * The event path that caused it is fixed. The watchdog exists because a
 * permanent silent failure is the worst outcome this component can produce,
 * and no future event-sequence surprise should be able to reach it again. It
 * is a backstop, not a strategy: it fires far later than any real reply takes,
 * and it reports rather than recovering quietly.
 */

/** Longer than any real reply, short enough that a stuck rep is recoverable. */
export const DEFAULT_STALL_MS = 12_000

export interface ResponseGateOptions {
  stallMs?: number
  /** Called when the watchdog fires. The rep continues; this is not fatal. */
  onStall?: () => void
  /**
   * How long to sit on a reply before creating it.
   *
   * A cold character does not answer the instant you stop talking; she looks up
   * first. Read fresh on each turn, because warmth moves during a rep and the
   * whole point is that the pause shortens as she warms — see
   * `lib/warmth/timing.ts`.
   *
   * The gate is held for the duration, which is what makes this safe: a turn
   * that lands during the pause is coalesced exactly as it would be during
   * generation, so the delay can never produce two responses.
   */
  delayMs?: () => number
  /** Injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export class OpenAIResponseGate {
  private inFlight = false
  private pending = false
  private stallHandle: unknown = null
  private delayHandle: unknown = null

  private readonly stallMs: number
  private readonly onStall: (() => void) | undefined
  private readonly delayMs: (() => number) | undefined
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  constructor(
    private readonly createResponse: () => void,
    options: ResponseGateOptions = {},
  ) {
    this.stallMs = options.stallMs ?? DEFAULT_STALL_MS
    this.onStall = options.onStall
    this.delayMs = options.delayMs
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as never))
  }

  /**
   * Server VAD committed a user turn.
   *
   * Returns which of the two things happened, and the caller needs to know:
   * a turn that later turns out to be echo or noise must be undone, and
   * undoing a response that was CREATED is a different operation from undoing
   * one that was merely QUEUED. Conflating them is how a cancel aimed at a
   * phantom lands on the reply that is currently playing.
   */
  userTurnCommitted(): 'created' | 'queued' {
    if (this.inFlight) {
      this.pending = true
      return 'queued'
    }
    this.startResponse()
    return 'created'
  }

  /**
   * Drop a queued turn without touching the response in flight.
   *
   * The narrow undo. Used when a commit that was coalesced into `pending`
   * turns out to have been her own voice or a noise artefact: there is nothing
   * of ours generating, and the response currently playing belongs to a real
   * turn that must be left alone.
   */
  cancelPending(): void {
    this.pending = false
  }

  responseSettled(): void {
    if (!this.inFlight) return
    this.disarm()
    this.inFlight = false
    if (!this.pending) return
    this.pending = false
    this.startResponse()
  }

  reset(): void {
    this.disarm()
    this.clearDelay()
    this.inFlight = false
    this.pending = false
  }

  /** True while a response is outstanding. Diagnostics only. */
  get busy(): boolean {
    return this.inFlight
  }

  /** True when a user turn is already waiting behind the response in flight. */
  get hasPending(): boolean {
    return this.pending
  }

  /**
   * Take the turn again, for a reply the user never heard.
   *
   * **Declines rather than queues.** Every other path into this gate is a user
   * turn, which must never be dropped; a repeat is the opposite. If something
   * is already generating, or a real turn is waiting behind it, then by the
   * time a repeat reached the speakers the moment it belonged to would be
   * gone — and a line arriving two turns late is worse than the gap it was
   * meant to fill. Returns whether it took.
   *
   * No reply delay, unlike `startResponse`. That pause is a warmth signal
   * about a turn she has just heard; this is her finishing something she
   * already started, and sitting on it a second time only widens the hole.
   *
   * The stall watchdog is armed exactly as it is for a normal response, so a
   * repeat that never settles cannot wedge the gate.
   */
  requestRepeat(): boolean {
    if (this.inFlight || this.pending) return false
    this.inFlight = true
    this.arm()
    this.createResponse()
    return true
  }

  /**
   * Take the turn — after the beat, if she is taking one.
   *
   * `inFlight` and the stall watchdog are both set BEFORE the pause, not after.
   * That ordering is the whole safety argument: for the entire delay the gate
   * looks busy, so a second commit coalesces into `pending` instead of racing
   * a second `response.create`, and if anything goes wrong during the pause the
   * watchdog still fires and recovers the rep.
   */
  private startResponse(): void {
    this.inFlight = true
    this.arm()

    const delay = Math.max(0, Math.round(this.delayMs?.() ?? 0))
    if (delay === 0) {
      this.createResponse()
      return
    }

    this.clearDelay()
    this.delayHandle = this.setTimer(() => {
      this.delayHandle = null
      // Reset or a stall may have released the gate while she was pausing. The
      // turn belongs to whatever is happening now, not to a timer from before.
      if (!this.inFlight) return
      this.createResponse()
    }, delay)
  }

  private clearDelay(): void {
    if (this.delayHandle === null) return
    this.clearTimer(this.delayHandle)
    this.delayHandle = null
  }

  private arm(): void {
    this.disarm()
    this.stallHandle = this.setTimer(() => {
      this.stallHandle = null
      // A pause that outlived its own watchdog is not a pause any more.
      this.clearDelay()
      // Report first, so the incident is visible even if the recovery is
      // clean. A gate that silently repairs itself hides a real defect.
      this.onStall?.()
      this.inFlight = false
      if (this.pending) {
        this.pending = false
        this.startResponse()
      }
    }, this.stallMs)
  }

  private disarm(): void {
    if (this.stallHandle === null) return
    this.clearTimer(this.stallHandle)
    this.stallHandle = null
  }
}
