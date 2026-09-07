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

/**
 * Prints the most recent REAL delivery of an event type, verbatim.
 *
 *   npm run whop:probe -- --capture payment.succeeded
 *
 * ── WHY THIS IS PART OF THE WEBHOOK SCRIPT ──────────────────────────────
 *
 * Rule 14, and `lib/billing/events.ts` is the scar: Whop's OpenAPI spec
 * documents `membership.*` with nested objects and it sends flat ids, and
 * building from the spec alone put a paying customer on Pro with no charge
 * date. The fix was to pin what Whop actually sent — which meant somebody
 * finding the payload by hand, once, after the damage.
 *
 * Whop stores the request body of every delivery for a fortnight. So this is
 * the one command that turns "read one real payload before trusting the
 * schema" from a discipline into a step: run it, paste the result into
 * `events.test.ts`, and the next integration starts from the wire rather than
 * from the documentation.
 *
 * It is what INTERVIEW-PLAN D2 asks for on the day the first pack is really
 * bought. Trim the payment-instrument icons before pinning; nothing reads them.
 */
async function capture(event: string): Promise<void> {
  const key = process.env['WHOP_API_KEY']?.trim()
  const account = process.env['WHOP_ACCOUNT_ID']?.trim()
  const base = (process.env['WHOP_API_BASE']?.trim() || 'https://api.whop.com/api/v1').replace(/\/+$/, '')
  const version = process.env['WHOP_API_VERSION_DATE']?.trim()
  if (!key || !account) {
    console.error('Need WHOP_API_KEY and WHOP_ACCOUNT_ID to read deliveries.\n')
    process.exit(1)
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${key}`,
    ...(version ? { 'api-version-date': version } : {}),
  }

  const hooks = await fetch(`${base}/webhooks?account_id=${encodeURIComponent(account)}&first=10`, { headers })
  const { data: list = [] } = (await hooks.json()) as { data?: { id: string; url: string }[] }
  if (list.length === 0) {
    console.error('No webhooks on this account.\n')
    process.exit(1)
  }

  for (const hook of list) {
    const response = await fetch(
      `${base}/webhooks/${encodeURIComponent(hook.id)}/deliveries?first=50`,
      { headers },
    )
    if (!response.ok) continue
    const { data: deliveries = [] } = (await response.json()) as {
      data?: { event: string | null; sent_at: string; request_body: unknown; response_code: number }[]
    }
    const match = deliveries.find((delivery) => delivery.event === event)
    if (!match) continue
    console.log(`\n${event} — ${hook.id}, sent ${match.sent_at}, answered ${match.response_code}\n`)
    console.log(JSON.stringify(match.request_body, null, 2))
    console.log('\nPin it in lib/billing/events.test.ts, trimmed of fields nothing reads.\n')
    return
  }

  console.error(`\nNo delivery of ${event} in the last 50 on any webhook.\n`)
  process.exit(1)
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const captureEvent = argValue('--capture')
  if (captureEvent) return capture(captureEvent)

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

  /**
   * A pack purchase that belongs to nobody (INTERVIEW-PLAN D3).
   *
   * The plan id is the REAL one from the environment, so this proves the thing
   * a fixture cannot: that the deployed route resolves `WHOP_PACK_FIVE` through
   * `configuredPackMap()` and takes the pack branch rather than the
   * subscription one. The user is all zeroes, so it resolves to no account and
   * writes nothing — safe to fire at production, like the membership above.
   *
   * The shape is the captured `payment.succeeded` of 2 September with the plan
   * swapped: `data` IS the payment, the membership hangs off it, and the plan
   * is a nested object with its own metadata. See `events.test.ts`.
   *
   * **It carries no `metadata.user_id` at all**, unlike the membership probe
   * above, and that is the difference between a safe probe and a destructive
   * one. An all-zero UUID is a valid id that resolves to a real code path and
   * then fails on the foreign key — which now, correctly, asks Whop to
   * redeliver. No metadata means `resolveUserId` finds nobody and the route
   * declines to credit anyone, which is the thing this probe is asserting.
   */
  const packPurchase = () => JSON.stringify({
    id: 'msg_probe_pack',
    type: 'payment.succeeded',
    api_version: 'v1',
    timestamp: new Date().toISOString(),
    account_id: account,
    data: {
      id: 'pay_probe',
      status: 'paid',
      billing_reason: 'one_time',
      membership: { id: 'mem_probe_pack', status: 'completed' },
      plan: { id: process.env['WHOP_PACK_FIVE']?.trim() ?? 'plan_probe_pack', metadata: { nerve_pack: 'pack5' } },
      product: { id: 'prod_probe' },
      user: { id: 'user_probe' },
      total: '29.0',
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

  console.log('\na pack purchase, through the real plan id')
  const pack = await deliver(packPurchase())
  check(pack.status === 200, `a one-time pack payment is accepted (${pack.status} ${pack.text})`)
  // `handled: false` is the CORRECT answer here and the point of the probe:
  // the route recognised the pack, went looking for the account the all-zero
  // metadata names, found none, and declined to credit anybody. A `handled:
  // true` would mean it had credited a user id that does not exist.
  check(/handled":false/.test(pack.text.replace(/\s/g, '')),
    'and credits nobody, because the buyer resolves to no account')

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
