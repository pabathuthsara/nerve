/**
 * Every route that spends money refuses an anonymous caller.
 *
 * Six route handlers shipped without an auth check. All six are called from
 * `/rep`, which already redirects an anonymous visitor to `/auth`, so the
 * protection lived entirely in the fact that nobody had guessed the paths.
 * `/api/voice/token` was the worst of them: it hands back a credential worth an
 * eight-minute Realtime session on our account.
 *
 * This suite is written against the ROUTES rather than the helper, because the
 * failure mode is a handler forgetting to call the helper — which a test of the
 * helper alone cannot see. It asserts the refusal happens before any upstream
 * call, so a 401 can never be reached by way of a paid request.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Nobody is signed in. */
const anonymous = {
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
}
/** Somebody is. */
const signedIn = {
  auth: {
    async getUser() {
      return { data: { user: { id: 'u_1' } }, error: null }
    },
  },
}

let session: typeof anonymous | typeof signedIn = anonymous

/** The daily quota, as the token route sees it. */
let quota: { ok: boolean; message: string | null } = { ok: true, message: null }

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/server', () => ({
  supabaseServer: async () => session,
}))
vi.mock('@/lib/db/progress', () => ({
  mayOpenSession: async () => quota,
}))

/** Any upstream call at all is a failure when the caller is anonymous. */
const upstream = vi.fn(async () => new Response('{}', { status: 200 }))

beforeEach(() => {
  session = anonymous
  quota = { ok: true, message: null }
  upstream.mockClear()
  vi.stubGlobal('fetch', upstream)
  vi.stubEnv('OPENAI_API_KEY', 'sk-test')
  vi.stubEnv('ELEVENLABS_API_KEY', 'el-test')
  vi.stubEnv('INTERNAL_API_SECRET', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const ROUTES: {
  name: string
  load: () => Promise<{ POST?: Function; GET?: Function }>
  call: (mod: { POST?: Function; GET?: Function }, request: Request) => Promise<Response>
  request: () => Request
}[] = [
  {
    name: '/api/grade',
    load: () => import('./grade/route'),
    call: (m, r) => m.POST!(r),
    request: () =>
      post('http://t/api/grade', {
        transcript: [{ speaker: 'user', text: 'Hello.', t_start: 0, t_end: 1 }],
        sessionSeconds: 60,
      }),
  },
  {
    name: '/api/warmth/score',
    load: () => import('./warmth/score/route'),
    call: (m, r) => m.POST!(r),
    request: () => post('http://t/api/warmth/score', { userText: 'Hello.', warmth: 30 }),
  },
  {
    name: '/api/voice/token',
    load: () => import('./voice/token/route'),
    call: (m, r) => m.POST!(r),
    request: () => post('http://t/api/voice/token', { personaId: 'nadia' }),
  },
  {
    name: '/api/voice/llm',
    load: () => import('./voice/llm/route'),
    call: (m, r) => m.POST!(r),
    request: () => post('http://t/api/voice/llm', { messages: [] }),
  },
  {
    name: '/api/voice/tts',
    load: () => import('./voice/tts/route'),
    call: (m, r) => m.POST!(r),
    request: () => post('http://t/api/voice/tts', { text: 'hello' }),
  },
  {
    name: '/api/voice/credits',
    load: () => import('./voice/credits/route'),
    call: (m, r) => m.GET!(r),
    request: () => new Request('http://t/api/voice/credits'),
  },
]

describe.each(ROUTES)('$name', ({ load, call, request }) => {
  it('refuses an anonymous caller with 401', async () => {
    const mod = await load()
    const response = await call(mod, request())
    expect(response.status).toBe(401)
  })

  it('spends nothing before refusing', async () => {
    // The assertion that matters. A route that called upstream and THEN checked
    // auth would still return 401 and still cost money on every probe.
    const mod = await load()
    await call(mod, request())
    expect(upstream).not.toHaveBeenCalled()
  })

  it('does not say which half of the check failed', async () => {
    const mod = await load()
    const response = await call(mod, request())
    const body = (await response.json()) as { error?: string }
    expect(body.error).toBe('unauthorised')
  })

  it('lets a signed-in caller through the gate', async () => {
    session = signedIn
    const mod = await load()
    const response = await call(mod, request())
    // What happens past the gate is each route's own business — it may still
    // 400 on a thin fixture body. It must not be 401.
    expect(response.status).not.toBe(401)
  })
})

describe('/api/voice/token and the daily quota', () => {
  it('refuses a signed-in caller who has no reps left, with 429', async () => {
    session = signedIn
    quota = { ok: false, message: 'You are out of reps for today.' }
    const { POST } = await import('./voice/token/route')
    const response = await POST(post('http://t/api/voice/token', { personaId: 'nadia' }))
    expect(response.status).toBe(429)
  })

  it('mints nothing when the quota is spent', async () => {
    // Same rule as the 401: the meter is only a meter if the refusal happens
    // before the credential is bought (§14).
    session = signedIn
    quota = { ok: false, message: 'You are out of reps for today.' }
    const { POST } = await import('./voice/token/route')
    await POST(post('http://t/api/voice/token', { personaId: 'nadia' }))
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('the machine bypass', () => {
  it('does not exist when INTERNAL_API_SECRET is unset', async () => {
    const { POST } = await import('./warmth/score/route')
    const response = await POST(
      post('http://t/api/warmth/score', { userText: 'Hi.' }, { authorization: 'Bearer ' }),
    )
    expect(response.status).toBe(401)
  })

  it('rejects a wrong secret', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'right')
    const { POST } = await import('./warmth/score/route')
    const response = await POST(
      post('http://t/api/warmth/score', { userText: 'Hi.' }, { authorization: 'Bearer wrong' }),
    )
    expect(response.status).toBe(401)
  })

  it('admits the calibration harness when the secret matches', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'right')
    const { POST } = await import('./warmth/score/route')
    const response = await POST(
      post('http://t/api/warmth/score', { userText: 'Hi.' }, { authorization: 'Bearer right' }),
    )
    expect(response.status).not.toBe(401)
  })
})
