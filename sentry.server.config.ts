/** Sentry, on the server. Off until keyed — see `instrumentation-client.ts`. */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // The routes that spend money are the ones worth a trace at full rate;
    // everything else is a read. `maySpend` already refuses before the spend,
    // so an error here is a real failure rather than a rejected request.
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
  })
}
