'use server'

/**
 * The texting section's mutations.
 *
 * Three rules the code holds up rather than the copy:
 *
 * 1. **A conversation, once started, always finishes.** The allowance gates
 *    opening a thread and nothing else. A message counter that cut somebody off
 *    mid-conversation would be indistinguishable, from the inside, from the
 *    character losing interest — which is the one signal this whole section
 *    exists to teach. §05's "nothing may interrupt a live rep", applied where it
 *    would otherwise be cruellest.
 *
 * 2. **The thread is the server's.** She replies to what is stored, and the
 *    meter is folded from that same transcript on every message, so the
 *    conversation she is continuing is the one that actually happened and the
 *    number behind her behaviour cannot be posted from a browser.
 *
 * 3. **It costs tokens, so it passes the ceiling and reaches the ledger.**
 *    `maySpend` was always there; the ledger write was not, and texting was
 *    invisible to `spend_today_cents()` until now (rule 18).
 *
 * Everything returns `{ ok, message }` rather than throwing, like every other
 * write in this app: a thrown Server Action error reaches the client as an
 * opaque digest and these screens have to be able to say what went wrong.
 */

import { revalidatePath } from 'next/cache'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { asJson } from '@/lib/db/json'
import { spendVerdict } from '@/lib/db/spend'
import { personaContext } from '@/lib/db/persona-context'
import { getTextingPersona } from '@/lib/personas/texting'
import { forgetPersona } from '@/app/profile/actions'
import { assessTurn } from '@/lib/safety/assess'
import { DECLINE_DIRECTIVE } from '@/lib/safety/escalation'
import { advanceExit, type SceneExit } from '@/lib/warmth/leaving'
import { isPressuring } from '@/lib/warmth/texting/reciprocity'
import {
  startedOnDay,
  textingAllowance,
  textingRefusal,
  type TextingAllowance,
} from '@/lib/texting/allowance'
import { nextExit, repliesAtAll, warmExitBudget, type TextingEnding } from '@/lib/texting/exit'
import { runMeter } from '@/lib/texting/meter'
import { scheduleFor } from '@/lib/texting/presence'
import { textingReply } from '@/lib/texting/reply'
import { exchangeSeed, threadSeed } from '@/lib/texting/seed'
import {
  appendTurn,
  exchangesFrom,
  nextRevealAt,
  readMessage,
  readTurns,
  visibleTurns,
  type TextingTurn,
} from '@/lib/texting/thread'
import {
  personaView,
  textingDebrief,
  textingInbox,
  type Inbox,
  type TextingPersonaView,
  type ThreadDebrief,
} from '@/lib/texting/queries'

export interface TextingResult {
  ok: boolean
  message: string | null
}

export interface ThreadState extends TextingResult {
  /**
   * The turns he can see, or `null` for "I never read it — keep what you have".
   *
   * The distinction is load-bearing. A refusal taken BEFORE the thread is read
   * — signed out, a message over the cap, the spend ceiling — knows nothing
   * about the conversation, and an empty array on those paths would tell the
   * screen to replace a live thread with nothing. Typing one character too many
   * would have wiped it off the screen.
   */
  turns: TextingTurn[] | null
  /** The line she still has in mind (§08), or null. Read, never written here. */
  memory: string | null
  /** Where the scene is. `leaving` with no pending turn means she has gone. */
  exit: SceneExit
  /** How it finished, once it has. */
  ending: TextingEnding | null
  /** ISO. When her pending message becomes visible, or null. */
  nextRevealAt: string | null
  /**
   * Her message, before he is meant to see it.
   *
   * Handed over with the schedule rather than fetched again at reveal time.
   * The alternative is a second round trip at the exact moment the screen is
   * supposed to feel like a phone, and the only thing a determined user gains
   * by reading it early is spoiling a delay for himself — the same trade
   * `TEXTING-PLAN.md` X11 makes about the timers.
   */
  pending: { text: string; revealAt: string } | null
  /** Offsets for the receipt and the typing indicator, from her last message. */
  presence: { seenAfterMs: number; typingAfterMs: number } | null
  /** Interest, for the presence label. Never shown as a number. */
  warmth: number
  /** The thread stopped being an exercise (§16.8). */
  distress: boolean
  /** What may still be started today. */
  allowance: TextingAllowance | null
  /**
   * The character, narrowed to what a screen may see.
   *
   * Resolved here rather than by a page, because the texting screens are
   * rendered by `RouteView` under the catch-all now — which is what puts them
   * inside the shared chrome layout. `Persona.contract` is the authored
   * character prompt and still never travels: this is four display fields.
   */
  persona: TextingPersonaView | null
}

