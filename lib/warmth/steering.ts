/**
 * The steering item — one line, injected before every reply.
 *
 * Round 10 composes it from all four persona layers instead of the band alone:
 *
 *   TRAJECTORY   arrives as the warmth band. Difficulty is never stated.
 *   PERSONALITY  how this band sounds coming from THIS character.
 *   GATED        what she has earned the right to do at this warmth.
 *   ROOM         implicit; the contract already put her in it.
 *
 * Two constraints shape everything here.
 *
 * **It must stay short.** This is appended on every user turn and re-charged as
 * context on every turn after that. The character contract is the cached prefix
 * and must stay byte-identical, so this is appended as a conversation item and
 * never written into the system prompt — round 5 rewrote instructions
 * mid-session and paid 2.9x for the next response.
 *
 * **Only one system may own reply length.** The band owns it. Nothing derived
 * from personality is allowed to mention length or question rate, which is why
 * `talkativeness` — the one personality dial that is about verbosity — is
 * deliberately absent from this file and lives in the contract instead. Round 6
 * had both, the two sets of numbers fought, and she obeyed neither.
 */

import {
  effectiveSharpness,
  unlockedGates,
  type GateName,
  type Persona,
} from '@/lib/voice/types'
import { bandDirectiveParts, bandPermissionParts, type DirectiveContext } from './bands'
import { postureClause, type Posture } from './affect'
import { reciprocityClauses, type UserTurnShape } from './reciprocity'

export interface SteeringContext extends DirectiveContext {
  persona: Persona
  warmth: number
  /** She cooled on a recent turn and he is inside the repair window. */
  repairOpen?: boolean
  /**
   * How interest, comfort and liking stand relative to each other.
   *
   * The band says how much she gives; this says what shape it takes. Omitted —
   * or `level`, when the three agree — adds nothing, which is the common case
   * and keeps the line short.
   */
  posture?: Posture
  /**
   * Whether the STANDING ORDERS ride along this turn. Default true.
   *
   * A standing order is a clause that tells her to DO something — her agenda,
   * the band's own invitation, and the gated behaviours she has earned. A
   * provider that retains conversation state gets those a handful of times per
   * rep, because the caller only sends the line when it changes. A stateless
   * provider has no such throttle: the directive is the LAST system message of
   * every request, so an unconditional standing order is a fresh instruction to
   * act on it immediately before every single reply.
   *
   * That is not the clauses behaving differently, it is the clauses arriving
   * differently, and it shows. On the ElevenLabs HTTP pipeline Nadia's retreat
   * to the shelf went from 17.4% of her turns to 45.8%, against a contract
   * whose rule 4 says never to retreat to what she is focused on — that was the
   * agenda, and PERSONA-AUDIT §11 rationed the agenda alone. The invitations
   * were left running every turn, and they compose the same way: one real line
   * from 5 September is "Claudia, fiction, huh? What kind? Light stuff or dark?
   * I'm only halfway through this one." — his name, a question about him, a new
   * topic and the agenda, four permissions performed at once, all of them
   * obeyed.
   *
   * The band DIRECTIVE still ships on every turn — nothing else owns reply
   * length and a stateless request carries no memory of the last one. Only the
   * orders are rationed, back to the cadence the throttle used to supply for
   * free. See `WarmthSession.statelessDirective`.
   */
  includeStanding?: boolean
  /**
   * What HE just did — the reciprocity half of the meter (`./reciprocity.ts`).
   *
   * Warmth says how much she likes him. This says how much he is giving, and
   * without it the two came apart entirely: at warmth 41 she answered three
   * consecutive one-word turns with self-disclosure, a question and more
   * self-disclosure.
   *
   * Three states, and they are not interchangeable — see `invitedThisTurn`.
   * A shape is an ordinary turn. `null` means he has not spoken at all, so
   * there is nothing to be invited by. `undefined` means the CALLER has no
   * reciprocity signal to give (the text arm, the adapter's fallback), which is
   * not the same claim and must not be read as one.
   */
  his?: UserTurnShape | null
  /**
   * This is her reply to his FIRST turn of the rep.
   *
   * Carried beside `his` rather than inside it, for the reason
   * `WarmthSession.lastUserAskedDirectly` is: `UserTurnShape` is Tier 0 and
   * every dating gate reads it exactly as it always has (rule 19).
   *
   * It exists because his opener is deliberately exempt from `deadEnd` — "Hey
   * there." must not cost him warmth and must not be answered with silence — and
   * the invitation gate below was reading that exemption as though he had
   * offered her something. He had said hello. See `invitedThisTurn`.
   */
  firstExchange?: boolean
}

