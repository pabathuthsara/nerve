'use server'

/**
 * Text mode (P1).
 *
 * The on-ramp. Same character, same contract, same memory — typed, with no
 * microphone, no clock, no meter, no score and **no quota**. It is what a
 * nervous person does before they open their microphone, and it is what is
 * still open when the day's voice reps are gone.
 *
 * Three rules the code holds up rather than the copy:
 *
 * 1. **It never spends a rep.** Nothing here goes near `consumeRep`,
 *    `entitlements` or `sessions`. That is the promise the whole mode is for
 *    and it is kept by there being no call to make.
 * 2. **It still costs tokens, so it still passes the ceiling.** §14: every
 *    path that spends money goes through the spend gate. Unmetered to the user
 *    is not unmetered to us — text gets its own bucket so a loop here cannot
 *    eat the allowance a live rep needs to keep talking (`lib/db/spend.ts`).
 * 3. **The thread is the server's.** She replies to what is stored, not to a
 *    history a client posted, so the conversation she is continuing is the one
 *    that actually happened.
 *
 * Everything returns `{ ok, message }` rather than throwing, like every other
 * write in this app: a thrown Server Action error reaches the client as an
 * opaque digest and this screen has to be able to say what went wrong.
 */

import { revalidatePath } from 'next/cache'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { asJson } from '@/lib/db/json'
import { spendVerdict } from '@/lib/db/spend'
import { personaContext } from '@/lib/db/persona-context'
import { getPersona } from '@/lib/personas'
import { characterReply } from '@/lib/text/reply'
import { appendTurn, readMessage, readTurns, type TextTurn } from '@/lib/text/thread'
import { forgetPersona } from '@/app/profile/actions'

export interface TextResult {
  ok: boolean
  message: string | null
}

export interface ThreadState extends TextResult {
  /**
   * The thread, or `null` for "I never read it — keep what you have".
   *
   * The distinction is load-bearing. A refusal that happens BEFORE the thread
   * is read — signed out, a message over the length cap, the spend ceiling —
   * knows nothing about the conversation, and an empty array on those paths
   * would tell the screen to replace a live conversation with nothing. Typing
   * one character too many would have wiped the thread off the screen.
   */
  turns: TextTurn[] | null
  /** The line she still has in mind (§08), or null. Read, never written here. */
  memory: string | null
  /** True once she has ended the scene. The screen offers to start fresh. */
  ended: boolean
}

/** Refused before the thread was read. See `turns`. */
const UNREAD: ThreadState = {
  ok: false,
  message: 'You are signed out.',
  turns: null,
  memory: null,
  ended: false,
}

/**
 * The thread as it stands, and what she remembers.
 *
 * Read on open. It creates nothing: a person who looks at text mode and leaves
 * has not started a conversation, and an empty row would make "start fresh"
 * an option on a thread that never existed.
 */
export async function openThread(personaSlug: string): Promise<ThreadState> {
  const user = await currentUser()
  if (!user) return UNREAD

  const persona = getPersona(personaSlug)
  if (!persona) return { ...UNREAD, message: 'No such character.' }

  const supabase = await supabaseServer()
  const [{ data: row }, context] = await Promise.all([
    supabase
      .from('text_threads')
      .select('turns')
      .eq('user_id', user.id)
      .eq('persona_slug', personaSlug)
      .maybeSingle(),
    personaContext(user.id, personaSlug),
  ])

  return {
    ok: true,
    message: null,
    turns: readTurns(row?.turns),
    memory: context.memorySummary ?? null,
    ended: false,
  }
}

/**
 * Send a message and get her reply.
 *
 * One round trip rather than a stream. A typed reply is a message and arrives
 * whole; streaming it would buy a "typing" animation and cost a second parser
 * to keep correct, and the indicator on the screen already says she is typing.
 *
 * His turn is written before the model is called, so a reply that fails is a
 * message he can send again rather than a message that vanished.
 */
