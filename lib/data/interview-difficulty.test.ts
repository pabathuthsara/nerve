import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LEVELS,
  difficultyFor,
  difficultyFromRoleTitle,
  difficultySpec,
  isDifficultyLevel,
  toDifficultyLevel,
} from './interview-difficulty'

describe('the five levels', () => {
  it('is exactly five, in order, with no gaps', () => {
    expect(DIFFICULTY_LEVELS.map((spec) => spec.level)).toEqual([1, 2, 3, 4, 5])
    for (const spec of DIFFICULTY_LEVELS) expect(difficultySpec(spec.level)).toBe(spec)
  })

  it('gives every level a label, a thing it tests, a directive and an example', () => {
    for (const spec of DIFFICULTY_LEVELS) {
      expect(spec.label.length, String(spec.level)).toBeGreaterThan(2)
      expect(spec.tests.length, String(spec.level)).toBeGreaterThan(2)
      expect(spec.directive.length, String(spec.level)).toBeGreaterThan(40)
      expect(spec.example.length, String(spec.level)).toBeGreaterThan(10)
    }
  })

  /**
   * THE SPLIT THAT MAKES RULE 10 SURVIVE THIS FEATURE.
   *
   * The example is for the SETUP SCREEN — a candidate choosing a number needs
   * to know what the number buys. The directive is for the interviewer, and it
   * describes a KIND of question. A directive carrying a question mark is a
   * script, which §05 and §11 both refuse, and it is the one way this table
   * could quietly become one.
   */
  it('never hands the interviewer a question to read out', () => {
    for (const spec of DIFFICULTY_LEVELS) {
      expect(spec.directive, spec.label).not.toContain('?')
      expect(spec.example, spec.label).toContain('?')
    }
  })
})

describe('deriving from the role title', () => {
  it('reads the seniority word people actually use', () => {
    expect(difficultyFromRoleTitle('Intern Software Engineer')).toBe(1)
    expect(difficultyFromRoleTitle('Graduate Backend Developer')).toBe(2)
    expect(difficultyFromRoleTitle('Junior Data Analyst')).toBe(2)
    expect(difficultyFromRoleTitle('Software Engineer II')).toBe(3)
    expect(difficultyFromRoleTitle('Senior Backend Engineer')).toBe(4)
    expect(difficultyFromRoleTitle('Engineering Manager')).toBe(4)
    expect(difficultyFromRoleTitle('Staff Engineer')).toBe(5)
    expect(difficultyFromRoleTitle('Principal Architect')).toBe(5)
  })

  it('takes the highest rung when a title carries two', () => {
    // Reading "Senior Staff Engineer" as senior would under-pitch every probe
    // in the rep, and the candidate would have no way to tell why.
    expect(difficultyFromRoleTitle('Senior Staff Engineer')).toBe(5)
    expect(difficultyFromRoleTitle('Junior to Mid Developer')).toBe(3)
  })

  /**
   * "intern" is inside "internal", "international" and "internship
   * coordinator". A substring match would default an Internal Tools Engineer
   * to definitions-level questions, which is exactly the kind of quiet
   * wrongness a derived default has to avoid to stay a convenience.
   */
  it('matches whole words, not substrings', () => {
    expect(difficultyFromRoleTitle('Internal Tools Engineer')).toBe(DEFAULT_DIFFICULTY)
    expect(difficultyFromRoleTitle('International Sales Lead')).toBe(4)
    expect(difficultyFromRoleTitle('Grade Teacher')).toBe(DEFAULT_DIFFICULTY)
  })

  it('falls back to the middle of the ladder on a title that says nothing', () => {
    expect(difficultyFromRoleTitle('Software Engineer')).toBe(DEFAULT_DIFFICULTY)
    expect(difficultyFromRoleTitle('')).toBe(DEFAULT_DIFFICULTY)
    expect(difficultyFromRoleTitle(null)).toBe(DEFAULT_DIFFICULTY)
    expect(DEFAULT_DIFFICULTY).toBe(3)
  })
})

describe('resolving what this rep runs at', () => {
  /**
   * NULL IS NOT LEVEL 3. It means "follow my title", so somebody who edits
   * their role from Junior to Senior and never opens the slider gets harder
   * questions — which is what they asked for by editing the title.
   */
  it('follows the title until the slider is touched', () => {
    expect(difficultyFor({ stored: null, roleTitle: 'Junior Engineer' })).toBe(2)
    expect(difficultyFor({ stored: null, roleTitle: 'Staff Engineer' })).toBe(5)
    expect(difficultyFor({ stored: undefined, roleTitle: 'Senior Engineer' })).toBe(4)
  })

  it('lets a stored choice beat the title outright', () => {
    // A candidate who wants to be beaten up sets it to 5 regardless of what
    // their title says. Deriving is a convenience and never a lock (§5.2).
    expect(difficultyFor({ stored: 5, roleTitle: 'Intern' })).toBe(5)
    expect(difficultyFor({ stored: 1, roleTitle: 'Staff Engineer' })).toBe(1)
  })

  it('clamps a value the form could not have produced', () => {
    expect(toDifficultyLevel(9)).toBe(5)
    expect(toDifficultyLevel(0)).toBe(1)
    expect(toDifficultyLevel(Number.NaN)).toBe(DEFAULT_DIFFICULTY)
    expect(toDifficultyLevel('four')).toBe(DEFAULT_DIFFICULTY)
    expect(isDifficultyLevel(3)).toBe(true)
    expect(isDifficultyLevel(0)).toBe(false)
    expect(isDifficultyLevel('3')).toBe(false)
  })
})
