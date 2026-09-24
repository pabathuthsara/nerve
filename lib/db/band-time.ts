import 'server-only'

/**
 * Where she spent the rep, read back for the grade (PERSONA-REALISM S5).
 *
 * The live engine counts seconds per band and the rep does not keep them —
 * `finishSession` stores the meter's per-turn events and where she started,
 * not the totals. The grade route needs the totals to set a talk-ratio target
 * that fits the character (`lib/grade/talk-ratio.ts`), and it runs strictly
 * after that save (`completeRep` awaits it), so the row is there to read.
 *
 * ── WHY IT CAN ONLY EVER FALL BACK ───────────────────────────────────────
 *
 * Null on every path that is not a clean read of the caller's OWN row: no
 * session id, a machine caller, a save that failed, a row with no events, a
 * database that did not answer. Null means `datingMetricBands(null)`, which
 * is `METRIC_BANDS` itself — the band every dating rep was scored against
 * before this existed. A failure here costs a normalisation, never a grade.
 *
 * Service role, filtered to the caller's user id on both reads, which is the
 * same shape `readInterviewSetupFor` uses from the same route. The id comes
 * from `requireUser`, never from the body.
 */

import { supabaseAdmin } from './admin'
import { bandTimeFromEvents, type BandEvent, type BandTime } from '@/lib/grade/talk-ratio'
import type { TranscriptTurn } from '@/lib/voice/types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function readBandTimeFor(input: {
  userId: string
  sessionId: unknown
  transcript: readonly TranscriptTurn[]
  sessionSeconds: number
}): Promise<BandTime | null> {
  if (input.userId === 'internal') return null
  if (typeof input.sessionId !== 'string' || !UUID.test(input.sessionId)) return null
  try {
    const admin = supabaseAdmin()
    const [{ data: stored }, { data: session }] = await Promise.all([
      admin.from('transcripts').select('warmth')
        .eq('session_id', input.sessionId).eq('user_id', input.userId).maybeSingle(),
      admin.from('sessions').select('start_warmth')
        .eq('id', input.sessionId).eq('user_id', input.userId).maybeSingle(),
    ])
    const events = Array.isArray(stored?.warmth) ? stored.warmth.flatMap(bandEventOf) : []
    return bandTimeFromEvents({
      transcript: input.transcript,
      events,
      startWarmth: session?.start_warmth ?? null,
      sessionSeconds: input.sessionSeconds,
    })
  } catch {
    return null
  }
}

function bandEventOf(entry: unknown): BandEvent[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
  const { turnIndex, band } = entry as Record<string, unknown>
  return typeof turnIndex === 'number' && typeof band === 'string' ? [{ turnIndex, band }] : []
}
