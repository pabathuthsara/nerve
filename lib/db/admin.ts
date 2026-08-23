import 'server-only'

/**
 * The service-role client. **Bypasses RLS entirely.**
 *
 * Exactly two things need it today:
 *
 *   1. appending to usage_ledger — a user who can write their own meter can
 *      bill themselves nothing (§14), so the table grants no insert policy
 *   2. seeding and purging, which act across users by definition
 *
 * Never construct this in anything reachable from a client component, and
 * never pass its results through unfiltered. `server-only` makes the first
 * mistake a build error; the second is on us.
 */

import { createClient } from '@supabase/supabase-js'
import { publicSupabaseEnv, secretSupabaseKey } from './env'
import type { Database } from './types'

export function supabaseAdmin() {
  const { url } = publicSupabaseEnv()
  return createClient<Database>(url, secretSupabaseKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
