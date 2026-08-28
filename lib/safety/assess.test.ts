/**
 * The server half: what gets written, and what happens when the classifier is
 * not there.
 *
 * The failing-open decision is the most consequential line in `assess.ts` and
 * the one somebody will eventually want to reverse. It is asserted here with
 * the reasoning attached: a classifier having a bad minute must not cut off
 * every live conversation in the product, because §05 does not allow anything
 * to interrupt a rep and because a safety layer that reads as "the thing that
 * breaks reps" is a safety layer that gets switched off.
 *
 * The second half is the record. §16.3 says events are logged, and a
 * merchant-of-record review asks to see that the controls fired — so what the
 * row contains, and what it deliberately does not, is a test rather than a
 * comment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface Row { kind: string; detail: Record<string, unknown> }

/** Rows already on the record, and rows written during a test. */
let existing: Row[] = []
let written: { user_id: string; session_id: string | null; kind: string; detail: Record<string, unknown> }[] = []

vi.mock('@/lib/db/admin', () => ({
  supabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: async () => ({ data: existing }),
        insert: async (row: (typeof written)[number]) => { written.push(row); return { error: null } },
      }
      return chain
    },
  }),
}))

const { assessTurn } = await import('./assess')

/** A moderation response the endpoint would actually return. */
function response(categories: Record<string, boolean>, scores: Record<string, number>) {
  return new Response(
    JSON.stringify({ results: [{ flagged: Object.values(categories).some(Boolean), categories, category_scores: scores }] }),
    { status: 200 },
  )
}

const clean = () => response({ sexual: false }, { sexual: 0.01 })
const explicit = () => response({ sexual: true }, { sexual: 0.95 })

const input = { userId: 'u_1', sessionId: null, scope: 'rep:u_1', speaker: 'user' as const, text: 'hello' }

beforeEach(() => {
  existing = []
  written = []
  vi.stubEnv('OPENAI_API_KEY', 'sk-test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('a clean turn', () => {
  it('passes and writes nothing', async () => {
    vi.stubGlobal('fetch', async () => clean())
    expect(await assessTurn(input)).toEqual({ verdict: 'ok', action: 'none' })
    expect(written).toEqual([])
  })

  it('does not call the classifier on an empty turn', async () => {
    const upstream = vi.fn(async () => clean())
    vi.stubGlobal('fetch', upstream)
    await assessTurn({ ...input, text: '   ' })
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('failing open', () => {
  it('passes the turn when the classifier is unreachable', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline') })
    // The alternative ends every live rep in the product because a third party
    // had a bad minute. See the header.
    expect(await assessTurn(input)).toEqual({ verdict: 'ok', action: 'none' })
  })

  it('passes the turn when the classifier errors', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }))
    expect(await assessTurn(input)).toEqual({ verdict: 'ok', action: 'none' })
  })

  it('passes the turn when there is no key configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const upstream = vi.fn(async () => clean())
    vi.stubGlobal('fetch', upstream)
    expect(await assessTurn(input)).toEqual({ verdict: 'ok', action: 'none' })
    expect(upstream).not.toHaveBeenCalled()
  })

  it('passes the turn when the response is not what we expect', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"unexpected":true}', { status: 200 }))
    expect(await assessTurn(input)).toEqual({ verdict: 'ok', action: 'none' })
  })
})

describe('a turn that crosses the line', () => {
  beforeEach(() => { vi.stubGlobal('fetch', async () => explicit()) })

  it('is declined in frame the first time', async () => {
    expect(await assessTurn(input)).toEqual({ verdict: 'boundary', action: 'decline' })
  })

  it('ends the rep when a strike is already on the record', async () => {
    existing = [{ kind: 'boundary', detail: { scope: 'rep:u_1', speaker: 'user' } }]
    expect(await assessTurn(input)).toEqual({ verdict: 'boundary', action: 'end' })
  })

  it('counts strikes only within its own scope', async () => {
    // A strike from a different rep, or a different text thread, is not this
    // conversation's second chance.
    existing = [{ kind: 'boundary', detail: { scope: 'text:nadia', speaker: 'user' } }]
    expect(await assessTurn(input)).toEqual({ verdict: 'boundary', action: 'decline' })
  })

  it('treats an unreadable history as a first strike', async () => {
    // Assuming the worst would end a rep because a query timed out.
    existing = [{ kind: 'boundary', detail: {} }]
    expect(await assessTurn(input)).toEqual({ verdict: 'boundary', action: 'decline' })
  })
})

describe('the record', () => {
  beforeEach(() => { vi.stubGlobal('fetch', async () => explicit()) })

  it('writes one row, with the decision on it', async () => {
    await assessTurn({ ...input, sessionId: 'abc', scope: 'abc' })
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      user_id: 'u_1',
      session_id: 'abc',
      kind: 'boundary',
    })
    expect(written[0]?.detail).toMatchObject({
      scope: 'abc',
      speaker: 'user',
      verdict: 'boundary',
      action: 'decline',
      categories: ['sexual'],
    })
  })

  it('never writes the turn', async () => {
    // The migration's rule: never the audio, and never more of the text than
    // the decision needed — and the decision needed none of it.
    await assessTurn({ ...input, text: 'the exact words somebody said' })
    expect(JSON.stringify(written)).not.toContain('the exact words')
  })

  it('records a flag that fell under our own floors', async () => {
    // The provider flagged it, we did not act. Written down so the gap between
    // their threshold and ours is a number somebody can look at.
    vi.stubGlobal('fetch', async () => response({ sexual: true }, { sexual: 0.3 }))
    expect(await assessTurn(input)).toEqual({ verdict: 'ok', action: 'none' })
    expect(written).toHaveLength(1)
    expect(written[0]?.kind).toBe('moderation')
  })
})

describe('distress', () => {
  it('drops the frame and is recorded as its own kind', async () => {
    vi.stubGlobal('fetch', async () => response({ 'self-harm/intent': true }, { 'self-harm/intent': 0.9 }))
    expect(await assessTurn(input)).toEqual({ verdict: 'distress', action: 'distress' })
    expect(written[0]?.kind).toBe('distress')
  })
})
