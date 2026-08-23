/**
 * Recording a rep (§05).
 *
 * Taps the two AnalyserNodes the provider already exposes. An AnalyserNode is
 * a pass-through — it emits exactly what it receives — so connecting one to a
 * second destination adds a branch without disturbing the routing that already
 * exists. That is what keeps this provider-neutral: the recorder never learns
 * whether it is capturing WebRTC or a decoded PCM stream.
 *
 * It also means the mix is her voice *as rendered*, room and all, and the
 * user's mic as the model heard it. Reviewing a rep should sound like the rep.
 *
 * Nothing here touches the speakers. The tap ends at a MediaStreamDestination,
 * so adding the user's own microphone to the mix cannot produce feedback.
 */

import type { Analysers } from '@/lib/voice/types'

export interface RepRecording {
  blob: Blob
  mimeType: string
  bytes: number
}

/** Opus in WebM first; Safari only offers MP4. Ordered by preference. */
const CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

export function recordingSupported(): boolean {
  return pickMimeType() !== null
}

/** The extension the bucket's allowed_mime_types will accept for this recording. */
export function extensionFor(mimeType: string): string {
  return mimeType.startsWith('audio/mp4') ? 'm4a' : 'webm'
}

export class RepRecorder {
  private recorder: MediaRecorder | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private readonly taps: AnalyserNode[] = []
  private readonly chunks: Blob[] = []
  private readonly mimeType: string

  /**
   * Returns null when the browser cannot record, or when the two analysers do
   * not share an AudioContext — nodes from different contexts cannot be mixed,
   * and a half-recorded rep is worse than none.
   */
  static create(analysers: Analysers): RepRecorder | null {
    const mimeType = pickMimeType()
    if (!mimeType) return null

    const nodes = [analysers.user, analysers.agent].filter(
      (node): node is AnalyserNode => node !== null,
    )
    if (nodes.length === 0) return null

    const ctx = nodes[0]!.context
    if (nodes.some((node) => node.context !== ctx)) return null
    if (!(ctx instanceof AudioContext)) return null

    return new RepRecorder(ctx, nodes, mimeType)
  }

  private constructor(
    private readonly ctx: AudioContext,
    nodes: AnalyserNode[],
    mimeType: string,
  ) {
    this.mimeType = mimeType
    this.taps = nodes
  }

  start(): void {
    if (this.recorder) return

    this.destination = this.ctx.createMediaStreamDestination()
    for (const tap of this.taps) tap.connect(this.destination)

    this.recorder = new MediaRecorder(this.destination.stream, {
      mimeType: this.mimeType,
      // Speech, mono-ish, reviewed rather than mastered. An 8-minute cap at
      // this bitrate lands around 1.5MB, well inside the bucket limit.
      audioBitsPerSecond: 32_000,
    })

    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
    // One second of buffered audio is the most a crash can cost.
    this.recorder.start(1000)
  }

  /** Resolves once the final chunk has been flushed. Null if nothing recorded. */
  async stop(): Promise<RepRecording | null> {
    const recorder = this.recorder
    if (!recorder) return null
    this.recorder = null

    if (recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        recorder.stop()
      })
    }

    this.disconnect()

    if (this.chunks.length === 0) return null
    const blob = new Blob(this.chunks, { type: this.mimeType })
    this.chunks.length = 0
    return { blob, mimeType: this.mimeType, bytes: blob.size }
  }

  /** Safe at any point, including before start(). */
  dispose(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.recorder = null
    this.chunks.length = 0
    this.disconnect()
  }

  private disconnect(): void {
    if (!this.destination) return
    for (const tap of this.taps) {
      try {
        tap.disconnect(this.destination)
      } catch {
        // Already torn down with the context. Nothing to release.
      }
    }
    this.destination = null
  }
}
