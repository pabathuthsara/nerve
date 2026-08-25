import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_CHARS,
  MAX_THREAD_TURNS,
  appendTurn,
  historyFrom,
  readMessage,
  readTurns,
  type TextTurn,
} from './thread'

const turn = (speaker: TextTurn['speaker'], text: string, at = '2026-08-25T10:00:00.000Z'): TextTurn =>
  ({ speaker, text, at })

describe('readMessage', () => {
  it('trims and accepts', () => {
    expect(readMessage('  hello  ')).toEqual({ ok: true, text: 'hello' })
  })

  it('refuses an empty message rather than sending whitespace', () => {
    expect(readMessage('   ')).toMatchObject({ ok: false, reason: 'empty' })
    expect(readMessage(null)).toMatchObject({ ok: false, reason: 'empty' })
    expect(readMessage(42)).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('refuses rather than truncates — half a sentence is worse than none', () => {
    const long = 'a'.repeat(MAX_MESSAGE_CHARS + 1)
    const verdict = readMessage(long)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('too-long')
  })

  it('accepts exactly the limit', () => {
    expect(readMessage('a'.repeat(MAX_MESSAGE_CHARS)).ok).toBe(true)
  })
})

describe('appendTurn', () => {
  it('adds to the end', () => {
    const thread = appendTurn([turn('user', 'one')], turn('persona', 'two'))
    expect(thread.map((entry) => entry.text)).toEqual(['one', 'two'])
  })

  it('keeps the thread inside its window, dropping the oldest', () => {
    const long = Array.from({ length: MAX_THREAD_TURNS }, (_, index) => turn('user', `m${index}`))
    const rolled = appendTurn(long, turn('persona', 'newest'))
    expect(rolled).toHaveLength(MAX_THREAD_TURNS)
    expect(rolled[0]?.text).toBe('m1')
    expect(rolled[rolled.length - 1]?.text).toBe('newest')
  })
})

describe('readTurns', () => {
  it('reads a stored array', () => {
    expect(readTurns([{ speaker: 'user', text: 'hi', at: 'x' }])).toEqual([
      { speaker: 'user', text: 'hi', at: 'x' },
    ])
  })

  it('is empty for anything that is not an array', () => {
    expect(readTurns(null)).toEqual([])
    expect(readTurns({})).toEqual([])
    expect(readTurns('turns')).toEqual([])
  })

  it('drops malformed entries rather than throwing on them', () => {
    const stored = [
      { speaker: 'user', text: 'kept', at: 'x' },
      { speaker: 'nobody', text: 'wrong speaker', at: 'x' },
      { speaker: 'persona', text: '   ', at: 'x' },
      { speaker: 'persona', text: 42, at: 'x' },
      null,
      'not an object',
      { speaker: 'persona', text: 'also kept' },
    ]
    expect(readTurns(stored).map((entry) => entry.text)).toEqual(['kept', 'also kept'])
  })

  it('supplies a timestamp when the stored row has none', () => {
    const [only] = readTurns([{ speaker: 'user', text: 'hi' }])
    expect(typeof only?.at).toBe('string')
  })

  it('never returns more than the thread window, however long the column is', () => {
    const stored = Array.from({ length: MAX_THREAD_TURNS * 3 }, (_, index) => ({
      speaker: 'user', text: `m${index}`, at: 'x',
    }))
    expect(readTurns(stored)).toHaveLength(MAX_THREAD_TURNS)
  })
})

describe('historyFrom', () => {
  it('maps our speakers onto chat roles', () => {
    expect(historyFrom([turn('user', 'hi'), turn('persona', 'hello')])).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('shows the model only the newest window', () => {
    const long = Array.from({ length: MAX_HISTORY_TURNS + 10 }, (_, index) => turn('user', `m${index}`))
    const history = historyFrom(long)
    expect(history).toHaveLength(MAX_HISTORY_TURNS)
    expect(history[0]?.content).toBe('m10')
  })
})
