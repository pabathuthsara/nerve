import 'server-only'

/**
 * The server client — RSC, route handlers and Server Actions.
 *
 * Still the publishable key: this runs as the signed-in user and RLS applies
 * exactly as it does in the browser. Use `supabaseAdmin()` only where a write
 * must not be forgeable by the user it belongs to.
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { publicSupabaseEnv } from './env'
import type { Database } from './types'

export async function supabaseServer() {
  const store = await cookies()
  const { url, key } = publicSupabaseEnv()

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to swallow —
          // and it is the documented shape of this integration.
        }
      },
    },
  })
}

/**
 * The signed-in user, or null. Uses getUser() rather than getSession():
 * getSession() reads the cookie without contacting the auth server, so it can
 * return a user object the server has already revoked.
 */
export async function currentUser() {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}
