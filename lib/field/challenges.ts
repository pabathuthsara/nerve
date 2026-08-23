/**
 * The challenge library (§09).
 *
 * Hand-written, reviewed, and never generated at runtime. That is not a
 * preference about quality — it is the safety rule the company survives on:
 * **every challenge is one where the worst realistic outcome is a polite no.**
 * Nothing here involves persisting after a refusal, filming anybody,
 * pressuring someone who cannot leave, or making a stranger the unwilling
 * subject of an exercise.
 *
 * The tiers are graded exposure, in that order, for a reason. Going too hard
 * too early sensitises rather than habituates, and a user who is pushed into
 * Tier 4 in week one quits feeling worse than when they arrived.
 *
 * Authored here and seeded into `field_challenges` by `npm run db:content`,
 * for the same reason personas are: this file is what gets reviewed in a pull
 * request, and the table is what gets read.
 */

export interface FieldChallenge {
  slug: string
  tier: 1 | 2 | 3 | 4
  title: string
  /** What to do. Second person, one or two sentences. */
  brief: string
  /** What counts as done. Generous on purpose: the ask is the rep. */
  doneWhen: string
  /** Shown on the first Tier 3 and the first Tier 4 (§12). */
  safetyNote?: string
  /** Where this is possible, so a morning assignment is not a bar. */
  setting: string
}

/** The line every Tier 3 challenge carries. */
const SOCIAL_SAFETY =
  'If they are working, wearing headphones, obviously busy, or alone at night, this is not the moment. Walk on and find another one. Say your piece and leave; nothing here depends on them saying yes.'

/** The line every Tier 4 challenge carries. */
const ROMANTIC_SAFETY =
  'One ask, in daylight or a public place, to somebody who can walk away easily. A no ends it — that is the rep working, not failing. Never ask twice, never follow, never make somebody who is working or cornered the subject of this.'

