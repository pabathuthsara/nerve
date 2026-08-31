/**
 * Acoustic model tests.
 *
 * Mostly pure maths. The graph tests at the bottom drive a recording stub of
 * WebAudio, because the round-10 bug — the bed only playing while she spoke —
 * was a wiring fault, not a maths fault, and wiring is exactly what a pure test
 * cannot see.
 */

import { describe, expect, it, vi } from 'vitest'
import { buildImpulseResponse, measureRt60, dbToGain } from './impulse'
import { nextIntervalSeconds, pickOneShot } from './schedule'
import { BOOKSHOP, BAR, roomAcousticsEnabled, sceneFor, sceneForRoom } from './scenes'
import { Room } from './engine'
import type { OneShot } from './types'
import { nadia } from '@/lib/personas/nadia'

const SR = 48000
/** Deterministic pseudo-noise so a test asserts the model, not a dice roll. */
function seeded(seed = 1): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('impulse response', () => {
  it('produces a tail envelope matching the requested RT60', () => {
    // Measured on a tail-dominant profile. In a dead room the early
    // reflections are the loudest thing in the response, so measuring from the
    // global peak would conflate tail length with early/late balance — those
    // are two separate parameters and the test below covers the other one.
    for (const rt60 of [0.3, 0.8, 1.1]) {
      const { left } = buildImpulseResponse(
        { ...BOOKSHOP.reverb, rt60Seconds: rt60, earlyReflectionRatio: 0.05 },
        SR,
        seeded(7),
      )
      const measured = measureRt60(left, SR)
      expect(Math.abs(measured - rt60), `rt60 ${rt60}`).toBeLessThan(rt60 * 0.25)
    }
  })

  it('makes a dead room decay audibly faster than its nominal RT60', () => {
    // Physically right, and worth pinning: with most energy in early
    // reflections the audible decay is shorter than the tail constant implies.
    const dead = measureRt60(buildImpulseResponse(BOOKSHOP.reverb, SR, seeded(7)).left, SR)
    expect(dead).toBeLessThan(BOOKSHOP.reverb.rt60Seconds)
  })

  it('models the bookshop as early reflections with almost no tail', () => {
    // The whole point: a hall or room preset is wrong for a space whose walls
    // are packed paper. Energy must sit at the front.
    const { left } = buildImpulseResponse(BOOKSHOP.reverb, SR, seeded(3))
    const firstFortyMs = left.slice(0, Math.round(0.04 * SR))
    const energy = (frames: Float32Array) =>
      frames.reduce((sum, value) => sum + value * value, 0)

    const earlyEnergy = energy(firstFortyMs)
    const totalEnergy = energy(left)
    expect(earlyEnergy / totalEnergy).toBeGreaterThan(0.5)
  })

  it('gives the bar a longer, brighter tail than the bookshop', () => {
    const tailOnly = (profile: typeof BOOKSHOP.reverb) =>
      measureRt60(
        buildImpulseResponse({ ...profile, earlyReflectionRatio: 0.05 }, SR, seeded(1)).left,
        SR,
      )
    expect(tailOnly(BAR.reverb)).toBeGreaterThan(tailOnly(BOOKSHOP.reverb) * 2)
    expect(BAR.reverb.dampingHz).toBeGreaterThan(BOOKSHOP.reverb.dampingHz)
  })

  it('respects the pre-delay before anything arrives', () => {
    const profile = { ...BOOKSHOP.reverb, preDelayMs: 20 }
    const { left } = buildImpulseResponse(profile, SR, seeded(5))
    const silentFrames = Math.round((profile.preDelayMs / 1000) * SR)
    for (let i = 0; i < silentFrames; i += 1) {
      expect(left[i]).toBe(0)
    }
  })

  it('normalises so wet mix means the same thing across scenes', () => {
    for (const profile of [BOOKSHOP.reverb, BAR.reverb]) {
      const { left, right } = buildImpulseResponse(profile, SR, seeded(9))
      // Reduced rather than spread into `Math.max`. A 1.1s tail at 48kHz is
      // ~53,000 samples per channel, and spreading that many arguments blows
      // the call stack on some engines — which is a property of the runner, not
      // of the impulse response, and it failed the assertion for the wrong
      // reason. Node 22 is one of the engines it fails on.
      let peak = 0
      for (const channel of [left, right]) {
        for (const sample of channel) {
          const magnitude = Math.abs(sample)
          if (magnitude > peak) peak = magnitude
        }
      }
      expect(peak).toBeGreaterThan(0.5)
      expect(peak).toBeLessThanOrEqual(0.9001)
    }
  })

  it('converts dB to gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 5)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2)
    expect(dbToGain(-40)).toBeCloseTo(0.01, 4)
  })
})

