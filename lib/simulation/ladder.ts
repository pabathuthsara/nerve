/**
 * The difficulty ladder, simulated — `PERSONA-REALISM-REPORT-2026-09-23.md`
 * §1.2 and Appendix C, as code that can be re-run rather than a table that
 * can only be quoted.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * The report's central ladder claim is that the rungs were tuned for fifteen
 * turns a rep and production delivers twelve, so a strong player arms Nadia 7%
 * of the time at 12 turns and 98% at 16. That number came from a scratch file
 * outside the repo, which means nobody can re-measure it after a latency fix,
 * a trajectory change or a reprice in `fast.ts` — and "re-measure the ladder
 * before any trajectory moves" is the whole of phase 3 in its §11.
 *
 * ── WHAT IT DRIVES ───────────────────────────────────────────────────────
 *
 * The REAL `WarmthSession`, through `onUserTurn` and `onAgentTurn`, in the
 * order and through the members the live adapter uses (`scripts/rep-audition.ts`
 * is the reference). So every rule a customer's rep runs is exercised, not
 * just `scoreFast` + `applyFast`:
 *
 *   · the turn-kind classifier, so "Okay." after her question is an ANSWER and
 *     after her statement is a dead end — which is why her side has to exist
 *   · the dead-end streak, contempt guard, temperament weighting, fast
 *     authority taper, loss cap, repair window
 *   · the hesitation penalty at level 4, off a real gap before his turn
 *   · her silence (`staysSilent`), which withholds a line and therefore a
 *     callback target, exactly as the adapter does by making no request
 *   · the steering cadence (`statelessDirective`), read for the one thing the
 *     meter depends on: whether she was allowed to ask him something
 *   · the wind-down hand-over thirty seconds out
 *
 * Only the judge is simulated, as Appendix C states it: a slow judgement of
 * intent +5 / +3 / +2 (strong / competent / nervous) on every third turn that
 * was not a dead end, applied through `engine.applySlow` after her reply, the
 * point at which the live judge's answer can first land.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 *
 * A model of the ladder, not of a person — the report's own caveat. Her lines
 * are canned per band and chosen at random; the only properties of them the
 * meter can see are their content words (callbacks) and whether they end in a
 * question (turn kind), and those are the properties authored here. Every
 * number it prints has to be confirmed with `rep:audition` and real reps.
 *
 * Pure and deterministic: no clock, no network, no `Math.random`. The same
 * seed produces the same table, byte for byte.
 */

import type { Persona, TranscriptTurn } from '@/lib/voice/types'
import { WarmthSession } from '@/lib/warmth/session'
import { bandFor, specFor, type WarmthBand } from '@/lib/warmth/bands'
import { contentWords, fillerCount, isOpenQuestion, referencesAgent, wordsIn } from '@/lib/warmth/fast'
import { classifyUserTurn, type UserTurnKind } from '@/lib/warmth/turn-kind'
import { isDismissal, isUserFarewell } from '@/lib/warmth/leaving'
import { hasHostilityMarker, worthJudging } from '@/lib/warmth/triggers'
import { ARM_THRESHOLD, givesNumber } from '@/lib/data/rep-rules'
import { seededRandom } from '@/lib/voice/seed'

/* ------------------------------------------------------------------ *
 * The players
 * ------------------------------------------------------------------ */

export type TurnCategory = 'open' | 'callback' | 'ordinary' | 'short' | 'deadEnd'
export type PlayerId = 'strong' | 'competent' | 'nervous'

export interface PlayerSpec {
  /** Share of his turns in each category. Sums to one. */
  mix: Record<TurnCategory, number>
  /**
   * What the simulated judge returns on the turns it scores.
   *
   * Appendix C's "+5 / +3 / +2", read as one figure per archetype in the order
   * the archetypes are listed. A strong player's ordinary turn is still judged
   * as meant warmly; a nervous player's best turn is still judged as awkward.
   */
  slowIntent: number
  /**
   * Seconds between her finishing and him starting, as a uniform range.
   *
   * Only read by the level-4 hesitation penalty (`fast.ts`, "> 3 s"), which is
   * dead below level 4 — so this is Robin's number and nobody else's. A nervous
   * man takes longer than three seconds about one turn in five.
   */
  gapSeconds: readonly [number, number]
}