const UNREAD: ThreadState = {
  ok: false,
  message: 'You are signed out.',
  turns: null,
  memory: null,
  exit: 'present',
  ending: null,
  nextRevealAt: null,
  pending: null,
  presence: null,
  warmth: 0,
  distress: false,
  allowance: null,
  persona: null,
}

interface ThreadRow {
  id: string
  turns: unknown
  state: string
  ending: string | null
  exit_state: string
  started_at: string
}

/** The open thread for this character, or null. */
async function openRow(userId: string, slug: string): Promise<ThreadRow | null> {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('texting_threads')
    .select('id, turns, state, ending, exit_state, started_at')
    .eq('user_id', userId)
    .eq('persona_slug', slug)
    .eq('state', 'open')
    .maybeSingle()
  return data ?? null
}

/** Today's allowance, counted rather than stored. See `lib/texting/allowance.ts`. */
export async function allowanceFor(userId: string): Promise<TextingAllowance> {
  const supabase = await supabaseServer()
  const [{ data: ent }, { data: profile }, { data: threads }] = await Promise.all([
    supabase.from('entitlements').select('texting_threads_per_day').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle(),
    supabase.from('texting_threads').select('started_at').eq('user_id', userId)
      .gte('started_at', new Date(Date.now() - 48 * 3600_000).toISOString()),
  ])
  const now = new Date()
  const zone = profile?.timezone ?? null
  const startedToday = (threads ?? []).filter((row) => startedOnDay(row.started_at, zone, now)).length
  return textingAllowance({
    threadsPerDay: ent?.texting_threads_per_day ?? 0,
    startedToday,
  })
}

/**
 * The thread as it stands.
 *
 * Creates nothing. A person who looks at a character and leaves has not started
 * a conversation, and an empty row would spend an allowance they never used.
 */
export async function openThread(slug: string): Promise<ThreadState> {
  const user = await currentUser()
  if (!user) return UNREAD

  const persona = getTextingPersona(slug)
  if (!persona) return { ...UNREAD, message: 'No such character.' }

  const [row, context, allowance] = await Promise.all([
    openRow(user.id, slug),
    personaContext(user.id, slug),
    allowanceFor(user.id),
  ])

  if (!row) {
    return {
      ok: true, message: null, turns: [], memory: context.memorySummary ?? null,
      exit: 'present', ending: null, nextRevealAt: null, pending: null, presence: null,
      warmth: persona.trajectory.start, distress: false, allowance, persona: personaView(persona),
    }
  }

  const stored = readTurns(row.turns)
  const now = Date.now()
  const seed = threadSeed({ userId: user.id, personaSlug: slug, startedAt: row.started_at })
  const meter = runMeter(persona, stored, seed)

  return {
    ok: true,
    message: null,
    turns: visibleTurns(stored, now),
    memory: context.memorySummary ?? null,
    exit: (row.exit_state as SceneExit) ?? 'present',
    ending: (row.ending as TextingEnding | null) ?? null,
    nextRevealAt: nextRevealAt(stored, now),
    pending: pendingTurn(stored, now),
    // A reload mid-delay has already spent some of the schedule, so the client
    // counts down to `nextRevealAt` and the receipt is simply already shown.
    presence: null,
    warmth: meter.warmth,
    distress: false,
    allowance,
    persona: personaView(persona),
  }
}

