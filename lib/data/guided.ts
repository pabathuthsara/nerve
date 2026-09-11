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
   * The example lines for this step, in the order they are offered — one per
   * exchange spent on the step, holding on the last once they run out.
   *
   * ── IT WAS ONE LINE PER STEP, AND THAT WAS TWO DEFECTS ───────────────
   *
   * **It did not change often enough.** Five reachable steps over the fifteen
   * or so exchanges a three-minute rep contains means a prompt that stands for
   * twenty-five seconds at best and, on the last step, for the rest of the rep.
   * Reported on 11 September as *"staying at one hint for a long time"*, which
   * is what it was.
   *
   * **And one line cannot fit a conversation it knows nothing about.** A single
   * authored sentence per lesson has to be general enough to survive anything
   * she might have said, which makes it general enough to fit nothing in
   * particular. Two or three ANGLES on the same lesson, offered in the order
   * the conversation tends to earn them, is a much better bet: the first is
   * written for a rep with almost nothing in it yet, the later ones assume she
   * has given him something to work with.
   *
   * `null` is a beat with no line, rendering the aim alone, promoted. It is not
   * padding — see `composure`, where the first beat's whole lesson is that
   * there is nothing to say.
   *
   * Square brackets mark the one word the user has to supply himself —
   * "[her thing]" — because the useful version of a follow-up depends on what
   * she just said, and a scripted line that names a fact she has not mentioned
   * is worse than no line at all. `splitSay` is what turns that convention into
   * a visible blank rather than two literal brackets on screen.
   */
  says: readonly (string | null)[]
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
    says: ['I have been standing here a while and I still have no idea.'],
    why: 'The first ten seconds are the whole skill. It does not have to be good, it has to be early.',
  },
  {
    key: 'curiosity',
    aim: 'Follow one answer twice.',
    // The room first, then her. At the first exchange she has answered an
    // opener about a painting and nothing more, so a line that asks what
    // something is LIKE has nothing to attach to; one about the picture they
    // are both looking at always does. By the second she has usually offered
    // something of her own — Cass is `earnest` and volunteers — and that is
    // when the canonical follow-up finally has an answer to follow.
    says: [
      'What made you stop at this one?',
      'What is that like?',
    ],
    why: 'Most conversations die because the second question changes the subject. Stay on her answer and go one layer down.',
  },
  {
    key: 'listening',
    aim: 'Say her detail back.',
    says: [
      'So you are a [her thing] person then.',
      'You said [her word]. What is that about?',
    ],
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
    // All three below are reads of her that OPEN: each one invites her to
    // agree, correct or protest, and `why` already says the skill works
    // whether you were right. This is the longest stretch of the ladder, which
    // is why it carries three.
    aim: 'Read her, then adjust.',
    says: [
      'You did not love that one, did you.',
      'You keep coming back to that one.',
      'You know more about this than you are saying.',
    ],
    why: 'Naming what you notice, out loud, is the skill. It works whether you were right or wrong.',
  },
  {
    key: 'composure',
    aim: 'Let the pause sit.',
    // TWO BEATS, AND THE FIRST ONE STILL HAS NO LINE.
    //
    // The header's argument is untouched and is the reason `null` leads:
    // handing somebody a sentence to say when the lesson is "say nothing" is
    // self-defeating, so the first beat renders the direction alone.
    //
    // What changed on 11 September is the LESSON, which is what that argument
    // says to change if a line is ever wanted here. Composure is two skills,
    // not one: not filling a silence, and then coming back into the
    // conversation without apologising for it. The second has a line, it is
    // the most useful sentence a nervous person can own, and it makes a pause
    // legitimate out loud rather than something to be rescued from. Without it
    // this step — which holds the last third of the rep — never changed at all.
    says: [null, 'Let me think about that for a second.'],
    why: 'Three seconds of silence feels like thirty. Not filling it, and then picking it back up without apologising, is the thing being trained here.',
  },
  {
    key: 'close',
    aim: 'Leave warmly, on purpose.',
    // ONE LINE, DELIBERATELY. The close is reachable only through the
    // wind-down and lasts thirty seconds; a prompt that changed inside it
    // would be changing the instruction at the one moment there is no time to
    // read a second one.
    says: ['I will let you get round the rest of it. Good to meet you.'],
    why: 'Ending it yourself, before it runs out, is worth more to the score than anything she decides.',
  },
]

/**
 * The one prompt that is not on the ladder: she just asked HIM something.
 *
 * ── WHY A REACTIVE PROMPT EXISTS AT ALL ──────────────────────────────────
 *
 * The ladder is blind. It knows how many exchanges have completed and nothing
 * whatever about what was said in them, which is fine for a lesson plan and
 * wrong for the single moment where the lesson plan is actively harmful: she
 * has asked him a question, and the rail is telling him to ask one. Reported
 * on 11 September as the rail not flowing with what she is actually saying,
 * and this is the sharpest case of it — every other mismatch is a prompt that
 * does not quite fit, and this one is a prompt that talks over her.
 *
 * **It has no line, and that is the whole point.** What he should say is the
 * answer to HER question, and we do not know what she asked. A generated line
 * would break rule 10 and a generic one would be worse than the direction. So
 * this renders as the aim alone, promoted — the same shape `composure`'s first
 * beat takes, for the same reason: there is a right thing to do here and no
 * right sentence we are in a position to write.
 *
 * Keyed `listening`, because answering what you were actually asked is the
 * listening dimension and not a seventh one. The rail's position dots keep
 * showing the LADDER's position while this is up: the ladder has not moved,
 * and the dots answer "where are we in the rep", not "what is on the card".
 */
