import { describe, expect, it } from 'vitest'
import {
  analyserRms,
  MIN_SAMPLES,
  SILENCE_FLOOR,
  TurnAudibility,
} from './audibility'

/** Float time-domain data is signed and centred on zero. */
function fakeAnalyser(samples: number[]): AnalyserNode {
  return {
    getFloatTimeDomainData(buffer: Float32Array<ArrayBuffer>) {
      for (let i = 0; i < buffer.length; i += 1) {
        buffer[i] = samples[i % samples.length] ?? 0
      }
    },
  } as unknown as AnalyserNode
}

describe('TurnAudibility', () => {
  it('calls a turn silent when every reading is below the floor', () => {
    const watch = new TurnAudibility()
    for (let i = 0; i < 20; i += 1) watch.observe(0.0001)
    const verdict = watch.verdict()
    expect(verdict.silent).toBe(true)
    expect(verdict.samples).toBe(20)
  })

  it('does not call a turn silent on one loud reading in a long quiet one', () => {
    // Real speech is mostly gaps, and the buffer window runs past the last word
    // while it drains. Peak, not mean, is what keeps a short line audible.
    const watch = new TurnAudibility()
    for (let i = 0; i < 30; i += 1) watch.observe(0)
    watch.observe(0.08)
    for (let i = 0; i < 30; i += 1) watch.observe(0)
    expect(watch.verdict().silent).toBe(false)
  })

  it('withholds a verdict on a turn too short to judge', () => {
    const watch = new TurnAudibility()
    for (let i = 0; i < MIN_SAMPLES - 1; i += 1) watch.observe(0)
    expect(watch.verdict().silent).toBe(false)
    watch.observe(0)
    expect(watch.verdict().silent).toBe(true)
  })

  it('treats a level exactly at the floor as audible', () => {
    const watch = new TurnAudibility()
    for (let i = 0; i < 10; i += 1) watch.observe(SILENCE_FLOOR)
    expect(watch.verdict().silent).toBe(false)
  })

  it('ignores non-finite readings without counting them', () => {
    const watch = new TurnAudibility()
    watch.observe(Number.NaN)
    watch.observe(Number.POSITIVE_INFINITY)
    expect(watch.verdict().samples).toBe(0)
    expect(watch.verdict().silent).toBe(false)
  })

  it('starts clean after reset, so one silent turn cannot condemn the next', () => {
    const watch = new TurnAudibility()
    for (let i = 0; i < 10; i += 1) watch.observe(0)
    expect(watch.verdict().silent).toBe(true)
    watch.reset()
    for (let i = 0; i < 10; i += 1) watch.observe(0.05)
    expect(watch.verdict().silent).toBe(false)
  })
})

describe('analyserRms', () => {
  it('reads zero for digital silence', () => {
    expect(analyserRms(fakeAnalyser([0]), new Float32Array(1024))).toBe(0)
  })

  it('reads a real level for speech-shaped data', () => {
    // A quarter of full scale, ≈ -12 dBFS. Ordinary speech in a rep recording.
    const level = analyserRms(fakeAnalyser([0.25, -0.25]), new Float32Array(1024))
    expect(level).toBeGreaterThan(SILENCE_FLOOR)
    expect(level).toBeCloseTo(0.25, 6)
  })

  it('reads room tone as below the silence floor', () => {
    // -60 dBFS. The quietest agent turn measured in a rep recording was -64,
    // the quietest audible one -28: the floor sits between them with room.
    const tone = analyserRms(fakeAnalyser([0.001, -0.001]), new Float32Array(1024))
    expect(tone).toBeLessThan(SILENCE_FLOOR)
  })

  it('resolves levels a byte analyser could not tell apart', () => {
    // The whole reason this reads floats: one byte LSB is ≈ -42 dBFS, so a
    // byte analyser cannot represent anything between silence and that.
    const buffer = new Float32Array(1024)
    expect(analyserRms(fakeAnalyser([0.0001, -0.0001]), buffer)).toBeLessThan(SILENCE_FLOOR)
    expect(analyserRms(fakeAnalyser([0.02, -0.02]), buffer)).toBeGreaterThan(SILENCE_FLOOR)
  })

  it('is zero for a missing node rather than throwing', () => {
    expect(analyserRms(null, new Float32Array(64))).toBe(0)
  })
})
