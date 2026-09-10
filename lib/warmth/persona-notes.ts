/**
 * What moves this particular character, as the judge needs to see it.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * The slow scorer is handed his line, her line, her previous line and a warmth
 * number. It is not told WHO SHE IS. Persona name and room select the generic
 * dating prompt and nothing else, so the one layer in the product capable of
 * judging what a turn meant judges it for a person who does not exist.
 *
 * Maya's contract says in as many words that what loses her warmth is "the
 * interview: a run of questions with nothing of his own in between". The actor
 * is told that. The judge is not — so a fourth consecutive question scored as a
 * fourth open question, +3 each time, and the single most specific thing her
 * author ever wrote about her was worth nothing to the meter.
 *
 * ── EXTRACT, NEVER RE-AUTHOR ─────────────────────────────────────────────
 *
 * The obvious fix is a `judgeNotes` field on `Persona`, and it is the wrong
 * one: it makes two sources of truth for one fact, they drift, and the drifted
 * copy is the one nobody is reading during a listening pass. Rule 10 wants
 * content authored once, in the repo, in the persona file.
 *
 * So this reads the authored sections straight out of `persona.contract` — the
 * same string the character is compiled from, unchanged, not re-typed. Adding
 * this file moves no compiled digest, because it does not touch the contract;
 * it only reads it.
 *
 * ── AND HALF OF THE CONTRACT MUST NEVER REACH THE JUDGE ──────────────────
 *
 * Only these two sections. Not her history, not her mood, not her exit
 * conditions, and above all not "How it comes out" — a judge told she is "dry
 * and does not signal jokes" starts reading her flatness as evidence about HIS
 * turn, which is the exact laundering `PAIR_RULE` exists to forbid.
 *
 * Pure. Memoised on the contract string, so a live rep pays the parse once.
 */

import type { Persona } from '@/lib/voice/types'

export interface PersonaNotes {
  /** Her authored "What earns your warmth", as bullet lines. */
  likes: string[]
  /** Her authored "What loses it", as bullet lines. */
  dislikes: string[]
}

const EMPTY: PersonaNotes = { likes: [], dislikes: [] }

/** At most this many lines per side. The judge prompt is charged per turn. */
const MAX_NOTES = 4

const cache = new Map<string, PersonaNotes>()

/**
 * Everything under a `# Heading` up to the next `#` heading, as bullet lines.
 *
 * Tolerant of the leading `- ` the contracts use and of a heading that is
 * simply absent — an unrecognised contract yields nothing rather than throwing,
 * because a judge with no notes is the behaviour this product had yesterday and
 * a rep that crashes on a persona nobody has reformatted is not.
 */
function section(contract: string, heading: string): string[] {
  const start = contract.indexOf(`# ${heading}`)
  if (start === -1) return []
  const after = contract.slice(start + heading.length + 2)
  const end = after.search(/\n#\s/)
  return (end === -1 ? after : after.slice(0, end))
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_NOTES)
}

export function personaNotes(persona: Pick<Persona, 'contract'>): PersonaNotes {
  const contract = persona.contract
  if (typeof contract !== 'string' || contract.length === 0) return EMPTY
  const hit = cache.get(contract)
  if (hit) return hit
  const notes: PersonaNotes = {
    likes: section(contract, 'What earns your warmth'),
    dislikes: section(contract, 'What loses it'),
  }
  cache.set(contract, notes)
  return notes
}
