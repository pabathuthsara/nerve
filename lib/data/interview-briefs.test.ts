import { describe, expect, it } from 'vitest'
import {
  DESIGN_LADDER,
  SOFTWARE_DESIGN_BRIEFS,
  curveballsAt,
  designBriefFor,
  designBriefsFor,
  designRungDirection,
  opensOnDesignBrief,
  renderDesignBrief,
} from './interview-briefs'
import { INTERVIEW_BRIEF_WORD_CAP } from '@/lib/warmth/interview/bands'
import { INTERVIEW_FIELDS } from './interview-fields'
import { ROUND_TYPES } from './interview-credits'
import type { DifficultyLevel } from './interview-difficulty'

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

describe('the authored design briefs', () => {
  it('is the five §7.3 names, with no duplicate ids', () => {
    expect(SOFTWARE_DESIGN_BRIEFS.map((brief) => brief.id)).toEqual([
      'url-shortener', 'rate-limiter', 'chat-service', 'job-queue', 'notification-fanout',
    ])
  })

  /**
   * §6.7 — and this is the reason `INTERVIEW_BRIEF_WORD_CAP` exists at all.
   * Every interview band tops out at thirty-four words, so a brief that fitted
   * inside a band would not need a carve-out, and one that ran past ninety
   * would be truncated by the ceiling that was added for it.
   */
  it('states a problem longer than a band and shorter than the carve-out', () => {
    for (const brief of SOFTWARE_DESIGN_BRIEFS) {
      const count = words(brief.statement)
      expect(count, brief.id).toBeGreaterThan(40)
      expect(count, brief.id).toBeLessThanOrEqual(INTERVIEW_BRIEF_WORD_CAP - 15)
    }
  })

  it('gives every brief depth to go at and constraints to add late', () => {
    for (const brief of SOFTWARE_DESIGN_BRIEFS) {
      expect(brief.depth.length, brief.id).toBeGreaterThanOrEqual(3)
      expect(brief.curveballs.length, brief.id).toBeGreaterThanOrEqual(3)
    }
  })

  /**
   * **THE ONE VERBATIM-AUTHORED QUESTION IN THE PRODUCT** — and only the
   * statement is one. §10.2: no question is authored verbatim except a design
   * brief. A depth item is a SUBJECT and a curveball is a CONSTRAINT; both are
   * things she finds a sentence for, exactly as a probe domain is.
   */
  it('authors the problem and never the follow-ups', () => {
    for (const brief of SOFTWARE_DESIGN_BRIEFS) {
      for (const item of brief.depth) expect(item, brief.id).not.toContain('?')
      for (const item of brief.curveballs) expect(item, brief.id).not.toContain('?')
    }
  })
})

describe('which problem a rep gets', () => {
  it('is stable for a seed and spread across the set', () => {
    expect(designBriefFor({ field: 'software', seed: 'abc' }))
      .toBe(designBriefFor({ field: 'software', seed: 'abc' }))
    const seen = new Set(
      Array.from({ length: 200 }, (_, index) => designBriefFor({ field: 'software', seed: `s${index}` })?.id),
    )
    expect(seen.size).toBe(SOFTWARE_DESIGN_BRIEFS.length)
  })

  it('has nothing to pose in the eleven fields with nothing authored', () => {
    for (const field of INTERVIEW_FIELDS) {
      if (field.id === 'software') continue
      expect(designBriefsFor(field.id), field.id).toHaveLength(0)
      expect(designBriefFor({ field: field.id, seed: 'x' }), field.id).toBeNull()
    }
  })

  it('opens on a brief only where the round and the field both allow it', () => {
    for (const round of ROUND_TYPES) {
      expect(opensOnDesignBrief({ round: round.id, field: 'software' }), round.id)
        .toBe(round.opener === 'brief')
      expect(opensOnDesignBrief({ round: round.id, field: 'finance' }), round.id).toBe(false)
    }
  })
})

describe('the ladder', () => {
  it('is the five §6.6 rungs, in order', () => {
    expect(DESIGN_LADDER).toEqual(['requirements', 'shape', 'choice', 'depth', 'curveball'])
  })

  /**
   * A direction that names the question is a script (§10.2, §11). The rungs
   * say what KIND of move is due; the material they draw on is in the
   * contract, which is what `renderDesignBrief` puts there.
   */
  it('never names the question and never names the subject', () => {
    for (const rung of DESIGN_LADDER) {
      const direction = designRungDirection(rung)
      expect(direction.startsWith('('), rung).toBe(true)
      expect(direction.endsWith(')'), rung).toBe(true)
      for (const brief of SOFTWARE_DESIGN_BRIEFS) {
        for (const item of [...brief.depth, ...brief.curveballs]) {
          expect(direction, `${rung} / ${brief.id}`).not.toContain(item)
        }
      }
    }
  })

  /**
   * Step 2 is whether the CANDIDATE asks what it needs to do, and that is the
   * tell. Prompting for it would hand them the mark they were being measured
   * on, so the direction tells her to leave room and notice.
   */
  it('tells her to leave the requirements to them', () => {
    const direction = designRungDirection('requirements').toLowerCase()
    expect(direction).toContain('do not tell them what it needs to do')
    expect(direction).toContain('have not asked')
  })
})

describe('the late constraint, and where difficulty lives', () => {
  it('reaches further into the list as the level rises', () => {
    const brief = SOFTWARE_DESIGN_BRIEFS[0]!
    const easy = curveballsAt(brief, 1 as DifficultyLevel)
    const hard = curveballsAt(brief, 5 as DifficultyLevel)
    expect(easy[0]).toBe(brief.curveballs[0])
    expect(hard[hard.length - 1]).toBe(brief.curveballs[brief.curveballs.length - 1])
    expect(easy).not.toEqual(hard)
  })

  it('clamps rather than wraps, at both ends', () => {
    // A staff candidate must never be handed the gentlest constraint because a
    // modulo came round, and an intern must never be handed the one with no
    // answer at their level.
    for (const brief of SOFTWARE_DESIGN_BRIEFS) {
      for (const level of [1, 2, 3, 4, 5] as DifficultyLevel[]) {
        const chosen = curveballsAt(brief, level)
        expect(chosen.length, `${brief.id} @ ${level}`).toBeGreaterThan(0)
        for (const item of chosen) expect(brief.curveballs).toContain(item)
      }
    }
  })
})

describe('rendering for the contract', () => {
  it('quotes the problem as written and says the CV is not the subject', () => {
    const brief = SOFTWARE_DESIGN_BRIEFS[2]!
    const rendered = renderDesignBrief(brief, 3 as DifficultyLevel)
    expect(rendered).toContain(brief.statement)
    expect(rendered.toLowerCase()).toContain('their cv and their own projects are not the subject')
    for (const item of brief.depth) expect(rendered).toContain(item)
  })

  it('offers only the constraints this level reaches', () => {
    const brief = SOFTWARE_DESIGN_BRIEFS[0]!
    const rendered = renderDesignBrief(brief, 1 as DifficultyLevel)
    expect(rendered).toContain(brief.curveballs[0])
    expect(rendered).not.toContain(brief.curveballs[brief.curveballs.length - 1])
  })
})
