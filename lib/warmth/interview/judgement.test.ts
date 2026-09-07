/**
 * The interview judgement layer: the band table, the inverted reciprocity model,
 * the steering line and the specificity anchors.
 *
 * The dating equivalents are pinned by `lib/characterization/dating-arm.test.ts`
 * and must not move; this file is about whether the interview arm is CORRECT,
 * and about the three places it is deliberately the opposite of the dating one.
 */

import { describe, expect, it } from 'vitest'
import {
  INTERVIEW_BANDS,
  INTERVIEW_BAND_LABEL,
  INTERVIEW_BRIEF_DIRECTIVE,
  INTERVIEW_BRIEF_WORD_CAP,
  INTERVIEW_MAX_BAND_WORDS,
  INTERVIEW_VERBOSITY_MEDIAN,
  interviewBandDirective,
  interviewSpecFor,
  interviewWordCapFor,
} from './bands'
import {
  ANSWER_WORDS,
  interviewMayAsk,
  interviewMayFollowUp,
  interviewMayLetPauseSit,
  interviewReciprocityClauses,
  interviewWordCap,
  OVER_ANSWER_WORDS,
  PAUSE_SPACING_TURNS,
} from './reciprocity'
import { composeInterviewSteering, interviewPostureClause, INTERVIEW_STEERING_BUDGET } from './steering'
import { postureClause, type Posture } from '../affect'

const POSTURES: Posture[] = ['wary', 'at-ease', 'taken', 'polite', 'level']
import { judgementFor } from '../track'
import { composeSteering } from '../steering'
import { SPECIFICITY_ANCHORS, buildInterviewSystemPrompt } from './anchors'
import { BANDS, BAND_NAMES, MAX_BAND_WORDS, bandFor, wordCapFor } from '../bands'
import { mirrorCapFor, mayStaySilentFor, type UserTurnShape } from '../reciprocity'
import { INTERVIEWERS } from '@/lib/personas/interview'
import { DEFAULT_VERBOSITY_MEDIAN } from '@/lib/metrics/stability'

const dan = INTERVIEWERS['dan-whitfield']!
const elena = INTERVIEWERS['elena-kovac']!

const shape = (over: Partial<UserTurnShape> = {}): UserTurnShape =>
  ({ words: 30, askedQuestion: false, disclosed: true, deadEnd: false, ...over })

