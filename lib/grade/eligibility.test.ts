/**
 * The gate, and the two production grades that should never have existed.
 *
 * Both cases below are real rows from 9 September 2026, recorded in
 * `docs/REP-BEHAVIOUR-AUDIT-2026-09-09.md` §7.
 */

import { describe, expect, it } from 'vitest'

import {
  GRADE_REFUSAL_COPY,
  MIN_GRADED_SECONDS,
  MIN_USER_TURNS,
  gradeEligibility,
} from './eligibility'

const turn = (speaker: 'user' | 'agent', text: string) => ({ speaker, text })

const REAL_REP = [
  turn('user', 'Hello.'),
  turn('agent', 'Hey.'),
  turn('user', 'Quiet in here today.'),
  turn('agent', 'Sundays, mostly.'),
]

describe('gradeEligibility', () => {
  it('grades an ordinary rep', () => {
    expect(gradeEligibility({ sessionSeconds: 180, transcript: REAL_REP })).toEqual({ ok: true })
  })

  it('refuses the 18-second hello that scored 45', () => {
    // REAL: session 22e37e39, 18 seconds, one user greeting, complete score 45.
    expect(gradeEligibility({
      sessionSeconds: 18,
      transcript: [turn('user', 'Hello there.'), turn('agent', 'Morning. The place is noisier than I wanted.')],
    })).toEqual({ ok: false, reason: 'too-short' })
  })

  it('refuses a rep in which she never spoke, however long it ran', () => {
    // REAL: a 38-second session with ZERO agent turns scored 36, including zero
    // talk-ratio points because the user supplied every audible word. Its voice
    // operations were aborted before delivering audio.
    expect(gradeEligibility({
      sessionSeconds: 38,
      transcript: [
        turn('user', 'Sure,'), turn('user', 'Hello'), turn('user', 'No one knows.'),
        turn('user', 'Hello.'), turn('user', 'Telescope.'), turn('user', "Let's go!"),
      ],
    })).toEqual({ ok: false, reason: 'no-reply' })
  })

  it('checks no-reply before too-short, because they are not the same apology', () => {
    // A short rep where she also never spoke is OURS, not the user's.
    expect(gradeEligibility({ sessionSeconds: 4, transcript: [turn('user', 'Hi')] }))
      .toEqual({ ok: false, reason: 'no-reply' })
  })

  it('needs him to have said two things', () => {
    expect(gradeEligibility({
      sessionSeconds: 120,
      transcript: [turn('user', 'Hello.'), turn('agent', 'Hey.')],
    })).toEqual({ ok: false, reason: 'too-short' })
    expect(MIN_USER_TURNS).toBe(2)
    expect(MIN_GRADED_SECONDS).toBe(20)
  })

  it('counts blank turns as nothing said', () => {
    expect(gradeEligibility({
      sessionSeconds: 120,
      transcript: [turn('user', 'Hello.'), turn('agent', '   '), turn('user', 'Anyone?')],
    })).toEqual({ ok: false, reason: 'no-reply' })
  })

  it('reads the data layer\'s spelling of her turns too', () => {
    // `lib/voice/types` says 'agent' and the data layer says 'persona'. A screen
    // holding the second must not render "she never got a word out" over a rep
    // she talked through.
    expect(gradeEligibility({
      sessionSeconds: 180,
      transcript: [
        { speaker: 'user' as const, text: 'Hello.' },
        { speaker: 'persona' as const, text: 'Hey.' },
        { speaker: 'user' as const, text: 'Quiet today.' },
      ],
    })).toEqual({ ok: true })
  })

  it('refuses a nonsense duration rather than trusting it', () => {
    expect(gradeEligibility({ sessionSeconds: Number.NaN, transcript: REAL_REP }))
      .toEqual({ ok: false, reason: 'too-short' })
  })
})

describe('the refusal copy', () => {
  it('never promises a refund that does not happen', () => {
    // The single state this replaces said "Your rep has been given back", and
    // `voice_session_refund` refuses any rep in which she spoke.
    for (const copy of Object.values(GRADE_REFUSAL_COPY)) {
      expect(`${copy.title} ${copy.body}`.toLowerCase()).not.toMatch(/given back|refund|returned/)
    }
  })

  it('never apologises and never blames', () => {
    for (const copy of Object.values(GRADE_REFUSAL_COPY)) {
      const text = `${copy.title} ${copy.body}`.toLowerCase()
      expect(text).not.toMatch(/sorry|apologi[sz]e/)
      expect(text).not.toMatch(/you failed|you did not try|your fault/)
      expect(copy.body.length).toBeGreaterThan(80)
    }
  })

  it('says whose fault it is, when it is ours', () => {
    expect(GRADE_REFUSAL_COPY['no-reply'].body).toContain('ours to fix')
  })
})
