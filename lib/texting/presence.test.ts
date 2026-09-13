import { describe, expect, it } from 'vitest'
import {
  MAX_TYPING_MS,
  MIN_TYPING_MS,
  PRESSURE_MULTIPLIER,
  presenceLabel,
  presenceText,
  scheduleFor,
  timingFor,
  typingDurationMs,
} from './presence'

const WARM = 85
const OPEN = 45
const COLD = 10

describe('the table reads coldness as delay', () => {
  it('every band is slower than the one above it', () => {
    const ladder = [95, 70, 50, 30, 10, -10].map((warmth) => timingFor(warmth))
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]!.readDelayMs).toBeGreaterThanOrEqual(ladder[i - 1]!.readDelayMs)
    }
  })

  it('the spread is large enough to be legible and small enough to be usable', () => {
    const fastest = timingFor(95).readDelayMs
    const slowest = timingFor(-10).readDelayMs
    expect(slowest / fastest).toBeGreaterThan(20)
    // A real cold reply takes hours. Rendering that honestly produces an app
    // that looks broken, so the scale is compressed rather than truthful.
    expect(slowest).toBeLessThanOrEqual(20_000)
  })
})

describe('the schedule', () => {
  const base = { replyText: 'yeah, that sounds about right', seed: 'thread:1#3' }

  it('always runs seen -> typing -> revealed', () => {
    for (const warmth of [-10, 5, 25, 45, 65, 90]) {
      const s = scheduleFor({ ...base, warmth })
      expect(s.seenAfterMs).toBeLessThanOrEqual(s.typingAfterMs)
      expect(s.typingAfterMs).toBeLessThan(s.revealAfterMs)
    }
  })

  it('a cold reply arrives later than a warm one', () => {
    expect(scheduleFor({ ...base, warmth: COLD }).revealAfterMs)
      .toBeGreaterThan(scheduleFor({ ...base, warmth: WARM }).revealAfterMs)
  })

  it('generation time is spent INSIDE the lead, not added to it', () => {
    const idle = scheduleFor({ ...base, warmth: OPEN })
    const slow = scheduleFor({ ...base, warmth: OPEN, generationMs: 1_500 })
    // The reply does not arrive later because the model was slow — the wait
    // the product wanted anyway absorbed it.
    expect(slow.revealAfterMs).toBeLessThanOrEqual(idle.revealAfterMs)
  })

  it('a generation longer than the whole lead shows typing immediately', () => {
    const s = scheduleFor({ ...base, warmth: OPEN, generationMs: 60_000 })
    expect(s.typingAfterMs).toBe(s.seenAfterMs)
  })

  it('pressure makes her slower, not faster', () => {
    const normal = scheduleFor({ ...base, warmth: COLD })
    const pushed = scheduleFor({ ...base, warmth: COLD, pressuring: true })
    expect(pushed.seenAfterMs).toBeGreaterThan(normal.seenAfterMs)
    expect(pushed.seenAfterMs / normal.seenAfterMs).toBeCloseTo(PRESSURE_MULTIPLIER, 1)
  })

  it('is deterministic for a thread and an exchange', () => {
    expect(scheduleFor({ ...base, warmth: OPEN })).toEqual(scheduleFor({ ...base, warmth: OPEN }))
  })

  it('differs between exchanges of the same thread', () => {
    const a = scheduleFor({ ...base, warmth: OPEN, seed: 'thread:1#3' })
    const b = scheduleFor({ ...base, warmth: OPEN, seed: 'thread:1#4' })
    expect(a.revealAfterMs).not.toBe(b.revealAfterMs)
  })
})

describe('typing duration', () => {
  it('is bounded at both ends', () => {
    for (const roll of [0, 0.5, 1]) {
      expect(typingDurationMs('ok', roll)).toBeGreaterThanOrEqual(Math.round(MIN_TYPING_MS * 0.75))
      expect(typingDurationMs('x'.repeat(500), roll)).toBeLessThanOrEqual(Math.round(MAX_TYPING_MS * 1.25))
    }
  })

  it('a silent turn types for no time at all', () => {
    expect(typingDurationMs('', 0.5)).toBe(0)
  })

  it('a longer message takes longer to type', () => {
    expect(typingDurationMs('yeah that was a genuinely strange evening all round', 0.5))
      .toBeGreaterThan(typingDurationMs('yeah', 0.5))
  })
})

describe('the line under her name', () => {
  it('says nothing at all once she has gone', () => {
    const label = presenceLabel({ ended: true, typing: false, warmth: 90, sinceHerLastMs: 1_000 })
    expect(label.kind).toBe('gone')
    expect(presenceText(label)).toBeNull()
  })

  it('typing outranks everything except having gone', () => {
    expect(presenceLabel({ ended: false, typing: true, warmth: 5, sinceHerLastMs: 900_000 }).kind).toBe('typing')
    expect(presenceLabel({ ended: true, typing: true, warmth: 90, sinceHerLastMs: 0 }).kind).toBe('gone')
  })

  it('a warm character who just replied is active', () => {
    expect(presenceText(presenceLabel({ ended: false, typing: false, warmth: 70, sinceHerLastMs: 4_000 }))).toBe('Active now')
  })

  it('a cold character is away, and the gap is reported in minutes', () => {
    const label = presenceLabel({ ended: false, typing: false, warmth: 15, sinceHerLastMs: 245_000 })
    expect(label).toEqual({ kind: 'lastSeen', minutesAgo: 4 })
    expect(presenceText(label)).toBe('Active 4m ago')
  })

  it('never reports less than a minute as a last-seen time', () => {
    const label = presenceLabel({ ended: false, typing: false, warmth: 15, sinceHerLastMs: 1_000 })
    expect(label).toEqual({ kind: 'lastSeen', minutesAgo: 1 })
  })
})
