import { describe, expect, it } from 'vitest'
import { VadDetector, type VadEvent } from '../vad'
import { EndOfTurnGate } from './gate'
import { extendedSilenceMs } from './policy'

/*
 * 20 ms frames at 24 kHz, exactly as `capture.ts` delivers them. A frame of
 * constant value v has RMS |v|, which is all the VAD reads — so a script of
 * levels is a script of what the VAD hears. 0.1 is plainly speech; 0.001 is
 * below the VAD's absolute noise gate (0.006) and is always silence.
 */

const RATE = 24_000
const FRAME = 480
const FRAME_MS = 20
const SPEECH = 0.1
const QUIET = 0.001

function frame(level: number): Float32Array {
  return new Float32Array(FRAME).fill(level)
}

/** `[level, ms]` runs → one level per frame. */
function script(runs: Array<[number, number]>): number[] {
  const out: number[] = []
  for (const [level, ms] of runs) for (let i = 0; i < ms / FRAME_MS; i += 1) out.push(level)
  return out
}

/** A deterministic mixture of speech, pauses of every length, and room noise. */
function randomScript(seed: number, frames: number): number[] {
  let state = seed >>> 0
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
  const out: number[] = []
  while (out.length < frames) {
    const speaking = next() < 0.55
    const length = speaking ? 1 + Math.floor(next() * 60) : 1 + Math.floor(next() * 90)
    for (let i = 0; i < length; i += 1) {
      // Speech wobbles; silence carries a little room noise under the gate.
      out.push(speaking ? 0.03 + next() * 0.15 : next() * 0.005)
    }
  }
  return out.slice(0, frames)
}

type Recorded = { frame: number; event: VadEvent }

function runPlain(levels: number[], calibratedMs: number, duckEvery?: number): Recorded[] {
  const vad = new VadDetector({ silenceMs: calibratedMs })
  const events: Recorded[] = []
  levels.forEach((level, i) => {
    if (duckEvery) vad.setDucked(Math.floor(i / duckEvery) % 2 === 1)
    const event = vad.push(Math.abs(level), i * FRAME_MS)
    if (event) events.push({ frame: i, event })
  })
  return events
}

/**
 * The gate, with the model answering `answer(pause)` the moment it is asked.
 * `answer` returning undefined means the model never answers at all.
 */
function runGate(
  levels: number[],
  calibratedMs: number,
  answer: (pause: number) => number | null | undefined,
  duckEvery?: number,
): { events: Recorded[]; probes: number[] } {
  const gate = new EndOfTurnGate({ calibratedMs, inputRate: RATE })
  const events: Recorded[] = []
  const probes: number[] = []
  levels.forEach((level, i) => {
    if (duckEvery) gate.vad.setDucked(Math.floor(i / duckEvery) % 2 === 1)
    const at = i * FRAME_MS
    const step = gate.push(frame(level), at)
    if (step.event) events.push({ frame: i, event: step.event })
    if (step.probe !== null) {
      probes.push(i)
      const p = answer(step.probe)
      if (p !== undefined) {
        const stop = gate.answer(step.probe, p, at)
        if (stop) events.push({ frame: i, event: stop })
      }
    }
  })
  return { events, probes }
}

describe('with no answer from the model, the gate IS today’s VAD', () => {
  const calibrations = [200, 300, 450, 600, 750, 900, 1200, 1300, 2000]

  it('emits the same events on the same frames over a scripted rep', () => {
    const levels = script([
      [QUIET, 400],
      [SPEECH, 1500],
      [QUIET, 150], // a breath
      [SPEECH, 800],
      [QUIET, 500], // a thinking pause
      [SPEECH, 600],
      [QUIET, 700], // a finished turn at the default
      [SPEECH, 2000],
      [QUIET, 1100],
      [SPEECH, 300],
      [QUIET, 3500],
    ])
    for (const calibratedMs of calibrations) {
      const today = runPlain(levels, calibratedMs)
      expect(today.length).toBeGreaterThan(0)
      expect(runGate(levels, calibratedMs, () => undefined).events, `calibrated ${calibratedMs}`).toEqual(today)
      expect(runGate(levels, calibratedMs, () => null).events, `calibrated ${calibratedMs}, null answer`).toEqual(today)
    }
  })

  it('emits the same events on the same frames over three random minutes, with her voice ducking the bar', () => {
    for (const seed of [1, 2, 3]) {
      const levels = randomScript(seed, 3_000) // a minute each
      for (const calibratedMs of [200, 600, 900, 1300]) {
        const today = runPlain(levels, calibratedMs, 37)
        // Below 1200 the gate's VAD waits longer than today's, so every stop
        // here was made by the gate itself — the path this test exists for.
        if (calibratedMs < 1200) expect(today.filter((e) => e.event.type === 'speech.stop').length).toBeGreaterThan(5)
        expect(runGate(levels, calibratedMs, () => undefined, 37).events, `seed ${seed}, calibrated ${calibratedMs}`).toEqual(today)
      }
    }
  })

  it('does the same when the answer is garbage rather than absent', () => {
    const levels = randomScript(9, 3_000)
    for (const garbage of [Number.NaN, -1, 7]) {
      expect(runGate(levels, 600, () => garbage).events).toEqual(runPlain(levels, 600))
    }
  })
})