/**
 * A ceiling on the whole line, enforced by construction rather than by
 * truncation — a directive cut off mid-sentence is worse than a shorter one.
 *
 * Round 13 raised this from 340, and the reason is worth writing down because
 * the number looks like a cost regression and is not one. Two clauses were
 * added: a want, which is what stops her being a pure responder, and a posture,
 * which is what a second and third affect axis are FOR. Meanwhile the caller
 * stopped sending this on every VAD trigger and now sends it only when the line
 * actually changes, so a rep carries far fewer copies of a slightly longer
 * line. Total context spent on steering went down.
 *
 * The ceiling still binds, and binding is the point — see `assemble`.
 */
export const STEERING_BUDGET = 420

/** At most this many personality clauses. Past two it stops being a direction. */
const MAX_PERSONALITY_CLAUSES = 2
/** At most this many gates. The newest are the ones worth spending words on. */
const MAX_GATE_CLAUSES = 2

export function composeSteering(context: SteeringContext): string {
  // Priority order, highest first. Everything below the band is droppable, and
  // when the budget binds the LAST ones go — which is why the order is a
  // judgement about what she most needs to be told and not the order the
  // clauses happen to be written in.
  //
  //   band         non-negotiable. It owns how much she gives.
  //   posture      what shape that takes. Only present when the axes disagree,
  //                so when it IS present it is the most informative line here.
  //   repair       rare, and expires in two turns. If it is dropped it is gone.
  //   permission   the band's own invitation. A STANDING ORDER, so it is
  //                rationed — see `includeStanding`. Placed here because it
  //                qualifies the band it came off.
  //   want         the reason she is a person rather than a response. Above
  //                personality because a character with an agenda and no
  //                adjectives still reads as someone; a character with
  //                adjectives and no agenda reads as a chatbot. A standing
  //                order too, and rationed with the rest.
  //   personality  colour. Never rationed: it describes how she sounds rather
  //                than telling her to do anything, so repeating it is free.
  //   gates        what she has earned. Standing orders, rationed.
  const standing = context.includeStanding !== false
  // The band's own invitation is a permission to DRIVE — volunteer something,
  // start a topic, ask about him — and handing one to somebody who has just
  // grunted at her is the failure this whole layer exists to stop. Shipping the
  // invitation and the refusal in the same line is two competing directions,
  // which this file's header is an argument against, so on a dead end the
  // invitation simply does not go.
  //
  // WHAT HE HAS OFFERED, AND NOTHING ELSE — a dead end, or a hello he has not
  // followed yet (`invitedThisTurn`). This used to be `mayVolunteerFor`, which
  // carried a warmth floor of ENGAGED — so the invitation and the gates were
  // vetoed twenty points above the band that composed the invitation, and above
  // the `unlocksAt` every persona author had chosen. Nadia's four gates open at
  // 40 and 45 and could not fire below 60; Tess, the sign-up character, has all
  // four open below 35 and could never use one. Whether she is warm enough is
  // the band's decision and the gate's own, and this line is not allowed a
  // third opinion. See `lib/warmth/reciprocity.ts`.
  const invited = invitedThisTurn(context)
  return assemble([
    // Her own band table when she has one, the shared one otherwise. The band
    // still owns reply length either way — see `BandDirectives`.
    bandDirectiveParts(context.warmth, context, context.persona.bandDirectives),
    // Directly under the band, because it qualifies the band: it is the clause
    // that decides whether this turn has earned what the band allows.
    reciprocityClauses(context.warmth, context.his ?? null),
    postureClauses(context),
    repairClauses(context),
    invited ? bandPermissionParts(context.warmth, context) : [],
    // The want is NOT gated, and that is deliberate: when he has given her
    // nothing, an agenda pulling her away from him is exactly the right thing
    // for her to have. It is the one standing order that is not about him.
    standing ? wantClauses(context.persona, context.warmth) : [],
    personalityClauses(context.persona, context.warmth),
    // The gates are. "You may start a topic" and "You may use his name" are
    // permissions to drive, same as the band's invitation, and a line that
    // says both "match him, do not fill the gap" and "start a topic" is the
    // third answer nobody asked for.
    standing && invited ? gateClauses(context.persona, context.warmth) : [],
  ])
}

