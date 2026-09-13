import { describe, expect, it } from 'vitest'
import { capTextingReply, UNSTEERED_TEXTING_WORDS } from './reply'

function words(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

describe('the newline is a message boundary', () => {
  /**
   * THE HOLE THE AUDITION FOUND. The warm bands ask for no terminal full stop,
   * so her reply often has no sentence boundary at all — and `capToBudget`
   * always keeps one whole sentence. The ceiling was unenforceable at exactly
   * the bands that ask for the punctuation that breaks it.
   */
  it('drops the second line when the budget cannot hold it', () => {
    // The measured case: a seventeen-word reply against a fourteen-word cap,
    // reported as `capped: false` because it contained no sentence boundary.
    const raw = 'mostly new stuff old ones are slow and frustrating\nthat old factory renovation was something else though'
    const capped = capTextingReply(raw, 14, 2)
    expect(capped).not.toContain('factory')
    expect(words(capped)).toBeLessThan(words(raw))
  })

  it('does not split a single line mid-sentence, even over the cap', () => {
    // INHERITED FROM `capToBudget` ON PURPOSE. A ceiling on how much she piles
    // on, not a shredder — a reply cut off mid-clause is worse than a long one,
    // and this is the one case the wrapper deliberately does not tighten. What
    // it fixes is the SECOND line, which is where the budget actually ran away.
    const oneLine = 'mostly new stuff old ones are slow and frustrating'
    expect(capTextingReply(oneLine, 8, 2)).toBe(oneLine)
  })

  it('keeps both lines when they fit', () => {
    const raw = 'yeah\nsame here'
    expect(capTextingReply(raw, 14, 2)).toBe('yeah\nsame here')
  })

  it('never produces silence, even from one long line', () => {
    // The same rule `capToBudget` holds: a low band must not be able to empty
    // her reply, because a blank message is a bug and a short one is a person.
    const raw = 'this is a single long line with no punctuation anywhere in it at all'
    expect(capTextingReply(raw, 2, 1).length).toBeGreaterThan(0)
  })

  it('an empty generation stays empty rather than becoming a space', () => {
    expect(capTextingReply('   \n  \n ', 14, 2)).toBe('')
  })

  it('respects the sentence ceiling inside a line', () => {
    const raw = 'Marketing. Sounds busy, yeah. I keep numbers, not stories.'
    expect(capTextingReply(raw, 20, 1).split(/(?<=[.!?])\s+/)).toHaveLength(1)
  })

  it('the unsteered ceiling is generous but finite', () => {
    // Her last message is the one the thread ends on, so a band she was not
    // given must not truncate it — but a runaway still has to stop somewhere.
    expect(UNSTEERED_TEXTING_WORDS).toBeGreaterThan(24)
    expect(UNSTEERED_TEXTING_WORDS).toBeLessThan(60)
  })
})
