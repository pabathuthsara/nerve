import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The point of this file is the call count.
 *
 * `getUser()` is a network round-trip, and the bug it is guarding against was
 * six of them per screen — invisible in development against a warm connection,
 * and the difference between a page that loads and a page of skeletons on a
 * slow one. A test that only checked "returns the user" would have passed
 * before the fix as happily as after it.
 */

let getUser: ReturnType<typeof vi.fn>
let onAuthStateChange: ReturnType<typeof vi.fn>
let authCallback: ((event: string) => void) | null

vi.mock('@/lib/db/client', () => ({
  supabaseBrowser: () => ({ auth: { getUser, onAuthStateChange } }),
}))

const ALICE = { id: 'user-1', email: 'a@example.com' }

async function freshModule() {
  vi.resetModules()
  return import('./session')
}

beforeEach(() => {
  authCallback = null
  getUser = vi.fn(async () => ({ data: { user: ALICE }, error: null }))
  onAuthStateChange = vi.fn((callback: (event: string) => void) => {
    authCallback = callback
    return { data: { subscription: { unsubscribe: () => undefined } } }
  })
})

describe('currentUser', () => {
  it('asks the auth server once, however many reads want the answer', async () => {
    const { currentUser } = await freshModule()

    const answers = await Promise.all([currentUser(), currentUser(), currentUser(), currentUser(), currentUser(), currentUser()])

    expect(getUser).toHaveBeenCalledTimes(1)
    expect(answers.every((user) => user?.id === 'user-1')).toBe(true)
  })

  it('does not ask again on a later read', async () => {
    const { currentUser } = await freshModule()

    await currentUser()
    await currentUser()

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('reports who is asking', async () => {
    const { currentUser, sessionStatus } = await freshModule()

    expect(sessionStatus()).toBe('unknown')
    await currentUser()
    expect(sessionStatus()).toBe('signed-in')
  })
})

describe('when there is no session', () => {
  it('reads an auth error as signed out rather than broken', async () => {
    getUser = vi.fn(async () => ({ data: { user: null }, error: { message: 'Auth session missing!' } }))
    const { currentUser, sessionStatus } = await freshModule()

    expect(await currentUser()).toBeNull()
    expect(sessionStatus()).toBe('signed-out')
  })

  it('reads a missing user with no error as signed out', async () => {
    getUser = vi.fn(async () => ({ data: { user: null }, error: null }))
    const { currentUser, sessionStatus } = await freshModule()

    expect(await currentUser()).toBeNull()
    expect(sessionStatus()).toBe('signed-out')
  })
})

describe('when the auth server cannot be reached', () => {
  it('is unavailable, not signed out — nobody gets bounced to login over a dropped connection', async () => {
    getUser = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const { currentUser, sessionStatus } = await freshModule()

    expect(await currentUser()).toBeNull()
    expect(sessionStatus()).toBe('unavailable')
  })

  it('retries on the next read rather than remembering a verdict it never reached', async () => {
    getUser = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const { currentUser } = await freshModule()

    await currentUser()
    await currentUser()

    expect(getUser).toHaveBeenCalledTimes(2)
  })
})

describe('the memo is dropped when the identity changes', () => {
  it('re-asks after a sign-in', async () => {
    const { currentUser } = await freshModule()
    await currentUser()

    authCallback?.('SIGNED_IN')
    await currentUser()

    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('re-asks after a sign-out', async () => {
    const { currentUser } = await freshModule()
    await currentUser()

    authCallback?.('SIGNED_OUT')
    await currentUser()

    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('does not re-ask on a token refresh, which is the same person', async () => {
    const { currentUser } = await freshModule()
    await currentUser()

    authCallback?.('TOKEN_REFRESHED')
    await currentUser()

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('does not re-ask on the initial-session event, which describes the read already in flight', async () => {
    const { currentUser } = await freshModule()
    await currentUser()

    authCallback?.('INITIAL_SESSION')
    await currentUser()

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('forgetting the user forces the next read to ask again', async () => {
    const { currentUser, forgetCurrentUser, sessionStatus } = await freshModule()
    await currentUser()

    forgetCurrentUser()
    expect(sessionStatus()).toBe('unknown')
    await currentUser()

    expect(getUser).toHaveBeenCalledTimes(2)
  })
})
