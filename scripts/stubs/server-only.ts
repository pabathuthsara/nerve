/**
 * `server-only` outside a bundler.
 *
 * The real package throws on import so that a server module can never end up
 * in a client bundle — the guarantee that keeps `SUPABASE_SECRET_KEY` out of
 * the browser. That guarantee is enforced by the Next build, which is where a
 * client import would actually be a breach.
 *
 * Vitest and the `scripts/` harnesses are neither a browser nor a bundle, and
 * `npm run db:rep` has to be able to call the same quota and progression code
 * the Server Actions call — testing a copy of it would test nothing. So the
 * module resolves to this file there, and only there.
 */
export {}
