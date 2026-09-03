/**
 * The streak-at-risk email (RETENTION-AUDIT R6).
 *
 * **Hourly, not daily**, and for the same reason `weekly-review` beside it is:
 * Vercel crons run in UTC and "evening" is the user's evening, so the route
 * asks each account's own clock and `nudgeDue` matches exactly one run per
 * local day. See `lib/db/nudge.ts` for the second guard.
 *
 * Dormant until three things are set: `CRON_SECRET` (or this refuses),
 * `RESEND_API_KEY` (or every send is a logged no-op), and something calling it
 * — `.github/workflows/cron.yml`, because Vercel's Hobby plan will not accept
 * an hourly expression. That is the workaround `LAUNCH-GAP.md` reasoned
 * through and deferred.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { sendStreakNudges } from '@/lib/db/nudge'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Refuse rather than run open. An unauthenticated endpoint that emails every
  // user in the database is the worst shape an open endpoint can have.
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  try {
    return NextResponse.json(await sendStreakNudges())
  } catch (error) {
    // A missed run costs one evening's nudges. Report it rather than reporting
    // success — but never retry from here, because a retry is a second email.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'failed' },
      { status: 500 },
    )
  }
}