export async function sendTextTurn(input: {
  personaSlug: string
  text: string
}): Promise<ThreadState> {
  const user = await currentUser()
  if (!user) return UNREAD

  const persona = getPersona(input.personaSlug)
  if (!persona) return { ...UNREAD, message: 'No such character.' }

  const verdict = readMessage(input.text)
  if (!verdict.ok) return { ...UNREAD, message: verdict.message }

  // §14. Free of quota is not free of cost, and this is the gate that says so.
  const allowed = await spendVerdict(user.id, 'text')
  if (!allowed.ok) return { ...UNREAD, message: allowed.message }

  const supabase = await supabaseServer()
  const { data: row } = await supabase
    .from('text_threads')
    .select('turns')
    .eq('user_id', user.id)
    .eq('persona_slug', input.personaSlug)
    .maybeSingle()

  const stored = readTurns(row?.turns)
  const withUser = appendTurn(stored, {
    speaker: 'user',
    text: verdict.text,
    at: new Date().toISOString(),
  })

  await save(user.id, input.personaSlug, withUser)

  // Character memory (§08), resolved from the authenticated user rather than
  // sent from the browser — the same rule the token route follows. This is the
  // hop that makes her the same person she was in the last voice rep.
  const context = await personaContext(user.id, input.personaSlug)
  const reply = await characterReply({
    persona: { ...persona, ...context },
    turns: withUser,
  })

  if (!reply.ok) {
    return {
      ok: false,
      message: reply.message,
      turns: withUser,
      memory: context.memorySummary ?? null,
      ended: false,
    }
  }

  const withReply = appendTurn(withUser, {
    speaker: 'persona',
    text: reply.text,
    at: new Date().toISOString(),
  })
  await save(user.id, input.personaSlug, withReply)

  return {
    ok: true,
    message: null,
    turns: withReply,
    memory: context.memorySummary ?? null,
    ended: reply.ended,
  }
}

/**
 * Start fresh.
 *
 * Two things, and the caller decides whether the second happens: the thread is
 * deleted, and — only if asked — the one line she carries between reps is
 * cleared too (§08). They are separate because they are separate promises. A
 * person who wants to restart a conversation that went badly is not
 * necessarily asking her to forget the bookshop, and `forgetPersona` already
 * owns the second half with the copy that explains what it does and does not
 * touch.
 *
 * Nothing else moves. Reps, scores, streak and ladder position are untouched,
 * because a text thread never reached any of them in the first place.
 */
export async function startFresh(input: {
  personaSlug: string
  forgetMemory: boolean
}): Promise<TextResult> {
  const user = await currentUser()
  if (!user) return { ok: false, message: 'You are signed out.' }

  const supabase = await supabaseServer()
  const { error } = await supabase
    .from('text_threads')
    .delete()
    .eq('user_id', user.id)
    .eq('persona_slug', input.personaSlug)

  if (error) return { ok: false, message: `Not cleared — ${error.message}` }

  if (input.forgetMemory) {
    const forgotten = await forgetPersona(input.personaSlug)
    if (!forgotten.ok) return forgotten
  }

  revalidatePath(`/text/${input.personaSlug}`)
  return { ok: true, message: null }
}

/**
 * Roll the thread forward in place.
 *
 * Upsert on the natural key, so two tabs typing at once end with one thread
 * rather than a unique-violation the user has to read about. Best-effort by
 * the same rule the rep lifecycle follows: losing the write costs one saved
 * message, and it must never cost the reply that is already on screen.
 */
async function save(userId: string, personaSlug: string, turns: TextTurn[]): Promise<void> {
  try {
    const supabase = await supabaseServer()
    await supabase.from('text_threads').upsert(
      { user_id: userId, persona_slug: personaSlug, turns: asJson(turns) },
      { onConflict: 'user_id,persona_slug' },
    )
  } catch {
    // See above. The conversation on screen is the thing that matters now.
  }
}
