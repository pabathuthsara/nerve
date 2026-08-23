'use client'

/**
 * The browser client. Publishable key, RLS enforced, user's own rows only.
 *
 * Memoised: `createBrowserClient` returns a fresh client each call, and two
 * clients in one tab means two auth listeners racing over the same storage.
 */

import { createBrowserClient } from '@supabase/ssr'
import { publicSupabaseEnv } from './env'
import type { Database } from './types'

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function supabaseBrowser() {
  if (client) return client
  const { url, key } = publicSupabaseEnv()
  client = createBrowserClient<Database>(url, key)
  return client
}
