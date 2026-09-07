import { describe, expect, it } from 'vitest'
import {
  FIRST_PROBE_FRACTION,
  INTERVIEW_BEAT_SPACING_MS,
  LAST_AGENDA_FRACTION,
  agendaStep,
  assertCaption,
  captionOrNull,
  dueAgendaBeat,
  dueInterviewBeat,
  dueProbeBeat,
  isGrounded,
  lastQuestionIn,
  questionCaption,
} from './interview-agenda'
import { ROUND_TYPES, roundType } from './interview-credits'
import { DESIGN_LADDER } from './interview-briefs'
import { difficultySpec } from './interview-difficulty'
import { SOFTWARE_PROBE_DOMAINS } from './interview-probes'
import type { TranscriptTurn } from '@/lib/voice/types'

const her = (text: string, at: number): TranscriptTurn =>
  ({ speaker: 'agent', text, t_start: at, t_end: at + 2 })
const him = (text: string, at: number): TranscriptTurn =>
  ({ speaker: 'user', text, t_start: at, t_end: at + 2 })

describe('the counter', () => {
  /**
   * D13's lesson, and it applies to any rail that counts. Advancing on his
   * turns alone told a user to follow an answer that had not arrived.
   */
  it('advances on completed exchanges, never on his turns alone', () => {
    const round = 'technical' as const
    expect(agendaStep({ userTurns: 0, agentTurns: 0, wrapping: false, round }).index).toBe(0)
    expect(agendaStep({ userTurns: 1, agentTurns: 0, wrapping: false, round }).index).toBe(0)
    expect(agendaStep({ userTurns: 1, agentTurns: 1, wrapping: false, round }).index).toBe(1)
    expect(agendaStep({ userTurns: 4, agentTurns: 2, wrapping: false, round }).index).toBe(2)
  })

  it('holds still when the pipeline is failing', () => {
    // Six of his turns and two of hers is a rep where four replies never
    // arrived. The rail must not claim he is on question six.
    expect(agendaStep({ userTurns: 6, agentTurns: 2, wrapping: false, round: 'technical' }).index).toBe(2)
  })

  it('never runs past the round’s own plan', () => {
    for (const round of ROUND_TYPES) {
      const step = agendaStep({ userTurns: 99, agentTurns: 99, wrapping: false, round: round.id })
      expect(step.index, round.id).toBeLessThan(step.total)
      expect(step.total, round.id).toBe(round.questions)
    }
  })

  /** The wind-down owns the close outright — the other half of D13. */
  it('reaches the last step only through the wind-down', () => {
    const round = 'recruiter' as const
    const total = roundType(round).questions
    expect(agendaStep({ userTurns: 50, agentTurns: 50, wrapping: false, round }).index)
      .toBe(total - 1)
    expect(agendaStep({ userTurns: 1, agentTurns: 1, wrapping: true, round }).index).toBe(total)
  })
})

describe('the caption', () => {
  const transcript: TranscriptTurn[] = [
    her('Thanks for making the time. I am Dan, I run recruitment here.', 1),
    him('Good to meet you.', 5),
    her('Take me through the last thing you shipped. I want a specific one.', 8),
    him('We rebuilt the checkout flow.', 14),
    her('What did you change first?', 20),
  ]

  it('shows her most recent question, in her own words', () => {
    expect(questionCaption(transcript)).toBe('What did you change first?')
  })

  it('skips her turns that are not questions', () => {
    const answered: TranscriptTurn[] = [...transcript, her('Right. Noted.', 26)]
    expect(questionCaption(answered)).toBe('What did you change first?')
  })

  it('takes the question out of a two-sentence turn rather than the preamble', () => {
    expect(lastQuestionIn('Take me through the last thing you shipped. I want a specific one.'))
      .toBeNull()
    expect(lastQuestionIn('That is useful. Who disagreed with you?')).toBe('Who disagreed with you?')
  })

  it('is null before she has asked anything', () => {
    expect(questionCaption([])).toBeNull()
    expect(questionCaption([her('Thanks for making the time.', 1)])).toBeNull()
    // And never his, however it was phrased.
    expect(questionCaption([him('So what does the team look like?', 1)])).toBeNull()
  })
})

/**
 * §11 and C6, enforced in code rather than in a style note — the same doctrine
 * as `assertNoScript` and `assertGuidedStep`.
 */
