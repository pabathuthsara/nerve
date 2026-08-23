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
  /** Injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export class OpenAIResponseGate {
  private inFlight = false
  private pending = false
  private stallHandle: unknown = null

  private readonly stallMs: number
  private readonly onStall: (() => void) | undefined
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  constructor(
    private readonly createResponse: () => void,
    options: ResponseGateOptions = {},
  ) {
    this.stallMs = options.stallMs ?? DEFAULT_STALL_MS
    this.onStall = options.onStall
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
    this.inFlight = false
    this.pending = false
  }

  /** True while a response is outstanding. Diagnostics only. */
  get busy(): boolean {
    return this.inFlight
  }

  private startResponse(): void {
    this.inFlight = true
    this.arm()
    this.createResponse()
  }

  private arm(): void {
    this.disarm()
    this.stallHandle = this.setTimer(() => {
      this.stallHandle = null
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
