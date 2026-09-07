import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIELD,
  INTERVIEW_FIELDS,
  interviewField,
  isInterviewFieldId,
  selectableInterviewFields,
} from './interview-fields'
import { fieldHasProbes } from './interview-probes'

describe('the authored fields', () => {
  it('has no duplicate ids and resolves every one of them', () => {
    const ids = INTERVIEW_FIELDS.map((field) => field.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(interviewField(id).id, id).toBe(id)
  })

  it('always has somewhere for a role that is none of the others', () => {
    // `general` is still authored and still resolves. It is no longer the
    // DEFAULT, because a default with no probe domains gives a technical round
    // nothing to test — see below.
    expect(INTERVIEW_FIELDS.some((field) => field.id === 'general')).toBe(true)
    expect(INTERVIEW_FIELDS.some((field) => field.id === DEFAULT_FIELD)).toBe(true)
    expect(interviewField(null).id).toBe(DEFAULT_FIELD)
    expect(interviewField('astrophysics').id).toBe(DEFAULT_FIELD)
    expect(isInterviewFieldId('software')).toBe(true)
    expect(isInterviewFieldId('astrophysics')).toBe(false)
  })

  /**
   * WHAT IS AUTHORED AND WHAT IS OFFERED ARE TWO DIFFERENT LISTS.
   *
   * All twelve stay authored: a stored row naming any of them resolves, and the
   * prose is reviewed rather than deleted and rewritten later. What a user is
   * offered is only the fields with probe domains behind them, which today is
   * one — a picker offering "Healthcare" would be selling a round that cannot
   * ask a healthcare fundamental, pose a healthcare design brief, or say
   * whether a healthcare answer was right (§7.2).
   */
  it('offers only the fields that have something to probe with', () => {
    const offered = selectableInterviewFields(fieldHasProbes)
    expect(offered.map((field) => field.id)).toEqual(['software'])
    // The list GROWS BY AUTHORING. It is derived from the probe domains rather
    // than kept by hand, so writing the next field's domains is what opens it
    // and there is no second place to remember.
    expect(selectableInterviewFields(() => true)).toHaveLength(INTERVIEW_FIELDS.length)
    expect(selectableInterviewFields(() => false)).toHaveLength(0)
  })

  it('defaults to a field a technical round can actually use', () => {
    // `general` was the default and has no probe domains, so a brand-new
    // account picking a technical round got an interviewer with nothing
    // authored to test — the ladder silently did not run.
    expect(fieldHasProbes(DEFAULT_FIELD)).toBe(true)
  })

  it('gives every field enough to build a round out of', () => {
    for (const field of INTERVIEW_FIELDS) {
      expect(field.label.length, field.id).toBeGreaterThan(3)
      expect(field.vocabulary.length, field.id).toBeGreaterThanOrEqual(5)
      // A round plans for up to six questions (`ROUND_TYPES`), so a field with
      // fewer stems than that would repeat itself inside one interview.
      expect(field.stems.length, field.id).toBeGreaterThanOrEqual(6)
      expect(field.vagueness.length, field.id).toBeGreaterThan(20)
    }
  })

  /**
   * §5.9. A stem is the SHAPE of a question an interviewer would really ask.
   * It is context for the compiled prompt, never a script and never an answer —
   * `compileInterviewBrief` says so in as many words, and this is the half that
   * stops a stem drifting into one.
   */
  it('writes stems as things a person says, never as instructions', () => {
    for (const field of INTERVIEW_FIELDS) {
      for (const stem of field.stems) {
        expect(stem, `${field.id}: ${stem}`).toMatch(/^[A-Z].*[.?]$/)
        // No answer, no structure reminder, no coaching vocabulary.
        for (const banned of ['STAR', 'you should', 'make sure', 'remember to', 'be specific']) {
          expect(stem.toLowerCase(), `${field.id}: ${stem}`).not.toContain(banned.toLowerCase())
        }
      }
    }
  })

  it('never asks anything it would be unlawful to ask', () => {
    // The interviewer's contract forbids it too; a field must not slip one in
    // through the back door.
    const UNLAWFUL = /\b(age|married|marriage|children|kids|pregnan|religio|disab|nationality|sexual)\b/i
    for (const field of INTERVIEW_FIELDS) {
      for (const stem of field.stems) {
        expect(UNLAWFUL.test(stem), `${field.id}: ${stem}`).toBe(false)
      }
    }
  })

  it('is in plain English, with no vocabulary that is not a word', () => {
    for (const field of INTERVIEW_FIELDS) {
      for (const word of field.vocabulary) {
        expect(word, field.id).toMatch(/^[A-Za-z][A-Za-z-]*$/)
      }
    }
  })
})