/**
 * Appendix C, exactly.
 *
 *   strong    = 50% open question, 40% callback, 10% ordinary
 *   competent = 35 / 20 / 25 / 12 / 8   open / callback / ordinary / short / dead end
 *   nervous   = 20 / 10 / 30 / 25 / 15
 */
export const PLAYERS: Record<PlayerId, PlayerSpec> = {
  strong: {
    mix: { open: 0.5, callback: 0.4, ordinary: 0.1, short: 0, deadEnd: 0 },
    slowIntent: 5,
    gapSeconds: [0.4, 1.4],
  },
  competent: {
    mix: { open: 0.35, callback: 0.2, ordinary: 0.25, short: 0.12, deadEnd: 0.08 },
    slowIntent: 3,
    gapSeconds: [0.6, 2.2],
  },
  nervous: {
    mix: { open: 0.2, callback: 0.1, ordinary: 0.3, short: 0.25, deadEnd: 0.15 },
    slowIntent: 2,
    gapSeconds: [0.8, 3.6],
  },
}

export const PLAYER_IDS: readonly PlayerId[] = ['strong', 'competent', 'nervous']
export const CATEGORIES: readonly TurnCategory[] = ['open', 'callback', 'ordinary', 'short', 'deadEnd']

/**
 * What he says, by category. Real sentences a man in his twenties says to a
 * stranger, not labels — because the classifier, the callback detector and the
 * length band all read the WORDS, and a label would test nothing.
 *
 * Every line is held to its category by `poolViolations` below, which runs the
 * real classifier over it. That check is not ceremony: "Can't complain, I
 * guess." reads as a statement and is classified as a QUESTION (the `can` lead
 * matches up to the apostrophe), which would have paid a short answer as
 * curiosity.
 *
 * None of these may share a content word with anything she says, or a line
 * authored as an open question would quietly earn a callback it never made.
 *
 * **One line was taken out, and it is a live defect rather than a fixture
 * problem.** "Where did you grow up, originally?" is classified a DISMISSAL:
 * `HOSTILITY` in `lib/warmth/triggers.ts` lists "grow up" as contempt ("oh,
 * grow up"), so the most ordinary getting-to-know-you question there is is
 * refused its +3 and charged `CONTEMPT_POINTS` (-10) on every rung. That file
 * is Tier 0 and is not opened from a harness; the finding is recorded, and the
 * line here reads "Where are you from" so the ladder measures the ladder.
 */
export const HIS_LINES: Record<Exclude<TurnCategory, 'callback'>, readonly string[]> = {
  open: [
    'What do you usually get up to on the weekend?',
    'How did you end up here this afternoon?',
    'What has been the best part of your week so far?',
    'Where would you rather be right now, if you could pick anywhere?',
    'What kind of music have you had on repeat lately?',
    'How do you normally spend a Saturday when nothing is planned?',
    'Where are you from, originally?',
    'What are you up to today?',
    'How is your day going so far?',
    'Who is the most interesting person you have met this year?',
    'What made you pick this spot over somewhere busier?',
  ],
  ordinary: [
    'I headed straight from the office, it has been a week of spreadsheets.',
    'I nearly stayed in today, the forecast looked terrible this morning.',
    'My brother keeps telling me I need to get out of the apartment more.',
    'I only moved to the city in March, so everything still feels pretty new.',
    'I spent the whole morning fixing my bike and my hands are covered in grease.',
    'My battery died an hour ago, so I am completely cut off from everyone.',
    'I have been trying to read more instead of scrolling, with mixed results.',
    'I am terrible at small talk, but I figured I would try anyway.',
  ],
  short: [
    'Not much, just office stuff.',
    'Pretty good, all things considered.',
    'Same as always, to be fair.',
    'A slow one today.',
    'Fair enough, makes sense.',
    'No plans yet, really.',
  ],
  deadEnd: ['Okay.', 'Mm.', 'Cool.', 'Right.', 'Oh, okay.', 'Yeah.', 'Ha, okay.'],
}

/* ------------------------------------------------------------------ *
 * Her side
 * ------------------------------------------------------------------ */