describe('with an answer', () => {
  // Speech from 0 to 1000 ms; silence from frame 50 (1000 ms) onwards.
  const turn = script([
    [SPEECH, 1000],
    [QUIET, 2000],
  ])
  const silenceStarts = 1000

  it('asks once per pause, on the first frame with 200 ms of silence behind it', () => {
    const { probes } = runGate(turn, 600, () => undefined)
    expect(probes).toEqual([(silenceStarts + 200) / FRAME_MS])
  })

  it('he sounds done: concedes at the probe, reported as the VAD would report it', () => {
    const { events } = runGate(turn, 600, () => 0.92)
    const stop = events.find((e) => e.event.type === 'speech.stop')
    expect(stop?.frame).toBe((silenceStarts + 200) / FRAME_MS)
    // `atMs` is where the silence began and `silenceMs` how long it was
    // waited out — the same shape `VadDetector` gives `onUserSpeechStop`.
    expect(stop?.event).toEqual({ type: 'speech.stop', atMs: silenceStarts, silenceMs: 200 })
    expect(events.filter((e) => e.event.type === 'speech.stop')).toHaveLength(1)
  })

  it('he sounds mid-thought: waits past the 600 ms that cuts him off today, to 960', () => {
    const { events } = runGate(turn, 600, () => 0.12)
    const stop = events.find((e) => e.event.type === 'speech.stop')
    expect(stop?.event).toEqual({ type: 'speech.stop', atMs: silenceStarts, silenceMs: extendedSilenceMs(600) })
  })

  it('he sounds mid-thought and carries on at 800 ms: nobody talked over him', () => {
    const levels = script([
      [SPEECH, 1000],
      [QUIET, 800],
      [SPEECH, 1000],
      [QUIET, 2000],
    ])
    // Unfinished the first time, finished the second.
    const { events, probes } = runGate(levels, 600, (pause) => (pause === 1 ? 0.1 : 0.9))
    expect(probes).toHaveLength(2)
    const stops = events.filter((e) => e.event.type === 'speech.stop')
    expect(stops).toHaveLength(1)
    expect(stops[0]?.event).toEqual({ type: 'speech.stop', atMs: 2800, silenceMs: 200 })
    // Today's VAD would have ended his turn in that first pause.
    expect(runPlain(levels, 600).filter((e) => e.event.type === 'speech.stop')[0]?.event.atMs).toBe(1000)
  })

  it('unsure: exactly today', () => {
    expect(runGate(turn, 600, () => 0.6).events).toEqual(runPlain(turn, 600))
  })

  it('an answer that arrives after the pause ended is thrown away', () => {
    const gate = new EndOfTurnGate({ calibratedMs: 600, inputRate: RATE })
    let pause: number | null = null
    let i = 0
    for (const level of script([
      [SPEECH, 1000],
      [QUIET, 300],
      [SPEECH, 200], // he spoke again before the model answered
    ])) {
      const step = gate.push(frame(level), i * FRAME_MS)
      if (step.probe !== null) pause = step.probe
      i += 1
    }
    expect(pause).not.toBeNull()
    expect(gate.answer(pause!, 0.99, i * FRAME_MS)).toBeNull()
    expect(gate.vad.isSpeaking).toBe(true)
  })

  it('an answer for an older pause cannot concede a newer one', () => {
    const gate = new EndOfTurnGate({ calibratedMs: 600, inputRate: RATE })
    const probes: number[] = []
    let i = 0
    for (const level of script([
      [SPEECH, 600],
      [QUIET, 300],
      [SPEECH, 400],
      [QUIET, 300],
    ])) {
      const step = gate.push(frame(level), i * FRAME_MS)
      if (step.probe !== null) probes.push(step.probe)
      i += 1
    }
    expect(probes).toHaveLength(2)
    expect(gate.answer(probes[0]!, 0.99, i * FRAME_MS)).toBeNull()
    // The second pause began at 1300 ms and it is 1600 now.
    expect(gate.answer(probes[1]!, 0.99, i * FRAME_MS)).toEqual({ type: 'speech.stop', atMs: 1300, silenceMs: 300 })
  })

  it('a slow answer that lands after the calibrated silence finds the turn already conceded', () => {
    const gate = new EndOfTurnGate({ calibratedMs: 600, inputRate: RATE })
    let pause: number | null = null
    const stops: VadEvent[] = []
    script([
      [SPEECH, 1000],
      [QUIET, 700],
    ]).forEach((level, i) => {
      const step = gate.push(frame(level), i * FRAME_MS)
      if (step.probe !== null) pause = step.probe
      if (step.event?.type === 'speech.stop') stops.push(step.event)
    })
    expect(stops).toEqual([{ type: 'speech.stop', atMs: 1000, silenceMs: 600 }])
    expect(gate.answer(pause!, 0.1, 1700)).toBeNull()
  })
})

