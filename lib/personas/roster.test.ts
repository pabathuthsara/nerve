import { describe, expect, it } from 'vitest'
import { PERSONAS, RETIRED_PERSONAS, getPersona, getPersonaEverAuthored } from './index'
import { PRESENTATION, presentationFor } from './presentation'
import { tess } from './tess'
import { nadia } from './nadia'
import { maya } from './maya'
import { robin } from './robin'
import { ARM_THRESHOLD, KEEP_THRESHOLD } from '@/lib/data/rep-rules'
import { TOP_TIER, uiLevel } from '@/lib/data/progression'
import { FOCUS_PLANS } from '@/lib/data/focus'

const ROSTER = Object.values(PERSONAS)

describe('the ladder', () => {
  it('is contiguous, one character per rung', () => {
    // It was 1, 2, 4 with nothing at 3, so an unheld rung fell back to a
    // neighbour's curve. Tess taking rung 1 closed it. `levels.ts` builds the
    // level→trajectory map off this roster, so a gap here is a difficulty curve
    // nobody designed.
    const rungs = ROSTER.map((persona) => persona.level).sort((a, b) => a - b)
    expect(rungs).toEqual([1, 2, 3, 4])
  })

  it('stands each shipped rung on its own visible tier', () => {
    const tiers = ROSTER.map((persona) => uiLevel(persona.level)).sort((a, b) => a - b)
    expect(tiers).toEqual([1, 2, 3, 4])
    expect(uiLevel(robin.level)).toBe(TOP_TIER)
  })

  it('puts the characters where the renumber said it would', () => {
    expect(tess.level).toBe(1)
    expect(nadia.level).toBe(2)
    expect(maya.level).toBe(3)
    expect(robin.level).toBe(4)
  })

  it('leaves the retired five off it entirely', () => {
    // A retired slug must not be startable by typing a URL, and must still
    // resolve for a history row somebody can open.
    for (const slug of Object.keys(RETIRED_PERSONAS)) {
      expect(getPersona(slug), slug).toBeNull()
      expect(getPersonaEverAuthored(slug), slug).not.toBeNull()
    }
  })
})

