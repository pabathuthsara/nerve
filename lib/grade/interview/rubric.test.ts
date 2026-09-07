import { describe, expect, it } from 'vitest'
import {
  INTERVIEW_RUBRIC,
  INTERVIEW_SUBSCORE_KEY,
  buildInterviewGradeSystemPrompt,
  normaliseInterviewScores,
  renderInterviewTranscript,
} from './rubric'
import { RUBRIC, buildGradeSystemPrompt } from '../prompt'
import { rubricForPersonaName, rubricForTrack, trackForPersonaName } from '../track'
import { clampSubScores } from '../index'
import { DIMENSION_COLUMN, INTERVIEW_DIMENSIONS } from '@/lib/data/interview-progress'
import type { TranscriptTurn } from '@/lib/voice/types'

describe('the interview rubric', () => {
  it('keeps §07 verbatim, and says it harder', () => {
    expect(INTERVIEW_RUBRIC).toContain('SCORE THE PROCESS, NEVER THE OUTCOME.')
    expect(INTERVIEW_RUBRIC).toContain('A clean interview that ends in a no can score 92.')
    expect(INTERVIEW_RUBRIC).toContain('contributes ZERO')
  })

  it('scores six dimensions, three of them re-authored', () => {
    for (const heading of ['STRUCTURE', 'SPECIFICITY', 'LISTENING', 'SIGNAL READING', 'COMPOSURE', 'CLOSE']) {
      expect(INTERVIEW_RUBRIC, heading).toContain(heading)
    }
    // The three that describe somebody who APPROACHED are gone. A candidate did
    // not open a conversation with a stranger and is not supposed to be curious
    // about the interviewer's afternoon.
    expect(INTERVIEW_RUBRIC).not.toContain('OPENING ')
    expect(INTERVIEW_RUBRIC).not.toContain('CURIOSITY ')
  })

  /** Rule 9 and §11: an interviewer who remembers your last attempt is a companion app. */
  it('asks for no memory line at all', () => {
    expect(INTERVIEW_RUBRIC).not.toMatch(/memory line/i)
    expect(buildInterviewGradeSystemPrompt()).not.toMatch(/memoryLine/i)
    expect(RUBRIC).toMatch(/MEMORY LINE/)
  })

  it('is not the dating rubric wearing different words', () => {
    expect(buildInterviewGradeSystemPrompt()).not.toBe(buildGradeSystemPrompt())
    expect(buildInterviewGradeSystemPrompt()).toContain('practice job interview')
    expect(buildInterviewGradeSystemPrompt()).not.toMatch(/\bwoman\b/i)
  })

  it('refuses to penalise the two things a nervous candidate does', () => {
    expect(INTERVIEW_RUBRIC).toContain('for asking for a moment to')
    expect(INTERVIEW_RUBRIC).toContain('do not have an example')
  })
})

describe('rendering', () => {
  const transcript: TranscriptTurn[] = [
    { speaker: 'agent', text: 'Take me through the last thing you shipped.', t_start: 2, t_end: 5 },
    { speaker: 'user', text: 'We rebuilt the checkout flow.', t_start: 6, t_end: 9 },
  ]

  it('names the candidate rather than "him"', () => {
    const rendered = renderInterviewTranscript(transcript, 'Dan Whitfield')
    expect(rendered).toContain('CANDIDATE:')
    expect(rendered).toContain('DAN WHITFIELD:')
    expect(rendered).not.toContain('HIM:')
  })
})

describe('normalising the model’s reply', () => {
  it('renames structure and specificity onto the columns everything downstream reads', () => {
    const raw = {
      structure: 71,
      specificity: 64,
      listening: 80,
      signalReading: 55,
      composure: 90,
      close: 40,
      evidence: { structure: 'a', specificity: 'b', close: 'c' },
      wentWell: 'named a number',
      outcome: 'neutral',
    }
    const mapped = normaliseInterviewScores(raw)
    expect(mapped.opening).toBe(71)
    expect(mapped.curiosity).toBe(64)
    expect(mapped.structure).toBeUndefined()
    expect(mapped.specificity).toBeUndefined()
    expect(mapped.evidence).toEqual({ opening: 'a', curiosity: 'b', close: 'c' })
    // And it survives the shared clamp, which is the point of renaming here.
    expect(clampSubScores(mapped)).toEqual({
      opening: 71, curiosity: 64, listening: 80, signalReading: 55, composure: 90, close: 40,
    })
  })

  it('clears the memory line whatever the model returned', () => {
    expect(normaliseInterviewScores({ memoryLine: 'I have been hoping you would come back.' }).memoryLine)
      .toBe('')
  })

  it('leaves everything it does not rename alone', () => {
    const mapped = normaliseInterviewScores({ wentWell: 'x', outcome: 'receptive', listening: 50 })
    expect(mapped.wentWell).toBe('x')
    expect(mapped.outcome).toBe('receptive')
    expect(mapped.listening).toBe(50)
  })

  it('agrees with the progress module about the mapping', () => {
    // Two files state it and neither is allowed to be the second opinion.
    for (const dimension of INTERVIEW_DIMENSIONS) {
      const gradeKey = INTERVIEW_SUBSCORE_KEY[dimension]!
      const column = DIMENSION_COLUMN[dimension]
      // `signalReading` is camelCase in the scorecard and snake_case in the row.
      expect(gradeKey.replace(/([A-Z])/g, '_$1').toLowerCase(), dimension).toBe(column)
    }
  })
})

describe('the seam', () => {
  it('sends a dating character to the rubric it has always had', () => {
    const rubric = rubricForPersonaName('Nadia')
    expect(rubric.track).toBe('dating')
    expect(rubric.systemPrompt()).toBe(buildGradeSystemPrompt())
    expect(rubric.normalise({ opening: 1 })).toEqual({ opening: 1 })
  })

  it('sends an interviewer to the interview rubric', () => {
    expect(trackForPersonaName('Elena Kovač')).toBe('interview')
    expect(rubricForPersonaName('Elena Kovač').systemPrompt()).toBe(buildInterviewGradeSystemPrompt())
  })

  it('falls an unknown name back to dating rather than guessing', () => {
    expect(trackForPersonaName('Somebody Nobody Authored')).toBe('dating')
    expect(rubricForTrack('language').track).toBe('dating')
  })
})
