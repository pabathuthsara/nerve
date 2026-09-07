/**
 * Design briefs, and the ladder a system design round climbs.
 *
 * ── THE ONE VERBATIM-AUTHORED QUESTION IN THE PRODUCT ────────────────────
 *
 * Everything an interviewer says is generated: the field stems are context she
 * paraphrases, the probe domains are subjects she finds a sentence for, and the
 * agenda beats tell her a thread is finished without naming what comes next.
 * **A design brief is the exception** (INTERVIEW-TECHNICAL-PLAN §4.3, §7.3),
 * and it is one exception for one reason: the brief IS the round. Generating it
 * at runtime would give a different exam every session, which is precisely what
 * rule 10 refuses — a candidate cannot measure themselves against a ladder that
 * is re-drawn every time they stand next to it.
 *
 * So `statement` is authored, reviewed in a pull request and posed as written.
 * Nothing else here is: the curveballs are CONSTRAINTS rather than questions,
 * for the same reason the probe domains are domains rather than questions, and
 * the ladder beats say what kind of move is due without naming the move.
 *
 * ── DELIBERATELY ORDINARY ────────────────────────────────────────────────
 *
 * A URL shortener, a rate limiter, a chat service, a job queue, a notification
 * fan-out. The brief is not supposed to be clever. It is supposed to have
 * enough surface for six turns of depth, and a clever brief spends its first
 * three turns being explained.
 *
 * ── AND THE CANDIDATE'S CV DOES NOT COME UP ──────────────────────────────
 *
 * §4.3. This is a different interview from `technical`, and the whole point is
 * that their own projects are not the subject. `compileInterviewBrief` suppresses
 * the CV section on this shape; `interview-briefs.test.ts` asserts it.
 */

import type { DifficultyLevel } from './interview-difficulty'
import type { InterviewFieldId } from './interview-fields'
import { roundType, type RoundTypeId } from './interview-credits'

export interface DesignBrief {
  id: string
  /** For the picker, the transcript and the audition harness. Never spoken. */
  label: string
  /**
   * The problem, as she poses it. THE ONE VERBATIM-AUTHORED QUESTION.
   *
   * Forty to seventy words, which is why `lib/warmth/interview/bands.ts` has a
   * ceiling for a brief turn — the widest band caps at thirty-four and a brief
   * truncated at thirty-four words is a round with no question in it (§6.7).
   */
  statement: string
  /**
   * The parts of it worth taking down, for the DEPTH beat.
   *
   * Subjects, not questions. She picks one and asks in her own words.
   */
  depth: string[]
  /**
   * Constraints added late, for the CURVEBALL beat (§6.6).
   *
   * Authored as facts about the problem rather than as sentences she reads:
   * "it has to work offline" is a constraint, and what she does with it is
   * hers. This is where difficulty 4 and 5 actually live — the ladder's first
   * five rungs are the same shape at every level, and the curveball is what
   * separates a mid interview from a staff one.
   */
  curveballs: string[]
}