/**
 * One of her lines, and two ways he could pick it up.
 *
 * A callback is defined by the scorer as reusing a content word from her side
 * of the conversation, so the pick-ups are authored against the line rather
 * than templated onto a word: "Your sister sounds like mine" and "How late is
 * she usually?" are what people say; "{word}, interesting!" is not.
 */
export interface HerLine {
  text: string
  /** He picks it up with a statement of his own. */
  statement: string
  /** He picks it up with a follow-up question. */
  question: string
}

type HerPool = { statements: readonly HerLine[]; questions: readonly HerLine[] }

/**
 * Canned, per band. Short at the cold end and longer and occasionally asking
 * at the warm end, because that is what the band table asks of her; the
 * meter never reads her length, only her content words and her question mark.
 *
 * Scene-agnostic on purpose: the four characters are in a gallery, a
 * bookshop, a coffee shop and a hotel lobby, and nothing here can tell.
 */
export const HER_LINES: Record<WarmthBand, HerPool> = {
  HOSTILE: {
    statements: [
      { text: 'Not interested, sorry.', statement: 'Sorry, I did not mean to bother you, I was only being friendly.', question: 'Sorry, was I being too much just then?' },
      { text: 'Seriously, please stop.', statement: 'Please do not take it the wrong way, I was only being friendly.', question: 'Stop what, exactly? I was only saying hello.' },
      { text: 'Mm. Excuse me.', statement: 'Excuse me for interrupting, I should have read the room better.', question: 'Excuse me for asking, but did I say something wrong?' },
    ],
    questions: [],
  },
  CLOSED: {
    statements: [
      { text: 'Just browsing.', statement: 'Browsing is underrated, I could do it for hours in a spot like this.', question: 'Browsing for anything special, or no plan at all?' },
      { text: 'Waiting on someone.', statement: 'Waiting around drives me crazy, I am always the early one.', question: 'Who are you waiting on, a friend?' },
      { text: 'Mm, not sure.', statement: 'Not sure is fair, I am never sure about anything either.', question: 'Not sure in a good way or a bad way?' },
      { text: 'Tired, mostly.', statement: 'Tired is the default setting for me by Friday too.', question: 'Tired from what, if you do not mind me asking?' },
    ],
    questions: [],
  },
  GUARDED: {
    statements: [
      { text: 'Waiting on my sister. She is late.', statement: 'My sister is exactly the same, she was late to her own birthday.', question: 'How late is your sister usually, ten minutes or an hour?' },
      { text: 'Killing time before a dentist appointment.', statement: 'A dentist appointment on a day off is brutal, I am sorry.', question: 'Why book the dentist on a day like this?' },
      { text: 'Mostly avoiding my laptop.', statement: 'Avoiding the laptop is the smartest thing anyone can do on a day off.', question: 'What is on the laptop that you are avoiding?' },
      { text: 'Um, looking for a birthday gift.', statement: 'Birthday gifts stress me out, I always leave it to the last day.', question: 'Who is the birthday for, someone picky?' },
      { text: 'Hard to say, really.', statement: 'Hard to say is the most honest answer I have heard in a while.', question: 'Why is it hard to say?' },
    ],
    questions: [],
  },
  OPEN: {
    statements: [
      { text: 'Ha. My cousin dragged me here and vanished.', statement: 'Your cousin sounds like my friends, they vanish the second we arrive.', question: 'Where did your cousin vanish to?' },
      { text: 'I came in mainly for the air conditioning.', statement: 'The air conditioning in here is a lifesaver, it is so hot outside.', question: 'Was the air conditioning the whole reason, or did something catch your eye?' },
      { text: 'My sister has a birthday Sunday, and I have zero ideas.', statement: 'Zero ideas by Sunday sounds stressful, my family does the same thing.', question: 'What does she like? Birthday gifts are easier with a hint.' },
      { text: 'I keep saying I will take a pottery class.', statement: 'A pottery class sounds great, my aunt did one and loved it.', question: 'What is stopping you from taking the pottery class?' },
    ],
    questions: [
      { text: 'Avoiding emails, mostly. And you?', statement: 'Emails follow me everywhere, I muted them for the whole trip.', question: 'Avoiding emails from anyone in particular?' },
      { text: 'Um, not sure yet. Are you from around here?', statement: 'Around here, yeah, about ten minutes away on foot.', question: 'Why, do I not look like I am from around here?' },
      { text: 'Bored, mainly. What brings you in?', statement: 'Bored is dangerous, that is how I end up buying things I do not need.', question: 'Bored of what, the day or the company?' },
    ],
  },
  ENGAGED: {
    statements: [
      { text: 'Okay, that is funny. I did not expect that.', statement: 'I will take funny, it beats the alternative.', question: 'Funny good or funny weird?' },
      { text: 'The bakery next door is the real reason I visit.', statement: 'That bakery does the best cinnamon rolls, I go twice a month.', question: 'Which thing at the bakery is worth the trip?' },
      { text: 'Deadline Monday, and I am hiding from it.', statement: 'Hiding from a deadline is a skill, I would rate yours highly.', question: 'What is the deadline for, anything exciting?' },
      { text: 'My cousin says I overthink. She has a point.', statement: 'I overthink too, my whole family plans dinners for weeks.', question: 'What do you overthink the most?' },
    ],
    questions: [
      { text: 'Ha. So what do you do for a living?', statement: 'For a living I fix phones, which is less glamorous than it sounds.', question: 'For a living? Would you believe I teach piano?' },
      { text: 'Wait, really? Where was that?', statement: 'Wait until you hear the rest of it, it gets worse.', question: 'Wait, you want the whole story?' },
      { text: 'Do you chat to strangers a lot?', statement: 'Strangers are easier than friends sometimes, there is no history to worry about.', question: 'Strangers? Only the ones who look approachable, why?' },
    ],
  },
  INVESTED: {
    statements: [
      { text: 'You are easier company than I expected.', statement: 'Easier company is the kindest thing anyone has said to me this month.', question: 'Easier company than who, exactly?' },
      { text: 'Stealing that line, by the way.', statement: 'Steal it, that line has served me well for years.', question: 'Which line, the one about the bike?' },
      { text: 'We should grab a coffee sometime, maybe.', statement: 'Coffee sounds great, I know a spot two streets over.', question: 'Coffee this week, or is that too soon?' },
    ],
    questions: [
      { text: 'Wait, you play piano? Since when?', statement: 'Piano since I was seven, though I play badly now.', question: 'Piano since I was seven. Do you play anything?' },
      { text: 'So when do I get to hear the rest?', statement: 'The rest is a longer story, it needs at least one coffee.', question: 'The rest of it? How long have you got?' },
    ],
  },
}

