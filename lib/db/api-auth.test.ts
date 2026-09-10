/**
 * The verification cache, and the two properties that make it safe.
 *
 * It exists because `authMs` was a 269ms p50 crossing the Pacific on EVERY turn
 * — fifteen times in a three-minute rep, roughly four seconds of a rep spent
 * re-establishing that a session valid twelve seconds ago is still valid. See
 * the comment on `VERIFIED_TTL_MS`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()

vi.mock('./server', () => ({
  supabaseServer: async () => ({ auth: { getUser } }),
}))

const { __resetAuthCache, requireUser } = await import('./api-auth')

const withCookie = (cookie: string | null): Request =>
  new Request('https://www.hellonerve.com/api/voice/turn', {
    method: 'POST',
    ...(cookie ? { headers: { cookie } } : {}),
  })

const SESSION = 'sb-ujhtzjcwwefqhwlpzhao-auth-token=abc123'
const OTHER = 'sb-ujhtzjcwwefqhwlpzhao-auth-token=zzz999'

beforeEach(() => {
  __resetAuthCache()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('requireUser', () => {
  it('verifies once and reuses it for the rest of the rep', async () => {
    for (let turn = 0; turn < 15; turn += 1) {
      const auth = await requireUser(withCookie(SESSION))
      expect(auth).toEqual({ userId: 'user-a' })
    }
    // Fifteen turns, one hop. This is the whole point.
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('checks again once the window has passed', async () => {
    await requireUser(withCookie(SESSION))
    vi.advanceTimersByTime(60_001)
    await requireUser(withCookie(SESSION))
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('never serves one session from another session\'s entry', async () => {
    // A hash collision here would hand one user another user's id, which is
    // why the key is the whole cookie and not a digest of it.
    await requireUser(withCookie(SESSION))
    getUser.mockResolvedValue({ data: { user: { id: 'user-b' } }, error: null })
    expect(await requireUser(withCookie(OTHER))).toEqual({ userId: 'user-b' })
    expect(await requireUser(withCookie(SESSION))).toEqual({ userId: 'user-a' })
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('never caches a refusal, so a 401 is always a fresh answer', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no' } })
    const first = await requireUser(withCookie(SESSION))
    expect('response' in first && first.response.status).toBe(401)

    // The session becomes valid. The next turn must see that immediately.
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null })
    expect(await requireUser(withCookie(SESSION))).toEqual({ userId: 'user-a' })
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('does not cache an anonymous request at all', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no' } })
    await requireUser(withCookie(null))
    await requireUser(withCookie(null))
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('ignores cookies that are not the session', async () => {
    // A key built from every cookie would miss whenever an analytics cookie
    // rotated, which is a cache that quietly does nothing.
    await requireUser(withCookie(`ph_session=1; ${SESSION}`))
    await requireUser(withCookie(`ph_session=2; ${SESSION}`))
    expect(getUser).toHaveBeenCalledTimes(1)
  })
})
