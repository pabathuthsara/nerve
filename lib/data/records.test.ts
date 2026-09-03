import { describe, expect, it } from 'vitest'

import { buildRepRecords, recordLabel } from './records'
import type { Level } from './types'

const roster = [
  { id: 'tess', name: 'Tess', level: 1 as Level, settingShort: 'Bookshop' },
  { id: 'nadia', name: 'Nadia', level: 2 as Level, settingShort: 'Gallery' },
  { id: 'robin', name: 'Robin Whitcombe', level: 4 as Level, settingShort: 'Rooftop' },
]

const rep = (over: Partial<Parameters<typeof buildRepRecords>[1][number]> = {}) => ({
  id: 's1',
  personaId: 'tess',
  startedAt: '2026-09-01T10:00:00.000Z',
  durationMs: 180_000,
  won: true,
  composite: 78,
  wentWell: 'You used the thing she said about the boat.',
  ...over,
})

describe('the contact shelf', () => {
  it('returns every character, so the gaps are visible', () => {
    // The gaps are half of what makes this a collection rather than a badge
    // shelf: you can see the hole where Robin's record is not.
    const records = buildRepRecords(roster, [rep()])
    expect(records.map((entry) => entry.personaId)).toEqual(['tess', 'nadia', 'robin'])
    expect(records[1]?.cleared).toBeNull()
    expect(records[2]?.cleared).toBeNull()
  })

  it('keeps the rep that cleared her, not the best one since', () => {
    // A shelf that swaps in a better rep every time you beat yourself is a
    // leaderboard against yourself, and the date on it stops meaning anything.
    const records = buildRepRecords(roster, [
      rep({ id: 'later', startedAt: '2026-09-05T10:00:00.000Z', composite: 94 }),
      rep({ id: 'first', startedAt: '2026-08-20T10:00:00.000Z', composite: 71 }),
    ])
    expect(records[0]?.cleared?.sessionId).toBe('first')
    expect(records[0]?.cleared?.composite).toBe(71)
  })

  it('ignores a rep that ended in her leaving', () => {
    expect(buildRepRecords(roster, [rep({ won: false })])[0]?.cleared).toBeNull()
  })

  it('drops a line the publish guard refuses, and keeps the record', () => {
    // The direction matters and it is the opposite of a share card's. A card
    // that cannot be made is not made; a record already earned must not vanish
    // because a model wrote an awkward sentence about it.
    const records = buildRepRecords(roster, [rep({ wentWell: 'She gave you her number in the end.' })])
    expect(records[0]?.cleared).not.toBeNull()
    expect(records[0]?.cleared?.wentWell).toBeNull()
  })

  it('keeps an ordinary line', () => {
    expect(buildRepRecords(roster, [rep()])[0]?.cleared?.wentWell)
      .toBe('You used the thing she said about the boat.')
  })

  it('labels a record as a level cleared, never as a trophy', () => {
    expect(recordLabel(2)).toBe('Level 02 cleared')
  })

  it('does not call an empty slot cleared', () => {
    // `LEVEL 01 CLEARED` above the words `Not yet.` is the card contradicting
    // itself, on the one surface whose job is to be an honest record.
    expect(recordLabel(1, false)).toBe('Level 01')
  })
})