describe('the interview band table', () => {
  it('covers every band the engine can produce', () => {
    expect(INTERVIEW_BANDS.map((spec) => spec.band)).toEqual([...BAND_NAMES])
    for (const band of BAND_NAMES) expect(interviewSpecFor(band).band).toBe(band)
  })

  it('climbs monotonically, typical always under the ceiling', () => {
    let previousTypical = 0
    let previousMax = 0
    for (const spec of INTERVIEW_BANDS) {
      expect(spec.typicalWords, spec.band).toBeGreaterThanOrEqual(previousTypical)
      expect(spec.maxWords, spec.band).toBeGreaterThanOrEqual(previousMax)
      expect(spec.typicalWords, spec.band).toBeLessThan(spec.maxWords)
      previousTypical = spec.typicalWords
      previousMax = spec.maxWords
    }
  })

  /**
   * §4 and B3, in one assertion. "Three to fifteen words" is a stranger who
   * owes you nothing; an interviewer asks a two-sentence question. The curve is
   * different in BOTH directions — the cold end is longer here, not shorter,
   * because a recruiter who is unconvinced does not answer in four words, she
   * moves briskly to the next question.
   */
  it('is longer than the dating table at every band, cold end included', () => {
    for (const spec of INTERVIEW_BANDS) {
      const dating = BANDS.find((row) => row.band === spec.band)!
      expect(spec.typicalWords, spec.band).toBeGreaterThan(dating.typicalWords)
      expect(spec.maxWords, spec.band).toBeGreaterThan(dating.maxWords)
    }
    expect(INTERVIEW_MAX_BAND_WORDS).toBeGreaterThan(MAX_BAND_WORDS)
  })

  it('states the typical first and the ceiling second, in every directive', () => {
    // PERSONA-AUDIT §12: a text model writes to whichever number it is given,
    // so the one it should aim at has to come first.
    for (const spec of INTERVIEW_BANDS) {
      // The typical is spelled, the ceiling is a numeral, and the typical
      // comes first — which is the whole of PERSONA-AUDIT §12's fix.
      const ceilingAt = spec.directive.indexOf('at the very most')
      expect(ceilingAt, spec.band).toBeGreaterThan(0)
      expect(spec.directive.slice(0, ceilingAt), spec.band).toMatch(/[a-z]+ or [a-z]+ words|words/i)
    }
  })

  it('caps in code at the number the prose states', () => {
    for (const spec of INTERVIEW_BANDS) {
      const inside = BANDS.find((row) => row.band === spec.band)!
      expect(interviewWordCapFor(inside.min)).toBe(spec.maxWords)
    }
    // And it is never the dating cap, which is the bug this file exists to
    // prevent: an interviewer trimmed at fourteen words cannot ask a question.
    for (const value of [0, 25, 45, 65, 85]) {
      expect(interviewWordCapFor(value)).toBeGreaterThan(wordCapFor(value))
    }
  })

  it('has a verbosity median of its own and leaves the dating one alone', () => {
    expect(INTERVIEW_VERBOSITY_MEDIAN).toBeGreaterThan(INTERVIEW_MAX_BAND_WORDS)
    expect(INTERVIEW_VERBOSITY_MEDIAN).toBeGreaterThan(DEFAULT_VERBOSITY_MEDIAN)
    // The dating alarm stays derived from the dating table, untouched.
    expect(DEFAULT_VERBOSITY_MEDIAN).toBeGreaterThan(MAX_BAND_WORDS)
    expect(DEFAULT_VERBOSITY_MEDIAN).toBeLessThan(INTERVIEW_MAX_BAND_WORDS)
  })

  it('has a label for every band, and never shows the engine’s word', () => {
    for (const band of BAND_NAMES) {
      expect(INTERVIEW_BAND_LABEL[band], band).toBeTruthy()
      expect(INTERVIEW_BAND_LABEL[band], band).not.toBe(band)
    }
  })

  it('suppresses the follow-up rather than the question, and only where one is allowed', () => {
    expect(interviewBandDirective(45, { suppressQuestion: true, includeStanding: false }))
      .toContain('Do not follow up this turn')
    // The cold bands already forbid it in their own words.
    expect(interviewBandDirective(5, { suppressQuestion: true, includeStanding: false }))
      .not.toContain('Do not follow up this turn')
  })

  it('rations the invitation and always ships the length rule', () => {
    const withStanding = interviewBandDirective(45)
    const without = interviewBandDirective(45, { includeStanding: false })
    expect(withStanding).toContain('pick up a detail')
    expect(without).not.toContain('pick up a detail')
    expect(without).toContain('at the very most')
  })
})

