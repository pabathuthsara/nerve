/**
 * Forward remarks — "I'm more interested in your ass" — and how she takes them.
 *
 * `REP-FIXES-PLAN-2026-10-03.md` Part A, signed off by the product owner on
 * 3 October 2026. A NEW FILE BESIDE THE JUDGEMENT LAYER, not a parameter added
 * to it (CLAUDE.md rule 19): nothing in `fast.ts`, `steering.ts`, `bands.ts`,
 * the persona files or the grader is opened to make this work.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────
 *
 * On the rep of 3 October (Cass, `b2d62aa7…`) "I'm more interested in your
 * ass." scored +0.56 as a CALLBACK, because "interested" echoed her previous
 * line, and the repeat scored +1.16 for length. Warmth rose 77.6 → 79.3 and she
 * offered her number. The slow judge, whose creepiness rule exists for exactly
 * this, never saw the line: `PERSONAL_MARKERS` had `body` and not `ass`. And
 * nothing told her how to react, so she answered "That's rude. I'm Cass." —
 * flat, whichever way it went.
 *
 * ── THE OWNER'S DECISION, AND WHY ITS NUMBERS LIVE HERE ALONE ────────────
 *
 * The same line means different things at different points in a conversation:
 *
 *   65 and above   flirting — she is into him and has not left. She flirts back.
 *   45 to 64.99    too fast, not unwelcome. A small smile, a little flirty,
 *                  "you're getting ahead of yourself".
 *   below 45       creepy, from a near-stranger. Cooler, shorter, real.
 *
 * Repeats charm her less: one forward remark in his previous four turns lands
 * the next one zone lower, two or more make it creepy whatever the meter says.
 *
 * **65 and 45 are not band boundaries** (ENGAGED is 60, OPEN 40) and they are
 * not a warmth opinion for anything else in the product. They are the owner's
 * thresholds for this one class of line, and they are named and used here and
 * nowhere else — rule 16's warning about a file that grows a warmth opinion of
 * its own is about exactly the move of reaching for these elsewhere.
 *
 * ── EACH CHARACTER IN HER OWN WAY ────────────────────────────────────────
 *
 * The reaction is chosen by the zone AND her own authored flirtiness dial
 * (`persona.gated.flirtiness`, read and never edited), and every clause ends
 * "in your own way", leaning on the voice her contract already gives her. Four
 * characters given one instruction say four different things; the audition in
 * §7 of the plan is where that was checked out loud.
 *
 * ── PG-13 HOLDS ──────────────────────────────────────────────────────────
 *
 * Flirting and innuendo are inside PG-13 (rule 13, spec §16). Every clause
 * tells her never to describe her body and never to make it sexual, and
 * `assertForwardClause` refuses a clause that breaks that — checked in code,
 * not in a style note, for the reason rule 9 gives. Explicit content is not
 * this module's: moderation owns it, unchanged, at any warmth.
 */
import type { Persona } from '@/lib/voice/types'

/** The owner's thresholds (3 October 2026). For this class of line only. */
export const FORWARD_WELCOME_AT = 65
export const FORWARD_TOO_FAST_AT = 45
/** How far back a previous forward remark still counts as "again". */
export const FORWARD_REPEAT_WINDOW = 4

export type ForwardZone = 'welcome' | 'too-fast' | 'creepy'

/**
 * What the line is worth, RAW — before the character's gain and decay, and
 * bounded by `WarmthEngine.scale`'s loss cap like any other turn. Starting
 * values from the plan, kept after the audition (§7).
 */
export const FORWARD_DELTA: Record<ForwardZone, number> = {
  welcome: 2,
  'too-fast': -4,
  creepy: -12,
}

/** Her flirtiness ceiling at or above which an open dial flirts BACK. */
export const FLIRT_BACK_CEILING = 61

export interface ForwardRemark {
  /** The words that matched, for the warmth event's detail. Never shown. */
  match: string
}

/* ------------------------------------------------------------------ *
 * Detection — lexical, pure, tuned for PRECISION
 * ------------------------------------------------------------------ *
 *
 * A false positive turns an ordinary line into a creepy one and costs him a
 * cliff he did not earn, so every pattern needs second-person framing or an
 * unmistakable appraisal. Bare words never match: "kick ass", "a body of
 * work", "chest of drawers", "it's hot in here", Klimt's The Kiss, and her own
 * name — Cass — all stay null. Recall is the slow judge's job, which is why
 * `PERSONAL_MARKERS` gained the same words (it only buys a scoring call).
 */

const APPRAISE = 'nice|cute|hot|sexy|perfect|gorgeous|fine|tight|great|beautiful|lovely|amazing|little|big'
/** Parts that are forward whenever they are HIS to remark on. */
const PARTS_ALWAYS = 'ass|butt|booty|bum|boobs|tits|breasts|rack|thighs|curves'
/** Parts that are ordinary words until somebody appraises them. */
const PARTS_APPRAISED = 'legs|lips|body|figure|chest'
const NOT_OF = String.raw`(?!\s+(?:of|on|in)\b)`

