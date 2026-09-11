/**
 * The guided rep — the one character who tells you what to say.
 *
 * ── WHAT THIS IS, AND WHAT IT COSTS ──────────────────────────────────────
 *
 * §05 says: *"No coaching during the rep. Nothing on screen but a timer, a
 * live waveform and the mission you were given. Interruption to coach would
 * destroy the only thing being trained."* §01 says the product is *"not a
 * reply generator — we never write your messages for you… our entire
 * differentiation is the opposite promise."*
 *
 * **This file is a deliberate, bounded exception to both, and the boundary is
 * one character.** Tess is rung 1, she is who a new account meets, and
 * first-session drop-off is where products in this category die. A user who
 * freezes on the one free rep does not come back to find out that rung 2 is
 * better. `site-audit-openai.md` reached the same conclusion from outside —
 * *"a performance dashboard without a coach"* — and put "a guided first win"
 * on its borrow list.
 *
 * The drift is recorded in `LAUNCH-GAP.md` §4 rather than by rewriting the
 * spec, which is v1.0 and is the thing the build is measured against.
 *
 * ── THE RULES THAT DID NOT MOVE ──────────────────────────────────────────
 *
 * `assertNoScript` in `./mission.ts` is UNTOUCHED and still guards every
 * mission on every other surface — the scorecard, Train, the brief, text mode
 * and every unguided rep. A mission still may not carry a quotation, the first
 * person, or a cue long enough to read out loud. This is a separate type with
 * a separate, stricter guard, precisely so that relaxing one screen cannot
 * quietly relax the other nine.
 *
 * `assertGuidedStep` below is the strongest guard in the codebase, because it
 * is checking the only strings the product ever puts in a user's mouth:
 *
 *   · the `aim` keeps the mission discipline exactly — a direction, six words,
 *     no quotation, no first person. It is what shows on the live screen most
 *     of the time, and it is what transfers
 *   · the `say` is the new thing, and it is bounded to a short spoken sentence
 *   · both are refused outright for anything that reads as a pickup product,
 *     anything about her body or appearance, and anything that frames the rep
 *     as getting a number — §16, and the merchant-of-record reviewer §14 says
 *     opens the site
 *
 * ── AND THE ONE A SCRIPT CANNOT HELP WITH ────────────────────────────────
 *
 * `composure` has no line, on purpose. Its whole skill is not filling a pause,
 * and handing somebody a sentence to say when the lesson is "say nothing" is
 * self-defeating. If a later author wants a line there, the thing to change is
 * the lesson, not this field.
 *
 * **What `say: null` DRAWS changed on 11 September, and only the drawing.** It
 * used to leave the live rail holding a dim six-word label alone in the space a
 * line normally fills — which, on the step that now holds the last third of the
 * rep, is indistinguishable from the rail having stopped. The direction is
 * promoted into the line's own slot instead: same words, same rule, rendered as
 * something rather than as the absence of something. See `components/guided.tsx`.
 *
 * Content is authored here and reviewed in a pull request (rule 10). Nothing
 * in this file is generated at runtime.
 */

import type { SubScores } from '@/lib/grade/types'

export interface GuidedStep {
  /** The scored dimension this step is trying to move. */
  key: keyof SubScores
  /** The direction. Six words at most, and it is still a direction. */
  aim: string
  /**
   * An example line, or null when a line would teach the wrong thing.
   *
   * Square brackets mark the one word the user has to supply himself —
   * "[her thing]" — because the useful version of a follow-up depends on what
   * she just said, and a scripted line that names a fact she has not mentioned
   * is worse than no line at all. `splitSay` is what turns that convention into
   * a visible blank rather than two literal brackets on screen.
   */
  say: string | null
  /** One sentence for the brief, saying what it is for. Never shown live. */
  why: string
}

