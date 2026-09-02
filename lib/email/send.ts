import 'server-only'

/**
 * Transactional email, or nothing at all.
 *
 * The same shape PostHog and Sentry have in this codebase: **no key means no
 * send, and that is a supported configuration rather than a broken one.** In
 * development, in CI and in any deployment without `RESEND_API_KEY`, every call
 * here is a logged no-op. Nothing throws and nothing retries.
 *
 * That default matters more than usual for this particular sender, because the
 * one message it carries goes out on a webhook. An email provider having a bad
 * afternoon must never turn a billing event into a 500 and a redelivery — the
 * plan has already moved by then, and Whop would send the event twelve more
 * times over three days, which is twelve more chances to send a duplicate.
 *
 * So every failure here is swallowed and logged, and the caller is told what
 * happened rather than made to handle it.
 */

const ENDPOINT = 'https://api.resend.com/emails'

/**
 * Who the mail comes from, and where a reply goes.
 *
 * **`hellonerve.com`, the apex.** The first version of this said
 * `send.hellonerve.com`, taken from a line in `PAYMENTS-APPROVAL.md`'s log that
 * was either stale or describing a plan that changed. That subdomain is not
 * verified on the Resend account; the apex is. Resend refuses to send from an
 * unverified domain, `sendEmail` swallows the failure by design, and the result
 * was a webhook that answered 200 and an email that never existed.
 *
 * That is the exact failure mode this whole message exists to prevent, so the
 * sender is now checked in `npm run whop:verify` against the domains Resend
 * says are verified — a silent non-send becomes a preflight failure.
 *
 * Replies go to the support inbox rather than into a void, because this email
 * asks somebody about money and some of them will answer it.
 */
export const FROM = 'Nerve <nerve@hellonerve.com>'
const REPLY_TO = 'support@hellonerve.com'

export interface SendResult {
  ok: boolean
  /** What happened, for the log. Never shown to anybody. */
  detail: string
}

export async function sendEmail(options: {
  to: string
  subject: string
  body: string
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    return { ok: false, detail: 'RESEND_API_KEY is unset, so no mail was sent' }
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: [options.to],
        subject: options.subject,
        text: options.body,
      }),
    })

    if (!response.ok) {
      // The provider's message can name an address, so it goes to the log.
      return { ok: false, detail: `resend refused it: ${response.status} ${await response.text()}` }
    }

    return { ok: true, detail: 'sent' }
  } catch (error) {
    return { ok: false, detail: `resend was unreachable: ${String(error)}` }
  }
}
