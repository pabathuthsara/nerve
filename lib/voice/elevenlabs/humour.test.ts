/**
 * The humour check (PERSONA-REALISM-REPORT R3, 5.4): a permitted laugh ships
 * only on a line that was meant to be funny, and every failure is "not funny".
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HUMOUR_MODEL, humourBound, humourCost, judgeHumour } from './humour'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const reply = (content: string) => Response.json({
  choices: [{ message: { content } }], usage: { prompt_tokens: 90, completion_tokens: 1 },
})

describe('judgeHumour', () => {
  it('reads Y as funny and anything else as not', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const fetch = vi.fn(async () => reply('Y'))
    vi.stubGlobal('fetch', fetch)
    expect(await judgeHumour({ his: 'I only read the last page first.', herPrior: 'Crime, mostly.' }, new AbortController().signal))
      .toEqual({ funny: true, usage: { input: 90, output: 1, cachedInput: 0 } })
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).toMatchObject({ model: HUMOUR_MODEL, max_tokens: 1, temperature: 0 })
    vi.stubGlobal('fetch', vi.fn(async () => reply('N')))
    expect((await judgeHumour({ his: 'What do you read?', herPrior: null }, new AbortController().signal)).funny).toBe(false)
  })

  it('fails closed on an error, a refusal, a missing key or an empty line', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect((await judgeHumour({ his: 'A joke.', herPrior: null }, new AbortController().signal)).funny).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    expect((await judgeHumour({ his: 'A joke.', herPrior: null }, new AbortController().signal)).funny).toBe(false)
    expect((await judgeHumour({ his: '   ', herPrior: null }, new AbortController().signal)).funny).toBe(false)
    vi.stubEnv('OPENAI_API_KEY', '')
    expect((await judgeHumour({ his: 'A joke.', herPrior: null }, new AbortController().signal)).funny).toBe(false)
  })

  it('is priced from its receipt, and at its bound when it never answered', () => {
    expect(humourCost(null)).toBe(0)
    expect(humourCost({ funny: false, usage: null })).toBe(humourBound())
    expect(humourCost({ funny: true, usage: { input: 90, output: 1, cachedInput: 0 } })).toBeLessThan(humourBound())
    expect(humourBound()).toBeLessThan(0.0002)
  })
})
