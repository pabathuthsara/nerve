import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOLERANCE_SECONDS,
  SignatureError,
  checkTimestamp,
  keyBytes,
  normaliseHeaders,
  verifyWhopSignature,
} from './signature'

const BODY = '{"id":"msg_1","type":"membership.activated","data":{"id":"mem_1"}}'

/** A `ws_` secret, which is what Whop actually issues. */
const WS_SECRET = 'ws_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

/**
 * The Standard Webhooks scheme, signed the way Whop documents it: HMAC-SHA256
 * over `id.timestamp.body`, keyed on the secret's own bytes, result base64.
 */
async function sign(
  body: string,
  secret: string,
  id: string,
  timestamp: number,
  key = keyBytes(secret),
): Promise<string> {
  const imported = await crypto.subtle.importKey(
    'raw',
    key.slice().buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(
    await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  )
  let binary = ''
  for (const byte of signed) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const NOW = 1_788_178_846_000
const TIMESTAMP = Math.floor(NOW / 1000)

function headersFor(signature: string, id = 'msg_1', timestamp = TIMESTAMP) {
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  }
}

describe('how the ws_ secret becomes key bytes', () => {
  it('uses the whole string, prefix included', async () => {
    // This was the one genuinely unknown thing about the migration. Whop's
    // documentation is explicit — "the key is your `ws_...` secret", passed
    // exactly as given, prefix kept and not base64-decoded — and Standard
    // Webhooks' own convention is the opposite, so it is asserted here rather
    // than left to a comment.
    expect(keyBytes(WS_SECRET)).toEqual(new TextEncoder().encode(WS_SECRET))
  })

  it('base64-decodes a whsec_ secret instead, chosen by the prefix', () => {
    // Selected by the secret's own shape, never tried as a fallback: exactly
    // one derivation is attempted per secret, so a failing signature never gets
    // a second, easier check to pass.
    expect(keyBytes(`whsec_${btoa('supersecret')}`)).toEqual(new TextEncoder().encode('supersecret'))
  })
})

describe('verifyWhopSignature', () => {
  it('accepts a correctly signed request', async () => {
    const signature = await sign(BODY, WS_SECRET, 'msg_1', TIMESTAMP)
    await expect(
      verifyWhopSignature(BODY, headersFor(signature), { secret: WS_SECRET, now: NOW }),
    ).resolves.toBeUndefined()
  })

  it('refuses a body that changed by one byte', async () => {
    const signature = await sign(BODY, WS_SECRET, 'msg_1', TIMESTAMP)
    const tampered = BODY.replace('mem_1', 'mem_2')
    await expect(
      verifyWhopSignature(tampered, headersFor(signature), { secret: WS_SECRET, now: NOW }),
    ).rejects.toThrow(SignatureError)
  })

  it('refuses a signature made with a different secret', async () => {
    const signature = await sign(BODY, 'ws_someone_elses', 'msg_1', TIMESTAMP)
    await expect(
      verifyWhopSignature(BODY, headersFor(signature), { secret: WS_SECRET, now: NOW }),
    ).rejects.toThrow(SignatureError)
  })

  it('refuses a signature over a different webhook-id', async () => {
    // The id is part of the signed string, so a replayed body under a fresh id
    // does not verify.
    const signature = await sign(BODY, WS_SECRET, 'msg_1', TIMESTAMP)
    await expect(
      verifyWhopSignature(BODY, headersFor(signature, 'msg_2'), { secret: WS_SECRET, now: NOW }),
    ).rejects.toThrow('No webhook-signature matched')
  })

  it('accepts when one of several rotated signatures matches', async () => {
    const signature = await sign(BODY, WS_SECRET, 'msg_1', TIMESTAMP)
    await expect(
      verifyWhopSignature(
        BODY,
        { ...headersFor(signature), 'webhook-signature': `v1,ZmFrZQ== v1,${signature}` },
        { secret: WS_SECRET, now: NOW },
      ),
    ).resolves.toBeUndefined()
  })

  it('refuses a replay from outside the tolerance', async () => {
    const stale = TIMESTAMP - DEFAULT_TOLERANCE_SECONDS - 1
    const signature = await sign(BODY, WS_SECRET, 'msg_1', stale)
    await expect(
      verifyWhopSignature(BODY, headersFor(signature, 'msg_1', stale), { secret: WS_SECRET, now: NOW }),
    ).rejects.toThrow('too old')
  })

  it('refuses an unknown signature version', async () => {
    const signature = await sign(BODY, WS_SECRET, 'msg_1', TIMESTAMP)
    await expect(
      verifyWhopSignature(
        BODY,
        { ...headersFor(signature), 'webhook-signature': `v2,${signature}` },
        { secret: WS_SECRET, now: NOW },
      ),
    ).rejects.toThrow(SignatureError)
  })

  it('refuses a request carrying no signature headers at all', async () => {
    // There is no second scheme to fall through to. Creem's bare
    // `creem-signature` header went with Creem, and an accepted fallback is an
    // accepted weakness.
    await expect(verifyWhopSignature(BODY, {}, { secret: WS_SECRET })).rejects.toThrow(
      'Request carries no webhook signature',
    )
    await expect(
      verifyWhopSignature(BODY, { 'creem-signature': 'abc' }, { secret: WS_SECRET }),
    ).rejects.toThrow('Request carries no webhook signature')
  })

  it('refuses a request missing only the timestamp', async () => {
    const signature = await sign(BODY, WS_SECRET, 'msg_1', TIMESTAMP)
    await expect(
      verifyWhopSignature(
        BODY,
        { 'webhook-id': 'msg_1', 'webhook-signature': `v1,${signature}` },
        { secret: WS_SECRET, now: NOW },
      ),
    ).rejects.toThrow('Request carries no webhook signature')
  })
})

describe('checkTimestamp', () => {
  const SECONDS = Math.floor(NOW / 1000)

  it('accepts a timestamp inside the window', () => {
    expect(checkTimestamp(String(SECONDS - 10), NOW)).toBe(SECONDS - 10)
  })

  it('refuses one that is too old', () => {
    expect(() => checkTimestamp(String(SECONDS - 301), NOW)).toThrow('too old')
  })

  it('refuses one from the future, because a bad clock breaks the old check too', () => {
    expect(() => checkTimestamp(String(SECONDS + 301), NOW)).toThrow('future')
  })

  it('refuses one that is not a number', () => {
    expect(() => checkTimestamp('tuesday', NOW)).toThrow('not a number')
  })
})

describe('an unset secret', () => {
  it('refuses rather than verifying nothing', async () => {
    await expect(
      verifyWhopSignature(BODY, headersFor('anything'), { secret: '' }),
    ).rejects.toThrow('WHOP_WEBHOOK_SECRET is not set')
  })
})

describe('normaliseHeaders', () => {
  it('lower-cases a plain object', () => {
    expect(normaliseHeaders({ 'Webhook-Id': 'msg_1' })).toEqual({ 'webhook-id': 'msg_1' })
  })

  it('reads a Headers instance', () => {
    expect(normaliseHeaders(new Headers({ 'Webhook-Id': 'msg_1' }))).toEqual({ 'webhook-id': 'msg_1' })
  })
})
