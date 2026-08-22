/**
 * Microphone capture for the assembled pipeline.
 *
 * One tap on the mic feeding two consumers: the VAD, which decides when a turn
 * ends, and the transcriber, which needs the same audio as PCM16. Taking two
 * separate taps would let them disagree about where a frame boundary is, and
 * the transcriber committing a buffer the VAD has not closed is a whole class
 * of dropped-word bug.
 *
 * 20 ms frames at 24 kHz. The AudioContext runs at 24 kHz throughout — mic in,
 * her voice out — so nothing in the path resamples.
 *
 * Browser only.
 */

const FRAME_SAMPLES = 480 // 20 ms at 24 kHz

/**
 * An AudioWorklet, inlined.
 *
 * As a Blob URL rather than a file in `public/` because the adapter has to work
 * anywhere the bundle does, and a missing static asset is a failure mode that
 * only shows up in production.
 */
const WORKLET_SOURCE = `
class NerveCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(${FRAME_SAMPLES})
    this.filled = 0
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    for (let i = 0; i < channel.length; i += 1) {
      this.buffer[this.filled++] = channel[i]
      if (this.filled === ${FRAME_SAMPLES}) {
        this.port.postMessage(this.buffer.slice(0))
        this.filled = 0
      }
    }
    return true
  }
}
registerProcessor('nerve-capture', NerveCaptureProcessor)
`

export type FrameHandler = (frame: Float32Array) => void

export interface MicCaptureOptions {
  context: AudioContext
  stream: MediaStream
  onFrame: FrameHandler
}

export class MicCapture {
  private readonly context: AudioContext
  private readonly onFrame: FrameHandler
  private source: MediaStreamAudioSourceNode | null = null
  private worklet: AudioWorkletNode | null = null
  private legacy: ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private legacyBuffer = new Float32Array(FRAME_SAMPLES)
  private legacyFilled = 0

  constructor(options: MicCaptureOptions) {
    this.context = options.context
    this.onFrame = options.onFrame
    this.source = this.context.createMediaStreamSource(options.stream)
  }

  async start(): Promise<void> {
    const source = this.source
    if (!source) return

    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }))
      try {
        await this.context.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      const node = new AudioWorkletNode(this.context, 'nerve-capture')
      node.port.onmessage = (event: MessageEvent<Float32Array>) => this.onFrame(event.data)
      source.connect(node)
      // A worklet with no downstream node is not guaranteed to be pulled. A
      // silent sink keeps the graph alive without adding the mic to the output.
      const sink = this.context.createGain()
      sink.gain.value = 0
      node.connect(sink)
      sink.connect(this.context.destination)
      this.worklet = node
      this.sink = sink
      return
    } catch {
      // Safari and older Chrome behind a non-secure origin. Deprecated, but it
      // is this or no pipeline at all on those browsers.
    }

    const processor = this.context.createScriptProcessor(1024, 1, 1)
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      for (let i = 0; i < input.length; i += 1) {
        this.legacyBuffer[this.legacyFilled++] = input[i] ?? 0
        if (this.legacyFilled === FRAME_SAMPLES) {
          this.onFrame(this.legacyBuffer.slice(0))
          this.legacyFilled = 0
        }
      }
    }
    const sink = this.context.createGain()
    sink.gain.value = 0
    source.connect(processor)
    processor.connect(sink)
    sink.connect(this.context.destination)
    this.legacy = processor
    this.sink = sink
  }

  stop(): void {
    try {
      if (this.worklet) this.worklet.port.onmessage = null
      if (this.legacy) this.legacy.onaudioprocess = null
      this.worklet?.disconnect()
      this.legacy?.disconnect()
      this.sink?.disconnect()
      this.source?.disconnect()
    } catch {
      /* Teardown is best-effort. */
    }
    this.worklet = null
    this.legacy = null
    this.sink = null
    this.source = null
  }
}

/** Float32 [-1, 1] to little-endian PCM16, which is what the transcriber wants. */
export function floatToPcm16(frame: Float32Array): Int16Array {
  const out = new Int16Array(frame.length)
  for (let i = 0; i < frame.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, frame[i] ?? 0))
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return out
}

/** Base64 of an ArrayBuffer, chunked so a long buffer cannot blow the stack. */
export function toBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Little-endian PCM16 bytes back to float samples, for the playback side. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const count = bytes.length >> 1
  const out = new Float32Array(count)
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2)
  for (let i = 0; i < count; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return out
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export { FRAME_SAMPLES }
