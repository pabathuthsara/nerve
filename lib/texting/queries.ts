import 'server-only'

/**
 * The texting section's read paths.
 *
 * Server components, per the stack rule — RSC for reads, client components only
 * around the live conversation. The inbox and the debrief are both pure reads
 * and neither needs a Server Action.
 */

import { currentUser, supabaseServer } from '@/lib/db/server'
import { TEXTING_ROSTER } from '@/lib/personas/texting'
import type { Persona } from '@/lib/voice/types'
import { buildDebrief, type Debrief } from './debrief'
import { runMeter } from './meter'
import { threadSeed } from './seed'
import { readTurns, visibleTurns, type TextingTurn } from './thread'
import type { TextingEnding } from './exit'
import { startedOnDay, textingAllowance, type TextingAllowance } from './allowance'

/**
 * A character, narrowed to what a screen may see.
 *
 * `Persona` carries `contract` — the authored character prompt — and every
 * screen in this section is a client component. A client that receives the
 * contract is a client that can post its own character, which is the rule the
 * token route and `lib/db/persona-context.ts` both already follow. Four display
 * fields travel; nothing else does.
 */
export interface TextingPersonaView {
  slug: string
  name: string
  scene: string
  premise: string
  level: number
}

export function personaView(persona: Persona): TextingPersonaView {
  return {
    slug: persona.slug,
    name: persona.name,
    scene: persona.scene,
    premise: persona.premise ?? '',
    level: persona.level,
  }
}

/** One row of the inbox. */
export interface InboxRow {
  persona: TextingPersonaView
  /** The last visible message, for the preview. Null before anything is sent. */
  lastMessage: { text: string; at: string; fromHer: boolean } | null
  /** open | ended_warm | ended_cold, or null when nothing has been started. */
  state: 'open' | 'ended_warm' | 'ended_cold' | null
  ending: TextingEnding | null
  /** Her reply is pending and he has not seen it yet. */
  awaitingHer: boolean
  /** She replied last and it is his move. The one volt element on the screen. */
  yourTurn: boolean
}

export interface Inbox {
  rows: InboxRow[]
  allowance: TextingAllowance
}

/**
 * The section home.
 *
 * Reads as a real inbox because that is the metaphor everybody already has: a
 * row with a thread shows its last message and when it arrived, and a row
 * without one shows her evening instead.
 */
export async function textingInbox(): Promise<Inbox | null> {
  const user = await currentUser()
  if (!user) return null

  const supabase = await supabaseServer()
  const [{ data: threads }, { data: ent }, { data: profile }] = await Promise.all([
    supabase
      .from('texting_threads')
      .select('persona_slug, turns, state, ending, started_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase.from('entitlements').select('texting_threads_per_day').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle(),
  ])

  const now = Date.now()
  const zone = profile?.timezone ?? null
  const all = threads ?? []

  // The newest thread per character. History lives behind it, and the inbox is
  // about the conversation somebody is in rather than every one they have had.
  const latest = new Map<string, (typeof all)[number]>()
  for (const row of all) {
    if (!latest.has(row.persona_slug)) latest.set(row.persona_slug, row)
  }

  const rows: InboxRow[] = TEXTING_ROSTER.map((entry) => {
    const persona = personaView(entry)
    const row = latest.get(entry.slug)
    if (!row) {
      return { persona, lastMessage: null, state: null, ending: null, awaitingHer: false, yourTurn: false }
    }
    const stored = readTurns(row.turns)
    const visible = visibleTurns(stored, now)
    const last = visible.at(-1) ?? null
    const pending = stored.length > visible.length
    const open = row.state === 'open'
    return {
      persona,
      lastMessage: last ? { text: last.text, at: last.at, fromHer: last.speaker === 'persona' } : null,
      state: row.state as InboxRow['state'],
      ending: (row.ending as TextingEnding | null) ?? null,
      awaitingHer: open && pending,
      yourTurn: open && !pending && last?.speaker === 'persona',
    }
  })

  const startedToday = all.filter((row) => startedOnDay(row.started_at, zone, new Date())).length

  return {
    rows,
    allowance: textingAllowance({
      threadsPerDay: ent?.texting_threads_per_day ?? 0,
      startedToday,
    }),
  }
}

export interface ThreadDebrief {
  persona: TextingPersonaView
  debrief: Debrief
  ending: TextingEnding | null
  /** The thread is still going, so there is nothing to look back on yet. */
  open: boolean
}

/**
 * What happened, for a character's most recent thread.
 *
 * Reads the latest thread rather than an id, because that is what the ending
 * card links to and because a section with no thread list has no other thread
 * to mean.
 */
export async function textingDebrief(slug: string): Promise<ThreadDebrief | null> {
  const user = await currentUser()
  if (!user) return null

  const persona = TEXTING_ROSTER.find((entry) => entry.slug === slug)
  if (!persona) return null

  const supabase = await supabaseServer()
  const { data: row } = await supabase
    .from('texting_threads')
    .select('turns, state, ending, started_at')
    .eq('user_id', user.id)
    .eq('persona_slug', slug)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return null

  const stored: TextingTurn[] = readTurns(row.turns)
  const seed = threadSeed({ userId: user.id, personaSlug: slug, startedAt: row.started_at })
  const meter = runMeter(persona, stored, seed)
  const ending = (row.ending as TextingEnding | null) ?? null

  return {
    persona: personaView(persona),
    debrief: buildDebrief(meter, ending),
    ending,
    open: row.state === 'open',
  }
}