export const FIELD_CHALLENGES: FieldChallenge[] = [
  /* ---------------------------------------------------------------- *
   * Tier 1 — in-app. Day one. No social risk at all.
   * ---------------------------------------------------------------- */
  {
    slug: 'ask-alex',
    tier: 1,
    title: 'Ask Alex for her number.',
    brief: 'Run a rep against Alex and ask for her number before the three minutes are up. She is going to say no. That is the exercise.',
    doneWhen: 'You asked out loud and heard the answer. Whatever she said, this one is done.',
    setting: 'in-app',
  },
  {
    slug: 'leave-first',
    tier: 1,
    title: 'End a rep yourself.',
    brief: 'In your next rep, decide when it is over and say so warmly, before the timer decides for you.',
    doneWhen: 'You said a real goodbye and ended it. No trailing off.',
    setting: 'in-app',
  },
  {
    slug: 'statement-not-question',
    tier: 1,
    title: 'Open with a statement.',
    brief: 'Start your next rep with something you noticed, not with a question. No "how are you", no tag question on the end.',
    doneWhen: 'Your first line contained no question mark.',
    setting: 'in-app',
  },
  {
    slug: 'let-one-silence-sit',
    tier: 1,
    title: 'Let one silence sit.',
    brief: 'Somewhere in your next rep, let a pause run for three full seconds without filling it.',
    doneWhen: 'You counted three and she spoke first, or she did not. Either is the rep.',
    setting: 'in-app',
  },
  {
    slug: 'say-the-observation',
    tier: 1,
    title: 'Say the thing you would keep in your head.',
    brief: 'One observation in your next rep that you would normally decide against saying. Say it anyway.',
    doneWhen: 'You said it out loud.',
    setting: 'in-app',
  },
  {
    slug: 'stay-on-the-topic',
    tier: 1,
    title: 'Stay on her topic for two more turns.',
    brief: 'When she gives you something, do not change the subject. Ask about that exact thing twice more.',
    doneWhen: 'Two follow-ups on the same thing, back to back.',
    setting: 'in-app',
  },

  /* ---------------------------------------------------------------- *
   * Tier 2 — low stakes. Transactional, no social exposure.
   * ---------------------------------------------------------------- */
  {
    slug: 'ask-the-time',
    tier: 2,
    title: 'Ask a stranger for the time.',
    brief: 'No phone in your hand. Ask, listen to the answer, thank them, keep walking.',
    doneWhen: 'You asked. Whether they knew, heard you, or ignored you does not matter.',
    setting: 'street',
  },
  {
    slug: 'ask-for-a-discount',
    tier: 2,
    title: 'Ask if there is any discount.',
    brief: 'At a till, before you pay: "Any chance there is a discount on this today?" Then accept the answer cheerfully.',
    doneWhen: 'You asked before you paid.',
    setting: 'shop',
  },
  {
    slug: 'ask-off-menu',
    tier: 2,
    title: 'Ask for something that is not on the menu.',
    brief: 'Order something reasonable that is not listed. If the answer is no, order normally and thank them.',
    doneWhen: 'You made the request out loud.',
    setting: 'cafe',
  },
  {
    slug: 'directions-you-do-not-need',
    tier: 2,
    title: 'Ask for directions you do not need.',
    brief: 'Ask somebody how to get to a place you could find in ten seconds on your phone. Listen properly. Thank them.',
    doneWhen: 'You asked and you listened to the whole answer.',
    setting: 'street',
  },
  {
    slug: 'borrow-a-pen',
    tier: 2,
    title: 'Borrow a pen.',
    brief: 'Ask a stranger if you can borrow a pen for a second. Give it back.',
    doneWhen: 'You asked.',
    setting: 'anywhere',
  },
  {
    slug: 'ask-for-the-extra',
    tier: 2,
    title: 'Ask for the extra.',
    brief: 'A free refill, an extra shot, the small side of something. Ask plainly, take the answer well.',
    doneWhen: 'You asked without apologising for asking.',
    setting: 'cafe',
  },

  /* ---------------------------------------------------------------- *
   * Tier 3 — social. Real interaction, nothing romantic.
   * ---------------------------------------------------------------- */
  {
    slug: 'genuine-recommendation',
    tier: 3,
    title: 'Ask for a real recommendation.',
    brief: 'Ask somebody who works somewhere you like what they would actually order, read, or try — and then keep the conversation going for two minutes.',
    doneWhen: 'You got past the recommendation into one real exchange.',
    safetyNote: SOCIAL_SAFETY,
    setting: 'shop',
  },
  {
    slug: 'compliment-and-go',
    tier: 3,
    title: 'Compliment a choice, then leave.',
    brief: 'Compliment something somebody chose — a jacket, a book, a bag — not their body. Then walk on without waiting for anything back.',
    doneWhen: 'You said it and left within ten seconds.',
    safetyNote: SOCIAL_SAFETY,
    setting: 'anywhere',
  },
  {
    slug: 'what-are-you-reading',
    tier: 3,
    title: 'Ask what they are reading.',
    brief: 'Somebody with a book, a magazine, a record in their hand. Ask what it is and whether it is any good.',
    doneWhen: 'You asked and heard the answer.',
    safetyNote: SOCIAL_SAFETY,
    setting: 'cafe',
  },
  {
    slug: 'share-a-table',
    tier: 3,
    title: 'Ask to share a table.',
    brief: 'A busy place, a table with a spare seat. Ask if you can take it. If they would rather not, say no problem and find another.',
    doneWhen: 'You asked out loud rather than hovering.',
    safetyNote: SOCIAL_SAFETY,
    setting: 'cafe',
  },
  {
    slug: 'the-small-comment',
    tier: 3,
    title: 'Make the small comment out loud.',
    brief: 'The queue, the weather, the thing that just happened in front of both of you. Say it to the person next to you.',
    doneWhen: 'You said it. A grunt back still counts.',
    safetyNote: SOCIAL_SAFETY,
    setting: 'queue',
  },
  {
    slug: 'two-question-conversation',
    tier: 3,
    title: 'Have a two-question conversation.',
    brief: 'Start something with a stranger and ask two real questions before it ends. Not an interview — two questions and your own answers in between.',
    doneWhen: 'Two questions, both about what they actually said.',
    safetyNote: SOCIAL_SAFETY,
    setting: 'anywhere',
  },

  /* ---------------------------------------------------------------- *
   * Tier 4 — the real thing. Romantic, and the tier the safety rule
   * exists for. Read ROMANTIC_SAFETY before adding anything here.
   * ---------------------------------------------------------------- */
  {
    slug: 'say-hello-in-daylight',
    tier: 4,
    title: 'Say hello, in daylight.',
    brief: 'Somebody you find attractive, somewhere public and bright. Say one thing. Keep it under a minute and leave first.',
    doneWhen: 'You opened your mouth and said something.',
    safetyNote: ROMANTIC_SAFETY,
    setting: 'street',
  },
  {
    slug: 'ask-a-name',
    tier: 4,
    title: 'Ask for a name.',
    brief: 'Have the exchange, then ask their name and give yours. That is the whole ask.',
    doneWhen: 'You asked. Whether they gave it is not the rep.',
    safetyNote: ROMANTIC_SAFETY,
    setting: 'anywhere',
  },
  {
    slug: 'compliment-then-one-question',
    tier: 4,
    title: 'A real compliment, then one question.',
    brief: 'Something specific you actually noticed, then one question that gives them somewhere to go.',
    doneWhen: 'Both halves happened, in that order.',
    safetyNote: ROMANTIC_SAFETY,
    setting: 'anywhere',
  },
  {
    slug: 'ask-for-a-number',
    tier: 4,
    title: 'Ask for a number.',
    brief: 'A conversation that has gone somewhere, and then the ask. Say it plainly and without a speech in front of it.',
    doneWhen: 'You asked out loud.',
    safetyNote: ROMANTIC_SAFETY,
    setting: 'anywhere',
  },
  {
    slug: 'ask-with-a-specific-plan',
    tier: 4,
    title: 'Ask with a specific plan.',
    brief: '"Coffee on Thursday" beats "we should hang out sometime". Name the thing, name the day.',
    doneWhen: 'The ask contained an actual plan.',
    safetyNote: ROMANTIC_SAFETY,
    setting: 'anywhere',
  },
  {
    slug: 'take-a-no-well',
    tier: 4,
    title: 'Take a no well.',
    brief: 'Make an ask, and when it comes back no, say something warm and leave inside ten seconds. No bargaining, no joke to soften it, no second attempt.',
    doneWhen: 'You left cleanly. This one is passed by how you left, not by what they said.',
    safetyNote: ROMANTIC_SAFETY,
    setting: 'anywhere',
  },
]

/** Who reviewed the library. Stamped on every row (§09, §16.5). */
export const REVIEWED_BY = 'pabath'

export function challengesForTier(tier: number): FieldChallenge[] {
  return FIELD_CHALLENGES.filter((challenge) => challenge.tier === tier)
}
