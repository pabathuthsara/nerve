/**
 * What the pipeline does to her line between the writer and the synthesiser.
 *
 * Three rules from PERSONA-REALISM-REPORT, each of them the same lesson this
 * directory has already learned three times (`maxWords`, `maxSentences`, the
 * em-dash): a rule that is only ever STATED to a text model is a rule it keeps
 * most of the time, and "most of the time" is a defect when the failure is
 * audible. So each is enforced here, in code, on the reply that arrived whole.
 *
 *   `enforceDeliveryTags`  R3. At most one leading tag, from a list that
 *                          depends on how warm she is, and `[laughs]` only on a
 *                          turn the session permitted it.
 *   `deadEndReply`         R7. A dead end gets a dead-end reply, in her own
 *                          words, not ten words of rescue.
 *   `withoutParticle`      R4. A pre-rendered "Mm." has already been heard, so
 *                          a line that opens with its own "Mm," must not say it
 *                          twice.
 *
 * Pure. No network, no audio, no DOM. It runs on the edge inside the turn
 * route and in the browser on the legacy path, and both must reach the same
 * answer — rule 1's lesson about a fix wired into one arm.
 */

import { bandFor, type WarmthBand } from '@/lib/warmth/bands'
import { spokenWordCount } from './truncate'

/* ------------------------------------------------------------------ *
 * R3 — delivery tags
 * ------------------------------------------------------------------ */

/**
 * The persona vocabulary `compileDeliveryTags` itself emits. Always allowed:
 * these are how SHE sounds, and the pipeline prepends one of them anyway when
 * the writer did not open with a tag of its own.
 */
const PERSONA_TAGS = new Set([
  'playful', 'dry', 'earnest', 'flat', 'cutting', 'clipped', 'distracted', 'polite', 'amused',
])

/** A sigh is available at every warmth: a cold one is a dispreferred answer. */
const COLD_TAGS = new Set(['sighs'])

/**
 * The warm bands add the breath and the lean-in.
 *
 * Deliberately short. v3 reads a great many tags and every one of them is a
 * way for a writer to perform an emotion instead of having it; this list is the
 * texture a person actually has in conversation and nothing theatrical.
 */
const WARM_TAGS = new Set(['sighs', 'exhales', 'curious'])

/** Everything a writer might produce that means she laughed. */
const LAUGH = /^(?:laughs?|laughing|laughs softly|laughs quietly|chuckles?|chuckling|giggles?|giggling|soft laugh|small laugh)$/i

const WARM_BANDS = new Set<WarmthBand>(['OPEN', 'ENGAGED', 'INVESTED'])

export interface TagContext {
  warmth: number
  /**
   * The session permitted a laugh on this turn (`WarmthSession.decideExpression`).
   *
   * Absent is FALSE. A laugh is the strongest interest signal a listener reads,
   * and one that arrives on a turn nobody permitted is a character laughing at
   * nothing — so the default is the safe direction.
   */
  laughAllowed?: boolean
}

export interface TagDecision {
  /** The line, with at most one leading tag and nothing bracketed after it. */
  text: string
  /** She opens with a laugh on this line. Reported so it can be rationed. */
  laughed: boolean
}

/**
 * At most one tag, at the front, from the list this warmth allows.
 *
 * A bracketed span anywhere else is removed rather than spoken: v3 would read a
 * mid-line tag as prosody and restart her delivery halfway through, and the
 * transcript strips it anyway (`stripDeliveryTags`), so the ear and the record
 * would disagree. A laugh the session did not permit is removed, not swapped for
 * another tag — whatever came after it is still her line.
 */
export function enforceDeliveryTags(text: string, context: TagContext): TagDecision {
  const band = bandFor(Number.isFinite(context.warmth) ? context.warmth : 0)
  const allowed = WARM_BANDS.has(band) ? WARM_TAGS : COLD_TAGS
  const match = /^\s*\[([^\]]*)\]\s*/.exec(text)
  const rest = (match ? text.slice(match[0].length) : text)
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!match) return { text: rest, laughed: false }

  const tag = (match[1] ?? '').trim().toLowerCase()
  if (LAUGH.test(tag)) {
    // Never at CLOSED or HOSTILE, whatever the session said: a stranger who
    // wants you gone does not laugh at your joke, and one who does is telling
    // you something the meter says is untrue.
    const laughs = context.laughAllowed === true && WARM_BANDS.has(band)
    return laughs ? { text: `[laughs] ${rest}`.trim(), laughed: true } : { text: rest, laughed: false }
  }
  if (PERSONA_TAGS.has(tag) || allowed.has(tag)) return { text: `[${tag}] ${rest}`.trim(), laughed: false }
  return { text: rest, laughed: false }
}

