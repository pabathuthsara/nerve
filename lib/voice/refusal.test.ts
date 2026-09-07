/**
 * A refusal is not a failed connection.
 *
 * Measured on 7 September: an account holding one screener credit and nothing
 * else started a recruiter screen, `/api/voice/token` answered **402** three
 * times, and the screen said *"Connection lost"* with a Retry button that could
 * never succeed and an End button that did nothing. Every one of those three is
 * a separate defect and this file covers the first.
 */

import { describe, expect, it } from 'vitest'
import { mintRefusal } from './refusal'
import { VoiceError } from './types'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('reading what the route said', () => {
  it('reads a credits refusal as a refusal, in the route’s own words', async () => {
    const error = await mintRefusal(
      json(402, { error: 'You have no interview credits left.', refusal: 'credits' }),
      'elevenlabs',
    )
    expect(error).toBeInstanceOf(VoiceError)
    expect(error.code).toBe('refused')
    // The ROUTE's sentence, not one invented here: only it knows whether this
    // was credits, the daily quota or the spend ceiling, and each one sends
    // somebody somewhere different.
    expect(error.message).toBe('You have no interview credits left.')
  })

  it('covers every status the route says no with on purpose', async () => {
    for (const status of [401, 402, 403, 429]) {
      const error = await mintRefusal(json(status, { error: 'no' }), 'openai')
      expect(error.code, String(status)).toBe('refused')
    }
  })

  it('leaves a real failure a failure, so it can still be retried', async () => {
    for (const status of [500, 502, 503]) {
      const error = await mintRefusal(json(status, { error: 'upstream' }), 'openai')
      expect(error.code, String(status)).toBe('token_mint_failed')
      expect(error.message, String(status)).toContain(String(status))
    }
  })

  it('still refuses when the body cannot be read', async () => {
    // A 402 with an unparseable body is a 402. Falling back to a network fault
    // would put the Retry button back on a screen that cannot use one.
    const error = await mintRefusal(new Response('<html>', { status: 402 }), 'elevenlabs')
    expect(error.code).toBe('refused')
    expect(error.message).toBe('This rep cannot start right now.')
  })

  it('trusts an explicit refusal flag over the status', async () => {
    const error = await mintRefusal(json(400, { error: 'Nope.', refusal: 'credits' }), 'elevenlabs')
    expect(error.code).toBe('refused')
  })

  it('carries the provider through, so the incident says which arm', async () => {
    expect((await mintRefusal(json(402, {}), 'elevenlabs')).provider).toBe('elevenlabs')
    expect((await mintRefusal(json(402, {}), 'openai')).provider).toBe('openai')
  })
})
