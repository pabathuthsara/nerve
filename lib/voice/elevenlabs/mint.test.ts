import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSubscription } from './mint'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('advisory subscription startup check', () => {
  it('shares in-flight checks and caches successful account counters briefly', async () => {
    const fetchImpl = vi.fn(async (_url: string) => Response.json({ character_count: 140, character_limit: 10_000 }))
    vi.stubGlobal('fetch', fetchImpl)
    const [first, second] = await Promise.all([readSubscription('cache-key'), readSubscription('cache-key')])
    expect(first).toEqual({ used: 140, limit: 10_000 })
    expect(second).toEqual(first)
    expect(await readSubscription('cache-key')).toEqual(first)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.elevenlabs.io/v1/user/subscription')
  })

  it('does not let a hung status request hold up startup', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    vi.stubGlobal('fetch', fetchImpl)
    const result = readSubscription('slow-key')
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual({ used: null, limit: null })
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('also bounds a response whose headers arrive but whose JSON body stalls', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream())))
    const result = readSubscription('body-timeout-key')
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual({ used: null, limit: null })
  })

  it('does not turn an unavailable account counter into a zero balance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    expect(await readSubscription('outage-key')).toEqual({ used: null, limit: null })
  })
})