/**
 * How many completed EXCHANGES each step waits for.
 *
 * One entry per step except the last: the close is owned by the wind-down and
 * is unreachable by progression. See `guidedStepFor`.
 *
 * ── IT WAS [0, 1, 2, 4, 7] AND IT RAN OUT IN THE FIRST MINUTE ────────────
 *
 * 11 September. The spacing was authored against "the twelve-to-fourteen
 * exchanges a three-minute rep contains", and the arm that ships reaches an
 * exchange about every ten seconds — the same measurement `guidedStepFor`
 * records below, where six user turns arrived at 0:63. So four of the five
 * steps were spent inside the first seventy seconds and `composure`, the only
 * one with no line, then held the rail for the remaining eighty. A guided rep
 * whose rail stops changing halfway through does not read as a rail that has
 * arrived at its last lesson. It reads as a feature that broke.
 *
 * Spread over the rep the rep actually is: roughly a step every twenty-five
 * seconds, with `composure` landing in the last third, which is also the only
 * part of a rep where a silence is a live risk rather than a hypothetical. The
 * gate is still EXCHANGES and never the clock — that is the 6 September fix and
 * it does not move — the numbers are just no longer bunched at the start.
 */
const STEP_AT: readonly number[] = [0, 1, 3, 5, 9]

/**
 * The script, in the order a three-minute conversation actually goes.
 *
 * One step per scored dimension, so what he is told to do and what the
 * scorecard grades him on are the same six things in the same words. That is
 * the connective tissue `site-audit-openai.md` says the product lacks, and it
 * is the reason the steps are keyed to `SubScores` rather than authored free.
 *
 * The lines are written for Cass's room — a public gallery on a weekday
 * afternoon, in front of a painting neither of them understands. A second
 * guided character needs her own script; `guidedScriptFor` is where that
 * choice would live.
 *
 * **The room does half the work of the opener**, which is why it was chosen:
 * a beginner does not have to invent a reason to speak, because there is a
 * thing on the wall and they are both looking at it. `say` below is one
 * suggestion out of fifty the room supplies.
 *
 * **None of them asks her for anything.** The close is owned by
 * `lib/data/rep-rules.ts` and she never speaks digits, so a suggested line
 * that asks for a number would be the product fighting its own format — and
 * `assertGuidedStep` refuses one.
 */
export const TESS_SCRIPT: readonly GuidedStep[] = [
  {
    key: 'opening',
    aim: 'Open early. Rough is fine.',
    say: 'I have been standing here a while and I still have no idea.',
    why: 'The first ten seconds are the whole skill. It does not have to be good, it has to be early.',
  },
  {
    key: 'curiosity',
    aim: 'Follow one answer twice.',
    say: 'What is that like?',
    why: 'Most conversations die because the second question changes the subject. Stay on her answer and go one layer down.',
  },
  {
    key: 'listening',
    aim: 'Say her detail back.',
    say: 'So you are a [her thing] person then.',
    why: 'Repeating one specific thing she said is the fastest way a stranger decides you were actually listening.',
  },
  {
    key: 'signalReading',
    // THE ONE LINE THAT COACHED A DEAD END (11 September).
    //
    // It read "You look like you are in a hurry." Cass has decided to stay
    // until she finds one painting she likes; it is false in her room, and it
    // is false in the worst direction — a beginner reading it verbatim tells a
    // stranger she looks like she wants to leave, and the honest answer to
    // that is to leave. `lib/warmth/reciprocity.ts` prices a dead end above
    // what a good question earns, so the one authored line that could lose a
    // rep warmth was this one.
    //
    // A read of her REACTION does the same teaching and opens instead of
    // closing: it is specific to the room, it invites an answer either way,
    // and `why` below already says the skill works whether you were right.
    aim: 'Read her, then adjust.',
    say: 'You did not love that one, did you.',
    why: 'Naming what you notice, out loud, is the skill. It works whether you were right or wrong.',
  },
  {
    key: 'composure',
    aim: 'Let the pause sit.',
    // No line, deliberately. See the header.
    say: null,
    why: 'Three seconds of silence feels like thirty. Not filling it is the thing being trained here.',
  },
  {
    key: 'close',
    aim: 'Leave warmly, on purpose.',
    say: 'I will let you get round the rest of it. Good to meet you.',
    why: 'Ending it yourself, before it runs out, is worth more to the score than anything she decides.',
  },
]

export class UnsafeGuidedStep extends Error {}

/**
 * What a suggested line may never contain.
 *
 * Wider than `assertPublishable`'s list, and it has to be: a share card is
 * read, and this is *spoken by a user to a character* and then scored. The
 * appearance and pickup rules are §16 and they are what keeps the account
 * open; the number rule is the rep format, which owns the close on its own.
 */
