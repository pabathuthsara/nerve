/**
 * A rep that went well, minted as an object (RETENTION-AUDIT R10).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * A win used to mint nothing. She never speaks digits — that is product law
 * (§07, `rep-rules.ts`) and it is not moving — but the rep itself is a thing
 * that happened, and a record of it is the strongest "I want another" mechanic
 * available here: it is a **collection rather than a badge shelf**, it is
 * diegetic, and the roster is finite. Four characters, four records, and you
 * can see the hole where Robin's is not.
 *
 * §08's "a rail rather than a badge shelf" objection does not apply. A rail
 * says where you are, a badge says you have one, and a collection with visible
 * gaps says what is missing — which is a different sentence from all three.
 *
 * ── THE GUARDRAIL ────────────────────────────────────────────────────────
 *
 * **It is a record of a rep, not a relationship.** Name, level, time, date, one
 * line of what worked, and nothing else — no number, no scene, no portrait, no
 * copy that frames her as somebody who liked you. The visible strings go
 * through `assertPublishable` (`lib/share/cards.ts`) like every other artefact
 * this product mints, so the companion-app framing §16 forbids and §14 calls a
 * payment account waiting to be closed is refused in code rather than avoided
 * by convention.
 *
 * A line that fails the guard is dropped and the record still stands. That is
 * the right direction here and the opposite of the share card's: a share card
 * that cannot be made is simply not made, while a record already earned must
 * not vanish because a model wrote an awkward sentence about it.
 *
 * ── EARLIEST, NOT BEST ───────────────────────────────────────────────────
 *
 * The record is the rep that CLEARED her, which is the one that happened
 * rather than the one that flatters most. A shelf that quietly swaps in a
 * better rep every time you beat your own record is a leaderboard against
 * yourself, and the date on it would stop meaning anything.
 */

import type { Level } from './types'
import { UnpublishableCard, assertPublishable } from '@/lib/share/cards'

export interface ClearedRep {
  sessionId: string
  /** ISO. The day it happened. */
  at: string
  durationMs: number
  /** Null when the rep was never graded. The record still stands. */
  composite: number | null
  /** One line of what worked, from the judge (§07). Null when unavailable. */
  wentWell: string | null
}

export interface RepRecord {
  personaId: string
  personaName: string
  level: Level
  settingShort: string
  /** Null is the point: it is the visible gap in a finite collection. */
  cleared: ClearedRep | null
}

interface SessionLike {
  id: string
  personaId: string
  startedAt: string
  durationMs: number
  won: boolean
  composite: number | null
  wentWell: string | null
}

interface PersonaLike {
  id: string
  name: string
  level: Level
  settingShort: string
}

/**
 * One row per character on the roster, in ladder order, filled or empty.
 *
 * Every character is returned whether or not she has been cleared, because the
 * empty slots are half of what makes this a collection.
 */
export function buildRepRecords(
  personas: readonly PersonaLike[],
  sessions: readonly SessionLike[],
): RepRecord[] {
  const earliest = new Map<string, SessionLike>()
  for (const session of sessions) {
    if (!session.won) continue
    const held = earliest.get(session.personaId)
    if (!held || Date.parse(session.startedAt) < Date.parse(held.startedAt)) {
      earliest.set(session.personaId, session)
    }
  }

  return [...personas]
    .sort((a, b) => a.level - b.level)
    .map((persona) => {
      const win = earliest.get(persona.id)
      return {
        personaId: persona.id,
        personaName: persona.name,
        level: persona.level,
        settingShort: persona.settingShort,
        cleared: win
          ? {
            sessionId: win.id,
            at: win.startedAt,
            durationMs: win.durationMs,
            composite: win.composite,
            wentWell: publishableLine(persona, win),
          }
          : null,
      }
    })
}

/**
 * `Level 02 cleared`, or `Level 02` when it is not.
 *
 * The empty slot is not a cleared one and must not be labelled as though it
 * were — `LEVEL 01 CLEARED` above the words `Not yet.` is the card
 * contradicting itself, and the shelf's whole job is to be an honest record.
 */
export function recordLabel(level: Level, cleared = true): string {
  const name = `Level ${String(level).padStart(2, '0')}`
  return cleared ? `${name} cleared` : name
}

/**
 * The one line, if it survives the guard.
 *
 * Checked with the record's own label and name beside it rather than on its
 * own, because `assertPublishable` reads every visible field — and the failure
 * this exists to catch is a payload assembled from a template picking up an
 * unexpected value in one of them.
 */
function publishableLine(persona: PersonaLike, session: SessionLike): string | null {
  const line = session.wentWell?.trim()
  if (!line) return null
  try {
    assertPublishable({
      kind: 'rep_win',
      label: recordLabel(persona.level),
      headline: firstName(persona.name),
      line,
    })
    return line
  } catch (error) {
    // Refused, not sanitised. A record whose line reads as a relationship keeps
    // the record and loses the line — see the module note.
    if (error instanceof UnpublishableCard) return null
    throw error
  }
}

/** First token only. A surname on a minted object is a person, not a character. */
export function firstName(name: string): string {
  return (name.trim().split(/\s+/)[0] ?? '').slice(0, 24)
}