export const SOFTWARE_DESIGN_BRIEFS: readonly DesignBrief[] = [
  {
    id: 'url-shortener',
    label: 'URL shortener',
    statement:
      'I want you to design a URL shortener with me. Someone pastes in a long link, we hand back a'
      + ' short one, and when anyone visits the short one they end up at the original. Assume it is'
      + ' public, so anyone can create a link, and assume it gets popular. Take it wherever you'
      + ' think it should go — I will follow you.',
    depth: [
      'how a short code is generated and why that scheme',
      'what the storage looks like and how a read is served',
      'what happens to a link nobody has used in two years',
      'the click counting, and whether it is exact',
    ],
    curveballs: [
      'the short links have to keep working if the database is unavailable for reads',
      'someone is creating ten thousand links a second from one client',
      'a customer wants to bring their own domain for their links',
      'a link has to be revocable within a second, everywhere',
    ],
  },
  {
    id: 'rate-limiter',
    label: 'Rate limiter',
    statement:
      'Design a rate limiter with me. We have an API, and we want to stop any one customer from'
      + ' using more than their share of it — say a thousand requests a minute each. It sits in'
      + ' front of everything we run, and everything we run is more than one machine. Start'
      + ' wherever you like and I will ask about the parts I am interested in.',
    depth: [
      'the counting scheme, and what it does at the boundary of a window',
      'where the counter lives when there is more than one server',
      'what the caller is told when they are over',
      'the cost of the check itself on every request',
    ],
    curveballs: [
      'the shared counter store is down and requests are still arriving',
      'one customer is worth ten times another and should get ten times the budget',
      'the limit has to be enforced across two regions that are two hundred milliseconds apart',
      'a burst of legitimate traffic looks exactly like abuse',
    ],
  },
  {
    id: 'chat-service',
    label: 'Chat service',
    statement:
      'Let us design a chat service. Two people, or a small group, sending messages to each other,'
      + ' and they should show up straight away rather than when somebody refreshes. People are on'
      + ' phones as much as laptops, so they go offline and come back. Take me through how you would'
      + ' build it.',
    depth: [
      'how a message reaches someone who is currently connected',
      'how a message reaches someone who is not',
      'the ordering of messages, and what is used to order them',
      'read receipts, and what they cost',
    ],
    curveballs: [
      'a phone has been offline for a week and comes back',
      'the same person is on three devices at once',
      'a group has ten thousand people in it',
      'messages have to be deletable, everywhere, after they were delivered',
    ],
  },
  {
    id: 'job-queue',
    label: 'Job queue',
    statement:
      'Design a job queue with me. Our application needs to hand off work that takes too long to do'
      + ' inside a request — sending an email, generating a report, that kind of thing. Something'
      + ' puts a job in, something else picks it up and runs it. Assume the work matters, so we care'
      + ' whether it actually happened.',
    depth: [
      'how a worker takes a job without two workers taking the same one',
      'what happens when a worker dies halfway through',
      'retries, and how many is the right number',
      'jobs that keep failing, and where they go',
    ],
    curveballs: [
      'a job is not safe to run twice and the worker crashed after doing the work',
      'the queue has a million jobs in it and the oldest is a day old',
      'one kind of job is urgent and the rest are not',
      'a job needs to run at a specific time rather than as soon as possible',
    ],
  },
  {
    id: 'notification-fanout',
    label: 'Notification fan-out',
    statement:
      'I would like to design a notification system with you. When something happens in our product'
      + ' — someone comments on your work, say — everybody who should hear about it gets told, by'
      + ' email or push or in the app itself. Some people follow a lot of things. Show me how you'
      + ' would put that together.',
    depth: [
      'how the list of people to notify is worked out',
      'the split between doing it at write time and at read time',
      'per-person preferences and how they are applied',
      'batching, so a busy hour is not a hundred emails',
    ],
    curveballs: [
      'one account is followed by two million people',
      'the email provider is rejecting everything for the next twenty minutes',
      'somebody must never receive a notification they have opted out of, even once',
      'a notification has to be recalled after the thing it was about was deleted',
    ],
  },
]

const DESIGN_BRIEFS: Partial<Record<InterviewFieldId, readonly DesignBrief[]>> = {
  software: SOFTWARE_DESIGN_BRIEFS,
}

export function designBriefsFor(
  field: InterviewFieldId | string | null | undefined,
): readonly DesignBrief[] {
  return DESIGN_BRIEFS[field as InterviewFieldId] ?? []
}

/**
 * Which brief this rep gets.
 *
 * Chosen by seed rather than at random, so the same session id always resolves
 * to the same brief — the token route compiles the prompt once and the audition
 * harness has to be able to reproduce a rep. `seed` is the session id in
 * production, which also means two consecutive interviews land on different
 * briefs without anything having to remember the last one (§7.3).
 *
 * Null when the field has no authored briefs, which is eleven of the twelve.
 * The round then falls back to the `technical` behaviour rather than posing a
 * problem nobody wrote.
 */
export function designBriefFor(input: {
  field: InterviewFieldId | string | null | undefined
  seed: string
}): DesignBrief | null {
  const briefs = designBriefsFor(input.field)
  if (briefs.length === 0) return null
  let hash = 0
  for (let index = 0; index < input.seed.length; index += 1) {
    hash = (hash * 31 + input.seed.charCodeAt(index)) >>> 0
  }
  return briefs[hash % briefs.length]!
}

/**
 * Does this round open on an authored design brief?
 *
 * Both halves matter: the round has to be a `system_design` one AND the field
 * has to have briefs written for it. A `deep_technical` interview in marketing
 * is a real thing somebody may have bought, and it runs as the interview it was
 * before this plan rather than refusing.
 */
export function opensOnDesignBrief(input: {
  round: RoundTypeId
  field: InterviewFieldId | string | null | undefined
}): boolean {
  return roundType(input.round).opener === 'brief' && designBriefsFor(input.field).length > 0
}

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

