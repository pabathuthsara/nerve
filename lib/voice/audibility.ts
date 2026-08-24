/**
 * Did the user actually hear that line?
 *
 * `output_audio_buffer.started` and `.stopped` are the SERVER's account of
 * playback: they say the model opened an audio buffer and closed it again.
 * They do not say a single sample reached the speakers, and the two come apart
 * more often than anybody had measured — five recorded reps, 104 of her turns,
 * seven of them with no audio at any point in the rep recording while the
 * transcript held the full line. The user's report was "I can't hear her first
 * few sentences"; the pipeline's report was zero incidents.
 *
 * The gap is structural. `sealAgentTurn` already refuses to commit a reply
 * whose buffer never opened (`onUnheardReply`), but a buffer that opens, sends
 * nothing audible and closes cleanly looks identical to a healthy turn from the
 * data channel. The only witness to what actually came out is the analyser the
 * adapter already builds for the waveform, so that is what this reads.
 *
 * Deliberately provider-neutral and free of any node type: it takes levels, not
 * an AnalyserNode, so it is testable without WebAudio and the ElevenLabs arm
 * can drive it from its own player.
 */

/**
 * RMS below this, for the whole of her turn, is silence rather than a quiet
 * line. ≈ -46 dBFS: two full stops below the quietest real speech measured in
 * a rep recording (-28 dBFS) and well above WebRTC room tone.
 */
export const SILENCE_FLOOR = 0.005

/**
 * Below this many samples the verdict is withheld.
 *
 * A turn can be sealed a few milliseconds after it opens, and one or two
 * readings of an analyser is not evidence of anything. At the adapter's sample
 * interval this is roughly 150ms of her speaking.
 */
export const MIN_SAMPLES = 3

/** How often the adapter reads the analyser while she is speaking. */
export const SAMPLE_INTERVAL_MS = 50

export interface AudibilityVerdict {
  /** True only when she spoke for long enough to judge and nothing came out. */
  silent: boolean
  peak: number
  samples: number
}

/**
 * One turn's worth of level readings, reduced to a verdict.
 *
 * Peak rather than mean on purpose: real speech has gaps in it, and the buffer
 * window routinely runs a second past the last word while it drains. A mean
 * would call a short line inside a long window silent.
 */
export class TurnAudibility {
  private peakLevel = 0
  private sampleCount = 0

  reset(): void {
    this.peakLevel = 0
    this.sampleCount = 0
  }

  observe(level: number): void {
    if (!Number.isFinite(level)) return
    this.sampleCount += 1
    if (level > this.peakLevel) this.peakLevel = level
  }

  verdict(): AudibilityVerdict {
    return {
      silent: this.sampleCount >= MIN_SAMPLES && this.peakLevel < SILENCE_FLOOR,
      peak: this.peakLevel,
      samples: this.sampleCount,
    }
  }
}

/**
 * Raw RMS of an analyser's time-domain data, 0–1.
 *
 * Unscaled and unclamped, unlike the level the waveform uses — this number is
 * compared against an absolute floor, so a display curve applied to it would
 * move the floor with it.
 *
 * FLOAT samples, not bytes. `getByteTimeDomainData` quantises to 1/128, so its
 * quietest non-zero reading is ≈ -42 dBFS — above the floor this has to test
 * against, which would leave a single dithered LSB indistinguishable from
 * speech. The waveform can afford bytes because it is drawing a shape; this is
 * deciding whether a line was heard.
 */
export function analyserRms(
  node: AnalyserNode | null,
  buffer: Float32Array<ArrayBuffer>,
): number {
  if (!node) return 0
  node.getFloatTimeDomainData(buffer)
  let sum = 0
  for (const value of buffer) sum += value * value
  return Math.sqrt(sum / buffer.length)
}