const FORBIDDEN = [
  { pattern: /\+?\d[\d\s().-]{6,}\d/, why: 'looks like a phone number' },
  { pattern: /\b(your |her )?(number|digits)\b|\binstagram\b|\bsnap(chat)?\b/i, why: 'the close is the format’s, and she never speaks digits' },
  { pattern: /@[\w.-]+\.\w{2,}/, why: 'contains an email address' },
  { pattern: /\b(hot|sexy|gorgeous|beautiful|cute|fit|body|legs|figure)\b/i, why: 'comments on her appearance' },
  { pattern: /\b(hookup|hook up|pickup|pick-?up line|seduc\w*|smash|score a date|slay)\b/i, why: 'reads as a pickup product' },
  { pattern: /\b(single|boyfriend|girlfriend|dating app|match(ed)? with|are you here alone)\b/i, why: 'frames it as a dating approach rather than a conversation' },
  { pattern: /\bbuy you a (drink|coffee)\b|\bgo out with me\b|\btake you out\b/i, why: 'asks her out, which is the format’s decision and not a step' },
] as const

/** The longest a suggested line may be, in words. */
export const MAX_SAY_WORDS = 14
/** The longest an aim may be, in words. Same bound a mission cue lives under. */
export const MAX_AIM_WORDS = 6

/**
 * The last gate before a suggested line exists.
 *
 * Throws rather than sanitising, the same way `assertNoScript`,
 * `assertPublishable` and `lib/grade/memory.ts` do, and for the same reason:
 * a trimmed line still ships, and the failure mode here is the product handing
 * somebody a sentence it would not want quoted back to it.
 */
export function assertGuidedStep(step: GuidedStep): void {
  if (/["“”']/.test(step.aim)) {
    throw new UnsafeGuidedStep(`guided ${step.key}.aim contains a quotation — an aim points, it does not speak.`)
  }
  if (/\b(I|I'm|I’m|my|me)\b/.test(step.aim)) {
    throw new UnsafeGuidedStep(`guided ${step.key}.aim is in the first person, which makes it a line rather than a direction.`)
  }
  if (words(step.aim) > MAX_AIM_WORDS) {
    throw new UnsafeGuidedStep(`guided ${step.key}.aim is longer than ${MAX_AIM_WORDS} words. It is read at a glance, mid-conversation.`)
  }
  if (step.say !== null) {
    if (words(step.say) > MAX_SAY_WORDS) {
      throw new UnsafeGuidedStep(`guided ${step.key}.say is longer than ${MAX_SAY_WORDS} words. Nobody reads a paragraph out loud while nervous.`)
    }
    if (step.say.trim().length === 0) {
      throw new UnsafeGuidedStep(`guided ${step.key}.say is empty. Use null, which renders the aim alone.`)
    }
  }
  for (const field of [step.aim, step.say, step.why]) {
    if (field === null) continue
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(field)) {
        throw new UnsafeGuidedStep(`Refused: guided ${step.key} ${rule.why} — "${field}"`)
      }
    }
  }
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * One piece of a suggested line: something to read, or a blank to fill.
 *
 * `slot` is the bracketed word — "[her thing]" — and it is the one part of a
 * line the user has to supply himself.
 */
export interface SayPart {
  text: string
  slot: boolean
}

/**
 * A suggested line, split into what to read and what to fill in.
 *
 * ── THE BRACKETS USED TO REACH THE SCREEN AS BRACKETS ────────────────────
 *
 * Both surfaces rendered `say` as a plain string, so the live rail printed
 * **"So you are a [her thing] person then."** at a nervous first-timer who has
 * about a second to look at it — and the only place the convention was ever
 * explained was a footnote at the bottom of the brief, under six steps, which
 * is the half of that screen that is being cut.
 *
 * A punctuation convention that needs a paragraph of explanation is not a
 * convention, it is a defect with a note attached. Drawn as a BLANK instead —
 * the renderer styles a slot as something visibly missing — it explains itself
 * at a glance and needs no footnote at all.
 *
 * Pure, and tested here, because it is the shape of a string the product puts
 * in somebody's mouth; the components only choose the styling.
 */
export function splitSay(say: string): readonly SayPart[] {
  const parts: SayPart[] = []
  const pattern = /\[([^\]]+)\]/g
  let cursor = 0
  for (let match = pattern.exec(say); match; match = pattern.exec(say)) {
    if (match.index > cursor) parts.push({ text: say.slice(cursor, match.index), slot: false })
    parts.push({ text: match[1] ?? '', slot: true })
    cursor = match.index + match[0].length
  }
  if (cursor < say.length) parts.push({ text: say.slice(cursor), slot: false })
  return parts
}

