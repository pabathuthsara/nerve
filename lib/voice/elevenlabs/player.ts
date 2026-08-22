/**
 * Streaming PCM playback with an exact playhead.
 *
 * Two requirements shape this, and neither is about sound quality:
 *
 *  1. **Start on the first chunk.** Her replies are about three words long, so
 *     there is nothing to hide latency behind. Waiting for the full clip would
 *     add its entire duration to the perceived response time.
 *  2. **Know precisely how much played.** Barge-in truncates her transcript to
 *     the audio that reached the ear, and "roughly" is not good enough — that
 *     is how you get a stored turn she never finished saying.
 *
 * So audio is scheduled chunk by chunk on the AudioContext clock and the
 * playhead is derived from the schedule rather than from wall time. The
 * difference matters the moment the network stalls: wall time keeps advancing
 * through an underrun, and the schedule does not.
 *
 * Browser only.
 */

interface Segment {
  /** AudioContext time this segment starts. */
  startAt: number
  duration: number
  /** Seconds of this turn's audio that precede it. */
  offset: number
  source: AudioBufferSourceNode
}

export interface PcmPlayerOptions {
  context: AudioContext
  sampleRate: number
  /** Where the audio goes — the room's input, or the destination. */
  destination: AudioNode
  /** Fired once, when the first sample of a turn actually leaves the speaker. */
  onFirstAudio?: (contextTime: number) => void
  /** Fired when the queue drains and nothing more is expected. */
  onDrained?: () => void
}

/**
 * Lead-in before the first chunk.
 *
 * Pure latency, so it is as small as it can be without the first buffer being
 * scheduled in the past on a busy main thread. Every chunk after the first is
 * scheduled back-to-back and costs nothing.
 */
const LEAD_IN_SECONDS = 0.02

export class PcmPlayer {
  private readonly context: AudioContext
  private readonly sampleRate: number
  private readonly destination: AudioNode
  private readonly onFirstAudio: ((contextTime: number) => void) | undefined
  private readonly onDrained: (() => void) | undefined

  private segments: Segment[] = []
  private nextStartAt = 0
  private scheduled = 0
  private started = false
  private closed = false
  private startTimer: ReturnType<typeof setTimeout> | null = null
  /** Playback gaps caused by the network not keeping up. Telemetry only. */
  private underruns = 0

  constructor(options: PcmPlayerOptions) {
    this.context = options.context
    this.sampleRate = options.sampleRate
    this.destination = options.destination
    this.onFirstAudio = options.onFirstAudio
    this.onDrained = options.onDrained
  }

  get isPlaying(): boolean {
    return this.started && !this.closed && this.playedSeconds < this.scheduled
  }

  get scheduledSeconds(): number {
    return this.scheduled
  }

  get underrunCount(): number {
    return this.underruns
  }

  /**
   * Seconds of this turn's audio that have actually been rendered.
   *
   * Derived from the schedule, not the clock: during an underrun the answer is
   * "everything before the gap", which is the truth, where wall time would
   * claim audio played that never did.
   */
  get playedSeconds(): number {
    if (!this.started) return 0
    const now = this.context.currentTime
    let played = 0
    for (const segment of this.segments) {
      if (now >= segment.startAt + segment.duration) {
        played = segment.offset + segment.duration
      } else if (now >= segment.startAt) {
        return segment.offset + (now - segment.startAt)
      } else {
        break
      }
    }
    return Math.min(played, this.scheduled)
  }

  /** One decoded chunk of mono float samples. */
  enqueue(samples: Float32Array): void {
    if (this.closed || samples.length === 0) return

    const buffer = this.context.createBuffer(1, samples.length, this.sampleRate)
    // `set` rather than `copyToChannel`: the latter is typed against a
    // non-shared ArrayBuffer and our samples come out of a decode helper.
    buffer.getChannelData(0).set(samples)

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.destination)

    const earliest = this.context.currentTime + (this.started ? 0 : LEAD_IN_SECONDS)
    if (this.started && this.nextStartAt < this.context.currentTime) this.underruns += 1
    const startAt = Math.max(earliest, this.nextStartAt)

    source.start(startAt)
    this.segments.push({ startAt, duration: buffer.duration, offset: this.scheduled, source })
    this.scheduled += buffer.duration
    this.nextStartAt = startAt + buffer.duration

    if (!this.started) {
      this.started = true
      const delayMs = Math.max(0, (startAt - this.context.currentTime) * 1000)
      this.startTimer = setTimeout(() => {
        this.startTimer = null
        this.onFirstAudio?.(startAt)
      }, delayMs)
    }

    source.onended = () => {
      if (this.closed) return
      const last = this.segments[this.segments.length - 1]
      if (last && last.source === source) this.onDrained?.()
    }
  }

  /**
   * Cut playback dead and throw away everything buffered.
   *
   * Returns the playhead at the moment of the cut, which is the number the
   * transcript is truncated against. Read before stopping the sources, because
   * stopping them is what makes the answer unknowable.
   */
  stopNow(): number {
    const played = this.playedSeconds
    this.closed = true
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }
    for (const segment of this.segments) {
      try {
        segment.source.onended = null
        segment.source.stop()
        segment.source.disconnect()
      } catch {
        /* Already finished. Nothing to stop. */
      }
    }
    this.segments = []
    return played
  }

  /** Wait for the queue to finish. Resolves immediately if it already has. */
  async waitForDrain(): Promise<void> {
    if (this.closed || !this.started) return
    const remaining = this.scheduled - this.playedSeconds
    if (remaining <= 0) return
    await new Promise<void>((resolve) => setTimeout(resolve, remaining * 1000 + 30))
  }
}