/**
 * Whether she may be handed a permission to DRIVE this turn.
 *
 * The invitations — the band's own "You may volunteer one small thing", and the
 * gates under it — are permissions to do something unprompted. Handing one to
 * somebody who has offered nothing is the failure this whole layer exists to
 * stop, and there are two ways to have offered nothing.
 *
 * **A dead end**, which is what this used to test and all it used to test.
 *
 * **HIS OPENING TURN**, which it did not, and that is the hole. `deadEnd` is
 * deliberately false on his first turn however short it is (`scoreFast`), so
 * that "Hey there." costs him no warmth and is never answered with silence —
 * and this gate read that exemption as evidence that he had given her
 * something. He had said hello. Measured on 8 September: Tess, rung 1, the free
 * sign-up rep, replying to a two-word hello with the band's invitation, a
 * disclosure gate and a flirt gate all open at once, and duly volunteering two
 * facts nobody asked for on the first line of the product — "Machine's got
 * nineteen minutes left. I'm deep into Tana French."
 *
 * The exemption stays where it is; it is right for the meter and right for the
 * silence gate. What changes is that it stops being read as an offer here.
 *
 * `undefined` is NOT `null`. A caller with no reciprocity signal at all — the
 * text arm, and the adapter's own fallback — has made no claim about what he
 * did, and must keep the behaviour it has always had. Only an explicit `null`
 * says he has not spoken.
 *
 * This is not a warmth opinion and must never become one: whether she is warm
 * enough is the band's decision and the gate's own `unlocksAt`. See the block
 * comment in `composeSteering` for the day this file had a third opinion.
 */
function invitedThisTurn(context: SteeringContext): boolean {
  if (context.his === undefined) return true
  if (context.his === null) return false
  if (context.his.deadEnd) return false
  // ON HIS OPENING TURN, ASK FOR THE OFFER DIRECTLY.
  //
  // Everywhere else `!deadEnd` is good evidence that he gave her something.
  // On his first turn it is not evidence of anything, because the exemption
  // put it there — so this turn alone tests what the exemption is standing in
  // for. The same two terms `mayAskFor` uses, and no third one.
  //
  // A substantive opener still counts. "I came in looking for something for my
  // brother, he only reads crime." is a real offer and she may answer it as
  // one; "Hey there." is a hello and she may not treat it as an invitation to
  // volunteer, disclose and flirt.
  if (context.firstExchange) return context.his.askedQuestion || context.his.disclosed
  return true
}

/**
 * Fit the clauses into the budget, dropping from the bottom.
 *
 * The first group always survives, whatever it costs — a line with no band
 * directive is worse than a long one, because then nothing owns reply length
 * and round 6 happens again. Everything after it is admitted only if it fits
 * whole. Clauses are never cut mid-sentence.
 *
 * This is also a quality rule and not only a cost one. Eight simultaneous
 * directions are obeyed about as well as none: the failure this file already
 * documents — two sets of numbers producing a third answer nobody asked for —
 * is the same failure, and adding axes to the model is exactly the kind of
 * change that would have reintroduced it.
 */
function assemble(groups: string[][]): string {
  const [required = [], ...optional] = groups
  const parts = [...required]
  let length = parts.join(' ').length + 2

  for (const group of optional) {
    for (const clause of group) {
      const cost = clause.length + 1
      if (length + cost > STEERING_BUDGET) continue
      parts.push(clause)
      length += cost
    }
  }
  return `[${parts.join(' ')}]`
}

/**
 * The shape of what she is feeling, when the three axes disagree.
 *
 * Placed directly after the band because it qualifies it: the band has just
 * said how much she gives, and this says whether that is curiosity held at a
 * distance, ease with nothing behind it, or the other way round. Silent when
 * the axes agree, which is most turns — see `postureOf`.
 */
export function postureClauses(context: SteeringContext): string[] {
  if (!context.posture) return []
  const clause = postureClause(context.posture)
  return clause ? [clause] : []
}

/**
 * What she is after, on her own account.
 *
 * Ungated on purpose, and it is the one clause here that is not a reward. Every
 * other line in this file describes how she responds; without this she has no
 * reason to say anything nobody asked for, and outside the warm bands
 * `initiatesTopics` never opens — so on most of the ladder she was a pure
 * responder for the whole rep. A person who only ever answers is the most
 * recognisable tell there is.
 *
 * Warmth changes the DIRECTION of the want, never whether she has one:
 *
 *   cold   it pulls her away from him, and she may say so
 *   mid    it is still there, and he is allowed to be a reason to put it off
 *   warm   she brings him into it
 *
 * One clause, because it is charged on every turn after this one.
 */
export function wantClauses(persona: Persona, warmth: number): string[] {
  const want = persona.want?.trim()
  if (!want) return []

  if (warmth < 20) return [`You would rather be ${want}, and it shows.`]
  if (warmth < 60) return [`You would still rather be ${want}. You are not going yet.`]
  return [`You would rather be ${want}. Bring him into it.`]
}