/**
 * The rungs of a system design round (§6.6).
 *
 * `brief` is her first turn and is not a beat — it is posed rather than fired.
 * The other five arrive on the rep clock, on the same bracketed channel as
 * every other direction she gets, and each one says what kind of move is due
 * without naming the move.
 */
export type DesignRung = 'requirements' | 'shape' | 'choice' | 'depth' | 'curveball'

export const DESIGN_LADDER: readonly DesignRung[] = [
  'requirements',
  'shape',
  'choice',
  'depth',
  'curveball',
]

/**
 * The direction for one rung.
 *
 * **IT NAMES NO SUBJECT, AND THAT IS THE POINT.** The depth items and the late
 * constraints are authored above, and they reach her in the CONTRACT — rendered
 * once by `compileInterviewBrief`, inside the cached prefix, alongside the brief
 * they belong to. So the beat says what kind of move is due and she picks from
 * a list she has already read, which is the same split every other authored
 * thing on this track uses: the domain is authored and the question is hers.
 *
 * Doing it the other way round — the beat carrying the subject — would have put
 * the brief's own content on the browser, which means either shipping the whole
 * authored table to the client or plumbing a rotation seed through five layers
 * of code the dating arm shares. Both are worse, and the second is a rule 19
 * surface for no gain.
 *
 * **REQUIREMENTS is not a question she asks.** Step 2 of the ladder is whether
 * the CANDIDATE asks what it needs to do, and that is the tell — so the
 * direction tells her to leave room for it and to notice, never to prompt for
 * it. Prompting would hand them the mark they were being measured on.
 */
export function designRungDirection(rung: DesignRung): string {
  switch (rung) {
    case 'requirements':
      return '(Stop and let them steer for a moment. Do not tell them what it needs to do and do'
        + ' not offer a number unprompted — if they have not asked what the requirements are, that'
        + ' is worth knowing. Answer whatever they do ask about scope plainly and briefly.)'
    case 'shape':
      return '(Move them off the details. Ask for the overall shape of the thing — the pieces and'
        + ' what talks to what — before any one piece gets taken apart.)'
    case 'choice':
      return '(Pick one thing they have named and ask what they would actually use for it, and why'
        + ' that rather than the obvious alternative. One question.)'
    case 'depth':
      return '(Take one component all the way down. Choose one of the parts of this problem you'
        + ' were told are worth going at, preferably one they have said least about, and ask how it'
        + ' actually works — the mechanism, not their opinion of it.)'
    case 'curveball':
      return '(Add one of this problem\'s late constraints now, in your own words, and ask what'
        + ' changes. Do not apologise for it and do not help them with it.)'
  }
}

/**
 * The late constraints this difficulty is allowed to reach for.
 *
 * The curveball is where difficulty 4 and 5 actually live (§6.6), and each
 * brief's list is authored easiest-first: the early ones add load, the later
 * ones remove a guarantee the candidate is assuming. So the level indexes into
 * the list and CLAMPS rather than wrapping — a staff candidate must never be
 * handed the gentlest constraint because a modulo came round, and an intern
 * must never be handed the one with no answer at their level.
 *
 * Two are offered rather than one, so she is choosing rather than reading.
 */
export function curveballsAt(brief: DesignBrief, difficulty: DifficultyLevel): string[] {
  const list = brief.curveballs
  if (list.length === 0) return []
  const start = Math.min(Math.max(0, list.length - 2), Math.max(0, difficulty - 2))
  return list.slice(start, start + 2)
}

/**
 * The brief, rendered for the character contract.
 *
 * The statement is quoted as authored — it is the one verbatim question — and
 * everything under it is material rather than script. Composed here rather than
 * in `compileInterviewBrief` so the authored table and the way it is presented
 * stay in one file.
 */
export function renderDesignBrief(brief: DesignBrief, difficulty: DifficultyLevel): string {
  const curveballs = curveballsAt(brief, difficulty)
  return [
    '# The problem you are setting them',
    'This is a system design round. Their CV and their own projects are NOT the subject and you'
    + ' should not ask about them. Open by posing this problem, close to as written — it is the'
    + ' one thing on this track you say rather than compose:',
    '',
    `"${brief.statement}"`,
    '',
    'Parts of it worth taking all the way down later, when you are told to go deep. Pick one and'
    + ' ask about the mechanism in your own words:',
    ...brief.depth.map((item) => `- ${item}`),
    ...(curveballs.length
      ? [
        'Constraints to add LATE, when you are told to, and not before. Introduce one in your own'
        + ' words and ask what changes:',
        ...curveballs.map((item) => `- ${item}`),
      ]
      : []),
  ].join('\n')
}
