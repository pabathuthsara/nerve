/**
 * He asked for her number.
 *
 * ── THE DEFECT THIS EXISTS FOR (30 September 2026) ──────────────────────
 *
 * The number was only ever decided at the thirty-second wind-down. A real rep
 * against Cass, armed at 66 and peaking at 71.7:
 *
 *   him  "So Cass, I have to go. Can I get your number before I go, though?"
 *   her  "No, not now. What's your name then?"
 *
 * …and the rep ended and awarded him her number. Two systems disagreed: the
 * farewell committed the exit, the model was never told she was willing and
 * improvised a refusal, and the end-of-rep rule then read the meter and said
 * yes. A number card after "no, not now" is the product contradicting itself
 * on the one moment it is built around.
 *
 * So asking is now a moment the rep acts on (`lib/data/rep.ts`): armed and
 * still warm enough to keep it (`givesNumber`), she says yes in her own words
 * and the rep ends on that line; otherwise nothing changes and she answers as
 * herself. The rule is the wind-down's rule, taken earlier — never a second
 * rule.
 *
 * ── WHY LEXICAL ──────────────────────────────────────────────────────────
 *
 * The same reason `leaving.ts` is: this ENDS A REP, synchronously, before her
 * reply is bought, so it has to be answered from the words already in hand and
 * it has to be narrow. It asks for HER contact, in a request frame. "What's
 * your favourite number" is not this, and neither is "I lost my phone".
 */
import { flattenPunctuation } from './text'

const CONTACT = String.raw`(?:phone\s+)?(?:number|digits|contact|insta(?:gram)?|socials?|snap(?:chat)?)`

const ASK = new RegExp([
  // "can I get your number", "could I have your digits", "may I take your insta"
  String.raw`\b(?:can|could|may)\s+i\s+(?:get|have|grab|take|ask\s+for)\s+your\s+${CONTACT}\b`,
  // "give me your number", "send me your contact"
  String.raw`\b(?:give|send|drop)\s+me\s+your\s+${CONTACT}\b`,
  // "what's your number" — but not "what's your favourite number"
  String.raw`\bwhat(?:'?s| is)\s+your\s+(?:phone\s+)?number\b`,
  // "swap numbers", "exchange numbers"
  String.raw`\b(?:swap|exchange|trade|share)\s+(?:phone\s+)?numbers\b`,
  // "can I text you", "could I call you sometime"
  String.raw`\b(?:can|could|may)\s+i\s+(?:text|call|message|dm)\s+you\b`,
  // "would you give me your number", "would you want to swap numbers"
  String.raw`\bwould\s+you\s+(?:give|send)\s+me\s+your\s+${CONTACT}\b`,
].join('|'), 'i')

export function asksForHerNumber(text: string): boolean {
  return ASK.test(flattenPunctuation(text).trim())
}
