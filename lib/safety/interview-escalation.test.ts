import { describe, expect, it } from 'vitest'
import {
  INTERVIEW_CLOSE_DIRECTIVE,
  INTERVIEW_CORRECT_DIRECTIVE,
  INTERVIEW_DECLINE_DIRECTIVE,
  safetyDirectiveFor,
} from './interview-escalation'
import {
  CLOSE_DIRECTIVE,
  CORRECT_DIRECTIVE,
  DECLINE_DIRECTIVE,
  emptySafetyState,
  nextSafetyAction,
} from './escalation'

describe('the sequence is track-blind, and stays that way', () => {
  /**
   * B9. Moderation runs on both streams already and is completely
   * track-blind, which is right. Only the copy moves — and this is the
   * assertion that says the state machine did not.
   */
  it('is the same state machine whichever track it is on', () => {
    const state = emptySafetyState()
    const first = nextSafetyAction(state, { verdict: 'boundary', speaker: 'user' })
    expect(first.action).toBe('decline')
    const second = nextSafetyAction(first.state, { verdict: 'boundary', speaker: 'user' })
    expect(second.action).toBe('end')
    // Content involving minors ends it on sight from either stream, and there
    // is no track in that sentence.
    expect(nextSafetyAction(emptySafetyState(), { verdict: 'stop', speaker: 'agent' }).action).toBe('end')
    expect(nextSafetyAction(emptySafetyState(), { verdict: 'distress', speaker: 'user' }).action).toBe('distress')
  })
})

describe('the selector', () => {
  it('sends a dating rep to the strings it has always had', () => {
    expect(safetyDirectiveFor('decline', 'dating')).toBe(DECLINE_DIRECTIVE)
    expect(safetyDirectiveFor('correct', 'dating')).toBe(CORRECT_DIRECTIVE)
    expect(safetyDirectiveFor('end', 'dating')).toBe(CLOSE_DIRECTIVE)
  })

  it('sends an interview to its own', () => {
    expect(safetyDirectiveFor('decline', 'interview')).toBe(INTERVIEW_DECLINE_DIRECTIVE)
    expect(safetyDirectiveFor('correct', 'interview')).toBe(INTERVIEW_CORRECT_DIRECTIVE)
    expect(safetyDirectiveFor('end', 'interview')).toBe(INTERVIEW_CLOSE_DIRECTIVE)
  })

  /**
   * §16.8. The frame is DROPPED, not wound down — handing a character a line
   * to say into that moment is exactly what that section refuses.
   */
  it('hands nothing to distress, on either track', () => {
    expect(safetyDirectiveFor('distress', 'dating')).toBeNull()
    expect(safetyDirectiveFor('distress', 'interview')).toBeNull()
    expect(safetyDirectiveFor('none', 'interview')).toBeNull()
  })

  it('falls an unbuilt track back to dating rather than to silence', () => {
    expect(safetyDirectiveFor('decline', 'language')).toBe(DECLINE_DIRECTIVE)
  })
})

describe('the interview voice', () => {
  const all = [INTERVIEW_DECLINE_DIRECTIVE, INTERVIEW_CORRECT_DIRECTIVE, INTERVIEW_CLOSE_DIRECTIVE]

  it('is genuinely different from the dating one', () => {
    expect(INTERVIEW_DECLINE_DIRECTIVE).not.toBe(DECLINE_DIRECTIVE)
    expect(INTERVIEW_CORRECT_DIRECTIVE).not.toBe(CORRECT_DIRECTIVE)
    expect(INTERVIEW_CLOSE_DIRECTIVE).not.toBe(CLOSE_DIRECTIVE)
  })

  it('stays in frame and never becomes the app talking', () => {
    for (const directive of all) {
      // A bracketed stage direction, second person, like every other thing she
      // is told. Two grammars on one channel is how a model starts narrating.
      expect(directive).toMatch(/^\(.*\)$/)
      // Words that could only ever be the app talking. "warning" is
      // deliberately not among them: the decline forbids sounding like one in
      // as many words, and a substring check cannot tell a prohibition from an
      // instruction.
      for (const banned of ['policy', 'terms of service', 'moderation', 'flagged', 'violat', 'we have']) {
        expect(directive.toLowerCase(), banned).not.toContain(banned)
      }
    }
  })

  it('never lectures, and never repeats what was said', () => {
    expect(INTERVIEW_DECLINE_DIRECTIVE).toContain('not a lecture')
    expect(INTERVIEW_DECLINE_DIRECTIVE).toContain('Do not repeat what they said')
  })

  it('keeps the interview going on the first strike and ends it on the last', () => {
    expect(INTERVIEW_DECLINE_DIRECTIVE).toContain('keep the interview going')
    expect(INTERVIEW_CLOSE_DIRECTIVE).toContain('over')
  })
})
