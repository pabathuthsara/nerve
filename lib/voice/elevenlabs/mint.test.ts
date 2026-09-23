import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintElevenLabsSession, mintScribeToken, readSubscription } from './mint'
import { getPersona } from '@/lib/personas'
import { DEFAULT_CALIBRATION, type Persona } from '../types'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the transcription credential', () => {
  const tess = getPersona('tess') as Persona
  const OPENAI_SECRETS = 'https://api.openai.com/v1/realtime/client_secrets'
  const SCRIBE_TOKENS = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe'

  /** Every vendor the mint may call, answering as it really does. */
  function vendors() {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === OPENAI_SECRETS) return Response.json({ value: 'ek_openai_fixture' })
      // The shape read off a real response on 23 September 2026.
      if (url === SCRIBE_TOKENS) return Response.json({ token: 'sutkn_fixture00000000000000000000' })
      return Response.json({ character_count: 140, character_limit: 10_000 })
    })
    vi.stubGlobal('fetch', fetchImpl)
    return fetchImpl
  }
  const mint = (stt: string | undefined) => mintElevenLabsSession(tess, DEFAULT_CALIBRATION, {
    elevenLabsApiKey: `standing-eleven-${stt ?? 'default'}`, openAiApiKey: 'standing-openai',
    pipeline: stt === undefined ? {} : { PIPELINE_STT_MODEL: stt },
  })

  it('mints exactly what it always did for every OpenAI transcriber', async () => {
    for (const model of [undefined, 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe']) {
      const fetchImpl = vendors()
      const minted = await mint(model)
      // The pre-Scribe shape, key for key and in order: no `stt` member at all,
      // so an OpenAI rep serialises to the bytes it did before this existed.
      expect(Object.keys(minted)).toEqual(['provider', 'clientSecret', 'model', 'rate', 'pipeline', 'credits'])
      expect(minted.clientSecret).toBe('ek_openai_fixture')
      expect(minted.pipeline.stt).toEqual({ model: model ?? 'gpt-4o-mini-transcribe', sampleRate: 24_000 })
      const urls = fetchImpl.mock.calls.map(([url]) => url)
      expect(urls).toContain(OPENAI_SECRETS)
      expect(urls).not.toContain(SCRIBE_TOKENS)
      vi.unstubAllGlobals()
    }
  })

  it('mints one Scribe token and no OpenAI secret when Scribe transcribes', async () => {
    const fetchImpl = vendors()
    const minted = await mint('scribe_v2_realtime')
    expect(minted.stt).toEqual({ vendor: 'elevenlabs', model: 'scribe_v2_realtime', token: 'sutkn_fixture00000000000000000000' })
    // No OpenAI transcription session exists for this rep, so no secret for one.
    expect(minted.clientSecret).toBe('')
    expect(minted.pipeline.stt).toEqual({ model: 'scribe_v2_realtime', sampleRate: 24_000 })
    const urls = fetchImpl.mock.calls.map(([url]) => url)
    expect(urls).not.toContain(OPENAI_SECRETS)
    const tokenCall = fetchImpl.mock.calls.find(([url]) => url === SCRIBE_TOKENS)
    expect(tokenCall?.[1]).toMatchObject({ method: 'POST', headers: { 'xi-api-key': 'standing-eleven-scribe_v2_realtime' } })
    // The standing key is spent on the server and goes no further.
    expect(JSON.stringify(minted)).not.toContain('standing-')
  })

  it('refuses the rep rather than starting one that cannot hear him', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"invalid_api_key"}', { status: 401 })))
    await expect(mintScribeToken('bad-key')).rejects.toMatchObject({
      code: 'token_mint_failed', provider: 'elevenlabs', message: expect.stringContaining('(401)'),
    })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ token: '' })))
    await expect(mintScribeToken('key')).rejects.toMatchObject({ code: 'token_mint_failed' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(mintScribeToken('key')).rejects.toMatchObject({
      code: 'token_mint_failed', message: 'Could not reach the transcription mint.',
    })
  })

  it('bounds a mint that never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })))
    const minted = mintScribeToken('slow-key')
    const refused = expect(minted).rejects.toMatchObject({ code: 'token_mint_failed' })
    await vi.advanceTimersByTimeAsync(10_000)
    await refused
  })
})

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