/** Her line on the wind-down turn, one per decision (rule 3). */
export const HER_CLOSING: Record<'leave' | 'number', HerLine> = {
  leave: { text: 'I should probably head off soon, actually.', statement: 'Head off somewhere fun, at least, if the day allows it.', question: 'Head off where, somewhere fun?' },
  number: { text: 'Here, hand me your cell and I will add my number.', statement: 'Your number would be great, here you go.', question: 'Your number, really? That would be great.' },
}

/* ------------------------------------------------------------------ *
 * One rep
 * ------------------------------------------------------------------ */

/** Speech rate for his turns and hers, words a second. Only moves the clock. */
const WORDS_PER_SECOND = 2.6
/** Her reply gap. The meter never reads it; it only keeps the clock honest. */
const REPLY_GAP_SECONDS = 3.4
/** How often she asks him something when the steering line lets her. */
export const ASK_BACK_RATE = 0.35
/** Absolute topic intimacy of every judged turn: small talk (§2d of the judge). */
const JUDGED_INTIMACY = 10
/** The judge scores every third turn that was not a dead end (Appendix C). */
const JUDGE_EVERY = 3

/** The clause `bandDirectiveParts` adds when the question quota is spent. */
const SUPPRESSED_QUESTION = 'Do not ask him anything this turn.'

const ENGAGED_FLOOR = specFor('ENGAGED').min

