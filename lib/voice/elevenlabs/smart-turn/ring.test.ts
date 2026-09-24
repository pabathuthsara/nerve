import { describe, expect, it } from 'vitest'
import { TURN_PRE_ROLL_MS, TurnAudioBuffer } from './ring'
import { WINDOW_SAMPLES } from './features'

const ramp = (from: number, count: number) => Float32Array.from({ length: count }, (_, i) => from + i)

describe('TurnAudioBuffer', () => {
  it('holds 8 s at 16 kHz by default', () => {
    expect(new TurnAudioBuffer().capacity).toBe(WINDOW_SAMPLES)
  })

  it('returns everything held, oldest first, when no turn is marked', () => {
    const ring = new TurnAudioBuffer(10)
    ring.push(ramp(0, 4))
    ring.push(ramp(4, 3))
    expect(Array.from(ring.turnAudio())).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('wraps: keeps only the newest `capacity` samples, in order', () => {
    const ring = new TurnAudioBuffer(10)
    for (let i = 0; i < 25; i += 3) ring.push(ramp(i, 3))
    expect(ring.total).toBe(27)
    expect(ring.held).toBe(10)
    expect(Array.from(ring.turnAudio())).toEqual(Array.from(ramp(17, 10)))
  })

  it('takes a single push longer than itself, keeping its tail', () => {
    const ring = new TurnAudioBuffer(10)
    ring.push(ramp(0, 3))
    ring.push(ramp(3, 24))
    expect(Array.from(ring.turnAudio())).toEqual(Array.from(ramp(17, 10)))
    ring.push(ramp(27, 2))
    expect(Array.from(ring.turnAudio())).toEqual(Array.from(ramp(19, 10)))
  })

  it('returns only what came after the turn mark — not her line in front of his', () => {
    const ring = new TurnAudioBuffer(WINDOW_SAMPLES)
    ring.push(new Float32Array(16_000).fill(-1)) // one second of her
    ring.markTurnStart(0)
    ring.push(new Float32Array(8_000).fill(1)) // half a second of him
    const turn = ring.turnAudio()
    expect(turn.length).toBe(8_000)
    expect(turn.every((v) => v === 1)).toBe(true)
  })

  it('backdates the mark by milliseconds at 16 kHz (the onset delay plus pre-roll)', () => {
    const ring = new TurnAudioBuffer(WINDOW_SAMPLES)
    ring.push(new Float32Array(32_000))
    ring.markTurnStart(90 + TURN_PRE_ROLL_MS)
    expect(ring.turnAudio().length).toBe((90 + TURN_PRE_ROLL_MS) * 16)
  })

  it('never backdates past the first sample it ever saw', () => {
    const ring = new TurnAudioBuffer(WINDOW_SAMPLES)
    ring.push(new Float32Array(100))
    ring.markTurnStart(10_000)
    expect(ring.turnAudio().length).toBe(100)
  })

  it('ignores a second mark while the turn is open: a resumed turn is scored whole', () => {
    const ring = new TurnAudioBuffer(1_000)
    ring.push(ramp(0, 10))
    ring.markTurnStart(0)
    ring.push(ramp(10, 5))
    ring.markTurnStart(0)
    ring.push(ramp(15, 5))
    expect(Array.from(ring.turnAudio())).toEqual(Array.from(ramp(10, 10)))
    expect(ring.inTurn).toBe(true)
  })

  it('a turn longer than 8 s gives its last 8 s', () => {
    const ring = new TurnAudioBuffer(10)
    ring.markTurnStart(0)
    ring.push(ramp(0, 30))
    expect(Array.from(ring.turnAudio())).toEqual(Array.from(ramp(20, 10)))
  })

  it('endTurn clears the mark; the next mark starts a new turn', () => {
    const ring = new TurnAudioBuffer(1_000)
    ring.markTurnStart(0)
    ring.push(ramp(0, 10))
    ring.endTurn()
    expect(ring.inTurn).toBe(false)
    ring.push(ramp(10, 3))
    ring.markTurnStart(0)
    ring.push(ramp(13, 4))
    expect(Array.from(ring.turnAudio())).toEqual([13, 14, 15, 16])
  })

  it('hands back a fresh array every time, safe to transfer to a worker', () => {
    const ring = new TurnAudioBuffer(10)
    ring.push(ramp(0, 5))
    const a = ring.turnAudio()
    a.fill(99)
    expect(Array.from(ring.turnAudio())).toEqual([0, 1, 2, 3, 4])
  })

  it('latest(n) gives the newest n, or all it has', () => {
    const ring = new TurnAudioBuffer(10)
    ring.push(ramp(0, 12))
    expect(Array.from(ring.latest(3))).toEqual([9, 10, 11])
    expect(ring.latest(50).length).toBe(10)
    expect(ring.latest(-1).length).toBe(0)
  })

  it('reset forgets the audio and the mark', () => {
    const ring = new TurnAudioBuffer(10)
    ring.push(ramp(0, 5))
    ring.markTurnStart(0)
    ring.reset()
    expect(ring.total).toBe(0)
    expect(ring.inTurn).toBe(false)
    expect(ring.turnAudio().length).toBe(0)
  })

  it('refuses a capacity that is not a positive integer', () => {
    expect(() => new TurnAudioBuffer(0)).toThrow()
    expect(() => new TurnAudioBuffer(2.5)).toThrow()
  })
})
