'use server'

/**
 * Report a problem with a rep (§16, §10 H).
 *
 * The last of the six safety features, and the only one a user operates. It
 * matters more than its size suggests: automated moderation catches categories,
 * and the things that will actually go wrong with a character in a three-minute
 * conversation are not categories. A report is how we find out about the rep
 * that was creepy in a way no classifier has a name for.
 *
 * Written through the user's own client, deliberately. `safety_events` grants
 * exactly one insert policy — your own row, `kind = 'report'`, and nothing else
 * — so RLS is the authorisation here rather than a check in this file. Every
 * other kind is the server's, because a moderation flag a user can forge is a
 * moderation flag that proves nothing (see the migration).
 *
 * This is the one place we DO keep what somebody wrote. `detail` carries their
 * note verbatim: a report with the report removed from it is not a report.
 */

import { currentUser, supabaseServer } from '@/lib/db/server'
import { asJson } from '@/lib/db/json'

export interface ReportResult {
  ok: boolean
  message: string | null
}

/**
 * The reasons, authored here and rendered from here.
 *
 * A fixed list rather than a free-text box alone, because the categories are
 * what make a pile of reports readable — and one of them has to be "something
 * else" or the list quietly teaches people that anything not on it does not
 * count.
 */
export const REPORT_REASONS = [
  { value: 'content', label: 'She said something that crossed a line' },
  { value: 'behaviour', label: 'The rep went somewhere it should not have' },
  { value: 'broken', label: 'Something was broken — audio, transcript or score' },
  { value: 'other', label: 'Something else' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['value']

const VALUES: readonly string[] = REPORT_REASONS.map((reason) => reason.value)

/** How much of a note we keep. Long enough for the whole story, in practice. */
const NOTE_LIMIT = 2000

export async function reportSession(input: {
  sessionId: string | null
  reason: string
  note: string
}): Promise<ReportResult> {
  const user = await currentUser()
  if (!user) return { ok: false, message: 'Not sent — you are signed out.' }

  const reason = VALUES.includes(input.reason) ? input.reason : 'other'
  const note = input.note.trim().slice(0, NOTE_LIMIT)

  const supabase = await supabaseServer()
  const { error } = await supabase.from('safety_events').insert({
    user_id: user.id,
    session_id: input.sessionId,
    kind: 'report',
    detail: asJson({ reason, note, source: 'session' }),
  })

  if (error) return { ok: false, message: `Not sent — ${error.message}` }
  return { ok: true, message: null }
}