describe('a caption may only ever contain the interviewer’s own words', () => {
  const transcript: TranscriptTurn[] = [
    her('What did you change first?', 20),
    him('The database, mostly.', 24),
  ]

  it('accepts what she actually said', () => {
    expect(() => assertCaption('What did you change first?', transcript)).not.toThrow()
    expect(captionOrNull('What did you change first?', transcript)).toBe('What did you change first?')
  })

  it('refuses a hint, however it is phrased', () => {
    for (const hint of [
      'Try the STAR method here.',
      'Name a number if you can.',
      'Q3: what did you change first?',
      'Tip: be specific.',
      'What did you change first? (Give a concrete example.)',
    ]) {
      expect(() => assertCaption(hint, transcript), hint).toThrow(/own words/)
      expect(captionOrNull(hint, transcript), hint).toBeNull()
    }
  })

  it('refuses the candidate’s own words too', () => {
    expect(() => assertCaption('The database, mostly.', transcript)).toThrow()
  })

  it('refuses everything when she has said nothing', () => {
    expect(captionOrNull('What did you change first?', [])).toBeNull()
  })
})

/**
 * The defect the first real interview found: fifteen of seventeen turns on the
 * opening question, and one question reaching the CV at 429 seconds of 502.
 */
describe('moving her off a thread', () => {
  const round = 'recruiter' as const // five questions

  it('fires nothing at the start', () => {
    expect(dueAgendaBeat({ elapsedFraction: 0, round, fired: 0 })).toBeNull()
    expect(dueAgendaBeat({ elapsedFraction: 0.1, round, fired: 0 })).toBeNull()
  })

  it('fires once per question, evenly across the rep', () => {
    const fired: number[] = []
    let count = 0
    for (let tick = 0; tick <= 100; tick += 1) {
      const beat = dueAgendaBeat({ elapsedFraction: tick / 100, round, fired: count })
      if (beat) { fired.push(tick / 100); count += 1 }
    }
    // Four beats for a five-question round: the last question needs none,
    // because the wind-down is what ends it.
    expect(count).toBe(4)
    expect(fired.every((at) => at <= LAST_AGENDA_FRACTION)).toBe(true)
    // Evenly spaced rather than bunched.
    expect(fired[0]).toBeLessThan(fired[1]!)
    expect(fired[1]).toBeLessThan(fired[2]!)
  })

  it('stops before the wind-down owns the room', () => {
    // Being told to change the subject and to wind down in the same breath is
    // two directions at once — the argument `LAST_BEAT_FRACTION` already settles.
    expect(dueAgendaBeat({ elapsedFraction: 0.95, round, fired: 4 })).toBeNull()
  })

  it('scales with the round rather than assuming one length', () => {
    const short = dueAgendaBeat({ elapsedFraction: 0.99, round: 'screener', fired: 0 })
    const long = dueAgendaBeat({ elapsedFraction: 0.99, round: 'technical', fired: 0 })
    expect(short).not.toBeNull()
    expect(long).not.toBeNull()
    // A three-question screener gets two beats; a six-question technical, five.
    const count = (id: 'screener' | 'technical') => {
      let n = 0
      while (dueAgendaBeat({ elapsedFraction: 1, round: id, fired: n })) n += 1
      return n
    }
    expect(count('screener')).toBe(2)
    expect(count('technical')).toBe(5)
  })

  /**
   * §05 and §11. It says the THREAD is finished; what she asks next is hers,
   * off her own field and their CV. A direction naming the next question would
   * be a script, which is the one thing this track refuses.
   */
  it('never tells her what to ask, only that this one is done', () => {
    for (const fired of [0, 1, 2, 3]) {
      const beat = dueAgendaBeat({ elapsedFraction: 1, round, fired })
      expect(beat, String(fired)).not.toBeNull()
      const direction = beat!.direction
      expect(direction).toMatch(/^\(.*\)$/)
      // A bracketed stage direction, second person, about the agenda.
      for (const banned of ['ask them about', 'ask about their', 'say "', 'for example']) {
        expect(direction.toLowerCase(), direction).not.toContain(banned)
      }
      expect(direction.toLowerCase()).toContain('thread')
    }
  })
})

/* ------------------------------------------------------------------ *
 * Going deeper (INTERVIEW-TECHNICAL-PLAN §6)
 * ------------------------------------------------------------------ */

