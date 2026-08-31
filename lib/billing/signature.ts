/**
 * Webhook signature verification for the merchant of record (§14).
 *
 * Implemented here rather than imported from the provider's SDK, for the same
 * reason §14 keeps the provider identifiers abstract: every merchant of record
 * on the shortlist bans dating products by name, being declined by one is a
 * live possibility, and the replacement should cost an adapter rather than a
 * rewrite. It is an HMAC and forty lines — an SDK dependency buys nothing here
 * and would put a provider import in the app layer.
 *
 * Two schemes are in the wild and Creem sends whichever the endpoint was
 * registered under, so both are accepted:
 *
 *   standard  the Standard Webhooks spec — `webhook-id`, `webhook-timestamp`
 *             and `webhook-signature` headers, signing `id.timestamp.body`
 *             with the base64 secret, compared base64. Carries a timestamp,
 *             so it is also replay-resistant.
 *   legacy    a bare `creem-signature` header: hex HMAC over the raw body,
 *             secret used as UTF-8 bytes. No timestamp, so no replay window.
 *
 * The standard scheme is tried first and only falls through to legacy when its
 * headers are absent — a request that carries standard headers and fails is a
 * failure, never a chance to try an easier check.
 *
 * **The body must be the raw bytes as received.** `await request.text()`, never
 * `JSON.stringify(await request.json())`: a re-serialised object differs from
 * the signed bytes in key order and whitespace, and every signature fails.
 */

/** The default replay window, matching the provider's own client. */
export const DEFAULT_TOLERANCE_SECONDS = 5 * 60

export class SignatureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureError'
  }
}

/**
 * Compares two byte strings without leaking where they first differ.
 *
 * Length is compared first and returns early, which does leak length — that is
 * true of the provider's own implementation and harmless here, because the
 * length of an HMAC digest is fixed and public.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    // Fail closed. An environment without Web Crypto cannot verify anything,
    // and an unverified billing webhook is an open endpoint that grants plans.
    throw new SignatureError('Web Crypto is unavailable, so nothing can be verified')
  }
  const imported = await subtle.importKey(
    'raw',
    key.slice().buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await subtle.sign('HMAC', imported, new TextEncoder().encode(message))
  return new Uint8Array(signed)
}

/** Lower-cases header names so a lookup does not depend on the runtime's casing. */
export function normaliseHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value
    })
    return out
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value
  }
  return out
}

/**
 * Rejects a timestamp outside the tolerance in either direction.
 *
 * Too old is a replay. Too new is a clock that disagrees badly enough that the
 * "too old" check would not fire when it should, so it is refused rather than
 * trusted.
 */
export function checkTimestamp(
  header: string,
  now: number,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): number {
  const timestamp = Number.parseInt(header, 10)
  if (Number.isNaN(timestamp)) {
    throw new SignatureError('Webhook timestamp is not a number')
  }
  const seconds = Math.floor(now / 1000)
  if (seconds - timestamp > toleranceSeconds) {
    throw new SignatureError('Webhook timestamp is too old')
  }
  if (timestamp - seconds > toleranceSeconds) {
    throw new SignatureError('Webhook timestamp is from the future')
  }
  return timestamp
}

export interface VerifyOptions {
  secret: string
  /** Injectable so the replay window is testable without faking the clock. */
  now?: number
  toleranceSeconds?: number
}

/**
 * Throws unless the body was signed with the secret. Returns nothing on
 * success: there is no "probably fine" return value to accidentally ignore.
 */
export async function verifyCreemSignature(
  rawBody: string,
  headers: Headers | Record<string, string>,
  { secret, now = Date.now(), toleranceSeconds = DEFAULT_TOLERANCE_SECONDS }: VerifyOptions,
): Promise<void> {
  if (!secret) {
    throw new SignatureError('CREEM_WEBHOOK_SECRET is not set, so nothing can be verified')
  }

  const head = normaliseHeaders(headers)
  const id = head['webhook-id']
  const timestampHeader = head['webhook-timestamp']
  const signatureHeader = head['webhook-signature']

  if (id && timestampHeader && signatureHeader) {
    const timestamp = checkTimestamp(timestampHeader, now, toleranceSeconds)
    const keyText = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
    const expected = toBase64(await hmacSha256(fromBase64(keyText), `${id}.${timestamp}.${rawBody}`))

    // The header carries space-separated versioned signatures so a secret can
    // be rotated with both live at once. Any v1 that matches is a pass.
    for (const versioned of signatureHeader.split(' ')) {
      const [version, candidate] = versioned.split(',')
      if (version === 'v1' && candidate && constantTimeEqual(candidate, expected)) return
    }
    throw new SignatureError('No webhook-signature matched')
  }

  const legacy = head['creem-signature'] ?? head['x-creem-signature']
  if (!legacy) {
    throw new SignatureError('Request carries no webhook signature')
  }

  const trimmed = legacy.trim()
  const offered = (trimmed.startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed)
    .toLowerCase()
  const expected = toHex(await hmacSha256(new TextEncoder().encode(secret), rawBody))
  if (!constantTimeEqual(offered, expected)) {
    throw new SignatureError('creem-signature did not match')
  }
}
