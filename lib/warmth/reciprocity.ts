/**
 * Who is doing the work.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * The warmth engine models how much she LIKES him. Nothing modelled how much
 * he is GIVING. Those two come apart, and in a rep on 6 September they came
 * apart completely — the last minute reads:
 *
 *   him  "Mhm."        (1 word)   her  "I like airports too, even if it's silly."   (8)
 *   him  "음."          (1)        her  "You ever read a thriller set in airports?"  (10)
 *   him  "Mm-mm-mm."   (1)        her  "Airports just feel like a good place for stories." (9)
 *
 * Three consecutive non-responses, answered with self-disclosure, a question,
 * and more self-disclosure. Talk ratio 0.27: she produced nearly three times
 * his words in a rep where he had stopped participating. She was at warmth 41
 * and behaving like someone at 75.
 *
 * **That is the assistant instinct leaking through the character.** When the
 * user gives a language model nothing, the model works harder, because that is
 * what the base model is for. The contract never told her that giving up is
 * allowed, so she rescued him every time he failed. It is the loudest reason
 * she reads as an AI, and it is a policy failure rather than a delivery one —
 * no amount of prosody, timing or disfluency touches it.
 *
 * ── AND THE DEFECT THE FIRST FIX CAUSED ──────────────────────────────────
 *
 * Every gate below was originally hung on ENGAGED, warmth 60. Read back
 * against a real rep the next day, that turned out to be a second warmth
 * system sitting on top of the band table, set higher than the band table, and
 * it silently won every argument. A seventeen-turn rep against Nadia
 * (start 32, the second-easiest character on the roster) peaked at 56, so for
 * the entire three minutes:
 *
 *   · `mayAskFor` was false on every turn — she asked nothing, ever
 *   · `mayVolunteerFor` was false on every turn — she added nothing, ever
 *   · the band's own OPEN permission, "You may volunteer one small thing",
 *     was composed and then vetoed by this file on the same line
 *   · every gate her author had opened at 40 and 45 was dropped unread
 *
 * What came out was seventeen turns of minimal answer, and with nothing
 * permitted to fill the words she filled them by restating his own sentence:
 * "true crime, mostly" → "Yeah, something like true crime, mostly."
 *
 * **So reciprocity is no longer allowed to have an opinion about warmth.**
 * Warmth is the band's, and the band table already forbids volunteering below
 * OPEN and questions below ENGAGED in its own words. A gate's `unlocksAt` is
 * its author's warmth decision and this file must not overrule it — Tess, the
 * sign-up character, has all four of hers open below 35 and could not use one
 * of them before 60. What is left here is the question these functions were
 * actually written to answer: **what did HE just do?**
 *
 * ── WHAT THESE RULES DO ──────────────────────────────────────────────────
 *
 * They are the reciprocity half of the meter. Warmth still decides how much
 * she gives. These decide whether she gives it *at all this turn*, off what he
 * just did:
 *
 *   `mirrorCapFor`   she does not out-talk him. He gives one word, he gets one.
 *   `mayAskFor`      she asks only when he has offered something to ask about.
 *   `mayVolunteerFor` unprompted disclosure closes when he stops participating.
 *
 * And the consequence nobody had allowed for: if nothing was asked and she may
 * not volunteer, **she has nothing to say**. `mayStaySilentFor` permits that.
 * Her saying nothing is the most human thing this product can do, and she was
 * previously obliged to produce a line every single turn.
 *
 * Pure functions with tests, the same as `lib/data/rep-rules.ts`. Change them
 * here, never in the hook, the steering composer or the prompt.
 */

import { bandFor, bandIndex, specFor, type WarmthBand } from './bands'

/**
 * What his turn actually was, in the only four terms these rules read.
 *
 * Every field is already computed by the fast scorer or is one call away from
 * it, so this costs nothing and sees no model. Null means he has not spoken
 * yet — the opening turn, where every gate below is at its most closed.
 */
export interface UserTurnShape {
  /** Words he said. `FastScore.wordCount`. */
  words: number
  /** He asked something. */
  askedQuestion: boolean
  /**
   * He gave a real turn rather than an acknowledgement.
   *
   * The same eight-word threshold `engaged-length` already uses, so "real
   * disclosure" means one thing in this codebase and not two.
   */
  disclosed: boolean
  /**
   * Fewer than three words, and there was something to answer. `FastScore.deadEnd`.
   *
   * **Never true on his opening turn**, and that is load-bearing for every rule
   * below: a dead end is a failure to answer and an opener answers nothing.
   * "Hey there." used to be one, which cost him six points and had her say
   * nothing back to the first sentence he had ever spoken to a stranger. The
   * exemption lives in `scoreFast` so that one definition serves the meter and
   * these gates alike.
   */
  deadEnd: boolean
}

