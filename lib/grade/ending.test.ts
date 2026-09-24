import { describe, expect, it } from 'vitest'
import { ENDING_WITHHELD, withEndingWithheld } from './ending'
import type { TranscriptTurn } from '@/lib/voice/types'

const t = (speaker: 'user' | 'agent', text: string, at: number): TranscriptTurn => ({ speaker, text, t_start: at, t_end: at + 1 })

describe('withEndingWithheld (S1, rule 2)', () => {
  const body = [t('user', 'Hi.', 0), t('agent', 'Hey.', 1), t('user', 'Good talking to you, can I get your number?', 170)]

  it('makes the offer and the refusal the same page', () => {
    const offer = withEndingWithheld([...body, t('agent', 'Sure. Message me, I have to go.', 172)])
    const leave = withEndingWithheld([...body, t('agent', 'I should get going. Take care.', 172)])
    expect(offer).toEqual(leave)
    expect(offer[offer.length - 1]!.text).toBe(ENDING_WITHHELD)
  })

  it('keeps every signal before his last line, and collapses a two-turn ending into one marker', () => {
    const out = withEndingWithheld([...body, t('agent', 'Sure.', 172), t('agent', 'Bye.', 175)])
    expect(out.slice(0, 3)).toEqual(body)
    expect(out).toHaveLength(4)
    expect(out[3]!.t_end).toBe(176)
  })

  it('changes nothing when she never answered his last line', () => {
    expect(withEndingWithheld(body)).toEqual(body)
    expect(withEndingWithheld([t('agent', 'Hey.', 0)])).toEqual([t('agent', 'Hey.', 0)])
  })
})
