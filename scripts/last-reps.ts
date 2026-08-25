/**
 * Read the last few reps back out, as they were actually stored.
 *
 * A read-only look at what the database holds for the most recent sessions:
 * the meter, the grade, the transcript, and the pipeline incident counts. Kept
 * as a script rather than a query pasted into a console so that "how did that
 * rep actually go" is answerable the same way twice.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/db/types'

const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
const key = process.env['SUPABASE_SECRET_KEY']
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.')

const admin = createClient<Database>(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const COUNT = Number(process.argv[2] ?? 2)

const { data: sessions, error } = await admin
  .from('sessions')
  .select('*')
  .order('started_at', { ascending: false })
  .limit(COUNT)

if (error) throw new Error(error.message)

for (const session of sessions ?? []) {
  const [{ data: score }, { data: transcript }] = await Promise.all([
    admin.from('scores').select('*').eq('session_id', session.id).maybeSingle(),
    admin.from('transcripts').select('turns, warmth').eq('session_id', session.id).maybeSingle(),
  ])

  console.log('\n' + '='.repeat(72))
  console.log(`${session.persona_slug}  ·  ${session.started_at}`)
  console.log('='.repeat(72))
  console.log(
    `  ${session.duration_s ?? '?'}s · ended by ${session.ended_by ?? '?'} · ${session.model}`,
  )
  console.log(
    `  warmth  start ${session.start_warmth} → final ${session.final_warmth} ` +
      `(peak ${session.peak_warmth}, decision ${session.decision_warmth}) · ` +
      `${session.final_band} · won=${session.won}`,
  )
  const incidents = (session.pipeline_incidents ?? {}) as {
    unheardTurns?: { at: number; peak: number; samples: number; packetDelta: number | null; recovered: boolean }[]
  } & Record<string, unknown>
  const { unheardTurns, ...counts } = incidents
  console.log(`  incidents  ${JSON.stringify(counts)}`)

  // B11's open question, printed rather than buried in a JSON blob. A zero
  // packet delta means her audio never left the model; a healthy count means it
  // arrived and the browser did not render it. See LAUNCH-GAP.md B11.
  for (const turn of unheardTurns ?? []) {
    const packets =
      turn.packetDelta === null ? 'packets unreadable' : `packets +${turn.packetDelta}`
    console.log(
      `  UNHEARD    ${turn.at.toFixed(1)}s · peak ${turn.peak.toFixed(5)} over ` +
        `${turn.samples} samples · ${packets}` +
        `${turn.recovered ? ' · asked her to say it again' : ''}`,
    )
  }

  if (score) {
    console.log(
      `  score  composite ${score.composite} (deterministic ${score.deterministic_score})` +
        ` · outcome ${score.outcome} · ${score.model_version}`,
    )
    console.log(
      `         opening ${score.opening} listening ${score.listening} curiosity ${score.curiosity}` +
        ` composure ${score.composure} signal ${score.signal_reading} close ${score.close}`,
    )
    console.log(`         focus: ${(score.focus ?? []).join(', ')}`)
    console.log(`         went well: ${score.went_well}`)
  } else {
    console.log('  score  none stored')
  }

  const turns = (transcript?.turns ?? []) as { speaker: string; text: string; t_start: number; t_end: number }[]
  const events = (transcript?.warmth ?? []) as { turnIndex: number; delta: number; warmthAfter: number; reason: string }[]
  const agent = turns.filter((t) => t.speaker === 'agent')
  const user = turns.filter((t) => t.speaker === 'user')
  const words = (list: typeof turns) =>
    list.length === 0 ? 0 : Math.round(list.reduce((n, t) => n + t.text.trim().split(/\s+/).length, 0) / list.length)

  console.log(
    `  turns  ${user.length} user (${words(user)} words avg) · ` +
      `${agent.length} her (${words(agent)} words avg)`,
  )

  console.log('\n  transcript')
  for (const turn of turns) {
    const who = turn.speaker === 'user' ? 'you ' : 'her '
    console.log(`    ${turn.t_start.toFixed(1).padStart(6)}s  ${who} ${turn.text}`)
  }

  if (events.length > 0) {
    console.log('\n  meter')
    for (const event of events) {
      const sign = event.delta > 0 ? '+' : ''
      console.log(
        `    turn ${String(event.turnIndex).padStart(2)}  ${sign}${event.delta.toFixed(2).padStart(6)}` +
          ` → ${event.warmthAfter.toFixed(1).padStart(5)}  ${event.reason}`,
      )
    }
  }
}

console.log('')
