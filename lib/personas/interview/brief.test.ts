/**
 * The compiled brief — what an interviewer is actually given, per round.
 *
 * The four reps on 7 September asked the candidate what they had DONE, every
 * time, and this file is where that was decided: all six `software` stems are
 * experiential and the CV section said *"Ask about what is actually in it."*
 * The assertions below are about the three things
 * `INTERVIEW-TECHNICAL-PLAN.md` changes here — the round's shape, the probe
 * domains, and a design round that must not reach for the CV at all.
 */

import { describe, expect, it } from 'vitest'
import { compileInterviewBrief } from './brief'
import { withInterviewBrief } from './overlay'
import { ROUND_TYPES, roundType, type RoundTypeId } from '@/lib/data/interview-credits'
import { SOFTWARE_PROBE_DOMAINS } from '@/lib/data/interview-probes'
import { SOFTWARE_DESIGN_BRIEFS, designBriefFor } from '@/lib/data/interview-briefs'
import { INTERVIEW_FIELDS } from '@/lib/data/interview-fields'
import { PERSONAS } from '@/lib/personas'
import type { DifficultyLevel } from '@/lib/data/interview-difficulty'

const CV = 'Backend engineer, six years. Payments, then a chat product with WebSockets and presence.'

const brief = (over: Partial<Parameters<typeof compileInterviewBrief>[0]> = {}) =>
  compileInterviewBrief({
    roleTitle: 'Senior Backend Engineer',
    company: 'Northwind',
    jobDescription: 'You will own the payments service and its on-call rotation.',
    field: 'software',
    round: 'technical',
    cvText: CV,
    customQuestions: ['Ask me about the outage in March.'],
    difficulty: 3,
    seed: 'seed-a',
    ...over,
  })

describe('the round reaches her as a shape, not only a length', () => {
  it('tells her what her first turn is about, on every round', () => {
    for (const round of ROUND_TYPES) {
      const compiled = brief({ round: round.id })
      expect(compiled, round.id).toContain(round.description)
      expect(compiled.length, round.id).toBeGreaterThan(200)
    }
  })

  it('says out loud that a technical round is about the fundamentals underneath', () => {
    const compiled = brief({ round: 'technical' }).toLowerCase()
    expect(compiled).toContain('where the rest of the round comes from rather than the subject of it')
    expect(compiled).toContain('what you may test that they know')
  })
})

describe('the probe domains (§6.1)', () => {
  it('reaches her on a round that probes, at the level this rep runs at', () => {
    const mid = brief({ difficulty: 3 })
    const staff = brief({ difficulty: 5 })
    const domain = SOFTWARE_PROBE_DOMAINS[0]!
    expect(mid).toContain(domain.substance[3])
    expect(mid).not.toContain(domain.substance[5])
    expect(staff).toContain(domain.substance[5])
  })

  it('is absent entirely on a behavioural round', () => {
    for (const round of ROUND_TYPES.filter((entry) => entry.probeShare === 0)) {
      const compiled = brief({ round: round.id })
      expect(compiled, round.id).not.toContain('What you may test that they KNOW')
      expect(compiled, round.id).not.toContain(SOFTWARE_PROBE_DOMAINS[0]!.substance[3])
    }
  })

  /**
   * §7.2. `software` is authored fully and the other eleven fields keep
   * behaving exactly as they do today — a field with no probe domains falls
   * back to the current behaviour, which is a working interview.
   */
  it('is absent entirely in the eleven fields with nothing authored', () => {
    for (const field of INTERVIEW_FIELDS) {
      if (field.id === 'software') continue
      const compiled = brief({ field: field.id, round: 'technical' })
      expect(compiled, field.id).not.toContain('What you may test that they KNOW')
      // And the field's own stems are still there, which is the fallback.
      expect(compiled, field.id).toContain(field.stems[0]!)
    }
  })

  it('gives her the unmoored fallback when the projects lead nowhere (§6.5)', () => {
    expect(brief().toLowerCase()).toContain('no pretence that it came')
  })
})

describe('a system design round is a different interview (§4.3)', () => {
  const design = () => brief({ round: 'deep_technical', seed: 'seed-a' })

  it('poses an authored problem, verbatim', () => {
    const chosen = designBriefFor({ field: 'software', seed: 'seed-a' })!
    expect(design()).toContain(chosen.statement)
    expect(SOFTWARE_DESIGN_BRIEFS).toContain(chosen)
  })

  /**
   * **THE CANDIDATE'S OWN PROJECTS DO NOT COME UP AT ALL.** Rep `e9c74f80` was
   * eleven consecutive questions about one of their web apps, because
   * everything in this brief pointed her at their history. The CV, the job
   * description, the experiential stems and the custom questions are all
   * suppressed, and the suppression is said out loud rather than left implicit
   * — a model holding a CV it has been told nothing about will reach for it.
   */
  it('never hands her the CV, the job description or the stems', () => {
    const compiled = design()
    expect(compiled).not.toContain(CV)
    expect(compiled).not.toContain('You will own the payments service')
    expect(compiled).not.toContain('Ask me about the outage in March.')
    for (const stem of INTERVIEW_FIELDS.find((field) => field.id === 'software')!.stems) {
      expect(compiled).not.toContain(stem)
    }
    expect(compiled).toContain('# Do not ask about their background')
  })

  it('still probes the fundamentals, through the problem rather than the CV', () => {
    expect(design()).toContain('What you may test that they KNOW')
  })

  it('falls back to the ordinary interview where no problem is authored', () => {
    // A deep technical in marketing is a real thing somebody may have bought.
    const compiled = brief({ round: 'deep_technical', field: 'marketing' })
    expect(compiled).not.toContain('# Do not ask about their background')
    expect(compiled).toContain(CV)
  })

  it('rotates the problem with the seed so two reps are not the same exam', () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, index) => brief({ round: 'deep_technical', seed: `s${index}` })),
    )
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('the overlay', () => {
  it('is still a no-op without a brief, which is every dating rep', () => {
    const nadia = PERSONAS['nadia']!
    expect(withInterviewBrief(nadia, {})).toBe(nadia)
    expect(withInterviewBrief(nadia, { interviewBrief: '   ' })).toBe(nadia)
  })

  it('appends the brief to the contract and nowhere else', () => {
    const nadia = PERSONAS['nadia']!
    const overlaid = withInterviewBrief(nadia, { interviewBrief: 'BRIEF' })
    expect(overlaid.contract.endsWith('BRIEF')).toBe(true)
    expect(overlaid.contract.startsWith(nadia.contract.trim())).toBe(true)
  })
})

describe('what a brief never contains', () => {
  /**
   * The one thing a brief may not do is script her. The design brief statement
   * is the single authored question in the product (§10.2) — every other
   * question mark in here belongs to a field stem or a custom question, both of
   * which are explicitly labelled "never read one out verbatim".
   */
  it('labels every question it does carry as something to ask in her own words', () => {
    const rounds: RoundTypeId[] = ROUND_TYPES.map((round) => round.id)
    for (const round of rounds) {
      const compiled = brief({ round, difficulty: 4 as DifficultyLevel })
      if (roundType(round).opener === 'brief') continue
      expect(compiled, round).toContain('never read one out verbatim')
    }
  })
})
