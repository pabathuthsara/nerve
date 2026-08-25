/**
 * Text mode's conversation, as data (P1).
 *
 * A text rep is the same character, the same contract and the same memory as a
 * voice rep, typed. What it is NOT is a session: it spends no quota, appends
 * nothing to `usage_ledger` at a per-minute rate, moves no streak, produces no
 * scorecard and reaches no unlock. The migration for `text_threads` says why at
 * length; this module is the shape.
 *
 * Everything here is pure, so the rules that matter — how long a message may
 * be, how much history the model is shown, that a thread cannot grow without
 * bound — are assertions rather than hopes.
 */

/**
 * One typed turn.
 *
 * `speaker` deliberately matches the normalised transcript shape both voice
 * adapters emit (§04) rather than inventing a third vocabulary. The timings
 * are gone because a typed conversation does not have them, and a `t_start` of
 * zero would be a lie that the warmth engine could one day read.
 */
export interface TextTurn {
  speaker: 'user' | 'persona'
  text: string
  /** ISO. When it was said, which is all the timing text mode has. */
  at: string
}

/**
 * The longest single message.
 *
 * Generous for a typed reply and far short of somebody pasting a document into
 * a proxied model. The refusal is a message the user reads, not a truncation:
 * silently cutting somebody's sentence in half and answering the first part is
 * the same failure the turn-taking calibration exists to prevent.
 */
export const MAX_MESSAGE_CHARS = 500

/**
 * How many turns a thread keeps.
 *
 * A rolling window rather than an archive. The continuity rule is that this is
 * one encounter (`lib/personas/shared.ts`) and an encounter has a length; past
 * this the oldest turns fall off, which is also what stops one thread growing
 * into an unbounded jsonb column somebody pays to store forever.
 *
 * Sixty turns is roughly thirty exchanges — comfortably longer than a
 * three-minute voice rep, which is about fifteen.
 */
export const MAX_THREAD_TURNS = 60

/** How many of those the character model is shown. */
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
      message: `That is ${text.length} characters. Keep it under ${MAX_MESSAGE_CHARS} — you are talking, not writing.`,
    }
  }
  return { ok: true, text }
}

/** Appends a turn and keeps the thread inside its window. */
export function appendTurn(turns: readonly TextTurn[], turn: TextTurn): TextTurn[] {
  return [...turns, turn].slice(-MAX_THREAD_TURNS)
}

/**
 * A stored `turns` column, read defensively.
 *
 * jsonb, so the shape is a promise rather than a guarantee. A malformed entry
 * is dropped rather than thrown on: losing one line of a practice conversation
 * is a bad afternoon, and a thrown page on a screen somebody opened to avoid
 * their microphone is the failure this whole mode exists to remove.
 */
export function readTurns(value: unknown): TextTurn[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const speaker = row['speaker']
    const text = row['text']
    if (speaker !== 'user' && speaker !== 'persona') return []
    if (typeof text !== 'string' || !text.trim()) return []
    const at = typeof row['at'] === 'string' ? row['at'] : new Date(0).toISOString()
    const turn: TextTurn = { speaker, text, at }
    return [turn]
  }).slice(-MAX_THREAD_TURNS)
}

/** Our turns as chat messages, newest window only. */
export function historyFrom(turns: readonly TextTurn[]): { role: 'user' | 'assistant'; content: string }[] {
  return turns
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.speaker === 'user' ? ('user' as const) : ('assistant' as const),
      content: turn.text,
    }))
}