/** Checked at module load, so a bad line cannot reach a build. */
for (const step of TESS_SCRIPT) assertGuidedStep(step)

/**
 * Every guided character, by slug.
 *
 * The screens resolve a script from here rather than from the persona registry,
 * because the registry carries nine full character contracts and none of them
 * belong in a browser bundle to answer one boolean. The two are held together
 * by `guided.test.ts`, which walks the real roster and asserts that
 * `guided: true` and a script here are the same set — so adding one without the
 * other fails the suite rather than shipping a screen that promises coaching
 * and renders nothing.
 */
export const GUIDED_SCRIPTS: Readonly<Record<string, readonly GuidedStep[]>> = {
  tess: TESS_SCRIPT,
}

/** The script this character runs, or null when she runs none. */
export function guidedScriptFor(slug: string | null | undefined): readonly GuidedStep[] | null {
  if (!slug) return null
  return GUIDED_SCRIPTS[slug] ?? null
}

/** What the rep has actually done so far, in the two counts a step reads. */
export interface GuidedProgress {
  /** His committed turns, with words in them. */
  userTurns: number
  /** Hers. */
  agentTurns: number
}

/**
 * Which step is being pointed at right now.
 *
 * ── IT ADVANCES ON EXCHANGES, AND IT USED TO ADVANCE ON HIS TURNS ────────
 *
 * An exchange is he spoke and she answered. Counting his turns alone reads as
 * the same thing right up until she stops answering, and then it is a script
 * that walks a user through a conversation nobody else is having.
 *
 * On the rep of 6 September her first two replies never reached him. This
 * function advanced anyway, so his second step was **"Follow one answer twice
 * — 'What is that like?'"** against a silence containing no answer at all. He
 * read it out. That utterance is what aborted her line, and the step after it
 * moved him on again. A rail that cannot tell whether she spoke will reliably
 * coach somebody into talking over a character who is still thinking.
 *
 * `min` rather than either count on its own: she cannot get ahead of him
 * (nothing generates without a user turn) and he must not get ahead of her.
 *
 * ── AND THE CLOSE IS THE WIND-DOWN'S, NOT THE COUNTER'S ──────────────────
 *
 * `STEP_AT` used to end at six user turns, which the pipeline arm reaches in
 * about a minute — so the last thing the rail said, 63 seconds into a
 * 180-second rep, was "leave warmly, on purpose", with a line to read. He read
 * it, she said goodbye, and the one free rep a new account gets ended at 74
 * seconds in a phone number.
 *
 * The format already owns that moment: `WRAP_UP_MS` is when she is told to
 * wind down. Telling him to leave before she has been told anything is the
 * product arguing with itself — the argument `dueSceneBeat` settles for scene
 * beats with `LAST_BEAT_FRACTION`, settled here the same way. The close is now
 * reachable ONLY through `wrapping`, so the two fire together.
 */
export function guidedStepFor(
  script: readonly GuidedStep[],
  progress: GuidedProgress,
  options: { wrapping?: boolean } = {},
): GuidedStep | null {
  if (script.length === 0) return null
  if (options.wrapping) return script[script.length - 1] ?? null

  const exchanges = Math.min(progress.userTurns, progress.agentTurns)
  // The opening step stands until the first exchange completes, so a user who
  // is waiting on her is told to open rather than told nothing.
  let chosen: GuidedStep | null = script[0] ?? null
  for (const [index, step] of script.slice(0, -1).entries()) {
    const at = STEP_AT[index] ?? index
    if (exchanges >= at) chosen = step
  }
  return chosen
}