/* ------------------------------------------------------------------ *
 * R7 — a dead end gets a dead-end reply
 * ------------------------------------------------------------------ */

/**
 * How far past the mirror cap a first sentence may run before it is a rescue.
 *
 * Twice, per the report. The mirror cap on a dead end is two words, so four is
 * still a grunt with a word of colour on it — "Mm, maybe not." — and anything
 * longer is her carrying a conversation he has left.
 */
export const DEAD_END_OVERRUN = 2

/**
 * The line she ships when he has given her nothing.
 *
 * ── WHY THIS IS NEEDED WHEN THE MIRROR CAP EXISTS ────────────────────────
 *
 * `mirrorCapFor` lowers her ceiling to two words on a dead end, and
 * `capToBudget` always keeps her first sentence WHOLE — deliberately, because a
 * line cut mid-clause is worse than a long one. Those two rules together mean
 * the cap can never bind a long first sentence. Measured on Cass, 18 September:
 *
 *   him "Okay."  her "I'm just trying to find one painting I like here."
 *   him "Ok"     her "There's a lot of stuff here I don't get."
 *   him "Okay."  her "Sometimes I think art's just stuff people hang up."
 *
 * Three dead ends, three volunteered sentences, and a two-word cap that never
 * fired once. The fix is not to shred her sentence; it is to replace a rescue
 * with what a person actually says to "Okay." — one of her own micro-replies,
 * authored in her persona file (rule 10), picked with the turn's own seed so a
 * replay is deterministic.
 *
 * Returns null when the reply may ship as it is.
 */
export function deadEndReply(
  text: string,
  options: { wordCap: number; microReplies: readonly string[] | undefined; pick: () => number },
): string | null {
  const replies = options.microReplies?.filter((line) => line.trim())
  if (!replies || replies.length === 0) return null
  const first = text.trim().split(/(?<=[.!?]["'’”)]?)\s+/)[0] ?? ''
  if (spokenWordCount(first) <= Math.max(1, options.wordCap) * DEAD_END_OVERRUN) return null
  const index = Math.min(replies.length - 1, Math.floor(Math.max(0, options.pick()) * replies.length))
  return replies[index] ?? replies[0] ?? null
}

/* ------------------------------------------------------------------ *
 * R4 — the particle is already said
 * ------------------------------------------------------------------ */

/**
 * The line without its own opening particle, when one has already been heard.
 *
 * A pre-rendered "Mm." plays while the writer is still working, and the writer
 * — which never heard it — is free to open with "Mm, maybe." as well. Said
 * twice it is a stutter. Only the SAME particle is removed ("Mm" after "Mm."),
 * and only when something is left after it, so a particle can never delete the
 * line it was covering for.
 */
export function withoutParticle(text: string, particle: string | null | undefined): string {
  if (!particle) return text
  const word = particle.replace(/[^\p{L}]/gu, '').toLowerCase()
  if (!word) return text
  // The particle's own word, its last letter held as long as she likes ("Mm",
  // "Mmm"), and then PUNCTUATION. Without the punctuation "Oh" would eat
  // "Ohio", which is a place and not a hesitation.
  const pattern = new RegExp(
    `^\\s*(?:\\[[^\\]]*\\]\\s*)?${escape(word)}${escape(word.slice(-1))}*[.,!?…—-]+\\s+`,
    'iu',
  )
  const match = pattern.exec(text)
  if (!match) return text
  const tag = /^\s*(\[[^\]]*\])/.exec(match[0])?.[1]
  const rest = text.slice(match[0].length).trim()
  if (!rest) return text
  const capitalised = rest.charAt(0).toUpperCase() + rest.slice(1)
  return tag ? `${tag} ${capitalised}` : capitalised
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