describe('the grounded gate', () => {
  it('needs one real sentence, not five short ones', () => {
    const short = Array.from({ length: 5 }, (_, index) => him('Yeah, about two years.', index))
    expect(isGrounded(short)).toBe(false)
    expect(isGrounded([...short, him(
      'We built the checkout service in Go and it published events onto a queue for reconciliation later.',
      6,
    )])).toBe(true)
  })

  it('never counts her own turns as him having described anything', () => {
    expect(isGrounded([her(
      'Tell me about something you built end to end, and take me through the whole thing please.',
      1,
    )])).toBe(false)
    expect(isGrounded([])).toBe(false)
  })
})

describe('dueProbeBeat', () => {
  const grounded = { grounded: true, difficulty: 3 as const }

  it('fires on nothing at all in a behavioural round', () => {
    for (const round of ['screener', 'recruiter', 'final'] as const) {
      expect(dueProbeBeat({ elapsedFraction: 0.9, round, fired: 0, ...grounded }), round).toBeNull()
    }
  })

  /**
   * §6.4. Probing a candidate who has not managed to describe anything yet
   * produces the interrogation in rep `e9c74f80` — nine of eleven turns were
   * increasingly narrow demands for one specific detail.
   */
  it('is suppressed entirely until something is on the table', () => {
    expect(dueProbeBeat({
      elapsedFraction: 0.9, round: 'technical', fired: 0, difficulty: 3, grounded: false,
    })).toBeNull()
    expect(dueProbeBeat({
      elapsedFraction: 0.9, round: 'technical', fired: 0, difficulty: 3, grounded: true,
    })).not.toBeNull()
  })

  it('leaves the opening minutes alone and stops before the wind-down', () => {
    const early = dueProbeBeat({ elapsedFraction: FIRST_PROBE_FRACTION - 0.01, round: 'technical', fired: 0, ...grounded })
    expect(early).toBeNull()
    const due = dueProbeBeat({ elapsedFraction: FIRST_PROBE_FRACTION, round: 'technical', fired: 0, ...grounded })
    expect(due?.rung).toBe('probe')
    // Everything the round plans for has fired; nothing is left for the close.
    let fired = 0
    while (dueProbeBeat({ elapsedFraction: 1, round: 'technical', fired, ...grounded })) fired += 1
    expect(fired).toBe(3)
  })

  /**
   * §4.1, and `INTERVIEW-PLAN.md` §14 is why it is stated as a target. A hard
   * quota gagged an interviewer on four turns in five and taught the model that
   * the bracketed directive was optional. `probeShare` moves how OFTEN the beat
   * is due and refuses nothing.
   */
  it('plans more probes on the round with the higher share', () => {
    const count = (round: 'technical' | 'deep_technical') => {
      let fired = 0
      while (dueProbeBeat({ elapsedFraction: 1, round, fired, ...grounded })) fired += 1
      return fired
    }
    expect(count('deep_technical')).toBeGreaterThan(count('technical'))
    expect(count('deep_technical')).toBe(DESIGN_LADDER.length)
  })

  it('never names the topic, and pitches at the level it was given', () => {
    const easy = dueProbeBeat({ elapsedFraction: 1, round: 'technical', fired: 0, grounded: true, difficulty: 1 })
    const hard = dueProbeBeat({ elapsedFraction: 1, round: 'technical', fired: 0, grounded: true, difficulty: 5 })
    expect(easy!.direction).not.toBe(hard!.direction)
    expect(easy!.direction).toContain(difficultySpec(1).directive)
    expect(hard!.direction).toContain(difficultySpec(5).directive)
    // A direction that names the question is a script (§05, §11). It says what
    // KIND of question is due and stops.
    for (const beat of [easy!, hard!]) {
      expect(beat.direction.startsWith('(')).toBe(true)
      expect(beat.direction.endsWith(')')).toBe(true)
      for (const domain of SOFTWARE_PROBE_DOMAINS) {
        expect(beat.direction).not.toContain(domain.label)
      }
    }
  })

  it('climbs the design ladder in order on a system design round', () => {
    const rungs = DESIGN_LADDER.map((_, fired) =>
      dueProbeBeat({ elapsedFraction: 1, round: 'deep_technical', fired, ...grounded })?.rung)
    expect(rungs).toEqual([...DESIGN_LADDER])
  })
})

