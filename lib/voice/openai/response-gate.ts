/**
 * Serialises server-VAD turns into exactly one Realtime response at a time.
 *
 * `turn_detection.create_response` is disabled. VAD still commits user audio,
 * but this gate owns `response.create`, coalescing any extra commits that land
 * while the current response is generating or playing.
 */
export class OpenAIResponseGate {
  private inFlight = false
  private pending = false

  constructor(private readonly createResponse: () => void) {}

  userTurnCommitted(): void {
    if (this.inFlight) {
      this.pending = true
      return
    }
    this.startResponse()
  }

  responseSettled(): void {
    if (!this.inFlight) return
    this.inFlight = false
    if (!this.pending) return
    this.pending = false
    this.startResponse()
  }

  reset(): void {
    this.inFlight = false
    this.pending = false
  }

  private startResponse(): void {
    this.inFlight = true
    this.createResponse()
  }
}
