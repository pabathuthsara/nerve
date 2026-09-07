import { describe, expect, it } from 'vitest'
import {
  ACCURACY_POINTS,
  accuracyReading,
  accuracyResult,
  buildAccuracySystemPrompt,
  MAX_PROBE_PAIRS,
  parseAccuracyJudgements,
  probePairsFrom,
  quotesTheAnswer,
  renderProbePairs,
  type AccuracyJudgement,
  type ProbePair,
} from './accuracy'
import type { TranscriptTurn } from '@/lib/voice/types'

const her = (text: string, at: number, kind?: 'probe' | 'brief'): TranscriptTurn =>
  ({ speaker: 'agent', text, t_start: at, t_end: at + 3, ...(kind ? { kind } : {}) })
const him = (text: string, at: number): TranscriptTurn =>
  ({ speaker: 'user', text, t_start: at, t_end: at + 8 })

describe('finding the pairs', () => {
  /**
   * §8.1. The grader cannot score correctness over a whole transcript, because
   * "walk me through what you built" has no correct answer. It needs the probe
   * questions paired with the answers that followed them.
   */
  it('reads only the turns the probe beat marked', () => {
    const pairs = probePairsFrom([
      her('Tell me about something you built.', 0),
      him('We built a chat feature for the support team.', 5),
      her('How does a WebSocket differ from a normal request?', 20, 'probe'),
      him('It stays open.', 25),
      him('So the server can send you something without you asking first.', 30),
      her('Right. And what happens when the phone loses signal?', 40),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.question).toContain('WebSocket')
    expect(pairs[0]!.answer).toBe(
      'It stays open. So the server can send you something without you asking first.',
    )
  })

  it('finds nothing at all in an unmarked transcript', () => {
    // Every dating rep, and every behavioural interview round. The accuracy
    // pass is skipped entirely rather than run over a transcript with no right
    // answers in it.
    expect(probePairsFrom([her('Nice weather.', 0), him('Yeah.', 3)])).toHaveLength(0)
    expect(probePairsFrom([])).toHaveLength(0)
  })

  it('drops a probe the clock cut off rather than scoring it against silence', () => {
    expect(probePairsFrom([
      her('How does that actually work?', 10, 'probe'),
    ])).toHaveLength(0)
    expect(probePairsFrom([
      her('How does that actually work?', 10, 'probe'),
      him('   ', 15),
    ])).toHaveLength(0)
  })

  it('ignores the brief turn, which is a problem and not a question with an answer', () => {
    expect(probePairsFrom([
      her('Design a URL shortener with me.', 0, 'brief'),
      him('Sure. What scale are we talking about?', 10),
    ])).toHaveLength(0)
  })

  it('bounds itself against a marking bug', () => {
    const many = Array.from({ length: MAX_PROBE_PAIRS + 6 }, (_, index) => [
      her('How does it work?', index * 20, 'probe'),
      him('It works like this.', index * 20 + 5),
    ]).flat()
    expect(probePairsFrom(many)).toHaveLength(MAX_PROBE_PAIRS)
  })
})

describe('the verdicts, and how they fail', () => {
  const pair: ProbePair = {
    question: 'Why a token rather than a session cookie?',
    answer: 'Because the server does not have to keep anything. The token carries the claims itself.',
    at: 40,
  }

  it('takes a clean verdict as given', () => {
    expect(parseAccuracyJudgements({ verdicts: [{ n: 1, verdict: 'CORRECT' }] }, [pair]))
      .toEqual([{ verdict: 'CORRECT', quote: '', correction: '' }])
  })

  /**
   * §3.4, and it is enforced rather than requested. **Every gate here fails
   * toward UNSCORABLE**: an abstention costs nothing and a false WRONG costs
   * the account.
   */
  it('abstains on anything malformed, missing or unrecognised', () => {
    const abstained = { verdict: 'UNSCORABLE', quote: '', correction: '' }
    expect(parseAccuracyJudgements(null, [pair])).toEqual([abstained])
    expect(parseAccuracyJudgements({}, [pair])).toEqual([abstained])
    expect(parseAccuracyJudgements({ verdicts: 'nope' }, [pair])).toEqual([abstained])
    expect(parseAccuracyJudgements({ verdicts: [] }, [pair])).toEqual([abstained])
    expect(parseAccuracyJudgements({ verdicts: [{ verdict: 'BAD' }] }, [pair])).toEqual([abstained])
    expect(parseAccuracyJudgements({ verdicts: [{ verdict: 'UNSCORABLE' }] }, [pair])).toEqual([abstained])
  })

  it('refuses an accusation with no quote or no correction', () => {
    const unquoted = parseAccuracyJudgements(
      { verdicts: [{ verdict: 'WRONG', correction: 'A token is signed, not encrypted.' }] },
      [pair],
    )
    expect(unquoted[0]!.verdict).toBe('UNSCORABLE')
    const uncorrected = parseAccuracyJudgements(
      { verdicts: [{ verdict: 'WRONG', quote: 'the token carries the claims itself' }] },
      [pair],
    )
    expect(uncorrected[0]!.verdict).toBe('UNSCORABLE')
  })

  /**
   * The important one. A grader that invents a quote is a grader telling
   * somebody they said something they did not, which is worse than any wrong
   * verdict — so the quote has to be in what the candidate actually said.
   */
  it('refuses a quote the candidate never said', () => {
    const invented = parseAccuracyJudgements({
      verdicts: [{
        verdict: 'WRONG',
        quote: 'a token is encrypted so nobody can read it',
        correction: 'A token is signed, not encrypted.',
      }],
    }, [pair])
    expect(invented[0]!.verdict).toBe('UNSCORABLE')
  })

  it('accepts a real quote through the transcript’s own punctuation', () => {
    const real = parseAccuracyJudgements({
      verdicts: [{
        verdict: 'WRONG',
        quote: 'The token, carries the claims — itself!',
        correction: 'A token carries claims and is signed; it is not itself proof of freshness.',
      }],
    }, [pair])
    expect(real[0]!.verdict).toBe('WRONG')
    expect(quotesTheAnswer('the token carries the claims itself', pair.answer)).toBe(true)
    expect(quotesTheAnswer('cookie', pair.answer)).toBe(false)
  })

  it('needs a correction on an incomplete answer and takes no quote for it', () => {
    const short = parseAccuracyJudgements(
      { verdicts: [{ verdict: 'INCOMPLETE', quote: 'the server', correction: 'Nothing said about revocation.' }] },
      [pair],
    )
    expect(short[0]).toEqual({
      verdict: 'INCOMPLETE', quote: '', correction: 'Nothing said about revocation.',
    })
    expect(parseAccuracyJudgements({ verdicts: [{ verdict: 'INCOMPLETE' }] }, [pair])[0]!.verdict)
      .toBe('UNSCORABLE')
  })
})

describe('the number', () => {
  const pairs: ProbePair[] = Array.from({ length: 4 }, (_, index) => ({
    question: `Question ${index}`, answer: `Answer ${index}`, at: index * 60,
  }))
  const verdict = (v: AccuracyJudgement['verdict'], correction = ''): AccuracyJudgement =>
    ({ verdict: v, quote: '', correction })

  /**
   * §8.3. `UNSCORABLE` pairs are excluded from the denominator entirely — an
   * interview where everything abstained returns **null**, not zero. "We did
   * not measure this" and "you got everything wrong" are two different
   * statements and only one of them would be true.
   */
  it('returns null when nothing could be judged, never a zero', () => {
    const result = accuracyResult(pairs, pairs.map(() => verdict('UNSCORABLE')))
    expect(result.score).toBeNull()
    expect(result.scored).toBe(0)
    expect(result.asked).toBe(4)
    expect(accuracyReading(result)).toBeNull()
  })

  it('excludes abstentions from the denominator rather than counting them', () => {
    const result = accuracyResult(pairs, [
      verdict('CORRECT'), verdict('CORRECT'), verdict('UNSCORABLE'), verdict('UNSCORABLE'),
    ])
    expect(result.score).toBe(100)
    expect(result.scored).toBe(2)
    expect(result.asked).toBe(4)
  })

  it('averages the three scorable verdicts', () => {
    const result = accuracyResult(pairs, [
      verdict('CORRECT'),
      verdict('CORRECT'),
      verdict('INCOMPLETE', 'Nothing about expiry.'),
      verdict('WRONG', 'A token is signed, not encrypted.'),
    ])
    const expected = Math.round(
      (ACCURACY_POINTS.CORRECT * 2 + ACCURACY_POINTS.INCOMPLETE + ACCURACY_POINTS.WRONG) / 4,
    )
    expect(result.score).toBe(expected)
    expect([result.correct, result.incomplete, result.wrong]).toEqual([2, 1, 1])
  })

  it('carries one line for each thing that was not right, and nothing for the rest', () => {
    const result = accuracyResult(pairs, [
      verdict('CORRECT'),
      verdict('WRONG', 'A token is signed, not encrypted.'),
      verdict('UNSCORABLE'),
      verdict('INCOMPLETE', 'Nothing about revocation.'),
    ])
    expect(result.notes.map((note) => note.verdict)).toEqual(['WRONG', 'INCOMPLETE'])
    expect(result.notes[0]!.question).toBe('Question 1')
  })

  it('says how many, and never anything about the person', () => {
    const clean = accuracyResult(pairs.slice(0, 2), [verdict('CORRECT'), verdict('CORRECT')])
    expect(accuracyReading(clean)).toBe('All 2 of the things you were asked about were right.')
    const mixed = accuracyResult(pairs.slice(0, 3), [
      verdict('CORRECT'), verdict('WRONG', 'x'), verdict('INCOMPLETE', 'y'),
    ])
    expect(accuracyReading(mixed))
      .toBe('Of the 3 things you were asked about, one was wrong and one was short of a full answer.')
  })
})

describe('the prompt', () => {
  it('abstains by construction, in the prompt as well as in the parser', () => {
    const prompt = buildAccuracySystemPrompt({ field: 'software', difficulty: 4 })
    expect(prompt).toContain('DEFAULT TO UNSCORABLE')
    expect(prompt).toContain('a false WRONG costs the')
    expect(prompt.toLowerCase()).toContain('never penalise "i do not know"')
    // The level, so an answer is judged against what somebody at THAT rung
    // should know rather than against the model's idea of "senior".
    expect(prompt).toContain('Senior')
    expect(prompt).toContain('Failure modes'.toLowerCase())
  })

  it('is not a course (§10.7)', () => {
    const prompt = buildAccuracySystemPrompt({ field: 'software', difficulty: 2 })
    expect(prompt).toContain('Corrections are one line')
    expect(prompt).toContain('no links')
  })

  it('renders the pairs numbered, so the verdicts can be matched back', () => {
    const rendered = renderProbePairs([
      { question: 'How does it work?', answer: 'Like this.', at: 0 },
      { question: 'And at scale?', answer: 'Differently.', at: 60 },
    ])
    expect(rendered).toContain('1. INTERVIEWER: How does it work?')
    expect(rendered).toContain('2. INTERVIEWER: And at scale?')
    expect(rendered).toContain('CANDIDATE: Differently.')
  })
})