const FORWARD = new RegExp([
  // "your ass", "your nice ass" — but not "kick your ass", "bet your ass",
  // "get your ass over here", which are idioms about him and not about her.
  String.raw`(?<!\b(?:kick|kicked|kicking|whoop|kiss|cover|covered|save|saved|get|haul|move|bet)\s+)\byour\s+(?:(?:${APPRAISE})\s+)?(?:${PARTS_ALWAYS})\b`,
  // "nice ass", "you've got great legs", "sexy lips" — an appraisal of a part,
  // never somebody else's ("her", "the", "that painting's").
  String.raw`(?<!\b(?:her|his|its|their|the|that|this|those|these|my)\s+)\b(?:nice|cute|hot|sexy|perfect|gorgeous|fine|tight|great)\s+(?:${PARTS_ALWAYS}|${PARTS_APPRAISED})\b${NOT_OF}`,
  // "you have beautiful lips", "you've got such nice legs".
  String.raw`\byou(?:'ve|\s+have|\s+got|'ve\s+got|\s+have\s+got)\s+(?:(?:such|a|really|so|very)\s+)*(?:${APPRAISE})\s+(?:${PARTS_ALWAYS}|${PARTS_APPRAISED})\b${NOT_OF}`,
  // "your legs look amazing", "I love your lips".
  String.raw`\byour\s+(?:${PARTS_APPRAISED})\s+(?:is|are|look|looks)\s+(?:so\s+|really\s+)?(?:${APPRAISE}|good|incredible|unreal)\b`,
  String.raw`\bi\s+(?:love|like|dig|want)\s+your\s+(?:${PARTS_ALWAYS}|${PARTS_APPRAISED})\b${NOT_OF}`,
  // "you're so hot", "you look sexy", "you're gorgeous". Hot and fit need an
  // intensifier or "look": "if you are hot I'll open a window" is weather.
  String.raw`\byou(?:'re|\s+are|\s+look|\s+looked)\s+(?:so|really|very|super|seriously|pretty|incredibly|unbelievably)\s+(?:hot|sexy|fit|gorgeous|beautiful|stunning)\b`,
  String.raw`\byou\s+look(?:ed)?\s+(?:hot|sexy|gorgeous|beautiful|stunning)\b`,
  String.raw`\byou(?:'re|\s+are)\s+(?:sexy|gorgeous|beautiful|stunning)\b`,
  // Advances. "kiss you", "take you home", "you in my bed", "checking you
  // out", "I want you" (not "I want you to see this"), and "I could grab you"
  // (not "grab you a coffee").
  String.raw`\b(?:kiss|kissing)\s+you\b`,
  String.raw`\b(?:take|get|bring)\s+you\s+(?:back\s+)?home\b`,
  String.raw`\byou\s+(?:in|into|to)\s+(?:my\s+)?bed\b`,
  String.raw`\bchecking\s+you\s+out\b`,
  String.raw`\b(?:want|wanna)\s+you\b(?!\s+(?:to|and|or|guys|two|all|both|here|there|back)\b)(?!\s*\?)`,
  String.raw`\b(?:grab|touch)\s+you\b(?!\s+(?:a|an|some|one|something|anything|the|another|more|coffee|drinks?|water|tea|seats?|chairs?)\b)`,
].join('|'), 'i')

/** Smart quotes and runs of whitespace normalised, so "you’re" reads as "you're". */
function normalise(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ')
}

export function detectForwardRemark(text: string): ForwardRemark | null {
  const match = FORWARD.exec(normalise(text))
  return match ? { match: match[0].trim() } : null
}

/* ------------------------------------------------------------------ *
 * The zone
 * ------------------------------------------------------------------ */

/**
 * Where her warmth was when he said it — BEFORE this turn's own delta — and
 * how many forward remarks he made in his previous `FORWARD_REPEAT_WINDOW`
 * turns.
 */
export function forwardZone(warmth: number, priorForwardRemarks: number): ForwardZone {
  const base: ForwardZone = warmth >= FORWARD_WELCOME_AT ? 'welcome'
    : warmth >= FORWARD_TOO_FAST_AT ? 'too-fast'
      : 'creepy'
  if (priorForwardRemarks >= 2) return 'creepy'
  if (priorForwardRemarks === 1) return base === 'welcome' ? 'too-fast' : 'creepy'
  return base
}

/* ------------------------------------------------------------------ *
 * Her reaction
 * ------------------------------------------------------------------ */

/** Which column of the plan's table her own dial puts her in, right now. */
export type FlirtColumn = 'flirt' | 'light' | 'closed'

/**
 * Read off `gated.flirtiness`, never edited. Open means warmth has reached the
 * gate her author set; how far she goes once open is her ceiling.
 *
 * `FLIRT_BACK_CEILING` is 61 rather than the plan table's 60 because the plan's
 * own worked example puts Maya (60/60) in the light column, and her contract
 * lists "compliments about how you look" under what LOSES her warmth. The
 * example and her author agree; the table's boundary was the odd one out.
 */
