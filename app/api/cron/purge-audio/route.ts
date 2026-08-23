/**
 * The 30-day audio purge (§05).
 *
 * Storage first, then the row. The other order orphans objects: once
 * `audio_path` is null nothing knows the file exists, and it sits in the
 * bucket costing money and holding a user's voice past the retention we
 * promised them.
 *
 * Runs on a Vercel Cron. Nothing about it is user-triggered, so a missed run
 * delays deletion rather than breaking anything — but it must not silently
 * report success when Storage refused, hence the reported failure count.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/db/admin'

/** One run's ceiling. Anything left over is collected on the next pass. */
const BATCH = 500

export const dynamic = 'force-dynamic'

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Refuse rather than run open. An unauthenticated deletion endpoint is worse
  // than audio that outlives its window by a day.
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const supabase = supabaseAdmin()

  const { data: expired, error } = await supabase
    .from('sessions')
    .select('id, audio_path')
    .not('audio_path', 'is', null)
    .lt('audio_expires_at', new Date().toISOString())
    .limit(BATCH)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!expired || expired.length === 0) {
    return NextResponse.json({ purged: 0, failed: 0 })
  }

  const paths = expired
    .map((row) => row.audio_path)
    .filter((path): path is string => path !== null)

  const { data: removed, error: storageError } = await supabase.storage
    .from('session-audio')
    .remove(paths)

  if (storageError) {
    return NextResponse.json({ error: storageError.message, purged: 0 }, { status: 500 })
  }

  // Clear only the rows whose object actually went. A partial removal must not
  // leave a session claiming its audio is gone while the file is still there.
  const goneNames = new Set((removed ?? []).map((object) => object.name))
  const cleared = expired
    .filter((row) => row.audio_path !== null && goneNames.has(row.audio_path))
    .map((row) => row.id)

  if (cleared.length > 0) {
    await supabase
      .from('sessions')
      .update({ audio_path: null, audio_expires_at: null })
      .in('id', cleared)
  }

  return NextResponse.json({
    purged: cleared.length,
    failed: paths.length - cleared.length,
  })
}