describe('reciprocity, inverted', () => {
  /**
   * B4, and the single line that is the whole reason two files exist. The
   * dating rule mirrors his length downward; here a one-word answer is exactly
   * the turn an interviewer digs into.
   */
  it('gives her MORE room on a dead end where the dating arm gives her less', () => {
    const grunt = shape({ words: 1, disclosed: false, deadEnd: true })
    expect(interviewWordCap(45, grunt)).toBe(interviewSpecFor(bandFor(45)).maxWords)
    expect(mirrorCapFor(45, grunt)).toBeLessThan(wordCapFor(45))
    expect(interviewWordCap(45, grunt)).toBeGreaterThan(mirrorCapFor(45, grunt))
  })

  it('gives her LESS room after a full answer, because she does not need it', () => {
    const full = shape({ words: ANSWER_WORDS + 20 })
    const spec = interviewSpecFor(bandFor(45))
    expect(interviewWordCap(45, full)).toBe(spec.typicalWords)
    expect(interviewWordCap(45, full)).toBeLessThan(spec.maxWords)
  })

  it('gives her the whole band on the opening turn and on a short answer', () => {
    const spec = interviewSpecFor(bandFor(45))
    expect(interviewWordCap(45, null)).toBe(spec.maxWords)
    expect(interviewWordCap(45, shape({ words: 8, disclosed: false }))).toBe(spec.maxWords)
  })

  it('follows up on a one-word answer at any impression', () => {
    const grunt = shape({ words: 1, disclosed: false, deadEnd: true })
    for (const impression of [0, 20, 45, 70, 95]) {
      expect(interviewMayFollowUp(impression, grunt), String(impression)).toBe(true)
    }
  })

  it('does not follow up a real answer until the band says she may', () => {
    const answer = shape({ words: ANSWER_WORDS })
    expect(interviewMayFollowUp(25, answer)).toBe(false)
    expect(interviewMayFollowUp(45, answer)).toBe(true)
  })

  it('never follows up on nothing at all', () => {
    expect(interviewMayFollowUp(90, null)).toBe(false)
  })

  /**
   * The defect the first audition found, as an assertion. A five-word answer
   * is neither a dead end nor a real answer, so the FOLLOW-UP gate says no —
   * and asking at all is a different question, which an interviewer answers yes
   * to on every turn.
   */
  it('always has a question, even where it would not follow up', () => {
    const middling = shape({ words: 5, disclosed: false })
    expect(interviewMayFollowUp(45, middling)).toBe(false)
    expect(interviewMayAsk(45, middling)).toBe(true)
    for (const impression of [0, 20, 45, 70, 95]) {
      expect(interviewMayAsk(impression, shape()), String(impression)).toBe(true)
    }
    // Before he has spoken there is nothing to answer, and her opening line is
    // composed by the contract rather than by this gate.
    expect(interviewMayAsk(45, null)).toBe(false)
  })

  /**
   * The silence rule, inverted with everything else. The dating arm goes quiet
   * when he gives her nothing; an interviewer goes quiet when the candidate has
   * just finished — which is the moment real interviews are lost.
   */
  it('lets the pause sit after an OVER-answer, never after an empty one', () => {
    const over = shape({ words: OVER_ANSWER_WORDS })
    const grunt = shape({ words: 1, disclosed: false, deadEnd: true })
    expect(interviewMayLetPauseSit(over)).toBe(true)
    expect(interviewMayLetPauseSit(grunt)).toBe(false)
    // Which is the exact opposite of the dating arm on the same two turns.
    expect(mayStaySilentFor(25, grunt)).toBe(true)
    expect(mayStaySilentFor(25, over)).toBe(false)
  })

  /**
   * The number the first audition moved. Against the under-confident candidate,
   * who over-answers every turn, "never twice running" produced seven silent
   * turns out of twenty-two — an interviewer who goes quiet after a third of
   * the answers is not applying pressure, she is not listening.
   */
  it('is a technique rather than a reflex', () => {
    const complete = shape({ words: ANSWER_WORDS })
    const over = shape({ words: OVER_ANSWER_WORDS })
    expect(interviewMayLetPauseSit(complete)).toBe(false)
    expect(interviewMayLetPauseSit(over, { turnsSinceSilence: PAUSE_SPACING_TURNS - 1 })).toBe(false)
    expect(interviewMayLetPauseSit(over, { turnsSinceSilence: PAUSE_SPACING_TURNS })).toBe(true)
    // She has never done it yet, which must not read as "too soon".
    expect(interviewMayLetPauseSit(over, {})).toBe(true)
  })

  /**
   * The bug that made the rambler audition come back with zero pauses in
   * twenty-two turns. `isOpenQuestion` fires on any text containing "which",
   * "how", "when" or "what", which a candidate's paragraph contains always.
   */
  it('reads "he asked me something" strictly, not off the lexical heuristic', () => {
    // A long answer the shared flag calls a question because it contains "which".
    const paragraph = shape({ words: OVER_ANSWER_WORDS, askedQuestion: true })
    expect(interviewMayLetPauseSit(paragraph)).toBe(false)
    expect(interviewMayLetPauseSit(paragraph, { askedDirectly: false })).toBe(true)
    // And a real question still gets an answer rather than a silence.
    expect(interviewMayLetPauseSit(paragraph, { askedDirectly: true })).toBe(false)
  })

  it('never sits on a question, never twice running, never on the opener', () => {
    const over = shape({ words: OVER_ANSWER_WORDS })
    expect(interviewMayLetPauseSit(shape({ words: 80, askedQuestion: true }))).toBe(false)
    expect(interviewMayLetPauseSit(over, { silentLastTurn: true })).toBe(false)
    expect(interviewMayLetPauseSit(over, { opening: true })).toBe(false)
    expect(interviewMayLetPauseSit(null)).toBe(false)
  })

  it('adds one clause and only one', () => {
    expect(interviewReciprocityClauses(45, null)).toEqual([])
    expect(interviewReciprocityClauses(45, shape({ words: 8, disclosed: false }))).toEqual([])
    expect(interviewReciprocityClauses(45, shape({ words: 1, disclosed: false, deadEnd: true })))
      .toHaveLength(1)
    expect(interviewReciprocityClauses(45, shape({ words: 40 }))).toHaveLength(1)
  })

  /**
   * `HUMANNESS.md` §7.1, and the failure this file was written not to repeat:
   * every gate hung twenty points above the band table it was gating, winning
   * silently for a whole rep.
   */
  it('carries no warmth floor above the band table’s own', () => {
    const answer = shape({ words: ANSWER_WORDS })
    // OPEN is warmth 40, which is where the OPEN band's own invitation sits.
    expect(interviewMayFollowUp(40, answer)).toBe(true)
    // And every authored gate on every interviewer is reachable.
    for (const persona of Object.values(INTERVIEWERS)) {
      for (const [name, gate] of Object.entries(persona.gated)) {
        expect(gate.unlocksAt, `${persona.slug}.${name}`)
          .toBeLessThan(persona.trajectory.sessionCeiling)
      }
    }
  })
})