export interface RepOutcome {
  /** Peak ≥ 65 on a turn before the last three — the wind-down (Appendix C). */
  armed: boolean
  /**
   * Reached ENGAGED (≥ 60) before the wind-down: the same window as `armed`.
   *
   * THE WINDOW IS THE REPORT'S, and it was measured rather than assumed. Read
   * over the whole rep, Nadia's competent player at 16 turns reaches ENGAGED
   * 70% of the time; read before the wind-down it is 36%, against §1.2's 37%.
   * The last three turns are where she has already been told how the scene
   * ends, so warmth gained there changes nothing the user can win.
   */
  engaged: boolean
  /** Reached ENGAGED at any point, the last three turns included. */
  engagedAnywhere: boolean
  /** The highest warmth before the wind-down, start included. */
  peakBeforeWindDown: number
  /** The highest warmth of the whole rep, start included. */
  peak: number
  end: number
  silentTurns: number
  /** His turns by category, and what the real fast scorer paid for each. */
  fastByCategory: Record<TurnCategory, { turns: number; raw: number }>
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)]
  if (item === undefined) throw new Error('Picked from an empty pool.')
  return item
}

function drawCategory(mix: Record<TurnCategory, number>, rng: () => number): TurnCategory {
  const roll = rng()
  let running = 0
  for (const category of CATEGORIES) {
    running += mix[category]
    if (roll < running) return category
  }
  // Float drift past the last boundary lands on the last category with weight.
  return [...CATEGORIES].reverse().find((category) => mix[category] > 0) ?? 'ordinary'
}

