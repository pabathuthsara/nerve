import 'server-only'

/**
 * The service-role client. **Bypasses RLS entirely.**
 *
 * Three things need it today:
 *
 *   1. appending to usage_ledger — a user who can write their own meter can
 *      bill themselves nothing (§14), so the table grants no insert policy
 *   2. seeding and purging, which act across users by definition
 *   3. the spend ceiling (`lib/db/spend.ts`) — `rate_limits` has no policies at
 *      all and `spend_allowance` is revoked from `authenticated`, because a
 *      limit its subject can read is one they can pace against (B9)
 *
 * Reached from the edge runtime by the two pipeline routes, which is fine:
 * `@supabase/supabase-js` is fetch-based and uses nothing Node-only.
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
