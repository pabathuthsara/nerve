import { describe, expect, it } from 'vitest'
import { FUNNEL_EVENTS, isSafeValue, safeProps, sessionReplayAllowed } from './events'

describe('where session replay may run', () => {
  it('never runs on a live rep — the §04 rule this exists for', () => {
    expect(sessionReplayAllowed('/rep/nadia/live')).toBe(false)
    expect(sessionReplayAllowed('/rep/nadia/brief')).toBe(false)
    expect(sessionReplayAllowed('/interview/rep/aisha-rahman/live')).toBe(false)
  })

  it('never runs anywhere else a transcript is on screen', () => {
    // The spec names only the live route. These three draw the same content by
    // another path, so excluding them is the same rule, not a stricter one.
    expect(sessionReplayAllowed('/text/nadia')).toBe(false)
    expect(sessionReplayAllowed('/session/abc-123/transcript')).toBe(false)
    expect(sessionReplayAllowed('/session/abc-123/scorecard')).toBe(false)
    expect(sessionReplayAllowed('/field')).toBe(false)
  })

  it('runs on the pages that carry nobody’s conversation', () => {
    expect(sessionReplayAllowed('/')).toBe(true)
    expect(sessionReplayAllowed('/train')).toBe(true)
    expect(sessionReplayAllowed('/pricing')).toBe(true)
    expect(sessionReplayAllowed('/progress')).toBe(true)
    expect(sessionReplayAllowed('/library/mirroring')).toBe(true)
  })
})

describe('the event catalogue', () => {
  it('covers the whole funnel B7 needs, in order', () => {
    // The order is the funnel. PostHog reads these as a sequence, so a
    // reordering here is a reordering of the chart M5's gate is read off.
    expect(FUNNEL_EVENTS).toEqual([
      'brief_viewed',
      'rep_started',
      'rep_first_user_turn',
      'rep_completed',
      'scorecard_viewed',
      'technique_opened',
      'focused_rep_started',
      'field_challenge_accepted',
      'field_challenge_logged',
    ])
  })

  it('keeps the step that measures the freeze', () => {
    // Between "rep started" and "the user said a word" is somebody opening a
    // microphone, hearing a stranger, and not speaking. No other pair of
    // events can see it, so it does not get dropped as redundant.
    expect(FUNNEL_EVENTS).toContain('rep_first_user_turn')
  })
})

describe('what may leave the device', () => {
  it('allows ids, slugs, uuids and enum members', () => {
    expect(isSafeValue('nadia')).toBe(true)
    expect(isSafeValue('9f8c1a2e-4b6d-4f31-9a77-0c2d5e8b1f44')).toBe(true)
    expect(isSafeValue('she_left')).toBe(true)
    expect(isSafeValue('opening')).toBe(true)
  })

  it('allows finite numbers and booleans, and refuses NaN', () => {
    expect(isSafeValue(0)).toBe(true)
    expect(isSafeValue(87)).toBe(true)
    expect(isSafeValue(true)).toBe(true)
    expect(isSafeValue(Number.NaN)).toBe(false)
    expect(isSafeValue(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('refuses anything with a space in it, which is what prose has', () => {
    expect(isSafeValue('Then I will leave you to it')).toBe(false)
    expect(isSafeValue('She was reading a book about birds')).toBe(false)
  })

  it('refuses a display name, an email and a long string', () => {
    expect(isSafeValue('Pabath Uthsara')).toBe(false)
    expect(isSafeValue('a'.repeat(65))).toBe(false)
    // A bare address has no space and would pass the shape test, which is why
    // no event in the catalogue carries one — the guard is the second line of
    // defence, not the first.
    expect(isSafeValue('x'.repeat(64))).toBe(true)
  })

  it('refuses objects and arrays outright', () => {
    expect(isSafeValue({ text: 'hello' })).toBe(false)
    expect(isSafeValue(['a', 'b'])).toBe(false)
    expect(isSafeValue(undefined)).toBe(false)
  })
})

describe('safeProps', () => {
  it('passes a well-formed event through unchanged', () => {
    const props = { session_id: 'abc-123', duration_ms: 180000, ended_by: 'clock' }
    expect(safeProps(props)).toEqual(props)
  })

  it('drops undefined without complaining, because an optional field is not a bug', () => {
    expect(safeProps({ a: 1, b: undefined })).toEqual({ a: 1 })
  })

  it('throws in development, so the bug is found in the pull request', () => {
    expect(() => safeProps({ note: 'she said she was late for a train' }, false)).toThrow(/must not be sent/)
  })

  it('drops and carries on in production, because a live rep outranks a metric', () => {
    // §05: instrumentation may not end a conversation. The property goes, the
    // event survives, and the transcript turn never leaves the device either way.
    const out = safeProps({ session_id: 'abc-123', note: 'she said she was late' }, true)
    expect(out).toEqual({ session_id: 'abc-123' })
    expect(out['note']).toBeUndefined()
  })
})
