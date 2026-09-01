/**
 * Next's server entry point, which is where Sentry has to be initialised for
 * the server and edge runtimes (`LAUNCH-GAP.md` B7).
 *
 * Both configs are no-ops without a DSN, so this import costs nothing until
 * somebody sets one.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config')
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config')
}

export { captureRequestError as onRequestError } from '@sentry/nextjs'
