/**
 * A CV file name that cannot escape the user's own folder.
 *
 * Its own module rather than a helper inside `app/interview/actions.ts`,
 * because **every export of a `'use server'` file is a Server Action** — a pure
 * string function living there would be published as a callable endpoint, and
 * Next refuses to build it. A rule enforced by the compiler is the best kind.
 *
 * The first path segment of a `cv` bucket key is the RLS key, so a name
 * containing a slash or `..` would be a name pointing at somebody else's CV.
 * Rebuilt rather than sanitised: anything not on the allowlist simply is not
 * carried through, which is the only version of this that cannot be argued
 * with by a cleverer input.
 */

export function safeFileName(name: string): string | null {
  const lower = name.toLowerCase()
  const extension = lower.endsWith('.pdf') ? '.pdf' : lower.endsWith('.docx') ? '.docx' : null
  if (!extension) return null
  const base = name
    .slice(0, name.length - extension.length)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60)
  return `${base || 'cv'}${extension}`
}