function wordsOf(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Whether she may ask him something this turn, read off the line she would
 * actually be given.
 *
 * The cold bands forbid it in their own words; OPEN allows it only when he
 * asked first; ENGAGED and INVESTED invite it unless the session's quota or
 * the reciprocity gate has appended the suppression clause. Reading the
 * directive rather than re-deriving the rule means a change to either owner
 * reaches the simulation without a second copy of the rule to update.
 */
function mayAskBack(band: WarmthBand, directive: string, heAsked: boolean): boolean {
  if (band === 'HOSTILE' || band === 'CLOSED' || band === 'GUARDED') return false
  if (directive.includes(SUPPRESSED_QUESTION)) return false
  if (band === 'OPEN') return heAsked
  return true
}

function emptyFastByCategory(): Record<TurnCategory, { turns: number; raw: number }> {
  return {
    open: { turns: 0, raw: 0 },
    callback: { turns: 0, raw: 0 },
    ordinary: { turns: 0, raw: 0 },
    short: { turns: 0, raw: 0 },
    deadEnd: { turns: 0, raw: 0 },
  }
}

/**
 * His line for a category, given what she last said.
 *
 * A callback with nothing to call back to — his opening turn, before she has
 * spoken — is rendered as an open question, because that is the move a strong
 * opener makes. It is COUNTED as what it became, so the audit table reports
 * what the scorer was actually shown.
 */
function hisLine(
  category: TurnCategory,
  herLast: HerLine | null,
  rng: () => number,
): { text: string; category: TurnCategory } {
  if (category === 'callback') {
    if (!herLast) return { text: pick(HIS_LINES.open, rng), category: 'open' }
    return { text: rng() < 0.5 ? herLast.statement : herLast.question, category }
  }
  return { text: pick(HIS_LINES[category], rng), category }
}

export function simulateRep(
  persona: Persona,
  playerId: PlayerId,
  turns: number,
  rng: () => number,
): RepOutcome {
  const player = PLAYERS[playerId]
  let clock = 0
  const session = new WarmthSession({
    persona,
    trajectory: persona.trajectory,
    // No judge. The one judgement the report simulates is applied by hand
    // below, at the moment the live judge's answer could first land.
    scorer: null,
    nowSeconds: () => clock,
    // The start jitter is the engine's one draw, taken at construction.
    rng,
  })

  const fastByCategory = emptyFastByCategory()
  let herLast: HerLine | null = null
  let silentTurns = 0
  let judgeable = 0
  let armed = false
  let peakBeforeWindDown = session.engine.warmth
  // The first of the last three turns is where the wind-down lands, thirty
  // seconds from the end of a three-minute rep at twelve to sixteen turns.
  const windDownTurn = Math.max(1, turns - 2)

  for (let index = 1; index <= turns; index += 1) {
    if (index === windDownTurn) armed = peakBeforeWindDown >= ARM_THRESHOLD

    // ── his turn ──────────────────────────────────────────────────────
    const drawn = drawCategory(player.mix, rng)
    const line = hisLine(drawn, herLast, rng)
    const [lo, hi] = player.gapSeconds
    const gap = index === 1 ? 0 : lo + (hi - lo) * rng()
    const userTurn: TranscriptTurn = {
      speaker: 'user',
      text: line.text,
      t_start: clock + gap,
      t_end: clock + gap + Math.max(0.8, wordsOf(line.text) / WORDS_PER_SECOND),
    }
    clock = userTurn.t_end
    const score = session.onUserTurn(userTurn)
    fastByCategory[line.category].turns += 1
    fastByCategory[line.category].raw += score.raw

    // Captured now, as `WarmthSession` captures it for the live judge: the
    // turn is judged against the warmth he had earned when he said it.
    const warmthAtTurn = session.engine.warmth
    const turnIndex = session.engine.currentTurnIndex
    // "Non-dead-end" by either reading. "Okay." after her question is an
    // ANSWER to the engine and costs him nothing, but it is still not a turn
    // the live judge would be asked about — `slowScoreTriggers` fires on
    // evidence, and a one-word reply carries none — so it does not earn the
    // simulated +5 / +3 / +2 either.
    const judged = !score.deadEnd && line.category !== 'deadEnd'
    if (judged) judgeable += 1
    const judgeThisTurn = judged && judgeable % JUDGE_EVERY === 0

    // ── the wind-down, thirty seconds out ────────────────────────────
    let closing: HerLine | null = null
    if (index === windDownTurn) {
      const decision = givesNumber({ armed, warmth: warmthAtTurn, interview: false }) ? 'number' : 'leave'
      session.handOverToClosing(decision)
      closing = HER_CLOSING[decision]
    }

    // ── her turn, in the adapter's order ─────────────────────────────
    //
    // `bindVoiceSteering`'s order exactly: silence first, recorded, then the
    // direction — read EVEN ON A SILENT TURN, because the live reply state is
    // one object and the adapter reads all of it before deciding to make no
    // request. That read moves the heartbeat and the change detector, so
    // skipping it (as `rep-audition.ts` does) would shift which later turns
    // carry the standing orders, and with them the question suppression.
    const silent = session.staysSilent
    session.noteSilence(silent)
    const directive = session.statelessDirective()
    if (silent) {
      silentTurns += 1
    } else {
      const band = bandFor(session.engine.warmth)
      const heAsked = line.text.includes('?') || isOpenQuestion(line.text)
      const pool = HER_LINES[band]
      const asks = pool.questions.length > 0
        && mayAskBack(band, directive, heAsked)
        && rng() < ASK_BACK_RATE
      const candidates = asks ? pool.questions : pool.statements
      // Not the line she has just said. A person does not repeat herself
      // verbatim, and a repeated line would make his next callback an echo.
      const fresh = candidates.filter((candidate) => candidate !== herLast)
      const her = closing ?? pick(fresh.length > 0 ? fresh : candidates, rng)
      const start = clock + REPLY_GAP_SECONDS
      const end = start + Math.max(0.6, wordsOf(her.text) / WORDS_PER_SECOND)
      session.onAgentTurn({ speaker: 'agent', text: her.text, t_start: start, t_end: end })
      clock = end
      herLast = her
    }

    // ── the judge lands, after her reply ─────────────────────────────
    if (judgeThisTurn) {
      session.engine.applySlow(
        { intimacy: JUDGED_INTIMACY, intent: player.slowIntent, quote: '', reason: 'simulated judgement' },
        warmthAtTurn,
        clock,
        line.text,
        0,
        turnIndex,
      )
    }

    if (index < windDownTurn) peakBeforeWindDown = Math.max(peakBeforeWindDown, session.engine.warmth)
  }

  const telemetry = session.telemetry(clock)
  session.dispose()
  return {
    armed,
    engaged: peakBeforeWindDown >= ENGAGED_FLOOR,
    engagedAnywhere: telemetry.peak >= ENGAGED_FLOOR,
    peakBeforeWindDown,
    peak: telemetry.peak,
    end: telemetry.end,
    silentTurns,
    fastByCategory,
  }
}

/* ------------------------------------------------------------------ *
 * A cell: one character, one player, one rep length
 * ------------------------------------------------------------------ */

export interface CellResult {
  slug: string
  name: string
  level: number
  player: PlayerId
  turns: number
  reps: number
  armRate: number
  /** Reached ENGAGED before the wind-down. See `RepOutcome.engaged`. */
  engagedShare: number
  /** Reached ENGAGED at any point in the rep. */
  engagedAnywhereShare: number
  /** Mean of the highest warmth before the wind-down. */
  meanPeakBeforeWindDown: number
  /** Mean of the highest warmth of the whole rep. */
  meanPeak: number
  meanEnd: number
  meanSilentTurns: number
  fastByCategory: Record<TurnCategory, { turns: number; meanRaw: number }>
}

export interface CellOptions {
  reps: number
  seed: string
}

/**
 * One cell of the table, from its own seeded stream.
 *
 * The stream is keyed on the cell, not shared across the table, so adding a
 * turn count or a character never reshuffles the reps of a cell that already
 * existed — the numbers for Nadia at 12 turns do not move because somebody
 * asked for 18 as well.
 */
export function simulateCell(
  persona: Persona,
  player: PlayerId,
  turns: number,
  options: CellOptions,
): CellResult {
  const rng = seededRandom(`${options.seed}|${persona.slug}|${player}|${turns}`)
  let armed = 0
  let engaged = 0
  let engagedAnywhere = 0
  let peakBefore = 0
  let peak = 0
  let end = 0
  let silent = 0
  const fast = emptyFastByCategory()
  for (let rep = 0; rep < options.reps; rep += 1) {
    const outcome = simulateRep(persona, player, turns, rng)
    if (outcome.armed) armed += 1
    if (outcome.engaged) engaged += 1
    if (outcome.engagedAnywhere) engagedAnywhere += 1
    peakBefore += outcome.peakBeforeWindDown
    peak += outcome.peak
    end += outcome.end
    silent += outcome.silentTurns
    for (const category of CATEGORIES) {
      fast[category].turns += outcome.fastByCategory[category].turns
      fast[category].raw += outcome.fastByCategory[category].raw
    }
  }
  const n = Math.max(1, options.reps)
  return {
    slug: persona.slug,
    name: persona.name,
    level: persona.level,
    player,
    turns,
    reps: options.reps,
    armRate: armed / n,
    engagedShare: engaged / n,
    engagedAnywhereShare: engagedAnywhere / n,
    meanPeakBeforeWindDown: peakBefore / n,
    meanPeak: peak / n,
    meanEnd: end / n,
    meanSilentTurns: silent / n,
    fastByCategory: Object.fromEntries(CATEGORIES.map((category) => [
      category,
      {
        turns: fast[category].turns,
        meanRaw: fast[category].turns > 0 ? fast[category].raw / fast[category].turns : 0,
      },
    ])) as Record<TurnCategory, { turns: number; meanRaw: number }>,
  }
}

/* ------------------------------------------------------------------ *
 * Keeping the fixtures honest
 * ------------------------------------------------------------------ */

/** Every line she can say, closing lines included. */
export function allHerLines(): HerLine[] {
  return [
    ...Object.values(HER_LINES).flatMap((pool) => [...pool.statements, ...pool.questions]),
    ...Object.values(HER_CLOSING),
  ]
}

/** What the real classifier must call each of his categories. */
const EXPECTED_KIND: Record<Exclude<TurnCategory, 'callback'>, UserTurnKind> = {
  open: 'question',
  ordinary: 'disclosure',
  short: 'answer',
  deadEnd: 'acknowledgement',
}

/** The engaged-length band `scoreFast` pays for. An ordinary turn sits in it. */
const ENGAGED_LENGTH: readonly [number, number] = [8, 25]
/** A short answer: long enough not to be a dead end, too short to be a turn. */
const SHORT_LENGTH: readonly [number, number] = [3, 7]

/** The four guards a line of his must pass whatever its category. */
function guardProblems(text: string): string[] {
  const problems: string[] = []
  if (isDismissal(text)) problems.push('reads as a dismissal')
  if (isUserFarewell(text)) problems.push('reads as a goodbye, which would commit her exit')
  if (hasHostilityMarker(text) || worthJudging(text)) problems.push('reads as contempt')
  if (fillerCount(text) >= 2) problems.push('carries enough filler to be charged for it')
  return problems
}

/**
 * Every way the fixtures above could silently stop meaning what they say.
 *
 * Empty is the only passing answer, and both the test and the script refuse
 * to run on anything else. Each check exists because the scorer reads words,
 * not intentions: an open question that shares a noun with one of her lines
 * is paid as a callback, a "short answer" that begins with "Can't" is paid as
 * a question, and a pick-up line that says "I should head off" ends the scene.
 */
export function poolViolations(): string[] {
  const problems: string[] = []
  const hers = allHerLines()
  const herWords = new Set(hers.flatMap((line) => [...contentWords(line.text)]))

  for (const category of Object.keys(EXPECTED_KIND) as Array<keyof typeof EXPECTED_KIND>) {
    for (const text of HIS_LINES[category]) {
      const where = `his ${category} "${text}"`
      // Against a statement of hers: the strict reading, where "Okay." is a
      // dead end. Against a question it is an answer, and that is the engine's
      // call to make at run time, not the fixture's.
      const kind = classifyUserTurn(text, { herLastTurnAsked: false })
      if (kind !== EXPECTED_KIND[category]) problems.push(`${where} is classified ${kind}, not ${EXPECTED_KIND[category]}`)
      if (category === 'open' && !isOpenQuestion(text)) problems.push(`${where} is not an open question to the scorer`)
      const count = wordsIn(text).length
      if (category === 'ordinary' && (count < ENGAGED_LENGTH[0] || count > ENGAGED_LENGTH[1])) {
        problems.push(`${where} is ${count} words, outside the engaged-length band`)
      }
      if (category === 'short' && (count < SHORT_LENGTH[0] || count > SHORT_LENGTH[1])) {
        problems.push(`${where} is ${count} words, not a short answer`)
      }
      const shared = [...contentWords(text)].filter((word) => herWords.has(word))
      if (shared.length > 0) problems.push(`${where} shares "${shared.join('", "')}" with her lines, so it would score as a callback`)
      for (const problem of guardProblems(text)) problems.push(`${where} ${problem}`)
    }
  }

  for (const her of hers) {
    if (contentWords(her.text).size === 0) problems.push(`her "${her.text}" has no content word to call back to`)
    const said: TranscriptTurn[] = [{ speaker: 'agent', text: her.text, t_start: 0, t_end: 1 }]
    for (const [form, text] of [['statement', her.statement], ['question', her.question]] as const) {
      const where = `his ${form} pick-up of "${her.text}"`
      if (!referencesAgent(text, said)) problems.push(`${where} ("${text}") reuses none of her words`)
      const asks = text.includes('?')
      if (form === 'question' && !asks) problems.push(`${where} ("${text}") is not a question`)
      if (form === 'statement' && (asks || classifyUserTurn(text) === 'question')) {
        problems.push(`${where} ("${text}") reads as a question`)
      }
      for (const problem of guardProblems(text)) problems.push(`${where} ("${text}") ${problem}`)
    }
  }

  for (const [band, pool] of Object.entries(HER_LINES)) {
    for (const line of pool.questions) {
      if (!line.text.trim().endsWith('?')) problems.push(`her ${band} question "${line.text}" does not end in a question mark`)
    }
    for (const line of pool.statements) {
      if (line.text.trim().endsWith('?')) problems.push(`her ${band} statement "${line.text}" ends in a question mark`)
    }
  }
  for (const line of Object.values(HER_CLOSING)) {
    if (line.text.trim().endsWith('?')) problems.push(`her closing line "${line.text}" ends in a question mark`)
  }

  for (const id of PLAYER_IDS) {
    const total = CATEGORIES.reduce((sum, category) => sum + PLAYERS[id].mix[category], 0)
    if (Math.abs(total - 1) > 1e-9) problems.push(`the ${id} mix sums to ${total}, not 1`)
  }
  return problems
}