/**
 * Send a message and get her reply.
 *
 * Generation happens immediately and the REVEAL is scheduled — the server never
 * holds a connection open for fifteen seconds. `lib/texting/presence.ts` turns
 * the meter into three offsets, the latest of which is stamped on her turn as
 * `revealAt`, and the client counts down to it. A reload mid-delay finds her
 * still typing; a closed tab finds the message waiting, which is what a phone
 * does.
 */
export async function sendTextingTurn(input: {
  personaSlug: string
  text: string
}): Promise<ThreadState> {
  const user = await currentUser()
  if (!user) return UNREAD

  const persona = getTextingPersona(input.personaSlug)
  if (!persona) return { ...UNREAD, message: 'No such character.' }

  const verdict = readMessage(input.text)
  if (!verdict.ok) return { ...UNREAD, message: verdict.message }

  // §14. Free of quota is not free of cost, and this is the gate that says so.
  const allowed = await spendVerdict(user.id, 'text')
  if (!allowed.ok) return { ...UNREAD, message: allowed.message }

  const supabase = await supabaseServer()
  let row = await openRow(user.id, input.personaSlug)
  const allowance = await allowanceFor(user.id)

  // THE ONLY GATE, AND IT IS ON OPENING. Rule 11 shape: the number has no user
  // write path and the refusal happens in the action, never in a screen.
  if (!row) {
    if (!allowance.mayStart) {
      return { ...UNREAD, message: textingRefusal(allowance), allowance }
    }
    const { data: created, error } = await supabase
      .from('texting_threads')
      .insert({ user_id: user.id, persona_slug: input.personaSlug, turns: asJson([]) })
      .select('id, turns, state, ending, exit_state, started_at')
      .single()
    if (error || !created) return { ...UNREAD, message: 'That did not start. Try again in a moment.' }
    row = created
  }

  if (row.state !== 'open') {
    return { ...UNREAD, message: 'That conversation has finished.', allowance }
  }

  const seed = threadSeed({ userId: user.id, personaSlug: input.personaSlug, startedAt: row.started_at })
  const stored = readTurns(row.turns)

  /**
   * A REPLY HE NEVER SAW IS NOT A REPLY (rule 17, in the medium's own terms).
   *
   * If he sends again while she is still "typing", the pending turn is dropped
   * and everything he said is folded into one answer. Two separate replies to
   * two messages sent ten seconds apart is not something a person does.
   *
   * It costs one wasted completion — about a tenth of a penny — and the trade
   * is deliberate: the alternative is holding the read delay open server-side
   * before generating, which parks an HTTP request for up to fifteen seconds.
   * `TEXTING-PLAN.md` §18 records the refinement.
   */
  const now = Date.now()
  const withoutPending = stored.filter(
    (turn) => !(turn.speaker === 'persona' && turn.revealAt && Date.parse(turn.revealAt) > now),
  )

  const withUser = appendTurn(withoutPending, {
    speaker: 'user',
    text: verdict.text,
    at: new Date().toISOString(),
  })
  await save(row.id, withUser)

  const context = await personaContext(user.id, input.personaSlug)
  const scope = `texting:${input.personaSlug}`

  // §16.3, on the typed stream. His message is already saved when this runs:
  // a message that is refused is still a message he sent, and quietly dropping
  // it would leave a thread that does not match the conversation.
  const check = await assessTurn({
    userId: user.id, sessionId: null, scope, speaker: 'user', text: verdict.text,
  })

  const meter = runMeter({ ...persona, ...context }, withUser, seed)

  if (check.action === 'distress') {
    await endThread(row.id, 'faded')
    return {
      ok: true, message: null, turns: visibleTurns(withUser, now),
      memory: context.memorySummary ?? null, exit: 'leaving', ending: 'faded',
      nextRevealAt: null, pending: null, presence: null, warmth: meter.warmth, distress: true, allowance,
      persona: personaView(persona),
    }
  }

  // WHERE THE THREAD IS, DECIDED BY THE STATE AND NEVER BY THE MODEL.
  const lastUserText = lastExchangeText(withUser)
  const verdictExit = nextExit({
    current: advanceExit((row.exit_state as SceneExit) ?? 'present', 'present'),
    warmth: meter.warmth,
    deadEndStreak: meter.deadEndStreak,
    completedExchanges: meter.completedExchanges,
    lastUserText,
    budget: warmExitBudget(seed),
  })

  // A second safety strike ends it outright, the same way a dismissal does.
  const exit: SceneExit = check.action === 'end' ? 'leaving' : verdictExit.exit
  const ending: TextingEnding | null = check.action === 'end' ? 'dismissed' : verdictExit.ending

  // LEFT ON READ. No generation at all, which is also why a faded thread costs
  // less than a warm one rather than more.
  if (!repliesAtAll(exit, ending)) {
    await endThread(row.id, ending ?? 'faded')
    return {
      ok: true, message: null, turns: visibleTurns(withUser, now),
      memory: context.memorySummary ?? null, exit, ending: ending ?? 'faded',
      nextRevealAt: null, pending: null, presence: null, warmth: meter.warmth, distress: false, allowance,
      persona: personaView(persona),
    }
  }

  await supabase.from('texting_threads').update({ exit_state: exit }).eq('id', row.id)

  const reply = await textingReply({
    persona: { ...persona, ...context },
    turns: withUser,
    meter,
    exit,
    seed,
    userId: user.id,
    ...(check.action === 'decline' ? { directive: DECLINE_DIRECTIVE } : {}),
  })

  if (!reply.ok) {
    return {
      ok: false, message: reply.message, turns: visibleTurns(withUser, now),
      memory: context.memorySummary ?? null, exit, ending: null,
      nextRevealAt: null, pending: null, presence: null, warmth: meter.warmth, distress: false, allowance,
      persona: personaView(persona),
    }
  }

  // Her stream too (§16.3), and here it is cheaper than in a rep: a typed reply
  // has not been spoken yet, so one that crosses the line is never stored and
  // never shown rather than corrected after the fact.
  const hers = await assessTurn({
    userId: user.id, sessionId: null, scope, speaker: 'agent', text: reply.text,
  })
  if (hers.action !== 'none') {
    return {
      ok: false, message: 'She did not answer. Try that again in a moment.',
      turns: visibleTurns(withUser, now), memory: context.memorySummary ?? null,
      exit, ending: null, nextRevealAt: null, pending: null, presence: null,
      warmth: meter.warmth, distress: false, allowance, persona: personaView(persona),
    }
  }

  const schedule = scheduleFor({
    warmth: meter.warmth,
    replyText: reply.text,
    pressuring: isPressuring(meter.warmth, meter.his),
    generationMs: reply.generationMs,
    seed: exchangeSeed(seed, exchangesFrom(withUser).length),
  })

  const sentAt = Date.now()
  const withReply = appendTurn(withUser, {
    speaker: 'persona',
    text: reply.text,
    at: new Date(sentAt).toISOString(),
    revealAt: new Date(sentAt + schedule.revealAfterMs).toISOString(),
  })
  await save(row.id, withReply)

  // The model may bring a warm ending forward when one of her authored exit
  // conditions genuinely fires — never a cold one. See `nextExit`.
  const finalVerdict = reply.signalledExit
    ? nextExit({
        current: exit, warmth: meter.warmth, deadEndStreak: meter.deadEndStreak,
        completedExchanges: meter.completedExchanges, lastUserText,
        budget: warmExitBudget(seed), modelSignalled: true,
      })
    : { exit, ending }

  if (finalVerdict.exit === 'leaving' && finalVerdict.ending) {
    await endThread(row.id, finalVerdict.ending)
  } else if (finalVerdict.exit !== exit) {
    await supabase.from('texting_threads').update({ exit_state: finalVerdict.exit }).eq('id', row.id)
  }

  return {
    ok: true,
    message: null,
    turns: visibleTurns(withReply, sentAt),
    memory: context.memorySummary ?? null,
    exit: finalVerdict.exit,
    ending: finalVerdict.ending,
    nextRevealAt: nextRevealAt(withReply, sentAt),
    pending: pendingTurn(withReply, sentAt),
    presence: { seenAfterMs: schedule.seenAfterMs, typingAfterMs: schedule.typingAfterMs },
    warmth: meter.warmth,
    distress: false,
    allowance,
    persona: personaView(persona),
  }
}