/**
 * The band at which she is allowed to drive rather than answer.
 *
 * OPEN, which is warmth 40, and it is the same number the OPEN band's own
 * `permission` is written against: "You may volunteer one small thing." The two
 * agreeing is the point. It was ENGAGED, twenty points higher than the clause
 * it was gating, and the disagreement is written up in this file's header.
 *
 * This is a FLOOR under a rule the band already states, not a second statement
 * of it. Below OPEN the band directives forbid volunteering in their own words;
 * this only stops the gate from opening before they do.
 */
export const RECIPROCITY_BAND: WarmthBand = 'OPEN'

/**
 * The band at or below which she may say nothing at all.
 *
 * Its own constant rather than a reuse of `RECIPROCITY_BAND`, because "may she
 * drive" and "may she withdraw" are different questions and there is no reason
 * they should move together. GUARDED and below: once she is OPEN she has
 * decided he is worth a sentence, and a silence from there reads as sulking
 * rather than as disinterest.
 */
export const SILENCE_BAND: WarmthBand = 'GUARDED'

/** He gave a real turn at this many words. Matches `engaged-length`. */
export const DISCLOSURE_WORDS = 8

/**
 * How much longer than him she may be.
 *
 * Not 1.0, because a stranger who matches your word count exactly is its own
 * tell, and because the person with more to say is usually the one who is
 * enjoying it. 1.3 leaves her room to be warmer than him without letting her
 * carry a conversation he has left.
 */
export const MIRROR_RATIO = 1.3

/**
 * The fewest words a DEAD END is ever worth.
 *
 * A one-word turn from him yields a two-word ceiling, which is a real reply —
 * "Not really.", "Mm, maybe." — and not a truncation. Below two the cap starts
 * producing fragments, and a fragment is a bug rather than a character.
 */
export const MIRROR_FLOOR = 2

/**
 * Her ceiling this turn: the band's, lowered to mirror what he just gave.
 *
 * **This rule rewrote the last minute of the rep in the header.** "Mhm." buys
 * her two words instead of nine, three turns running, and a stranger answering
 * three grunts with two words each is a stranger visibly losing interest —
 * which is the thing the product is supposed to be teaching him to notice.
 *
 * The band is still the ceiling: this can only ever lower it. Warmth decides
 * how much she gives; reciprocity decides whether this turn has earned it.
 *
 * Two exemptions, both learned from the rep that made this file necessary in
 * the other direction. See the block comments.
 */
export function mirrorCapFor(warmth: number, his: UserTurnShape | null): number {
  const spec = specFor(bandFor(warmth))
  if (!his) return spec.maxWords

  // A QUESTION IS A REQUEST FOR AN ANSWER, AND MIRRORING ONE IS A BUG.
  //
  // "So, how old are you?" is five words, which bought a seven-word ceiling,
  // which is a stub. Questions are short by construction — brevity is what
  // makes them questions — so mirroring word count on one punishes the single
  // most useful thing a nervous user does. He asked; the band alone decides
  // how much of an answer that is worth.
  if (his.askedQuestion) return spec.maxWords

  const mirrored = Math.ceil(his.words * MIRROR_RATIO)

  // A REAL TURN ALWAYS BUYS A SENTENCE.
  //
  // One floor of two words served everything, so "I am hungry" — three words,
  // and a real thing to say to somebody — bought four. Two is right for a
  // grunt and wrong for a sentence. Her band's own TYPICAL is the floor for
  // anything he actually said, which is by definition at or below the band
  // ceiling, so this still cannot raise anything.
  const floor = his.deadEnd ? MIRROR_FLOOR : Math.min(spec.typicalWords, spec.maxWords)
  return Math.min(spec.maxWords, Math.max(floor, mirrored))
}

/**
 * Whether she may ask him anything this turn.
 *
 * Three conditions, and all three have to hold:
 *
 *  1. **Warm enough**, at the floor the band table already uses — OPEN. Above
 *     it the band still decides the shape: OPEN allows a question back and
 *     nothing more ("unless he asked you one first"), ENGAGED invites one
 *     outright. That split is the band's to make, and this used to pre-empt it
 *     twenty points early.
 *  2. **He offered something.** A question of his own, or a real turn. Asking
 *     a question of somebody who just said "Mhm" is interviewing, not talking.
 *  3. **Not straight after a dead-end.** In that rep she asked a question
 *     immediately after three of them — the exact inverse of what a person
 *     does, which is to stop asking.
 *
 * Never on his first turn either: a stranger at warmth 28 who opens with
 * "Hey. What's up?" is soliciting, and strangers do not solicit.
 */
