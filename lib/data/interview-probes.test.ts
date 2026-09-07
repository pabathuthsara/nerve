import { describe, expect, it } from 'vitest'
import {
  SOFTWARE_PROBE_DOMAINS,
  fieldHasProbes,
  probeDomainsFor,
  probeLadderEnabled,
  renderProbeDomains,
} from './interview-probes'
import { DIFFICULTY_LEVELS, type DifficultyLevel } from './interview-difficulty'
import { INTERVIEW_FIELDS } from './interview-fields'
import { ROUND_TYPES } from './interview-credits'

const LEVELS = DIFFICULTY_LEVELS.map((spec) => spec.level)

describe('the authored probe domains', () => {
  it('has no duplicate ids', () => {
    const ids = SOFTWARE_PROBE_DOMAINS.map((domain) => domain.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('says what a good answer touches at every one of the five levels', () => {
    // A domain missing a rung is a domain that silently degrades to whatever
    // the model already thinks "senior" means, which is the thing the slider
    // exists to stop being a guess.
    for (const domain of SOFTWARE_PROBE_DOMAINS) {
      for (const level of LEVELS) {
        expect(domain.substance[level].length, `${domain.id} @ ${level}`).toBeGreaterThan(30)
      }
    }
  })

  it('gives every domain a vagueness reading and something to hook off', () => {
    for (const domain of SOFTWARE_PROBE_DOMAINS) {
      expect(domain.vagueness.length, domain.id).toBeGreaterThan(20)
      expect(domain.opensFrom.length, domain.id).toBeGreaterThanOrEqual(3)
    }
  })

  /**
   * **THE DOMAIN IS AUTHORED, THE QUESTION IS HERS** (§6.1).
   *
   * This is the assertion that keeps rule 10 intact through a feature whose
   * whole point is that the question emerges from the conversation. There is no
   * question string in this file and there must never be one: a directive
   * naming the question is a script, and §05 and §11 both refuse one.
   */
  it('never authors a question', () => {
    for (const domain of SOFTWARE_PROBE_DOMAINS) {
      for (const level of LEVELS) {
        expect(domain.substance[level], `${domain.id} @ ${level}`).not.toContain('?')
      }
      expect(domain.vagueness, domain.id).not.toContain('?')
      for (const hook of domain.opensFrom) expect(hook, domain.id).not.toContain('?')
    }
  })

  /**
   * The specification's own worked example: *if it is a chat service, ask
   * whether they used WebSockets or REST, then ask them to explain the
   * difference* (§6.2). If nothing in the authored set opens onto that, the
   * feature does not do the thing it was asked for.
   */
  it('opens onto the transport question a chat service raises', () => {
    const transport = SOFTWARE_PROBE_DOMAINS.find((domain) => domain.id === 'transport')
    expect(transport).toBeDefined()
    const hooks = transport!.opensFrom.join(' ').toLowerCase()
    expect(hooks).toContain('chat')
    expect(hooks).toContain('websockets')
    expect(hooks).toContain('rest')
  })
})

describe('software first, and only software (§7.2)', () => {
  it('leaves the other eleven fields exactly as they were', () => {
    for (const field of INTERVIEW_FIELDS) {
      if (field.id === 'software') continue
      expect(probeDomainsFor(field.id), field.id).toHaveLength(0)
      expect(fieldHasProbes(field.id), field.id).toBe(false)
    }
    expect(fieldHasProbes('software')).toBe(true)
    expect(probeDomainsFor(null)).toHaveLength(0)
    expect(probeDomainsFor('astrophysics')).toHaveLength(0)
  })
})

describe('whether the ladder runs at all', () => {
  it('runs on the two rounds that probe, and on no others', () => {
    for (const round of ROUND_TYPES) {
      expect(probeLadderEnabled({ round: round.id, field: 'software' }), round.id)
        .toBe(round.probeShare > 0)
    }
  })

  /**
   * A `deep_technical` round in marketing is a real thing somebody may have
   * bought — the picker offers every round to every field — and running the
   * design ladder with no problem posed would be five directions about a brief
   * that was never given.
   */
  it('refuses a design round in a field with no authored problems', () => {
    expect(probeLadderEnabled({ round: 'deep_technical', field: 'marketing' })).toBe(false)
    expect(probeLadderEnabled({ round: 'technical', field: 'marketing' })).toBe(false)
    expect(probeLadderEnabled({ round: 'deep_technical', field: 'software' })).toBe(true)
  })
})

describe('rendering for the contract', () => {
  it('renders only the level this rep runs at', () => {
    const domains = SOFTWARE_PROBE_DOMAINS.slice(0, 2)
    const junior = renderProbeDomains(domains, 2 as DifficultyLevel)
    const staff = renderProbeDomains(domains, 5 as DifficultyLevel)
    expect(junior).toContain(domains[0]!.substance[2])
    expect(junior).not.toContain(domains[0]!.substance[5])
    expect(staff).toContain(domains[0]!.substance[5])
    expect(staff).not.toContain(domains[0]!.substance[2])
  })

  it('renders nothing at all for a field with nothing authored', () => {
    expect(renderProbeDomains([], 3 as DifficultyLevel)).toBe('')
  })
})