/**
 * She has just cooled, and this is his next move.
 *
 * A misstep followed by a decent recovery is the strongest bonding move there
 * is, and it was worth nothing: a bad turn cost its points and the conversation
 * carried on as though nothing had happened. That teaches avoidance rather than
 * recovery, which is the opposite of the skill.
 *
 * The engine owns whether the window is open (see `WarmthEngine.repairOpen`).
 * All this does is let her ACKNOWLEDGE it, because a repair the other person
 * does not visibly register is not a repair.
 */
export function repairClauses(context: SteeringContext): string[] {
  if (!context.repairOpen) return []
  return ['He misjudged it and is recovering. Let him, if he earns it.']
}

/**
 * How this band sounds coming from this particular person.
 *
 * Expression always ships, because it is the cheapest and most load-bearing
 * word in the line. The rest are ranked by how far past their threshold they
 * are, so a character who is merely a bit distracted does not spend a clause
 * saying so.
 */
export function personalityClauses(persona: Persona, warmth: number): string[] {
  const p = persona.personality
  const clauses: string[] = [EXPRESSION_CLAUSE[p.expression]]

  const candidates: { strength: number; text: string }[] = []

  // The sharpness curve (§2). A stranger who is already cold is sharper than a
  // neutral one, so this can fire on a character whose base sharpness is mild.
  const sharp = effectiveSharpness(p, warmth)
  if (sharp >= 60) {
    candidates.push({
      strength: sharp,
      text: sharp >= 80 ? 'Cutting, and you do not soften it.' : 'A little cutting if he fumbles.',
    })
  }
  if (p.patience <= 40) {
    candidates.push({ strength: 100 - p.patience, text: 'You have no patience for fumbling.' })
  }
  if (p.distraction >= 60) {
    candidates.push({ strength: p.distraction, text: 'Half your attention is elsewhere.' })
  }
  if (p.humour >= 70) {
    candidates.push({ strength: p.humour, text: 'Tease him if he gives you an opening.' })
  }
  if (p.signalClarity <= 33) {
    candidates.push({
      strength: 100 - p.signalClarity,
      text: 'Stay pleasant either way. Never say plainly that you want to go.',
    })
  }

  candidates.sort((a, b) => b.strength - a.strength)
  for (const candidate of candidates.slice(0, MAX_PERSONALITY_CLAUSES)) {
    clauses.push(candidate.text)
  }
  return clauses
}

/**
 * Layer 2's expression, as its steering clause. Exported for the same reason
 * as `EXPRESSION_TAG`: the tests assert that the clause is constant across
 * every warmth band, which is a claim about the composition and not about any
 * one character's current dial.
 */
export const EXPRESSION_CLAUSE: Record<Persona['personality']['expression'], string> = {
  playful: 'Light.',
  dry: 'Dry.',
  earnest: 'Straight, no irony.',
  flat: 'Flat.',
}

/**
 * What she has earned the right to do.
 *
 * Only unlocked behaviours are named. A locked one is not mentioned at all —
 * telling a model what it may not do invites it to think about doing it, and
 * every word here is charged on every subsequent turn.
 *
 * When more than two are open, the most recently unlocked win: those are the
 * ones the model has not been told about on many previous turns, and they are
 * what the user just earned.
 */
export function gateClauses(persona: Persona, warmth: number): string[] {
  const open = unlockedGates(persona.gated, warmth)
  if (open.length === 0) return []

  const ranked = [...open].sort(
    (a, b) => persona.gated[b].unlocksAt - persona.gated[a].unlocksAt,
  )

  return ranked
    .slice(0, MAX_GATE_CLAUSES)
    .map((name) => gateText(persona, name))
    .filter((text): text is string => text !== null)
}

function gateText(persona: Persona, name: GateName): string | null {
  const gate = persona.gated[name]
  switch (name) {
    case 'flirtiness': {
      const ceiling = 'ceiling' in gate ? gate.ceiling : 0
      // An unlocked behaviour with a ceiling of zero is unlocked in name only.
      if (ceiling <= 0) return null
      return ceiling >= 50 ? 'You may flirt.' : 'You may flirt, barely.'
    }
    case 'personalDisclosure': {
      const ceiling = 'ceiling' in gate ? gate.ceiling : 0
      if (ceiling <= 0) return null
      return ceiling >= 50
        ? 'You may say something real about your life.'
        : 'One small true thing about yourself, no more.'
    }
    case 'initiatesTopics':
      return 'You may start a topic.'
    case 'usesYourName':
      // "MAY", ONCE, AND NOT AGAIN.
      //
      // Measured on 6 September: she said "Pabath" four times in twelve lines.
      // Real people barely use your name, and a stranger who keeps using it is
      // doing the thing a salesman does. The permission is what she had; the
      // rationing is what she needed, and on a stateless arm a bare permission
      // at maximum recency reads as an instruction to use it now.
      return 'You may use his name, once at most, and not if you used it recently.'
  }
}