describe('Tess — the sign-up rep (PAYMENTS-NEW-INTEGRATION §4)', () => {
  it('is easier than Nadia on every dial that decides difficulty', () => {
    // The ladder test in `engine.test.ts` asserts the ordering across all eight
    // rungs. This one says WHY rung 1 exists: she is the character authored to
    // be won, and every one of these numbers is the reason.
    expect(tess.trajectory.start).toBeGreaterThan(nadia.trajectory.start)
    expect(tess.trajectory.gain).toBeGreaterThan(nadia.trajectory.gain)
    expect(tess.trajectory.decay).toBeLessThan(nadia.trajectory.decay)
    expect(tess.trajectory.decayPerTurn).toBeLessThan(nadia.trajectory.decayPerTurn)
    expect(tess.trajectory.maxGainPerTurn).toBeGreaterThan(nadia.trajectory.maxGainPerTurn)
    expect(tess.personality.patience).toBeGreaterThan(nadia.personality.patience)
    expect(tess.personality.distraction).toBeLessThan(nadia.personality.distraction)
  })

  it('opens her gated layers earlier than anybody else', () => {
    // The "more engaging" note, expressed as a dial rather than as prose. Below
    // her own `start`, so the layer is available from the first turn.
    expect(tess.gated.flirtiness.unlocksAt).toBeLessThan(nadia.gated.flirtiness.unlocksAt)
    expect(tess.gated.flirtiness.unlocksAt).toBeLessThan(tess.trajectory.start)
    for (const persona of ROSTER) {
      if (persona.slug === 'tess') continue
      expect(tess.gated.personalDisclosure.unlocksAt, persona.slug)
        .toBeLessThan(persona.gated.personalDisclosure.unlocksAt)
    }
  })

  it('is easy to win and still has to be won', () => {
    // The line this whole character is balanced on. `start` is a long way up
    // and still a long way below the arm line, so a user who says nothing does
    // not get a number handed to them. If these two ever cross, the win teaches
    // nothing and the user knows it.
    expect(tess.trajectory.start).toBeLessThan(ARM_THRESHOLD)
    expect(tess.trajectory.start + tess.trajectory.startJitter).toBeLessThan(ARM_THRESHOLD)
    // And it must not open ABOVE the keep line either, or a silent rep would
    // still be holding a number at the wind-down.
    expect(tess.trajectory.start - tess.trajectory.startJitter).toBeLessThan(KEEP_THRESHOLD)
  })

  it('keeps warmth generous without making the grade generous', () => {
    // Warmth 65 arms a rep; a tier opens on two reps GRADED 70+, and the grade
    // scores process rather than outcome (§07). Her session ceiling is the
    // roster's ordinary one — nothing here touches scoring, and nothing here
    // may start to.
    expect(tess.trajectory.sessionCeiling).toBe(nadia.trajectory.sessionCeiling)
    expect(Math.min(tess.trajectory.sessionCeiling, tess.trajectory.hardCeiling))
      .toBeGreaterThan(ARM_THRESHOLD)
  })

  it('can still have a rep go badly', () => {
    // §05: always a real chance it goes well and always a real chance it does
    // not. A first rep that cannot go wrong is a demo, and §08 re-offers this
    // rep at day 28 as a measurement.
    expect(tess.outcomeWeights.receptive).toBeLessThan(1)
    expect(tess.outcomeWeights.receptive).toBeGreaterThan(nadia.outcomeWeights.receptive)
    const total = tess.outcomeWeights.receptive + tess.outcomeWeights.neutral + tess.outcomeWeights.rejecting
    expect(total).toBeCloseTo(1, 5)
  })

  it('never calls her a flirt anywhere a reviewer can read it', () => {
    // §14. `flirtiness` is a dial in her file; the word must not reach public
    // copy, the persona list, or anything a merchant-of-record reviewer sees —
    // and a reviewer who signs up meets this character first.
    const shown = presentationFor('tess')
    expect(shown).not.toBeNull()
    const copy = [
      tess.name,
      tess.scene,
      shown!.setting,
      shown!.settingShort,
      shown!.hook,
      shown!.blurb,
      ...shown!.respondsTo,
      ...shown!.shutsDownOn,
    ].join(' ').toLowerCase()
    for (const word of ['flirt', 'sexy', 'seduc', 'girlfriend', 'companion', 'date']) {
      expect(copy, `Tess's public copy says "${word}"`).not.toContain(word)
    }
  })

  it('leads the focus answers whose first rep should be winnable', () => {
    // The sign-up rep is against whoever `chooseTodayPersona` puts first, and
    // `rejection` is the deliberate exception: somebody whose hard part is
    // being turned down is not served by the character least likely to do it.
    expect(FOCUS_PLANS.opening.personaSlugs[0]).toBe('tess')
    expect(FOCUS_PLANS.flirting.personaSlugs[0]).toBe('tess')
    expect(FOCUS_PLANS.rejection.personaSlugs[0]).not.toBe('tess')
    for (const plan of Object.values(FOCUS_PLANS)) {
      // A roster addition must never be unreachable because nobody listed her.
      for (const persona of ROSTER) expect(plan.personaSlugs).toContain(persona.slug)
    }
  })
})

describe('every shipped character is complete', () => {
  it('has presentation copy, without which the roster has nothing to draw', () => {
    for (const persona of ROSTER) {
      expect(PRESENTATION[persona.slug], `${persona.slug} has no presentation copy`).toBeDefined()
    }
  })

  it('carries a want, an exit and a scene', () => {
    for (const persona of ROSTER) {
      expect(persona.want.length, persona.slug).toBeGreaterThan(0)
      expect(persona.exitConditions.length, persona.slug).toBeGreaterThan(0)
      expect(persona.scene.length, persona.slug).toBeGreaterThan(0)
    }
  })

  it('keeps every scene beat clear of the wind-down', () => {
    // The last third belongs to the wind-down. A character told two things
    // thirty seconds from the end is the argument this codebase settled once.
    for (const persona of ROSTER) {
      for (const beat of persona.sceneBeats ?? []) {
        expect(beat.at, `${persona.slug} @ ${beat.at}`).toBeGreaterThanOrEqual(0.15)
        expect(beat.at, `${persona.slug} @ ${beat.at}`).toBeLessThanOrEqual(0.7)
      }
    }
  })
})
