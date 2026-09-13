/**
 * A texting thread, as data.
 *
 * Pure. Everything that decides how long a message may be, how much history the
 * model is shown, and that a thread cannot grow without bound is an assertion
 * here rather than a hope somewhere else.
 *
 * ── WHAT A TURN CARRIES THAT A SPOKEN ONE DOES NOT ───────────────────────
 *
 * `revealAt`. A spoken reply exists the moment it is audible; a typed one has
 * been sent at a time somebody chose, and the whole of `./presence.ts` is the
 * argument that WHEN she answers is as legible as what she says. So her turn is
 * written to the database immediately and shown later, and the server stamps
 * the moment it becomes visible.
 *
 * That one field buys three behaviours for free:
 *
 *   a reload mid-delay      she is simply still typing
 *   a closed tab            the message is waiting when he comes back, which
 *                           is exactly what a phone does
 *   left on read            there is no next turn to reveal, so the receipt
 *                           sits at Seen forever with nothing under it
 */

/**
 * One typed message.
 *
 * `speaker` matches the normalised transcript shape both voice adapters emit
 * (§04) rather than inventing a third vocabulary. The sub-second timings are
 * gone because a typed message does not have them, and a `t_start` of zero
 * would be a lie the warmth engine could one day read.
 */
export interface TextingTurn {
  speaker: 'user' | 'persona'
  text: string
  /** ISO. When it was sent. */
  at: string
  /**
   * ISO. When it becomes visible to him. Her turns only.
   *
   * Absent means "already visible", which is always true of his own messages
   * and of any turn written before the presence layer existed.
   */
  revealAt?: string
}

/**
 * The longest single message.
 *
 * Generous for a typed message and far short of somebody pasting a document
 * into a proxied model. The refusal is a message he reads, never a truncation:
 * silently cutting a sentence in half and answering the first part is the same
 * failure the turn-taking calibration exists to prevent.
 */
export const MAX_MESSAGE_CHARS = 500

/**
 * How many turns a thread keeps.
 *
 * Higher than the voice arm's rolling window and higher than the old text
 * mode's sixty, because a texting conversation is genuinely longer: §14 of the
 * plan costs a thread at 25 of his messages, so 120 turns is roughly double a
 * full conversation and no thread should ever reach it before the exit does.
 *
 * It is a runaway guard rather than a feature. If a thread is hitting this, the
 * exit layer has failed and that is the bug.
 */
export const MAX_THREAD_TURNS = 120

/**
 * How many of those the character model is shown.
 *
 * DELIBERATELY UNCHANGED from the voice arm's forty. It is the single number
 * that decides whether per-message cost compounds or plateaus: past this the
 * window slides and every message costs the same, which is what makes an
 * unbounded conversation a bounded bill (plan §14).
 */
export const MAX_HISTORY_TURNS = 40

export type MessageRefusal = 'empty' | 'too-long'

export type MessageVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: MessageRefusal; message: string }

/** What may be sent. Trimmed, never truncated. */
export function readMessage(raw: unknown): MessageVerdict {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return { ok: false, reason: 'empty', message: 'Type something first.' }
  if (text.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      reason: 'too-long',
      message: `That is ${text.length} characters. Keep it under ${MAX_MESSAGE_CHARS} — you are texting, not writing.`,
    }
  }
  return { ok: true, text }
}

/** Appends a turn and keeps the thread inside its window. */
export function appendTurn(turns: readonly TextingTurn[], turn: TextingTurn): TextingTurn[] {
  return [...turns, turn].slice(-MAX_THREAD_TURNS)
}

/**
 * A stored `turns` column, read defensively.
 *
 * jsonb, so the shape is a promise rather than a guarantee. A malformed entry
 * is dropped rather than thrown on: losing one line of a practice conversation
 * is a bad evening, and a thrown page on a screen somebody opened instead of
 * their microphone is the failure this whole section exists to remove.
 */
export function readTurns(value: unknown): TextingTurn[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const row = entry as Record<string, unknown>
      const speaker = row['speaker']
      const text = row['text']
      if (speaker !== 'user' && speaker !== 'persona') return []
      if (typeof text !== 'string' || !text.trim()) return []
      const at = typeof row['at'] === 'string' ? row['at'] : new Date(0).toISOString()
      const revealAt = typeof row['revealAt'] === 'string' ? row['revealAt'] : undefined
      const turn: TextingTurn = { speaker, text, at, ...(revealAt ? { revealAt } : {}) }
      return [turn]
    })
    .slice(-MAX_THREAD_TURNS)
}

/**
 * The turns he can actually see right now.
 *
 * Her unrevealed reply is stored but withheld — see `revealAt`. His own
 * messages are never withheld: he wrote them, and a compose box that swallows
 * what you typed is a broken app rather than a patient character.
 */
export function visibleTurns(turns: readonly TextingTurn[], now: number): TextingTurn[] {
  return turns.filter((turn) => {
    if (turn.speaker === 'user') return true
    if (!turn.revealAt) return true
    return Date.parse(turn.revealAt) <= now
  })
}

/** When the next withheld turn becomes visible, or null if nothing is pending. */
export function nextRevealAt(turns: readonly TextingTurn[], now: number): string | null {
  for (const turn of turns) {
    if (turn.speaker !== 'persona' || !turn.revealAt) continue
    if (Date.parse(turn.revealAt) > now) return turn.revealAt
  }
  return null
}

/**
 * Her turns as chat messages, newest window only.
 *
 * CONSECUTIVE USER MESSAGES ARE NOT MERGED HERE, deliberately. The model should
 * see that he sent three in a row — that is the fact `TextingTurnShape.messages`
 * is scored on, and flattening it would leave the steering line describing a
 * conversation the history does not show.
 */
export function historyFrom(
  turns: readonly TextingTurn[],
): { role: 'user' | 'assistant'; content: string }[] {
  return turns.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.speaker === 'user' ? ('user' as const) : ('assistant' as const),
    content: turn.text,
  }))
}

/**
 * One exchange: everything he said, and what she said back.
 *
 * The unit the meter folds over. `messages` is why it exists — a thread can
 * produce two of his turns in a row and a spoken conversation cannot, so the
 * grouping is the medium's own shape rather than a convenience.
 */
export interface Exchange {
  /** His messages, in order. At least one. */
  user: TextingTurn[]
  /** Her reply, if she has given one yet. */
  reply: TextingTurn | null
}

/** The thread as exchanges. Leading persona turns (an opener) are skipped. */
export function exchangesFrom(turns: readonly TextingTurn[]): Exchange[] {
  const exchanges: Exchange[] = []
  let pending: TextingTurn[] = []

  for (const turn of turns) {
    if (turn.speaker === 'user') {
      pending.push(turn)
      continue
    }
    // Her turn. It closes the pending exchange, or is an opener with nothing
    // in front of it — in which case there is no exchange to record yet.
    if (pending.length > 0) {
      exchanges.push({ user: pending, reply: turn })
      pending = []
    }
  }
  if (pending.length > 0) exchanges.push({ user: pending, reply: null })
  return exchanges
}
