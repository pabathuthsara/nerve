/**
 * One-time repair: wins the grader invented.
 *
 *   npm run db:repair-wins -- --dry     # show what would change
 *   npm run db:repair-wins              # apply
 *
 * `wonFromRep` used to short-circuit on the grader's outcome before it looked
 * at the meter — `if (outcome === 'receptive') return true` — so a rep whose
 * meter never reached ARM_THRESHOLD could be rewritten as a win the moment the
 * grade landed. The user was shown "She left" and the stored record then said
 * otherwise. The rule is fixed; the rows it already wrote are not.
 *
 * **It only undoes the unambiguous half**, and that restraint is the whole
 * design. `won` is decided live from the warmth at the WIND-DOWN, which is not
 * what any column stores — `final_warmth` is the value at the end, after her
 * closing line. So a stored win whose final warmth dipped under KEEP_THRESHOLD
 * may be perfectly legitimate and is left alone.
 *
 * A peak below ARM_THRESHOLD is different in kind: never armed means never
 * armed, no wind-down timing can rescue it, and no honest rep can carry that
 * pair. Those are the only rows touched.
 *
 * Idempotent. Rows with no meter at all (written before the warmth columns
 * existed) are never touched — there is nothing to check them against.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import { loadEnvLocal } from './env'

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.')
    process.exit(1)
  }

  const dry = process.argv.includes('--dry')
  const admin = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: rows, error } = await admin
    .from('sessions')
    .select('id, persona_slug, started_at, outcome, won, peak_warmth, final_warmth')
    .eq('won', true)
    .not('peak_warmth', 'is', null)
    .lt('peak_warmth', ARM_THRESHOLD)
    .order('started_at', { ascending: false })

  if (error) {
    console.error(`Could not read sessions: ${error.message}`)
    process.exit(1)
  }

  const affected = rows ?? []
  if (affected.length === 0) {
    console.log('\nNothing to repair. No stored win has a peak below the arm threshold.\n')
    return
  }

  console.log(`\n${affected.length} session(s) stored as a win the meter never earned:\n`)
  console.log('  started              persona   peak   final   graded as')
  for (const row of affected) {
    console.log(
      `  ${row.started_at.slice(0, 19)}  ${(row.persona_slug ?? '').padEnd(8)}`
      + `  ${String(row.peak_warmth).padStart(5)}  ${String(row.final_warmth).padStart(5)}`
      + `   ${row.outcome ?? '—'}`,
    )
  }
  console.log(`\n  (armed needs peak >= ${ARM_THRESHOLD})`)

  if (dry) {
    console.log('\nDry run. Nothing written. Drop --dry to apply.\n')
    return
  }

  const { error: writeError } = await admin
    .from('sessions')
    .update({ won: false })
    .in('id', affected.map((row) => row.id))

  if (writeError) {
    console.error(`\nNot repaired — ${writeError.message}\n`)
    process.exit(1)
  }

  // The ladder is derived from wins, so it has to be recomputed after this —
  // except that `syncLevel` only ever moves a level UP (a bad week does not
  // take a character away, §08, §12). Removing a win therefore cannot close a
  // level somebody already has, which is the correct behaviour here too: they
  // were shown that roster and it should not retract underneath them.
  console.log(`\n${affected.length} session(s) corrected. Levels already open stay open.\n`)
}

void main()