describe('the interview steering line', () => {
  it('always carries the band, whatever else is dropped', () => {
    for (const impression of [0, 20, 45, 70, 95]) {
      const line = composeInterviewSteering({ persona: dan, warmth: impression, his: shape() })
      expect(line, String(impression)).toMatch(/at the very most/)
      expect(line.length, String(impression)).toBeLessThanOrEqual(INTERVIEW_STEERING_BUDGET + 2)
    }
  })

  it('keeps the follow-up invitation on a dead end, unlike the dating arm', () => {
    // The dating line drops the invitation on a grunt, because handing somebody
    // who just grunted a permission to DRIVE is the failure that layer exists
    // to stop. Here the grunt is the reason to dig in.
    const line = composeInterviewSteering({
      persona: dan,
      warmth: 45,
      his: shape({ words: 1, disclosed: false, deadEnd: true }),
    })
    expect(line).toContain('That was not an answer')
    expect(line).not.toContain('pick up a detail')
  })

  it('rations the standing orders and never the length rule', () => {
    const standing = composeInterviewSteering({ persona: dan, warmth: 60, his: shape() })
    const rationed = composeInterviewSteering({
      persona: dan, warmth: 60, his: shape(), includeStanding: false,
    })
    expect(standing.length).toBeGreaterThan(rationed.length)
    expect(rationed).toMatch(/at the very most/)
    expect(rationed).not.toContain('You would')
  })

  it('turns the agenda toward the candidate as the impression rises', () => {
    expect(composeInterviewSteering({ persona: elena, warmth: 10, his: shape() }))
      .toContain('not changing that')
    expect(composeInterviewSteering({ persona: elena, warmth: 85, his: shape() }))
      .toContain('worth the time')
  })

  /**
   * §05 and B9's neighbour: the interview line is the surface most likely to
   * drift into coaching, because a warm interviewer WANTS to say "good answer,
   * though you might mention the numbers".
   *
   * Asserted per SENTENCE rather than per line, because a substring check
   * cannot tell a prohibition from a permission — the ENGAGED band forbids
   * "great answer" in as many words, and Aisha's own clause is "Never tell them
   * how it is going." Every sentence carrying one of these has to be negative.
   */
  /**
   * §16, and the single worst thing this track could ship. `postureClause` is
   * written about a date — "You like him more than the conversation" — and it
   * appeared in the first audition of Elena Kovač, from an interviewer, about a
   * candidate she was not impressed by.
   */
  it('never lets an interviewer sound like she fancies the candidate', () => {
    for (const posture of POSTURES) {
      const clause = interviewPostureClause(posture)
      if (!clause) continue
      for (const banned of ['you like him', 'like him more', 'him more than', 'attract']) {
        expect(clause.toLowerCase(), posture).not.toContain(banned)
      }
      // And it is about behaviour, not a feeling to narrate.
      expect(clause, posture).toMatch(/\.$/)
    }
    // Every posture has a different word for it than the dating table does.
    for (const posture of POSTURES) {
      const dating = postureClause(posture)
      const interview = interviewPostureClause(posture)
      expect(interview, posture).toBe(posture === 'level' ? null : interview)
      if (dating) expect(interview, posture).not.toBe(dating)
    }
  })

  it('never instructs an interviewer to say how it is going', () => {
    const PRAISE = /(tell them how|how it is going|great answer|good answer|well done|encourage)/
    const NEGATED = /\b(never|not|no|do not|don't|stop)\b/
    for (const persona of Object.values(INTERVIEWERS)) {
      for (const impression of [0, 30, 55, 75, 95]) {
        const line = composeInterviewSteering({ persona, warmth: impression, his: shape() })
        for (const sentence of line.toLowerCase().split(/(?<=[.!?])\s+/)) {
          if (!PRAISE.test(sentence)) continue
          expect(NEGATED.test(sentence), `${persona.slug}@${impression}: ${sentence}`).toBe(true)
        }
      }
    }
  })
})

describe('the question quota', () => {
  /**
   * The defect the first audition found. `suppressQuestion` was true on almost
   * every turn of a real interview rep, and "Do not follow up this turn" was
   * issued and ignored every time — which teaches a model that the bracketed
   * line is optional, and the bracketed line is the only thing that owns reply
   * length.
   */
  it('gags a dating character at §4e’s share and never gags an interviewer', () => {
    expect(judgementFor({ track: 'dating' }).maxQuestionShare).toBe(0.4)
    expect(judgementFor({ track: 'interview' }).maxQuestionShare).toBe(1)
  })

  /**
   * The first real interview, 7 September: three silences in ten minutes, and
   * all three read as a dropped connection — "Hello", "Did you hear what I
   * said?", "There". Answering the second cost her the only frame break in the
   * rep: "I did hear you."
   *
   * The rule is good and the medium refuses it. She always answers until the
   * live screen can show that she is listening.
   */
  it('never lets an interviewer say nothing, whatever the answer was', () => {
    const interview = judgementFor({ track: 'interview' })
    for (const his of [
      shape({ words: OVER_ANSWER_WORDS * 3 }),
      shape({ words: ANSWER_WORDS }),
      shape({ words: 1, disclosed: false, deadEnd: true }),
      null,
    ]) {
      expect(interview.maySayNothing(45, his)).toBe(false)
      expect(interview.maySayNothing(90, his, { turnsSinceSilence: 99 })).toBe(false)
    }
    // The dating arm still withdraws, which is the signal its whole rung
    // teaches. Nothing about it moved.
    const dating = judgementFor({ track: 'dating' })
    expect(dating.maySayNothing(25, shape({ words: 1, disclosed: false, deadEnd: true }))).toBe(true)
  })

  it('keeps the dating branch on the shared functions, byte for byte', () => {
    const dating = judgementFor({ track: 'dating' })
    expect(dating.wordCap).toBe(mirrorCapFor)
    expect(dating.bandCap).toBe(wordCapFor)
    expect(dating.steer).toBe(composeSteering)
  })

  it('sends an unbuilt track to the dating tables rather than to a stub', () => {
    expect(judgementFor({ track: 'language' }).track).toBe('dating')
  })
})

describe('the specificity anchors', () => {
  it('never puts work halfway up a scale whose top is sexual', () => {
    // The one-line reason `INTIMACY_ANCHORS` cannot be reused.
    // Word boundaries: "somebody" is not a comment on anybody's body.
    expect(SPECIFICITY_ANCHORS).not.toMatch(/\b(body|sexual|innuendo|flirt\w*)\b/i)
    expect(SPECIFICITY_ANCHORS).toMatch(/job title/i)
  })

  it('builds a prompt that names the candidate rather than "him"', () => {
    const prompt = buildInterviewSystemPrompt('Dan Whitfield', 'a meeting room')
    expect(prompt).toContain('candidate')
    expect(prompt).toContain('THEM:')
    expect(prompt).not.toMatch(/\bHIM:/)
    expect(prompt).not.toMatch(/\bHER:/)
  })

  it('keeps the JSON shape the engine already parses', () => {
    const prompt = buildInterviewSystemPrompt('Dan Whitfield')
    expect(prompt).toContain('{"intimacy":n,"intent":n,"quote":"...","reason":"..."}')
  })

  it('pins the scale to the answer and not to how it landed', () => {
    expect(buildInterviewSystemPrompt('Dan Whitfield'))
      .toMatch(/must NOT change your specificity number/)
  })
})

/* ------------------------------------------------------------------ *
 * The one turn that is not a reply (INTERVIEW-TECHNICAL-PLAN §6.7)
 * ------------------------------------------------------------------ */

describe('the design brief carve-out', () => {
  /**
   * Rule 4: a word cap is a runtime ceiling and it is what she writes to. Every
   * band above tops out at thirty-four words, because an interviewer asks a
   * two-sentence question and then is quiet. A system design brief is forty to
   * seventy — it is the problem itself — and a brief truncated at thirty-four
   * is a round with no question in it.
   */
  it('lifts the ceiling for a brief turn and for nothing else', () => {
    for (const spec of INTERVIEW_BANDS) {
      const impression = spec.band === 'HOSTILE' ? 0 : INTERVIEW_BANDS.indexOf(spec) * 18
      expect(interviewWordCapFor(impression, 'brief')).toBe(INTERVIEW_BRIEF_WORD_CAP)
    }
    // The default at every call site is `'reply'`, which is what keeps this
    // from being a loosening: a caller that says nothing gets the table.
    expect(interviewWordCapFor(90)).toBe(interviewWordCapFor(90, 'reply'))
    expect(interviewWordCapFor(90)).toBe(INTERVIEW_MAX_BAND_WORDS)
    expect(INTERVIEW_BRIEF_WORD_CAP).toBeGreaterThan(INTERVIEW_MAX_BAND_WORDS)
  })

  /**
   * The drift alarm deliberately does NOT move with the brief ceiling. Sized
   * for a ninety-word turn it would stop noticing a character who had started
   * giving speeches, which is the failure `DEFAULT_VERBOSITY_MEDIAN` exists for.
   */
  it('leaves the verbosity alarm where the band table put it', () => {
    expect(INTERVIEW_VERBOSITY_MEDIAN).toBeLessThan(INTERVIEW_BRIEF_WORD_CAP)
  })

  it('takes the carve-out through the track seam without mirroring it', () => {
    const judgement = judgementFor(dan)
    // Nothing to mirror on turn one, and a candidate who has said "hi" would
    // otherwise cap the problem statement at two words.
    const grunt = shape({ words: 1, disclosed: false, deadEnd: true })
    expect(judgement.wordCap(50, grunt, 'brief')).toBe(INTERVIEW_BRIEF_WORD_CAP)
    expect(judgement.wordCap(50, grunt)).toBeLessThanOrEqual(INTERVIEW_MAX_BAND_WORDS)
    expect(judgement.bandCap(50, 'brief')).toBe(INTERVIEW_BRIEF_WORD_CAP)
  })

  /**
   * The dating arm passes two arguments and `mirrorCapFor` declares two. A
   * third one it never sees cannot change what it returns — asserted rather
   * than assumed, because this is a shared seam and rule 19's whole shape is
   * that the dating branch reaches the code it reached yesterday.
   */
  it('is invisible to the dating arm', () => {
    const nadia = { track: 'dating' as const }
    const judgement = judgementFor(nadia)
    const his = shape({ words: 12 })
    expect(judgement.wordCap(70, his, 'brief')).toBe(mirrorCapFor(70, his))
    expect(judgement.bandCap(70, 'brief')).toBe(wordCapFor(70))
  })

  it('replaces the band’s length rule rather than joining it', () => {
    const line = composeInterviewSteering({
      persona: dan, warmth: 50, openingBrief: true,
    })
    expect(line).toContain(INTERVIEW_BRIEF_DIRECTIVE)
    // Two length rules in one directive is round 6: the numbers fight and the
    // specific one wins, which here would be the band cutting the problem in
    // half. Neither the band's number nor its permission may appear.
    for (const spec of INTERVIEW_BANDS) {
      expect(line).not.toContain(spec.directive)
      if (spec.permission) expect(line).not.toContain(spec.permission)
    }
    expect(line.startsWith('[')).toBe(true)
    expect(line.endsWith(']')).toBe(true)
  })

  it('is the ordinary line on every other turn', () => {
    const ordinary = composeInterviewSteering({ persona: dan, warmth: 50 })
    const explicit = composeInterviewSteering({ persona: dan, warmth: 50, openingBrief: false })
    expect(explicit).toBe(ordinary)
    expect(ordinary).not.toContain(INTERVIEW_BRIEF_DIRECTIVE)
  })
})
