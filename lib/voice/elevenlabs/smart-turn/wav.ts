/**
 * The smallest WAV reader that is not wrong: 16-bit PCM, any channel count,
 * any chunk layout.
 *
 * Only tests and the end-to-end check read files — the live rep never does,
 * its audio comes from the microphone — but both of those read what
 * `afconvert` and Python's `wave` write, and `afconvert` pads the header with
 * a 4 KB `FLLR` chunk. A reader that assumes the data starts at byte 44 reads
 * that padding as the first 2 000 samples of speech, and feeds the model a
 * burst of garbage at the start of every clip. So: walk the chunks.
 *
 * Pure: bytes in, samples out.
 */

export interface Wav {
  sampleRate: number
  /** Mono, float in [-1, 1): channels are averaged, and int16 is divided by 32768. */
  samples: Float32Array
  /** The raw int16 samples of channel 0 — the fixture compares on these. */
  pcm: Int16Array
}

function tag(view: DataView, at: number): string {
  return String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3))
}

export function readWav16(bytes: Uint8Array): Wav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 12 || tag(view, 0) !== 'RIFF' || tag(view, 8) !== 'WAVE') throw new Error('not a RIFF/WAVE file')

  let channels = 0
  let sampleRate = 0
  let bits = 0
  let format = 0
  let data: { at: number; length: number } | null = null
  let at = 12
  while (at + 8 <= bytes.byteLength) {
    const id = tag(view, at)
    const length = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ') {
      format = view.getUint16(body, true)
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
    } else if (id === 'data') {
      data = { at: body, length: Math.min(length, bytes.byteLength - body) }
    }
    // Chunks are word-aligned: an odd length carries one pad byte.
    at = body + length + (length % 2)
  }

  // 0xFFFE is WAVE_FORMAT_EXTENSIBLE, which `afconvert` writes for plain PCM.
  if ((format !== 1 && format !== 0xfffe) || bits !== 16) throw new Error(`need 16-bit PCM, got format ${format} at ${bits} bits`)
  if (!data || channels < 1 || sampleRate < 1) throw new Error('WAV has no fmt or data chunk')

  const frames = Math.floor(data.length / (2 * channels))
  const pcm = new Int16Array(frames)
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i += 1) {
    let sum = 0
    for (let c = 0; c < channels; c += 1) {
      const value = view.getInt16(data.at + (i * channels + c) * 2, true)
      if (c === 0) pcm[i] = value
      sum += value
    }
    samples[i] = sum / channels / 32768
  }
  return { sampleRate, samples, pcm }
}
