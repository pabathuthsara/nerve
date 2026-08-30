/**
 * The paste-back.
 *
 * What matters here is that the output is source somebody can drop into a
 * persona file without cleaning it up first — so the assertions are about
 * shape and about the one thing that reliably goes wrong when numbers become
 * text, which is floating point arriving as `0.30000000000000004` in a file
 * that gets reviewed by eye.
 *
 * Every assertion below reads the dial off the persona rather than restating
 * the number it currently holds. That is not looseness, it is the point: this
 * module exists so a character can be retuned, and a test that hard-codes
 * `expression: 'dry'` breaks the moment somebody does the exact thing the
 * module is for. The shape is what is under test; the value is Nadia's, and
 * hers to change.
 */

import { describe, expect, it } from 'vitest'
import { changedDials, dialsToSource, type PersonaDials } from './export'
import { getPersona } from '@/lib/personas'

function dialsOf(slug: string): PersonaDials {
  const persona = getPersona(slug)
  if (!persona) throw new Error(`no persona ${slug}`)
  return {
    trajectory: persona.trajectory,
    personality: persona.personality,
    gated: persona.gated,
    room: persona.room,
  }
}

describe('dialsToSource', () => {
  const source = dialsToSource(dialsOf('nadia'))

  it('emits all four layers', () => {
    expect(source).toContain('trajectory: {')
    expect(source).toContain('personality: {')
    expect(source).toContain('gated: {')
    expect(source).toContain('room: {')
  })

  it('writes the gates the way the files already write them', () => {
    // One line per gate, braces inline — the shape `lib/personas/*.ts` uses,
    // so the output pastes in without being reformatted first.
    const { ceiling, unlocksAt } = dialsOf('nadia').gated.flirtiness
    expect(source).toContain(`flirtiness: { ceiling: ${ceiling}, unlocksAt: ${unlocksAt} },`)
  })

  it('quotes strings and leaves null alone', () => {
    const { expression } = dialsOf('nadia').personality
    expect(source).toContain(`expression: '${expression}',`)
    expect(source).toContain('bed: null,')
  })

  it('keeps arrays inline', () => {
    expect(source).toContain('oneShotIntervalMs: [20000, 40000],')
  })

  it('never emits floating point noise', () => {
    // 0.1 + 0.2 arithmetic on a 0.05 slider step is how a reviewed file ends
    // up with a twenty-digit number in it.
    const noisy = dialsOf('nadia')
    const source = dialsToSource({ ...noisy, trajectory: { ...noisy.trajectory, gain: 0.1 + 0.2 } })
    expect(source).toContain('gain: 0.3,')
    expect(source).not.toMatch(/\d\.\d{6,}/)
  })

  it('leaves the prose out', () => {
    // The contract, the want and the beats are hand-authored. Regenerating
    // them from a form is how authored copy quietly stops being authored.
    expect(source).not.toContain('contract')
    expect(source).not.toContain('want:')
    expect(source).not.toContain('sceneBeats')
  })
})

describe('changedDials', () => {
  it('finds nothing when nothing moved', () => {
    expect(changedDials(dialsOf('nadia'), dialsOf('nadia'))).toEqual([])
  })

  it('names the path that moved', () => {
    // Moved off the value on file rather than to a literal, so this stays a
    // test of the diff and not of what Nadia's ceiling happens to be today.
    const base = dialsOf('nadia')
    const flirtiness = { ...base.gated.flirtiness, ceiling: base.gated.flirtiness.ceiling - 5 }
    const next = { ...base, gated: { ...base.gated, flirtiness } }
    expect(changedDials(base, next)).toEqual(['gated.flirtiness.ceiling'])
  })

  it('finds more than one', () => {
    const base = dialsOf('nadia')
    const next = {
      ...base,
      personality: { ...base.personality, sharpness: 44, humour: 10 },
    }
    expect(changedDials(base, next)).toEqual(['personality.sharpness', 'personality.humour'])
  })
})
