import 'server-only'

/**
 * The two things a character contract knows about the person in front of it.
 *
 * Both are §08: the one line she still has in mind from the last encounter,
 * and what he is called. Both are resolved HERE, from an already-authenticated
 * user id, and never accepted from a client — the same rule the persona itself
 * follows. A client that can post its own memory can post its own character,
 * and the character contract is the product.
 *
 * One module rather than one per route because there are three callers now and
 * they must not disagree: `/api/voice/token` mints the Realtime session,
 * `/api/voice/llm` drives the assembled pipeline, and text mode runs the same
 * character without a microphone. A memory that reaches two of the three is
 * the bug this replaces — the pipeline arm never had it at all.
 *
 * Best-effort by rule. A rep must never fail to start because a nice-to-have
 * lookup was slow or the character was never seeded: forgetting is the same
 * answer as never having met, and an unnamed user is the ordinary case.
 */

import { supabaseAdmin } from './admin'
import { getPersona } from '@/lib/personas'

export interface PersonaContext {
  /** Absent when there is nothing to carry. Spread onto a `Persona`. */
  memorySummary?: string
  /** Absent when the name step was skipped. */
  userName?: string
  /**
   * The interview brief — the role, the round, the field, the JD and the CV
   * (C5). Absent on every dating rep, and on an interview whose account has
   * filled nothing in.
   *
   * Resolved ONCE, when the session is opened, and stored on
   * `voice_sessions.context` so every turn of the rep reads the identical
   * string. That is what keeps it inside the cached system-prompt prefix: a
   * brief that changed per turn would be a prefix that changed per turn, and
   * the 72.5% cache hit would go with it.
   */
  interviewBrief?: string
  /**
   * Her first line on this user's last few reps against her (R9).
   *
   * Resolved here, from the stored transcripts, and never accepted from a
   * client. Dating only; see `recallOpeners`.
   */
  previousOpeners?: string[]
}

/**
 * The first name only, and only if it looks like one.
 *
 * `display_name` is a free-text field the user owns, so it can hold anything
 * they typed into Settings. What goes into a system prompt out of it is one
 * short word: a character addressing somebody by a sentence is worse than a
 * character addressing nobody, and the failure mode of a long value here is
 * prompt text wearing a name's clothes.
 */
export function firstNameFrom(displayName: string | null | undefined): string | undefined {
  const first = (displayName ?? '').trim().split(/\s+/)[0] ?? ''
  if (first.length < 2 || first.length > 24) return undefined
  // Letters, and the marks that appear inside real names. Nothing else — a
  // "name" carrying punctuation is not being used as a name.
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(first)) return undefined
  return first
}

/**
 * What this user's rep against this character should carry.
 *
 * `slug` may be omitted when only the name is wanted — text mode reads the
 * memory through its own thread and the token route does not.
 */
export async function personaContext(
  userId: string,
  slug: string | null,
): Promise<PersonaContext> {
  // The calibration harnesses drive the deployed routes on purpose, as nobody.
  if (userId === 'internal') return {}

  try {
    const admin = supabaseAdmin()
    const [{ data: profile }, memorySummary, previousOpeners] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
      slug ? recallMemory(userId, slug) : Promise.resolve(undefined),
      // In parallel with the other two, so the lookup costs no extra hop on
      // the path that opens a rep.
      slug && getPersona(slug)?.track === 'dating' ? recallOpeners(userId, slug) : Promise.resolve([]),
    ])

    const userName = firstNameFrom(profile?.display_name)
    return {
      ...(memorySummary ? { memorySummary } : {}),
      ...(userName ? { userName } : {}),
      ...(previousOpeners.length > 0 ? { previousOpeners } : {}),
    }
  } catch {
    return {}
  }
}

/** The stored line for one character, or nothing. */
export async function recallMemory(userId: string, slug: string): Promise<string | undefined> {
  try {
    const admin = supabaseAdmin()
    const { data: persona } = await admin
      .from('personas')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!persona) return undefined

    const { data: memory } = await admin
      .from('persona_memory')
      .select('summary')
      .eq('user_id', userId)
      .eq('persona_id', persona.id)
      .maybeSingle()

    return memory?.summary?.trim() || undefined
  } catch {
    return undefined
  }
}

/** How many earlier reps to look back over. Three is a week of a habit. */
export const OPENER_LOOKBACK = 3

/**
 * Her first line on this user's last few reps against her, newest first.
 *
 * ── WHY (PERSONA-REALISM-REPORT R9, `HUMANNESS-PLAN.md` §7.4) ────────────
 *
 * A seeded mood gives her a different afternoon; it does not stop her opening
 * with the same line, because a hello to a hello has very few good answers and
 * a model finds the same one. A second rep whose first line is the first line
 * of the last rep is the loudest possible tell that nobody is there. So the
 * lines she has already used are handed back to her as lines not to use.
 *
 * Her OWN lines, from the stored transcript, clamped to one short sentence and
 * stripped of anything bracketed — it is text the product wrote, but it is
 * still text crossing into a system prompt, so it is treated like a name.
 * Best-effort like everything here: an empty list is a first meeting.
 */
export async function recallOpeners(userId: string, slug: string): Promise<string[]> {
  try {
    const admin = supabaseAdmin()
    const { data: sessions } = await admin
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('persona_slug', slug)
      .eq('track', 'dating')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(OPENER_LOOKBACK)
    const ids = (sessions ?? []).map((row) => row.id)
    if (ids.length === 0) return []
    const { data: transcripts } = await admin
      .from('transcripts')
      .select('session_id, turns')
      .in('session_id', ids)
    const byId = new Map((transcripts ?? []).map((row) => [row.session_id, row.turns]))
    const openers: string[] = []
    for (const id of ids) {
      const line = firstAgentLine(byId.get(id))
      if (line && !openers.includes(line)) openers.push(line)
    }
    return openers
  } catch {
    return []
  }
}

/** Her first spoken line in a stored transcript, made safe to quote back. */
export function firstAgentLine(turns: unknown): string | null {
  if (!Array.isArray(turns)) return null
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') continue
    const entry = turn as Record<string, unknown>
    if (entry.speaker !== 'agent' || typeof entry.text !== 'string') continue
    const text = entry.text
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[\r\n#]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!text) continue
    return text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text
  }
  return null
}