export function flirtColumn(persona: Persona, warmth: number): FlirtColumn {
  const dial = persona.gated.flirtiness
  if (dial.ceiling <= 0 || warmth < dial.unlocksAt) return 'closed'
  return dial.ceiling >= FLIRT_BACK_CEILING ? 'flirt' : 'light'
}

const NEVER = 'Never describe your body and never make it sexual.'
const LIGHT = 'Keep it light.'

/**
 * Authored, reviewed, tested — never generated (rule 10). Parenthesised like
 * every other one-shot direction she is given, so it reads as stage direction
 * and not as something to say.
 */
export const FORWARD_CLAUSES: Record<ForwardZone, Record<FlirtColumn, string>> = {
  welcome: {
    flirt: `He just made a bold comment about you, and from him it lands. Answer the remark itself, don't change the subject. Take it as a compliment and flirt back, in your own way: a tease, a comeback, or a thank-you with a grin. Playful, not flat, not a lecture. ${LIGHT} ${NEVER}`,
    light: `He just made a bold comment about you, and from him you don't mind it. Answer the remark itself: pleased, a little flirty, mostly amused, in your own way. ${LIGHT} ${NEVER}`,
    closed: `He just made a bold comment about you. You like him enough not to mind, but you don't flirt back. Answer the remark itself, in your own way: amused, dry, an eyebrow raised. ${LIGHT} ${NEVER}`,
  },
  'too-fast': {
    flirt: `He just made a bold comment about you, a bit fast for where you two are. Answer the remark itself with a small smile: a little flirty, and let him know he's getting ahead of himself, in your own way. ${LIGHT} ${NEVER}`,
    light: `He just made a bold comment about you, a bit fast for where you two are. You are amused rather than charmed. Answer the remark itself and tell him to slow down, in your own way. ${LIGHT} ${NEVER}`,
    closed: `He just made a bold comment about you, too fast for where you two are. You are not charmed. Answer the remark itself and tell him to slow down, in your own way, without flirting back. ${NEVER}`,
  },
  creepy: {
    flirt: CREEPY(),
    light: CREEPY(),
    closed: CREEPY(),
  },
}

/**
 * The first audition had her answer "That's not really something I talk
 * about" — evasive, as if he had asked about her salary — from two different
 * characters in nearly the same words. So the clause names the reaction (taken
 * aback, put off) and forbids the two escapes: changing the subject and
 * explaining herself.
 */
function CREEPY(): string {
  return `He just said something about your body, and from someone you barely know it's creepy. React to the remark itself the way you really would, taken aback and put off, cooler and shorter, in your own way. Don't change the subject, don't explain yourself, don't lecture him and don't flirt. ${NEVER}`
}

const REPEAT = 'This is not the first time he has gone there.'

/**
 * The one-shot direction for her next reply only (rule 5). Ends in her own
 * way because the persona's voice, not this file, decides the words.
 */
export function forwardClause(zone: ForwardZone, persona: Persona, warmth: number, repeat: boolean): string {
  const body = FORWARD_CLAUSES[zone][flirtColumn(persona, warmth)]
  return `(${repeat ? `${REPEAT} ` : ''}${body})`
}

/* ------------------------------------------------------------------ *
 * The PG-13 check, in code
 * ------------------------------------------------------------------ */

const EXPLICIT = /\b(?:sex|sexy\s+time|naked|nude|horny|aroused|orgasm|fuck\w*|cock|dick|pussy|tits|boobs|breasts|nipples?|ass|butt|thong|lingerie|underwear|strip|undress|bed\s+with|sleep\s+with|hook\s*up)\b/i
/** First-person description of her own body — "my legs", "I have nice…". */
const SELF_DESCRIPTION = /\b(?:my\s+(?:body|legs|lips|chest|figure|curves|thighs|skin)|i\s+(?:have|'ve\s+got)\s+(?:nice|great|good)\s+\w+)\b/i

/**
 * Refuses rather than sanitises (rule 9's shape). Every authored clause passes
 * it; a test proves an explicit one does not.
 */
export function assertForwardClause(clause: string): string {
  if (EXPLICIT.test(clause)) throw new Error(`Forward clause carries explicit vocabulary: ${clause}`)
  if (/\d/.test(clause)) throw new Error(`Forward clause carries digits: ${clause}`)
  if (SELF_DESCRIPTION.test(clause)) throw new Error(`Forward clause describes her body: ${clause}`)
  if (!clause.includes(NEVER)) throw new Error(`Forward clause is missing the PG-13 line: ${clause}`)
  if (!/in your own way/i.test(clause)) throw new Error(`Forward clause is not hers to phrase: ${clause}`)
  return clause
}

// Checked at module load as well as in the suite: a clause that fails here
// must never reach a character, even in a build where nobody ran the tests.
for (const zone of Object.values(FORWARD_CLAUSES)) for (const clause of Object.values(zone)) assertForwardClause(clause)