/**
 * The inbox and the debrief, as Server Actions.
 *
 * They were page-level server reads. The screens are rendered by `RouteView`
 * under the catch-all now — which is what puts them inside the shared chrome
 * layout so the rail stops remounting — and a client screen cannot await a
 * server module, so the reads come across the same seam every other texting
 * mutation already uses.
 */
export async function loadInbox(): Promise<Inbox | null> {
  return textingInbox()
}

export async function loadDebrief(slug: string): Promise<ThreadDebrief | null> {
  return textingDebrief(slug)
}

/**
 * Start fresh.
 *
 * **It ENDS the current thread; it never deletes one.** The original
 * `text_threads` had a delete policy and an argument for it — "nobody would pay
 * to change what they themselves typed" — which expired the moment a thread
 * became a daily quota. A deletable thread is a resettable allowance (rule 11),
 * and the debrief has to be able to say what happened months later.
 *
 * The second promise is separate and the caller decides: clearing what she
 * remembers between threads (§08). Restarting a conversation that went badly is
 * not the same as asking her to forget you.
 */
export async function startFresh(input: {
  personaSlug: string
  forgetMemory: boolean
}): Promise<TextingResult> {
  const user = await currentUser()
  if (!user) return { ok: false, message: 'You are signed out.' }

  const row = await openRow(user.id, input.personaSlug)
  if (row) {
    const supabase = await supabaseServer()
    const { error } = await supabase
      .from('texting_threads')
      // `abandoned`, NOT `faded`. See `TextingEnding` — marking a thread he
      // closed himself as one she walked away from would have the debrief
      // report the opposite of what happened.
      .update({ state: 'ended_cold', ending: 'abandoned', ended_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) return { ok: false, message: `Not cleared — ${error.message}` }
  }

  if (input.forgetMemory) {
    const forgotten = await forgetPersona(input.personaSlug)
    if (!forgotten.ok) return forgotten
  }

  revalidatePath(`/texting/${input.personaSlug}`)
  revalidatePath('/texting')
  return { ok: true, message: null }
}

/** Her withheld message, if one is waiting. */
function pendingTurn(
  turns: readonly TextingTurn[],
  now: number,
): { text: string; revealAt: string } | null {
  for (const turn of turns) {
    if (turn.speaker !== 'persona' || !turn.revealAt) continue
    if (Date.parse(turn.revealAt) > now) return { text: turn.text, revealAt: turn.revealAt }
  }
  return null
}

/** Everything he sent since her last reply, joined. The exit reads this. */
function lastExchangeText(turns: readonly TextingTurn[]): string {
  const exchanges = exchangesFrom(turns)
  const last = exchanges.at(-1)
  if (!last) return ''
  return last.user.map((turn) => turn.text).join('\n')
}

async function endThread(id: string, ending: TextingEnding): Promise<void> {
  try {
    const supabase = await supabaseServer()
    await supabase
      .from('texting_threads')
      .update({
        state: ending === 'warm' ? 'ended_warm' : 'ended_cold',
        ending,
        exit_state: 'leaving',
        ended_at: new Date().toISOString(),
      })
      .eq('id', id)
  } catch {
    // Best-effort, like every write around a live conversation.
  }
}

/**
 * Roll the thread forward in place.
 *
 * Best-effort by the same rule the rep lifecycle follows: losing the write
 * costs one saved message, and it must never cost the reply already on screen.
 */
async function save(id: string, turns: TextingTurn[]): Promise<void> {
  try {
    const supabase = await supabaseServer()
    await supabase.from('texting_threads').update({ turns: asJson(turns) }).eq('id', id)
  } catch {
    // See above.
  }
}
