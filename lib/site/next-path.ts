/**
 * Where a redirect is allowed to land after an auth hop.
 *
 * `/auth/callback` takes `?next=` from a URL that was last touched by Google,
 * then by Supabase, then by whoever wrote the link — so it is the definition
 * of untrusted input arriving at the one route whose job is to send a
 * freshly-authenticated browser somewhere.
 *
 * Pure and tested rather than inline in the route, because the interesting
 * cases are all strings that LOOK fine. `//evil.com` starts with a slash and
 * passes the obvious check; concatenated onto an origin it produces
 * `https://www.hellonerve.com//evil.com`, which every browser reads as
 * protocol-relative and follows to another host. The second slash is the
 * whole attack, and a test is the only thing that keeps the next person from
 * "simplifying" this back to `startsWith('/')`.
 *
 * Backslash is refused beside it: some browsers normalise `\` to `/` before
 * parsing an authority, so `/\evil.com` is the same trick with a different
 * key.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}
