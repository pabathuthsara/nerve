/**
 * Editing a persona file without damaging it.
 *
 * The assertion that matters most here is the negative one: the comments
 * survive. Nadia's `room` block explains in four lines why her ambient bed is
 * null, and a "save" that regenerated the block would delete the reason and
 * invite somebody to reintroduce the bug it describes.
 *
 * Run against the real file rather than a fixture, on purpose. A fixture would
 * assert that this works on source shaped the way the test author imagined,
 * which is exactly the thing that stops being true.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyDialEdits, editsBetween } from './patch'

const NADIA = readFileSync(new URL('../personas/nadia.ts', import.meta.url), 'utf8')

describe('applyDialEdits', () => {
  it('rewrites one number on its own line', () => {
    const { source, applied, missed } = applyDialEdits(NADIA, [{ path: 'personality.sharpness', value: 44 }])
    expect(applied).toEqual(['personality.sharpness'])
    expect(missed).toEqual([])
    expect(source).toContain('sharpness: 44,')
    expect(source).not.toContain('sharpness: 20,')
  })

  it('leaves the neighbouring dials alone', () => {
    // Asserted as a diff rather than as three remembered numbers. A tuning
    // pass moves those numbers — that is what this module is for — and a test
    // that restates them fails on the exact change it exists to support. The
    // claim is that ONE line moved, which is both stronger and durable.
    const { source } = applyDialEdits(NADIA, [{ path: 'personality.sharpness', value: 44 }])
    const before = NADIA.split('\n')
    const after = source.split('\n')
    expect(after).toHaveLength(before.length)
    const moved = before.flatMap((line, index) => (line === after[index] ? [] : [index]))
    expect(moved).toHaveLength(1)
    expect(after[moved[0] as number]).toContain('sharpness: 44,')
  })

  it('rewrites one field inside a gate without touching the other', () => {
    // Both fields live on one line, so the risk is rewriting the line rather
    // than the field. `unlocksAt` is read off the file instead of restated,
    // so this keeps testing that it survived rather than what it happens to be.
    const unlocksAt = /flirtiness: \{ ceiling: \d+, unlocksAt: (\d+) \}/.exec(NADIA)?.[1]
    expect(unlocksAt).toBeDefined()
    const { source, applied } = applyDialEdits(NADIA, [{ path: 'gated.flirtiness.ceiling', value: 80 }])
    expect(applied).toEqual(['gated.flirtiness.ceiling'])
    expect(source).toContain(`flirtiness: { ceiling: 80, unlocksAt: ${unlocksAt} },`)
  })

  it('applies several edits in the same layer', () => {
    const { source, applied } = applyDialEdits(NADIA, [
      { path: 'gated.flirtiness.ceiling', value: 80 },
      { path: 'gated.flirtiness.unlocksAt', value: 26 },
      { path: 'gated.personalDisclosure.ceiling', value: 96 },
    ])
    expect(applied).toHaveLength(3)
    expect(source).toContain('flirtiness: { ceiling: 80, unlocksAt: 26 },')
    expect(source).toContain('personalDisclosure: { ceiling: 96, unlocksAt: 40 },')
  })

  it('keeps the hand-written comments', () => {
    // The whole reason this edits instead of regenerating.
    const { source } = applyDialEdits(NADIA, [
      { path: 'room.bedDb', value: -35 },
      { path: 'personality.humour', value: 12 },
    ])
    expect(source).toContain('// Off. The synthesised bed and its one-shots were audible to the')
    expect(source).toContain('// LAYER 2 — who she is. None of this moves with warmth.')
    expect(source).toContain('bed: null,')
    expect(source).toContain('bedDb: -35,')
  })

  it('never touches the prose', () => {
    const { source } = applyDialEdits(NADIA, [{ path: 'personality.sharpness', value: 1 }])
    expect(source).toContain('const CONTRACT = `# Who you are')
    expect(source).toContain("want: 'left alone with the shelf you are halfway through',")
    expect(source).toContain('sceneBeats: [')
  })

  it('handles a string and a float', () => {
    const { source } = applyDialEdits(NADIA, [
      { path: 'personality.expression', value: 'playful' },
      { path: 'trajectory.gain', value: 0.1 + 0.2 },
    ])
    expect(source).toContain("expression: 'playful',")
    expect(source).toContain('gain: 0.3,')
  })

  it('reports a path the file does not have instead of guessing', () => {
    const { applied, missed, source } = applyDialEdits(NADIA, [{ path: 'personality.charisma', value: 9 }])
    expect(applied).toEqual([])
    expect(missed).toEqual(['personality.charisma'])
    expect(source).toBe(NADIA)
  })

  it('refuses a path outside the four layers', () => {
    // `contract` and `want` are prose and are not addressable from here.
    for (const path of ['contract', 'want', 'sceneBeats.0.at', 'voice.pace']) {
      const { applied, missed } = applyDialEdits(NADIA, [{ path, value: 1 }])
      expect(applied).toEqual([])
      expect(missed).toEqual([path])
    }
  })

  it('changes nothing when given nothing', () => {
    expect(applyDialEdits(NADIA, []).source).toBe(NADIA)
  })
})

describe('editsBetween', () => {
  it('returns the path and the new value together', () => {
    const base = { personality: { sharpness: 20, humour: 60 } }
    const next = { personality: { sharpness: 44, humour: 60 } }
    expect(editsBetween(base, next)).toEqual([{ path: 'personality.sharpness', value: 44 }])
  })

  it('finds nested gate fields', () => {
    const base = { gated: { flirtiness: { ceiling: 60, unlocksAt: 55 } } }
    const next = { gated: { flirtiness: { ceiling: 60, unlocksAt: 26 } } }
    expect(editsBetween(base, next)).toEqual([{ path: 'gated.flirtiness.unlocksAt', value: 26 }])
  })
})