export function mayAskFor(warmth: number, his: UserTurnShape | null): boolean {
  if (!his) return false
  if (bandIndex(bandFor(warmth)) < bandIndex(RECIPROCITY_BAND)) return false
  if (his.deadEnd) return false
  return his.askedQuestion || his.disclosed
}

/**
 * Whether she may volunteer something he did not ask for.
 *
 * "I like airports too, even if it's silly" is a lovely line and she had not
 * earned the right to say it — she was answering a grunt. What she HAD earned
 * was the band she was in: warmth 41 is OPEN, and OPEN says in its own words
 * "You may volunteer one small thing". So the gate is the band's floor and the
 * dead end, which is what actually made that line wrong.
 */
export function mayVolunteerFor(warmth: number, his: UserTurnShape | null): boolean {
  if (!his) return false
  if (bandIndex(bandFor(warmth)) < bandIndex(RECIPROCITY_BAND)) return false
  return !his.deadEnd
}

/**
 * Whether she may say nothing at all.
 *
 * The consequence of the two gates above, and the one that makes them mean
 * something. If he asked her nothing, and she may neither ask nor volunteer,
 * then she genuinely has nothing to say — and a character who produces a line
 * anyway is a character who cannot stop talking to you, which is the whole
 * complaint.
 *
 * Deliberately narrow. It requires a dead end AND a cold band AND no question
 * to answer, so it fires on the shape of that last minute and essentially
 * nowhere else. A rep of silences is not a rep; a silence at the moment he has
 * stopped trying is the loudest feedback the product can give him, and it costs
 * nothing to synthesise.
 *
 * **It cannot fire on his opening turn**, because `deadEnd` cannot. That was
 * not true for one day and the product answered "Hey there." with nothing.
 */
export function mayStaySilentFor(
  warmth: number,
  his: UserTurnShape | null,
  options: { silentLastTurn?: boolean } = {},
): boolean {
  if (!his) return false
  // NEVER TWICE RUNNING, and the reason is not politeness.
  //
  // Her exit conditions live in the contract and are decided by the model, so
  // she signals one by finishing a line — three dead-end replies in a row is
  // one of them. A character who is silent every turn can never generate, and
  // therefore can never leave: the rep would run to the clock with nobody in
  // it. So the shape is silence, then a reply, and that reply is where she goes.
  if (options.silentLastTurn) return false
  return his.deadEnd
    && !his.askedQuestion
    && bandIndex(bandFor(warmth)) <= bandIndex(SILENCE_BAND)
}

/**
 * The clause this adds to the steering line. One, and only one.
 *
 * Phrased as a permission withdrawn rather than as an instruction to perform,
 * because §12's lesson is that anything at maximum recency reading as "do this
 * now" gets done now.
 *
 * ── WHAT USED TO BE HERE, AND WHY IT IS NOT ──────────────────────────────
 *
 * **"Answer what he asked and stop. Do not offer anything he did not ask for."**
 * fired whenever `mayVolunteerFor` was false and he had not dead-ended, which
 * with the old ENGAGED floor meant fourteen of the seventeen turns in the rep
 * this file's header describes. It was also pure duplication: at every warmth
 * where the volunteer gate is shut, the band directive already says the same
 * thing in its own words — CLOSED's "Answer, then stop… do not volunteer
 * anything", GUARDED's "Answer only what he asked". Two systems specifying one
 * thing is the round-6 failure, and here the second copy was the one nobody had
 * tuned. The band owns it.
 *
 * **"He has given you nothing. You have nothing to say back…"** could never
 * reach a model. Silence is enforced by making no request at all
 * (`ReplyState.silent`), so on a silent turn there is no generation to steer;
 * and on the turn AFTER one, the caller has already cleared `silentLastTurn`,
 * so the clause could compose onto a line she was about to speak — telling her
 * she had nothing to say while she said something. Silence is a state the
 * adapter enforces, like the word cap, and it is not a thing she is told.
 */
export function reciprocityClauses(
  _warmth: number,
  his: UserTurnShape | null,
): string[] {
  if (!his?.deadEnd) return []
  return ['He gave you almost nothing. Match it. Do not fill the gap for him.']
}