describe('the audio the model reads', () => {
  it('is his turn at 16 kHz, from just before his onset — not her voice in front of it', () => {
    const gate = new EndOfTurnGate({ calibratedMs: 600, inputRate: RATE })
    // 2 s of her voice leaking through echo cancellation, under the gate;
    // then him for 1.5 s; then the pause the model is asked about.
    const levels = script([
      [0.004, 2000],
      [SPEECH, 1500],
      [QUIET, 400],
    ])
    let audio: Float32Array | null = null
    levels.forEach((level, i) => {
      const step = gate.push(frame(level), i * FRAME_MS)
      if (step.probe !== null) audio = gate.turnAudio()
    })
    expect(audio).not.toBeNull()
    const got = audio as unknown as Float32Array
    // Onset is believed after 90 ms (five frames) and backdated to the first
    // loud frame, then 200 ms of pre-roll is kept in front of it.
    const expected = (200 + 1500 + 200) * 16
    expect(Math.abs(got.length - expected)).toBeLessThanOrEqual(16 * FRAME_MS)
    // The loud part is his, at the level he spoke.
    const middle = got[Math.floor(got.length / 2)]!
    expect(middle).toBeCloseTo(SPEECH, 3)
    // Nothing from more than the pre-roll before his onset.
    expect(got.length).toBeLessThan((2000 + 1500 + 200) * 16)
  })

  it('starts afresh on the onset after she took the floor', () => {
    const gate = new EndOfTurnGate({ calibratedMs: 600, inputRate: RATE })
    const lengths: number[] = []
    script([
      [SPEECH, 1000],
      [QUIET, 1000], // conceded at 600
      [SPEECH, 400],
      [QUIET, 300],
    ]).forEach((level, i) => {
      const step = gate.push(frame(level), i * FRAME_MS)
      if (step.probe !== null) lengths.push(gate.turnAudio().length)
    })
    expect(lengths).toHaveLength(2)
    // The second turn is 400 ms of speech, 200 ms of pre-roll and 200 ms of
    // pause — not the first turn as well.
    expect(Math.abs(lengths[1]! - 800 * 16)).toBeLessThanOrEqual(16 * FRAME_MS)
  })

  it('keeps a resumed turn whole: a pause that did not end it does not move the mark', () => {
    const gate = new EndOfTurnGate({ calibratedMs: 600, inputRate: RATE })
    const lengths: number[] = []
    script([
      [QUIET, 400], // room for the pre-roll in front of him
      [SPEECH, 1000],
      [QUIET, 400],
      [SPEECH, 500],
      [QUIET, 300],
    ]).forEach((level, i) => {
      const step = gate.push(frame(level), i * FRAME_MS)
      if (step.probe !== null) {
        lengths.push(gate.turnAudio().length)
        gate.answer(step.probe, 0.1, i * FRAME_MS)
      }
    })
    expect(lengths).toHaveLength(2)
    expect(Math.abs(lengths[1]! - (200 + 1000 + 400 + 500 + 200) * 16)).toBeLessThanOrEqual(16 * FRAME_MS)
  })

  it('reset forgets the turn, the pause and the audio', () => {
    const gate = new EndOfTurnGate({ calibratedMs: 600, inputRate: RATE })
    script([[SPEECH, 1000]]).forEach((level, i) => gate.push(frame(level), i * FRAME_MS))
    gate.reset()
    expect(gate.vad.isSpeaking).toBe(false)
    expect(gate.turnAudio().length).toBe(0)
  })
})
