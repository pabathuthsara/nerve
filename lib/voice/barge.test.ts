import { describe, expect, it } from 'vitest'
import { BARGE_CONFIRM_MS, BARGE_TAIL_MS, BargeGate } from './barge'

describe('barge-in confirmation (REP-FIXES B3)', () => {
  it('confirms only once he has kept talking for ~350ms', () => {
    const gate = new BargeGate()
    gate.open(0)
    for (let t = 20; t < BARGE_CONFIRM_MS; t += 20) expect(gate.frame(t, true)).toBeNull()
    expect(gate.frame(BARGE_CONFIRM_MS, true)).toBe('confirm')
    expect(gate.pending).toBe(false)
  })

  it('calls a 240ms "Mm." a backchannel, and throws the rest away when the VAD concedes', () => {
    const gate = new BargeGate()
    gate.open(0)
    for (let t = 20; t <= 240; t += 20) expect(gate.frame(t, true)).toBeNull()
    expect(gate.frame(360, false)).toBeNull()
    expect(gate.frame(400, false)).toBe('backchannel')
    expect(gate.released).toBe(true)
    expect(gate.frame(500, false)).toBeNull()
    expect(gate.stopped()).toBe('backchannel')
    expect(gate.stopped()).toBeNull()
  })

  it('waits out a short pause inside a real interruption, then confirms on the next word', () => {
    const gate = new BargeGate()
    gate.open(0)
    gate.frame(250, true)
    expect(gate.frame(BARGE_CONFIRM_MS, false)).toBeNull()
    expect(gate.frame(250 + BARGE_TAIL_MS, false)).toBeNull()
    expect(gate.frame(420, true)).toBe('confirm')
  })

  it('decides within about half a second whatever happens', () => {
    const gate = new BargeGate()
    gate.open(0)
    gate.frame(BARGE_CONFIRM_MS - 10, true)
    expect(gate.frame(BARGE_CONFIRM_MS - 10 + BARGE_TAIL_MS + 1, false)).toBe('backchannel')
    expect(BARGE_CONFIRM_MS + BARGE_TAIL_MS).toBeLessThanOrEqual(500)
  })

  it('re-opens the question when he starts again after a backchannel', () => {
    const gate = new BargeGate()
    gate.open(0)
    gate.frame(100, true)
    expect(gate.frame(400, false)).toBe('backchannel')
    expect(gate.frame(500, true)).toBe('reopened')
    expect(gate.frame(700, true)).toBeNull()
    expect(gate.frame(850, true)).toBe('confirm')
  })

  it('says nothing about frames when no question is open', () => {
    const gate = new BargeGate()
    expect(gate.frame(100, true)).toBeNull()
    expect(gate.stopped()).toBeNull()
  })
})
