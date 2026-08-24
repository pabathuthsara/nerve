/**
 * The Sunday review (§09, §11).
 *
 * **Hourly, not weekly.** Vercel crons run in UTC and "Sunday morning" is the
 * user's Sunday — a weekly UTC cron would post a Sunday letter into somebody's
 * Monday. So this runs every hour and asks each user's own clock, which is the
 * honest implementation rather than the convenient one.
 *
 * Idempotent by the `(user_id, week_start)` unique constraint: the twenty-odd
 * runs that fall inside one user's Sunday write the letter once and skip the
 * rest.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { generateWeeklyReviews } from '@/lib/db/weekly'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Refuse rather than run open, the same as the purge route. This one writes
  // rather than deletes, but an open endpoint that writes to every profile is
  // not better for being additive.
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  try {
    const result = await generateWeeklyReviews()
    return NextResponse.json(result)
  } catch (error) {
    // A missed run costs a letter until the next hour, and there are plenty of
    // hours left in a Sunday. Report it rather than reporting success.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'failed' },
      { status: 500 },
    )
  }
}
