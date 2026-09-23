/**
 * The research-backed rapport terms (PERSONA-REALISM-REPORT §5.3, W3).
 *
 * Asserted as behaviour on real-looking lines, plus the one property that must
 * survive any repricing: a dead end costs more than a good question earns.
 */

import { describe, expect, it } from 'vitest'
import { maya, nadia, tess } from '@/lib/personas'
import type { TranscriptTurn } from '@/lib/voice/types'
import { scoreFast } from './fast'
import { RAPPORT_POINTS, herDisclosed, isBareQuestion, rapportReasons, withRapport, type RapportContext } from './rapport'
import { WarmthSession } from './session'

const her = (text: string): TranscriptTurn => ({ speaker: 'agent', text, t_start: 0, t_end: 2 })
const base: RapportContext = {
  herLast: her('I read crime, mostly. Tana French.'),
  priorQuestionRun: 0,
  kind: 'question',
  penalisesInterview: false,
  paidOpenQuestion: true,
  opening: false,
}
const codes = (text: string, context: Partial<RapportContext> = {}) =>
  rapportReasons(text, { ...base, ...context }).map((reason) => [reason.code, reason.points])

describe('the follow-up (Huang et al. 2017)', () => {
  it('pays a question that picks up what she just said', () => {
    expect(codes('What is it about crime that gets you?')).toEqual([['follow-up', RAPPORT_POINTS.followUpUpgrade]])
  })

  it('pays a closed-shaped follow-up in full, because nothing else did', () => {
    expect(codes('Is crime always your thing?', { paidOpenQuestion: false }))
      .toEqual([['follow-up', RAPPORT_POINTS.followUpAlone]])
  })

  it('does not pay a fresh question as a follow-up, and charges it as a hop', () => {
    expect(codes('So what do you do for work?')).toEqual([['topic-hop', RAPPORT_POINTS.topicHop]])
  })

  it('does not call a question a hop when he acknowledged her first', () => {
    expect(codes('Oh nice. What do you do for work?')).toEqual([])
  })

  it('does not call a question a hop when she had asked him something', () => {
    expect(codes('What about you?', { herLast: her('Do you read much?') })).toEqual([])
  })
})

describe('appreciation and reciprocal disclosure (McFarland 2013, Sprecher 2013)', () => {
  const disclosed = her('I have been meaning to quit my job for a year.')

  it('recognises when she has offered something of hers', () => {
    expect(herDisclosed(disclosed)).toBe(true)
    expect(herDisclosed(her('Twice, actually.'))).toBe(false)
    expect(herDisclosed(her('Do you?'))).toBe(false)
  })

  it('pays appreciation and sympathy after she disclosed', () => {
    expect(codes('That must be exhausting.', { herLast: disclosed, kind: 'answer' }))
      .toEqual([['appreciation', RAPPORT_POINTS.appreciation]])
    expect(codes('No way, good for you.', { herLast: disclosed, kind: 'answer' }))
      .toEqual([['appreciation', RAPPORT_POINTS.appreciation]])
  })

  it('does not pay "nice" or "cool", which are what inattention sounds like', () => {
    expect(codes('Cool.', { herLast: disclosed, kind: 'acknowledgement' })).toEqual([])
    expect(codes('Nice.', { herLast: disclosed, kind: 'acknowledgement' })).toEqual([])
  })

  it('pays something of his own straight after something of hers', () => {
    expect(codes('I quit a job last spring and I still think about it.', { herLast: disclosed, kind: 'disclosure' }))
      .toEqual([['reciprocal-disclosure', RAPPORT_POINTS.reciprocalDisclosure]])
  })
})

describe('the interview (her authored dislike, not everybody\'s)', () => {
  it('charges the third bare question in a row only for a character who minds', () => {
    expect(codes('Where do you work?', { priorQuestionRun: 2, penalisesInterview: true, herLast: her('Do you?') }))
      .toEqual([['interview-mode', RAPPORT_POINTS.interviewMode]])
    expect(codes('Where do you work?', { priorQuestionRun: 2, penalisesInterview: false, herLast: her('Do you?') }))
      .toEqual([])
  })

  it('does not count a question with something of his own in it', () => {
    expect(isBareQuestion('What do you do? I work nights, so I never know.')).toBe(false)
    expect(isBareQuestion('What do you do?')).toBe(true)
  })
})

describe('what is never paid', () => {
  it('pays nothing on an opener, a mishearing, or a dismissal', () => {
    expect(codes('What is it about crime?', { opening: true })).toEqual([])
    expect(codes('Hej der.', { kind: 'unclear' })).toEqual([])
    expect(codes('Why are you still here about crime?', { kind: 'dismissal' })).toEqual([])
  })
})

describe('folded into the score, under her temperament', () => {
  it('keeps one score per turn, with the rapport reasons in it', () => {
    const turn: TranscriptTurn = { speaker: 'user', text: 'What is it about crime that gets you?', t_start: 5, t_end: 8 }
    const fast = scoreFast(turn, { level: 2, agentTurns: [base.herLast!], precedingDeadEnds: 0, gapSeconds: 1 })
    const folded = withRapport(fast, rapportReasons(turn.text, base), nadia.personality)
    expect(folded.raw).toBeGreaterThan(fast.raw)
    expect(folded.reasons.map((reason) => reason.code)).toContain('follow-up')
    expect(withRapport(fast, [], nadia.personality)).toBe(fast)
  })

  it('still charges a dead end more than the best question earns, on every shipped rung', () => {
    // README: "a dead end has to cost more than a good question earns", or she
    // never visibly withdraws and signal-reading is unlearnable.
    for (const persona of [tess, nadia, maya]) {
      const ask: TranscriptTurn = { speaker: 'user', text: 'What is it about crime that gets you?', t_start: 5, t_end: 8 }
      const fast = scoreFast(ask, { level: persona.level, personality: persona.personality, agentTurns: [base.herLast!], precedingDeadEnds: 0, gapSeconds: 1 })
      const best = withRapport(fast, rapportReasons(ask.text, base), persona.personality)
      const questionCredit = best.reasons
        .filter((reason) => reason.code === 'open-question' || reason.code === 'follow-up')
        .reduce((sum, reason) => sum + reason.points, 0)
      const grunt = scoreFast({ speaker: 'user', text: 'Ok.', t_start: 9, t_end: 10 }, {
        level: persona.level, personality: persona.personality, agentTurns: [base.herLast!], precedingDeadEnds: 1, gapSeconds: 1,
      })
      expect(Math.abs(grunt.raw), persona.slug).toBeGreaterThan(questionCredit)
    }
  })
})

describe('in a live session', () => {
  it('charges Maya for an interview and not Nadia', () => {
    const run = (persona: typeof maya) => {
      const session = new WarmthSession({ persona, trajectory: { ...persona.trajectory, startJitter: 0 }, scorer: null, nowSeconds: () => 0 })
      const scores = []
      let at = 0
      for (const text of ['Hey.', 'Where are you from?', 'What do you do?', 'Do you come here often?', 'What are you drawing?']) {
        at += 5
        scores.push(session.onUserTurn({ speaker: 'user', text, t_start: at, t_end: at + 1 }))
        session.onAgentTurn({ speaker: 'agent', text: 'Mm, not sure.', t_start: at + 2, t_end: at + 3 })
      }
      session.dispose()
      return scores.flatMap((score) => score.reasons.map((reason) => reason.code))
    }
    expect(run(maya)).toContain('interview-mode')
    expect(run(nadia)).not.toContain('interview-mode')
  })
})
