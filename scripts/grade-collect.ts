/**
 * Pull stored transcripts into calibration-fixture shape (§07, §17).
 *
 *   npm run grade:collect            # everything eligible
 *   npm run grade:collect -- 8       # the most recent eight
 *
 * The long pole on the M2 gate is hand-scoring twenty transcripts, not typing
 * them out. This prints them in the shape `lib/grade/calibration/fixtures.ts`
 * wants, with `expected: null` on each, so the remaining work is reading and
 * scoring rather than transcription.
 *
 * **Only reps run under the current three-minute format are eligible.** A
 * transcript from a two-minute rep is the wrong shape to score a three-minute
 * one — which is the reason the format changed before anything else in M2 —
 * and one that slipped into the golden set would calibrate the grader against
 * a rep the product no longer runs.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { DATING_DURATION_MS } from '@/lib/data/rep-rules'
import { loadEnvLocal } from './env'

/** The format changed on this date; anything older is the wrong shape. */
const FORMAT_CHANGED_ON = '2026-08-23'

/** A rep this short produced nothing worth grading. */
const MIN_SECONDS = 60

interface StoredTurn {
  speaker: 'user' | 'agent'
  text: string
  t_start: number
  t_end: number
}

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.')
    process.exit(1)
  }

  const limit = Number(process.argv[2] ?? '0') || 100
  const admin = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, persona_slug, duration_s, started_at')
    .not('ended_at', 'is', null)
    .gte('started_at', `${FORMAT_CHANGED_ON}T00:00:00Z`)
    .gte('duration_s', MIN_SECONDS)
    .order('started_at', { ascending: false })
    .limit(limit)

  const rows = sessions ?? []
  if (rows.length === 0) {
    console.error(
      `\nNo eligible reps. Needs sessions from ${FORMAT_CHANGED_ON} onward, at least`
      + ` ${MIN_SECONDS}s long.\nThe format is ${DATING_DURATION_MS / 1000}s; run some reps and try again.\n`,
    )
    process.exit(1)
  }

  const { data: transcripts } = await admin
    .from('transcripts')
    .select('session_id, turns')
    .in('session_id', rows.map((row) => row.id))

  const { data: personas } = await admin.from('personas').select('slug, name')
  const nameBySlug = new Map((personas ?? []).map((row) => [row.slug, row.name]))
  const turnsById = new Map((transcripts ?? []).map((row) => [row.session_id, row.turns]))

  const fixtures = rows.flatMap((row) => {
    const turns = turnsById.get(row.id)
    if (!Array.isArray(turns) || turns.length < 6) return []
    return [{
      id: `${row.persona_slug}-${row.started_at.slice(0, 10)}-${row.id.slice(0, 6)}`,
      source: `session ${row.id}`,
      personaName: nameBySlug.get(row.persona_slug) ?? row.persona_slug,
      sessionSeconds: row.duration_s ?? 0,
      transcript: turns as unknown as StoredTurn[],
    }]
  })

  console.log(
    `\n// ${fixtures.length} transcript(s) from ${FORMAT_CHANGED_ON} onward.\n`
    + '// Paste into CALIBRATION_TRANSCRIPTS in transcripts.ts, then add an\n'
    + '// EXPECTED entry per id in fixtures.ts and hand-score it.\n',
  )
  console.log(JSON.stringify(fixtures, null, 2))
  console.log(
    `\n// ${fixtures.length} collected. §07 wants twenty hand-scored before the suite is green.\n`,
  )
}

void main()