describe('one-shot scheduling', () => {
  it('stays inside the configured window', () => {
    const rng = seeded(11)
    for (let i = 0; i < 500; i += 1) {
      const seconds = nextIntervalSeconds(BOOKSHOP.ambient.oneShotIntervalSeconds, rng)
      expect(seconds).toBeGreaterThanOrEqual(20)
      expect(seconds).toBeLessThanOrEqual(40)
    }
  })

  it('never produces a fixed rhythm', () => {
    const rng = seeded(13)
    const draws = Array.from({ length: 50 }, () =>
      nextIntervalSeconds(BOOKSHOP.ambient.oneShotIntervalSeconds, rng),
    )
    expect(new Set(draws.map((d) => d.toFixed(3))).size).toBeGreaterThan(45)
  })

  it('picks by weight', () => {
    const shots: OneShot[] = [
      { kind: 'page-turn', weight: 9, levelDb: -30 },
      { kind: 'distant-door', weight: 1, levelDb: -30 },
    ]
    const rng = seeded(17)
    const picks = Array.from({ length: 2000 }, () => pickOneShot(shots, rng)?.kind)
    const pages = picks.filter((kind) => kind === 'page-turn').length
    expect(pages / picks.length).toBeGreaterThan(0.8)
    expect(pages / picks.length).toBeLessThan(0.96)
  })

  it('handles an empty or zero-weight set without throwing', () => {
    expect(pickOneShot([], seeded())).toBeNull()
    expect(pickOneShot([{ kind: 'page-turn', weight: 0, levelDb: -30 }], seeded())).toBeNull()
  })
})

describe('scene presets', () => {
  it('keeps everything distinctive out of the looping bed', () => {
    // A page turn heard twice inside a loop is worse than no page turn at all.
    for (const scene of [BOOKSHOP, BAR]) {
      for (const layer of scene.ambient.layers) {
        expect(['hvac-hum', 'traffic-through-glass', 'room-rumble', 'crowd-wash', 'platform-wind'])
          .toContain(layer.kind)
      }
      expect(scene.ambient.oneShots.length).toBeGreaterThan(0)
    }
  })

  it('makes the bookshop far quieter than a loud room', () => {
    expect(BOOKSHOP.ambient.masterDb).toBeLessThan(BAR.ambient.masterDb - 10)
    expect(BOOKSHOP.ambient.masterDb).toBeLessThanOrEqual(-40)
  })

  it('keeps the bookshop wet mix subtle', () => {
    expect(BOOKSHOP.reverb.wetMix).toBeGreaterThanOrEqual(0.08)
    expect(BOOKSHOP.reverb.wetMix).toBeLessThanOrEqual(0.12)
  })

  it('rolls high frequencies off in the bookshop, because paper eats treble', () => {
    expect(BOOKSHOP.reverb.dampingHz).toBeLessThanOrEqual(6000)
    for (const layer of BOOKSHOP.ambient.layers) {
      expect(layer.highCutHz ?? 0).toBeLessThan(1000)
    }
  })

  it('resolves scenes by id', () => {
    expect(sceneFor('bookshop')?.id).toBe('bookshop')
    expect(sceneFor('train-platform')).toBeNull()
  })
})


/* ------------------------------------------------------------------ *
 * The audio graph
 * ------------------------------------------------------------------ */

