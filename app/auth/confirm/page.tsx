/**
 * Where every sign-in link lands, in all three shapes it can take.
 *
 *   ?code=…                     PKCE, from a template using token_hash and
 *                               from OAuth. Exchanged here, on the server.
 *   ?token_hash=…&type=…        an edited template. Verified here.
 *   #access_token=…             Supabase's DEFAULT template, via its own
 *                               verify endpoint. Fragment — server-invisible,
 *                               so a client component finishes the job.
 *
 * The third case is the one that matters on a project nobody has configured:
 * editing the Magic Link template on a hosted project requires custom SMTP, so
 * the default is what most links will be for a while.
 */

import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/db/server'
import { HashSession } from './hash-session'

/** Never send a user to another origin on the strength of a query parameter. */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }>
}) {
  const params = await searchParams
  const next = safeNext(params.next)

  if (params.code) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.exchangeCodeForSession(params.code)
    redirect(error ? '/auth?error=link' : next)
  }

  if (params.token_hash && params.type) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.verifyOtp({
      type: params.type as EmailOtpType,
      token_hash: params.token_hash,
    })
    redirect(error ? '/auth?error=link' : next)
  }

  return <HashSession next={next} />
}