export const ANSWER_HER: GuidedStep = {
  key: 'listening',
  aim: 'Answer it, then give it back.',
  says: [],
  why: 'A question you talk over is the one thing a stranger always notices. Answer it first, properly, then hand it back.',
}

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
  for (const say of step.says) {
    if (say === null) continue
    if (words(say) > MAX_SAY_WORDS) {
      throw new UnsafeGuidedStep(`guided ${step.key} line is longer than ${MAX_SAY_WORDS} words. Nobody reads a paragraph out loud while nervous.`)
    }
    if (say.trim().length === 0) {
      throw new UnsafeGuidedStep(`guided ${step.key} line is empty. Use null, which renders the aim alone.`)
    }
  }
  // Every line a step can ever show, plus the two strings that describe it.
  // The loop walks `says` rather than one field because the set grew and a
  // guard that checked the first line would be a guard with a hole in it.
  for (const field of [step.aim, step.why, ...step.says]) {
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
assertGuidedStep(ANSWER_HER)

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

/**
 * Which step he is on, as an index into the script.
 *
 * The same decision `guidedStepFor` makes, expressed as a position, because
 * the rail draws position dots and the line chosen within a step depends on
 * how many exchanges have been spent on it. Returns `script.length - 1` for the
 * close, which is the only step the wind-down can reach.
 */
export function guidedStepIndexFor(
  script: readonly GuidedStep[],
  progress: GuidedProgress,
  options: { wrapping?: boolean } = {},
): number {
  if (script.length === 0) return -1
  if (options.wrapping) return script.length - 1
  const exchanges = Math.min(progress.userTurns, progress.agentTurns)
  let chosen = 0
  for (let index = 0; index < script.length - 1; index += 1) {
    if (exchanges >= (STEP_AT[index] ?? index)) chosen = index
  }
  return chosen
}

/** What the live rail is showing right now. */
export interface GuidedPrompt {
  /** The step it came from — its mark, its label and its aim. */
  step: GuidedStep
  /** The line to offer, or null to render the aim alone, promoted. */
  say: string | null
  /**
   * Position on the LADDER, for the dots. Unchanged while `reactive` is true:
   * the ladder has not moved, and the dots answer "where are we in the rep"
   * rather than "what is on the card".
   */
  index: number
  /** How many steps the ladder has. */
  total: number
  /** True when `step` is `ANSWER_HER` rather than a step on the ladder. */
  reactive: boolean
}

/**
 * The whole decision: which step, which of its lines, and whether she has just
 * put a question to him that outranks both.
 *
 * ── THREE THINGS DECIDE IT, IN THIS ORDER ────────────────────────────────
 *
 * **The wind-down wins outright.** Thirty seconds out the only thing worth
 * saying is how to leave, and that is true whatever she just asked. This is the
 * 6 September rule and it is first for the same reason it was written.
 *
 * **Then her question.** A rail that tells him to ask a follow-up while she is
 * waiting on an answer is not a prompt that fits badly, it is a prompt that
 * talks over her — see `ANSWER_HER`. Suppressed on the opening step, where she
 * has not spoken at all and `herLastTurnAsked` can only be a stale read.
 * `herLastTurnAsked` means **she is waiting**, not that she once asked: the
 * caller requires hers to be the last turn in the transcript, so the prompt
 * clears the moment he answers rather than standing for another exchange.
 *
 * **Then the ladder, and which of its lines.** A step's lines are offered one
 * per exchange spent on it and hold on the last, so the rail changes on most
 * exchanges of a rep rather than four times in the first seventy seconds.
 *
 * Pure, so the whole of it is testable without a microphone; the caller reads
 * `herLastTurnAsked` off the committed transcript (`lib/data/rep.ts`), which is
 * the same source the interview caption is taken from.
 */
export function guidedPromptFor(
  script: readonly GuidedStep[],
  progress: GuidedProgress,
  options: { wrapping?: boolean; herLastTurnAsked?: boolean } = {},
): GuidedPrompt | null {
  if (script.length === 0) return null
  const total = script.length
  const index = guidedStepIndexFor(script, progress, options)
  const step = script[index]
  if (!step) return null

  if (!options.wrapping && options.herLastTurnAsked && index > 0) {
    return { step: ANSWER_HER, say: lineAt(ANSWER_HER, 0), index, total, reactive: true }
  }

  // Exchanges spent on this step. The close is reached by the clock rather
  // than by a count, so it opens at its first line and stays there.
  const exchanges = Math.min(progress.userTurns, progress.agentTurns)
  const spent = options.wrapping ? 0 : Math.max(0, exchanges - (STEP_AT[index] ?? index))
  return { step, say: lineAt(step, spent), index, total, reactive: false }
}

/** The nth line of a step, holding on the last. No lines renders the aim. */
function lineAt(step: GuidedStep, nth: number): string | null {
  if (step.says.length === 0) return null
  return step.says[Math.min(nth, step.says.length - 1)] ?? null
}
