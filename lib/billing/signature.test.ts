import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOLERANCE_SECONDS,
  SignatureError,
  checkTimestamp,
  normaliseHeaders,
  verifyCreemSignature,
} from './signature'

const BODY = '{"id":"evt_1","type":"subscription.paid","object":{"id":"sub_1"}}'

/** The legacy scheme: hex HMAC over the raw body, secret as UTF-8 bytes. */
async function legacySignature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  return Array.from(signed)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** The Standard Webhooks scheme: base64 HMAC over `id.timestamp.body`. */
async function standardSignature(
  body: string,
  secretBase64: string,
  id: string,
  timestamp: number,
): Promise<string> {
  const keyBytes = Uint8Array.from(atob(secretBase64), (char) => char.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.slice().buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  )
  let binary = ''
  for (const byte of signed) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('the legacy creem-signature scheme', () => {
  it('accepts a body signed with the secret', async () => {
    const signature = await legacySignature(BODY, 'whsec_test')
    await expect(
      verifyCreemSignature(BODY, { 'creem-signature': signature }, { secret: 'whsec_test' }),
    ).resolves.toBeUndefined()
  })

  it('accepts a sha256= prefix and any casing', async () => {
    const signature = await legacySignature(BODY, 'whsec_test')
    await expect(
      verifyCreemSignature(
        BODY,
        { 'creem-signature': `sha256=${signature.toUpperCase()}` },
        { secret: 'whsec_test' },
      ),
    ).resolves.toBeUndefined()
  })

  it('refuses a body that changed by one byte', async () => {
    const signature = await legacySignature(BODY, 'whsec_test')
    const tampered = BODY.replace('sub_1', 'sub_2')
    await expect(
      verifyCreemSignature(tampered, { 'creem-signature': signature }, { secret: 'whsec_test' }),
    ).rejects.toThrow(SignatureError)
  })

  it('refuses a signature made with a different secret', async () => {
    const signature = await legacySignature(BODY, 'someone-elses-secret')
    await expect(
      verifyCreemSignature(BODY, { 'creem-signature': signature }, { secret: 'whsec_test' }),
    ).rejects.toThrow(SignatureError)
  })

  it('refuses a request carrying no signature at all', async () => {
    await expect(verifyCreemSignature(BODY, {}, { secret: 'whsec_test' })).rejects.toThrow(
      'Request carries no webhook signature',
    )
  })
})

describe('the Standard Webhooks scheme', () => {
  // "supersecret" as base64, which is the shape the provider issues.
  const SECRET_BASE64 = btoa('supersecret')
  const NOW = 1_788_178_846_000
  const TIMESTAMP = Math.floor(NOW / 1000)

  it('accepts a correctly signed request', async () => {
    const signature = await standardSignature(BODY, SECRET_BASE64, 'msg_1', TIMESTAMP)
    await expect(
      verifyCreemSignature(
        BODY,
        {
          'webhook-id': 'msg_1',
          'webhook-timestamp': String(TIMESTAMP),
          'webhook-signature': `v1,${signature}`,
        },
        { secret: SECRET_BASE64, now: NOW },
      ),
    ).resolves.toBeUndefined()
  })

  it('strips a whsec_ prefix from the secret', async () => {
    const signature = await standardSignature(BODY, SECRET_BASE64, 'msg_1', TIMESTAMP)
    await expect(
      verifyCreemSignature(
        BODY,
        {
          'webhook-id': 'msg_1',
          'webhook-timestamp': String(TIMESTAMP),
          'webhook-signature': `v1,${signature}`,
        },
        { secret: `whsec_${SECRET_BASE64}`, now: NOW },
      ),
    ).resolves.toBeUndefined()
  })

  it('accepts when one of several rotated signatures matches', async () => {
    const signature = await standardSignature(BODY, SECRET_BASE64, 'msg_1', TIMESTAMP)
    await expect(
      verifyCreemSignature(
        BODY,
        {
          'webhook-id': 'msg_1',
          'webhook-timestamp': String(TIMESTAMP),
          'webhook-signature': `v1,ZmFrZQ== v1,${signature}`,
        },
        { secret: SECRET_BASE64, now: NOW },
      ),
    ).resolves.toBeUndefined()
  })

  it('refuses a replay from outside the tolerance', async () => {
    const stale = TIMESTAMP - DEFAULT_TOLERANCE_SECONDS - 1
    const signature = await standardSignature(BODY, SECRET_BASE64, 'msg_1', stale)
    await expect(
      verifyCreemSignature(
        BODY,
        {
          'webhook-id': 'msg_1',
          'webhook-timestamp': String(stale),
          'webhook-signature': `v1,${signature}`,
        },
        { secret: SECRET_BASE64, now: NOW },
      ),
    ).rejects.toThrow('too old')
  })

  it('does not fall back to the legacy check when a standard signature fails', async () => {
    // The trap this guards: a request that presents standard headers and fails
    // must be refused, not handed a second, easier check to pass.
    const legacy = await legacySignature(BODY, SECRET_BASE64)
    await expect(
      verifyCreemSignature(
        BODY,
        {
          'webhook-id': 'msg_1',
          'webhook-timestamp': String(TIMESTAMP),
          'webhook-signature': 'v1,bm90LXJpZ2h0',
          'creem-signature': legacy,
        },
        { secret: SECRET_BASE64, now: NOW },
      ),
    ).rejects.toThrow('No webhook-signature matched')
  })

  it('refuses an unknown signature version', async () => {
    const signature = await standardSignature(BODY, SECRET_BASE64, 'msg_1', TIMESTAMP)
    await expect(
      verifyCreemSignature(
        BODY,
        {
          'webhook-id': 'msg_1',
          'webhook-timestamp': String(TIMESTAMP),
          'webhook-signature': `v2,${signature}`,
        },
        { secret: SECRET_BASE64, now: NOW },
      ),
    ).rejects.toThrow(SignatureError)
  })
})

describe('checkTimestamp', () => {
  const NOW = 1_788_178_846_000
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
      verifyCreemSignature(BODY, { 'creem-signature': 'anything' }, { secret: '' }),
    ).rejects.toThrow('CREEM_WEBHOOK_SECRET is not set')
  })
})

describe('normaliseHeaders', () => {
  it('lower-cases a plain object', () => {
    expect(normaliseHeaders({ 'Creem-Signature': 'abc' })).toEqual({ 'creem-signature': 'abc' })
  })

  it('reads a Headers instance', () => {
    const headers = new Headers({ 'Creem-Signature': 'abc' })
    expect(normaliseHeaders(headers)).toEqual({ 'creem-signature': 'abc' })
  })
})