/**
 * A recording stub of the bits of WebAudio the Room touches.
 *
 * It exists to answer one question that no amount of listening in CI can:
 * does the ambient bed reach the speakers on a path that does not run through
 * her voice? That was the round-9 bug — the bed was mixed into her output bus,
 * so it was only audible while she was talking, which is the exact opposite of
 * what a bed is for.
 */
function stubContext() {
  let nextId = 0
  const edges = new Map<number, Set<number>>()
  const sources: StubSource[] = []

  interface Tagged { __id: number }
  const tag = <T extends object>(node: T): T & Tagged => {
    const id = nextId++
    return Object.assign(node, { __id: id })
  }
  const connect = (from: Tagged, to: Tagged & { __id: number }) => {
    if (!edges.has(from.__id)) edges.set(from.__id, new Set())
    edges.get(from.__id)?.add(to.__id)
    return to
  }

  const param = () => {
    const p = {
      value: 1,
      setValueAtTime: vi.fn((v: number) => { p.value = v }),
      linearRampToValueAtTime: vi.fn((v: number) => { p.value = v }),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    }
    return p
  }

  interface StubSource extends Tagged {
    loop: boolean
    started: boolean
    stopped: boolean
  }

  const makeNode = <T extends object>(extra: T) =>
    tag({
      ...extra,
      connect(target: Tagged) { return connect(this as unknown as Tagged, target) },
      disconnect() { /* noop */ },
    })

  const destination = tag({ connect: () => destination, disconnect: () => {} })

  const ctx = {
    sampleRate: 48000,
    currentTime: 0,
    state: 'running' as const,
    destination,
    createGain: () => makeNode({ gain: param() }),
    createConvolver: () => makeNode({ buffer: null as unknown, normalize: true }),
    createBiquadFilter: () => makeNode({ type: 'lowpass', frequency: param(), Q: param() }),
    createBuffer: (channels: number, length: number) => ({
      length,
      duration: length / 48000,
      numberOfChannels: channels,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const node = makeNode({
        buffer: null as unknown,
        loop: false,
        started: false,
        stopped: false,
        start(this: StubSource) { this.started = true },
        stop(this: StubSource) { this.stopped = true },
      }) as unknown as StubSource & { connect: (t: Tagged) => Tagged }
      sources.push(node)
      return node
    },
  }

  /** Every node id reachable from `from`, following connections. */
  const reachable = (from: number): Set<number> => {
    const seen = new Set<number>()
    const queue = [from]
    while (queue.length > 0) {
      const id = queue.shift() as number
      for (const next of edges.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    return seen
  }

  return { ctx: ctx as unknown as AudioContext, destination, sources, reachable }
}

const seededRng = () => seeded(11)

describe('the room graph', () => {
  it('gets the bed to the speakers without going through her voice', () => {
    const { ctx, destination, sources, reachable } = stubContext()
    const room = new Room(ctx, { scene: BOOKSHOP, rng: seededRng() })
    room.arm()

    const herInput = room.handles.input as unknown as { __id: number }
    const looping = sources.filter((source) => source.loop)
    expect(looping.length).toBe(BOOKSHOP.ambient.layers.length)

    for (const source of looping) {
      const downstream = reachable(source.__id)
      // It reaches the speakers...
      expect(downstream.has(destination.__id)).toBe(true)
      // ...and never by way of her input bus. This is the whole fix.
      expect(downstream.has(herInput.__id)).toBe(false)
    }
  })

  it('runs the bed from arm to stop, and nothing in between touches it', () => {
    const { ctx, sources } = stubContext()
    const room = new Room(ctx, { scene: BOOKSHOP, rng: seededRng() })
    room.arm()

    const looping = () => sources.filter((source) => source.loop)
    expect(looping().every((source) => source.started)).toBe(true)

    // Ten seconds of her speaking, stopping, speaking again. Nothing that
    // happens to the conversation may stop a single ambient source.
    for (let i = 0; i < 5; i += 1) {
      room.duck(true)
      room.duck(false)
    }
    expect(looping().some((source) => source.stopped)).toBe(false)
    expect(room.isRunning).toBe(true)

    room.stop()
    expect(looping().every((source) => source.stopped)).toBe(true)
  })

  it('plays no bed and schedules no one-shots when the ambient is off', () => {
    // The synthesised bed reached the microphone and read as speech, so it is
    // switched off while the room re-renders as recorded audio. "Off" has to
    // mean no sources and no timer — a silent source is still a graph a stray
    // dB trim can wake, and a scheduled one-shot is still a timer that fires.
    const { ctx, sources } = stubContext()
    const room = new Room(ctx, { scene: BOOKSHOP, rng: seededRng(), ambient: false })
    room.arm()

    expect(sources.filter((source) => source.loop)).toHaveLength(0)
    expect(sources).toHaveLength(0)
  })

  it('still puts her voice in the room when the ambient is off', () => {
    // Acoustics are the shape of the space and stay on. Only sound playing
    // INTO the room can be mistaken for someone speaking.
    const { ctx } = stubContext()
    const room = new Room(ctx, { scene: BOOKSHOP, rng: seededRng(), ambient: false })
    room.arm()
    room.setWetMix(0.1)

    expect(room.handles.input).toBeTruthy()
    expect(room.wetMix).toBeCloseTo(0.1, 5)
  })

  it('is idempotent on arm, so a second call cannot phase the loop', () => {
    const { ctx, sources } = stubContext()
    const room = new Room(ctx, { scene: BOOKSHOP, rng: seededRng() })
    room.arm()
    room.arm()
    room.start()
    expect(sources.filter((source) => source.loop).length).toBe(BOOKSHOP.ambient.layers.length)
  })

  it('ducks by a couple of dB and never mutes', () => {
    const { ctx } = stubContext()
    const room = new Room(ctx, { scene: BOOKSHOP, rng: seededRng() })
    room.arm()

    // Reading the duck gain through the only handle the outside world has.
    const duckGain = () => {
      const node = (room as unknown as { ambientDuck: { gain: { value: number } } }).ambientDuck
      return node.gain.value
    }

    expect(duckGain()).toBe(1)
    room.duck(true)
    expect(room.ducked).toBe(true)
    // -2.5dB is about 0.75. Audibly under her, unmistakably still there.
    expect(duckGain()).toBeGreaterThan(0.6)
    expect(duckGain()).toBeLessThan(0.9)

    room.duck(false)
    expect(duckGain()).toBe(1)
    expect(room.ducked).toBe(false)
  })

  it('keeps the bookshop dead rather than reverberant', () => {
    // A hall or room preset on packed paper sounds like a bathroom (§1).
    expect(BOOKSHOP.reverb.rt60Seconds).toBeLessThanOrEqual(0.35)
    expect(BOOKSHOP.reverb.earlyReflectionRatio).toBeGreaterThan(0.7)
    expect(BOOKSHOP.reverb.dampingHz).toBeLessThanOrEqual(6000)
    expect(BOOKSHOP.reverb.wetMix).toBeGreaterThanOrEqual(0.08)
    expect(BOOKSHOP.reverb.wetMix).toBeLessThanOrEqual(0.12)
  })

  it('keeps everything distinctive out of the loop', () => {
    // Anything recognisable heard twice stops being scenery (§1).
    for (const layer of BOOKSHOP.ambient.layers) {
      expect(['hvac-hum', 'traffic-through-glass', 'room-rumble']).toContain(layer.kind)
    }
    const [min, max] = BOOKSHOP.ambient.oneShotIntervalSeconds
    expect(min).toBeGreaterThanOrEqual(20)
    expect(max).toBeLessThanOrEqual(40)
  })
})

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

describe('bed level', () => {
  /**
   * The noise buffer is normalised to unity RMS, so a layer's gain IS its level
   * in dBFS relative to the master. That is the whole reason for normalising:
   * without it the generator's own amplitude — measured at -13.8 dBFS — sits
   * silently underneath every number in scenes.ts.
   */
  const levelDbFs = (relativeDb: number, masterDb: number) => relativeDb + masterDb

  const bedTotalDbFs = (scene: typeof BOOKSHOP) => {
    const power = scene.ambient.layers.reduce((sum, layer) => {
      const gain = dbToGain(levelDbFs(layer.levelDb, scene.ambient.masterDb))
      return sum + gain * gain
    }, 0)
    return 20 * Math.log10(Math.sqrt(power))
  }

  it('puts the bookshop bed where §02 says it goes, not 56dB below it', () => {
    // THE BUG. Layer levels were absolute dBFS and were then multiplied by an
    // absolute masterDb, so -44 and -40 compounded to -95.7 dBFS. The bed was
    // never audible in any session; what could be heard was the one-shots,
    // which reached the speakers through her voice path and skipped the trim.
    const bed = bedTotalDbFs(BOOKSHOP)
    expect(bed).toBeGreaterThan(-45)
    expect(bed).toBeLessThan(-32)
  })

  it('keeps every layer relative, so one absolute number owns the level', () => {
    // A layer at -44 here would mean the old compounding is back.
    for (const scene of [BOOKSHOP, BAR]) {
      for (const layer of scene.ambient.layers) {
        expect(Math.abs(layer.levelDb), `${scene.id}/${layer.kind}`).toBeLessThanOrEqual(24)
      }
    }
  })

  it('lifts one-shots above the floor, or they are not events', () => {
    for (const shot of BOOKSHOP.ambient.oneShots) {
      expect(shot.levelDb, shot.kind).toBeGreaterThan(0)
    }
    const quietest = Math.min(...BOOKSHOP.ambient.oneShots.map((s) => s.levelDb))
    const loudest = Math.max(...BOOKSHOP.ambient.oneShots.map((s) => s.levelDb))
    // Audible against the bed, and nowhere near her voice.
    expect(quietest).toBeGreaterThanOrEqual(4)
    expect(levelDbFs(loudest, BOOKSHOP.ambient.masterDb)).toBeLessThan(-18)
  })

  it('makes the bar substantially louder than the bookshop', () => {
    expect(bedTotalDbFs(BAR)).toBeGreaterThan(bedTotalDbFs(BOOKSHOP) + 10)
  })

  it('leaves the bed audible after the duck, which is the point of ducking', () => {
    // -2.5dB is about 0.75 of the gain. A bed that vanished under her voice
    // would be the original bug wearing a different hat.
    const ducked = bedTotalDbFs(BOOKSHOP) - 2.5
    expect(ducked).toBeGreaterThan(-45)
  })
})

describe('the procedural room switch', () => {
  // Off by default. The convolution reverb made her harder to understand on
  // ordinary hardware, and a rep the user cannot follow is not a rep. Recorded
  // beds arrive as audio files later and are a different mechanism.
  it('gives the adapters no scene while acoustics are off', () => {
    vi.stubEnv('NEXT_PUBLIC_ROOM_ACOUSTICS', '')
    expect(roomAcousticsEnabled()).toBe(false)
    expect(sceneForRoom('bookshop')).toBeNull()
    expect(sceneForRoom('bar')).toBeNull()
    vi.unstubAllEnvs()
  })

  it('hands back the authored scene when it is switched on', () => {
    vi.stubEnv('NEXT_PUBLIC_ROOM_ACOUSTICS', 'on')
    expect(roomAcousticsEnabled()).toBe(true)
    expect(sceneForRoom('bookshop')?.id).toBe('bookshop')
    // Still a lookup: an unknown scene is null whether or not this is on.
    expect(sceneForRoom('train-platform')).toBeNull()
    vi.unstubAllEnvs()
  })

  it('leaves the authored room layer on every persona untouched', () => {
    // The switch is the one answer. Zeroing wet mixes across eight characters
    // would be eight places to undo when the recorded beds land.
    expect(nadia.room.reverbIr).toBe('bookshop')
    expect(nadia.room.reverbWet).toBeGreaterThan(0)
  })
})
