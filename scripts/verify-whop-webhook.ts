/**
 * The webhook route itself, over HTTP (docs/PAYMENTS-WHOP.md §8, T1/T8/T10).
 *
 *   npm run whop:probe                       # against a local dev server
 *   npm run whop:probe -- --url https://…    # against a deployment
 *
 * `db:billing` proves everything from `applyBillingEvent` inwards. `whop:verify`
 * proves the vendor account is configured. Neither touches the route, and the
 * route is where three of the four things that can go wrong actually live: the
 * HMAC over the raw bytes, the account check, and the status code each failure
 * returns. A 4xx where a 5xx belongs loses the event; a 5xx where a 4xx belongs
 * has Whop redeliver an unverifiable request twelve times over three days.
 *
 * It signs its own deliveries, so it needs no Whop account and no tunnel — only
 * the same `WHOP_WEBHOOK_SECRET` and `WHOP_ACCOUNT_ID` the target is running
 * with. Nothing it sends can grant a plan: the payloads carry a `user_id` that
 * belongs to nobody, so the apply reports "no account" and moves nothing. That
 * is deliberate — this script must be safe to point at production.
 *
 * Locally:
 *
 *   WHOP_WEBHOOK_SECRET=ws_… WHOP_ACCOUNT_ID=biz_… npm run dev
 *   npm run whop:probe
 */

let failures = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function hmacBase64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
  let binary = ''
  for (const byte of signed) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const target = (argValue('--url') ?? 'http://localhost:3000').replace(/\/+$/, '')
  const secret = process.env['WHOP_WEBHOOK_SECRET']?.trim() ?? ''
  const account = process.env['WHOP_ACCOUNT_ID']?.trim() ?? ''

  console.log(`\nWhop webhook route — ${target}/api/webhooks/whop\n`)

  if (!secret || !account) {
    console.error('Need WHOP_WEBHOOK_SECRET and WHOP_ACCOUNT_ID, matching what the target is running with.\n')
    process.exit(1)
  }

  /** Signs and delivers one request, and reports the status it came back with. */
  const deliver = async (
    body: string,
    options: { id?: string; timestamp?: number; signature?: string } = {},
  ): Promise<{ status: number; text: string }> => {
    const id = options.id ?? `msg_probe_${Math.random().toString(36).slice(2)}`
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000)
    const signature = options.signature ?? `v1,${await hmacBase64(secret, `${id}.${timestamp}.${body}`)}`
    const response = await fetch(`${target}/api/webhooks/whop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': signature,
      },
      body,
    })
    return { status: response.status, text: (await response.text()).slice(0, 120) }
  }

  /**
   * A membership that belongs to nobody.
   *
   * The `user_id` is all zeroes on purpose: it parses, it reaches
   * `applyBillingEvent`, and it resolves to no account — so the route answers
   * 200 with `handled: false` and writes nothing. Safe to fire at production.
   */
  const membership = (over: Record<string, unknown> = {}) => JSON.stringify({
    id: 'msg_probe',
    type: 'membership.activated',
    api_version: 'v1',
    timestamp: new Date().toISOString(),
    account_id: account,
    data: {
      id: 'mem_probe',
      status: 'trialing',
      metadata: { user_id: '00000000-0000-4000-8000-000000000000' },
      plan: { id: 'plan_probe' },
      product: { id: 'prod_probe' },
      user: { id: 'user_probe' },
      cancel_at_period_end: false,
      renewal_period_end: '2099-01-01T00:00:00.000Z',
      ...over,
    },
  })

  const body = membership()

  console.log('a delivery that should be accepted')
  const good = await deliver(body)
  check(good.status === 200, `a correctly signed event is accepted (${good.status} ${good.text})`)

  console.log('\ndeliveries that should be refused — 401, so Whop stops retrying')
  const tampered = await deliver(body.replace('mem_probe', 'mem_other'), {
    signature: `v1,${await hmacBase64(secret, `x.1.${body}`)}`,
  })
  check(tampered.status === 401, `a body changed after signing (${tampered.status})`)

  const wrongSecret = await deliver(body, {
    signature: `v1,${await hmacBase64('ws_not_the_secret', 'a.b.c')}`,
  })
  check(wrongSecret.status === 401, `a signature made with another secret (${wrongSecret.status})`)

  // Whop's own replay window. Refusing a stale timestamp is what stops a
  // captured delivery being replayed at us tomorrow.
  const stale = await deliver(body, { timestamp: Math.floor(Date.now() / 1000) - 400 })
  check(stale.status === 401, `a timestamp outside the five-minute window (${stale.status})`)

  console.log('\ndeliveries that should be acknowledged and ignored — 200, no retry')
  const foreign = await deliver(JSON.stringify({ ...JSON.parse(body), account_id: 'biz_somebody_else' }))
  check(foreign.status === 200 && /account/.test(foreign.text),
    `an event for another Whop account (${foreign.status} ${foreign.text})`)

  const unknown = await deliver(JSON.stringify({ ...JSON.parse(body), type: 'chat.message.created' }))
  check(unknown.status === 200 && /ignored/.test(unknown.text),
    `an event type we do not act on (${unknown.status} ${unknown.text})`)

  console.log('\na signed but broken body')
  const malformed = await deliver('{not json')
  check(malformed.status === 400, `is a 400 rather than a retry loop (${malformed.status})`)

  console.log(`\n${failures} failed.`)
  if (failures > 0) {
    console.log('The webhook route is NOT behaving correctly.\n')
    process.exit(1)
  }
  console.log('The route verifies, refuses and acknowledges correctly.\n')
}

void main()
