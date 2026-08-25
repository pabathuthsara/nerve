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

export interface PersonaContext {
  /** Absent when there is nothing to carry. Spread onto a `Persona`. */
  memorySummary?: string
  /** Absent when the name step was skipped. */
  userName?: string
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
    const [{ data: profile }, memorySummary] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
      slug ? recallMemory(userId, slug) : Promise.resolve(undefined),
    ])

    const userName = firstNameFrom(profile?.display_name)
    return {
      ...(memorySummary ? { memorySummary } : {}),
      ...(userName ? { userName } : {}),
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