describe('one direction per turn', () => {
  const base = {
    elapsedFraction: 1,
    round: 'technical' as const,
    difficulty: 3 as const,
    agendaFired: 0,
    probeFired: 0,
    ladder: true,
    grounded: true,
  }

  /**
   * The agenda beat says *leave this thread* and the probe says *go deeper on
   * what they just named*. Arriving together they are flatly contradictory, and
   * two evenly-spaced schedules collide by construction — so the spacing is
   * enforced in time rather than in arithmetic.
   */
  it('says nothing at all inside one exchange of the last direction', () => {
    expect(dueInterviewBeat({ ...base, msSinceLastBeat: INTERVIEW_BEAT_SPACING_MS - 1 })).toBeNull()
    expect(dueInterviewBeat({ ...base, msSinceLastBeat: INTERVIEW_BEAT_SPACING_MS })).not.toBeNull()
  })

  it('gives the probe the tie, and the agenda the turn after', () => {
    // §6.3's ladder puts the probe before the move: HOOK, PROBE, ESCALATE, then
    // MOVE. An agenda beat one exchange later costs nothing.
    const first = dueInterviewBeat({ ...base, msSinceLastBeat: Number.POSITIVE_INFINITY })
    expect(first?.kind).toBe('probe')
    const next = dueInterviewBeat({
      ...base, probeFired: 3, msSinceLastBeat: Number.POSITIVE_INFINITY,
    })
    expect(next?.kind).toBe('agenda')
  })

  /**
   * The whole point of the gate: a rep where nothing is grounded, or a
   * behavioural round, still gets moved off a thread it has been on too long.
   * The agenda beat is the only thing in the build that does that.
   */
  it('still moves her along when the probe ladder is not running', () => {
    const behavioural = dueInterviewBeat({
      ...base, round: 'recruiter', msSinceLastBeat: Number.POSITIVE_INFINITY,
    })
    expect(behavioural?.kind).toBe('agenda')
    const ungrounded = dueInterviewBeat({
      ...base, grounded: false, msSinceLastBeat: Number.POSITIVE_INFINITY,
    })
    expect(ungrounded?.kind).toBe('agenda')
    // A `technical` round in a field with nothing authored: the ladder is off,
    // the agenda beat is the whole of what she gets, and that is the interview
    // this track ran before the plan.
    const noDomains = dueInterviewBeat({
      ...base, ladder: false, msSinceLastBeat: Number.POSITIVE_INFINITY,
    })
    expect(noDomains?.kind).toBe('agenda')
  })

  /**
   * **A SYSTEM DESIGN ROUND HAS ONE THREAD AND IT IS THE PROBLEM.**
   *
   * `dueAgendaBeat` says "leave the thread, do not return to it, and open a new
   * question on something you have not asked about yet", which would walk her
   * off the brief she had just posed. §9's "Done when" is explicit: a
   * `deep_technical` rep spends its whole length on one design problem.
   */
  it('never tells her to leave the design problem', () => {
    const design = { ...base, round: 'deep_technical' as const }
    // Every rung of the ladder fires, and then nothing does.
    for (let fired = 0; fired < DESIGN_LADDER.length; fired += 1) {
      const due = dueInterviewBeat({
        ...design, probeFired: fired, msSinceLastBeat: Number.POSITIVE_INFINITY,
      })
      expect(due?.kind, String(fired)).toBe('probe')
    }
    expect(dueInterviewBeat({
      ...design, probeFired: DESIGN_LADDER.length, msSinceLastBeat: Number.POSITIVE_INFINITY,
    })).toBeNull()
    // Not even before the candidate has grounded, which is when the ladder is
    // silent and the agenda beat would otherwise be the only thing due.
    expect(dueInterviewBeat({
      ...design, grounded: false, msSinceLastBeat: Number.POSITIVE_INFINITY,
    })).toBeNull()
  })

  it('keeps the agenda beat on a design round with no authored problem', () => {
    // A deep technical in marketing. There is no brief to be walked off, and
    // without the agenda beat nothing at all would push her off a thread.
    const due = dueInterviewBeat({
      ...base, round: 'deep_technical', ladder: false,
      msSinceLastBeat: Number.POSITIVE_INFINITY,
    })
    expect(due?.kind).toBe('agenda')
  })
})
