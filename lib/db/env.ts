/**
 * Supabase environment, read in one place and validated loudly.
 *
 * A missing key here fails at the first call site with a message naming the
 * variable, rather than surfacing as a 401 from PostgREST three layers down.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    )
  }
  return value
}

/** Safe in the browser. */
export function publicSupabaseEnv(): { url: string; key: string } {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    key: required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  }
}

/**
 * Server only. This key bypasses RLS, so every module that imports it carries
 * `import 'server-only'` — a leak into a client bundle is a full data breach,
 * not a bug.
 */
export function secretSupabaseKey(): string {
  return required('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY)
}
