/**
 * CALIBRATION FIXTURES (§07 harness, §Part 5).
 *
 * ── FILL IN `intimacy` AND `intent` BY HAND ─────────────────────────────
 *
 * Twenty turn-pairs drawn from the session logs so far. Every one is currently
 * `null`, which is deliberate: these are the ground truth, and ground truth
 * that a model wrote is not ground truth. Score each pair yourself, then run:
 *
 *     npm test -- calibration
 *
 * The harness fails if mean absolute error on intimacy exceeds 15 points.
 *
 * Use the anchors from lib/warmth/prompt.ts — they are re-stated here so you
 * are not scoring against a moving target:
 *
 *     0-10    the shop, the books, the weather, objects in the room
 *     20-30   her tastes, her opinions, what she is doing here
 *     40-50   her life outside this room: work, where she lives, weekend plans
 *     60-70   relationship status, contact details, proposing to meet
 *     80-90   her body, sexual innuendo, pressing after a deflection
 *     100     explicit propositions
 *
 * INTENT runs -10 (hostile) to +10 (warm and genuinely curious).
 *
 * Score intimacy by TOPIC ALONE. Ignore whether it was welcome or well-timed —
 * that comparison is the engine's job and scoring it twice is what kept the
 * boundary rule silent through round 6.
 *
 * `warmth` is what the meter actually read when the line was spoken; it is
 * context for intent, and must not move your intimacy number.
 */

export interface CalibrationFixture {
  id: string
  /** Where it came from, so a disputed score can be listened to again. */
  source: string
  user: string
  /** Her reply to that line. Null where she never answered. */
  agent: string | null
  warmth: number
  /** HAND-SCORED. 0-100 by topic. */
  intimacy: number | null
  /** HAND-SCORED. -10..+10. */
  intent: number | null
  /** Optional: why, for the record. */
  note?: string
}

export const CALIBRATION_FIXTURES: CalibrationFixture[] = [
  // ── round 6, bookshop, gpt-realtime-mini ──────────────────────────────
  {
    id: 'r6-01',
    source: 'round 6, turn 1',
    user: 'Evet.',
    agent: 'Hi there. I was just looking at this old copy of a Feluda mystery. What brings you in?',
    warmth: 41.5,
    intimacy: null,
    intent: null,
  },
  {
    id: 'r6-02',
    source: 'round 6, turn 2',
    user: "I am looking to buy a present for my friend. What's your name?",
    agent: 'I am Nadia. That book in my hand is older than it looks. Who is the present for?',
    warmth: 40,
    intimacy: null,
    intent: null,
  },
  {
    id: 'r6-03',
    source: 'round 6, turn 3',
    user: 'The present is for my brother.',
    agent: 'Nice, what kind of things does he like to read?',
    warmth: 50.5,
    intimacy: null,
    intent: null,
  },
  {
    id: 'r6-04',
    source: 'round 6, turn 4',
    user: 'Yeah, a lot of stuff.',
    agent: 'Got it, this one is a bit of a thriller, quite fast-paced. What is the last book he really loved?',
    warmth: 53.5,
    intimacy: null,
    intent: null,
  },
  {
    id: 'r6-05',
    source: 'round 6, turn 5',
    user: "I'm not sure.",
    agent: 'It is tricky when you are not sure, my brother is like that too, always random choices.',
    warmth: 56.5,
    intimacy: null,
    intent: null,
  },
  {
    id: 'r6-06',
    source: 'round 6, turn 6',
    user: 'Yeah, is that right?',
    agent: 'Yeah, exactly, he picks up random things too, what kind of vibe are you thinking for him?',
    warmth: 56.5,
    intimacy: null,
    intent: null,
  },

  // ── the turn the old sampler missed entirely (§2a) ────────────────────
  {
    id: 'r6-16',
    source: 'round 6, turn 16 — never scored under count-based sampling',
    user: 'maybe you should get down my number and we could arrange a date sometime',
    agent: null,
    warmth: 58,
    intimacy: null,
    intent: null,
    note: 'The largest boundary event of the session. Scored zero times.',
  },

  // ── the ASR failure that penalised a coherent turn (§2b) ──────────────
  {
    id: 'asr-01',
    source: 'ASR mangled "Sherlock Holmes" to "cello combs"',
    user: 'Have you read any of the cello combs ones',
    agent: 'Sherlock? Ages ago. I liked the short ones better.',
    warmth: 30,
    intimacy: null,
    intent: null,
    note: 'Her reply proves he was understood. Was previously charged -3 for being confusing.',
  },

  // ── the fast/slow disagreements that motivated §2c ────────────────────
  {
    id: 'split-01',
    source: 'fast -1 / slow +2 disagreement',
    user: 'Any other recommendations?',
    agent: 'Not really my area, that one.',
    warmth: 45,
    intimacy: null,
    intent: null,
  },
  {
    id: 'split-02',
    source: 'fast +5 / slow -2 disagreement',
    user: "Ja, why, you don't like Dexter?",
    agent: 'Ha. Not especially, no.',
    warmth: 48,
    intimacy: null,
    intent: null,
  },

  // ── low intimacy: the room and the books ──────────────────────────────
  {
    id: 'low-01',
    source: 'bookshop, opening',
    user: 'Is this place always this quiet on a Saturday?',
    agent: 'Pretty much. It is why I come.',
    warmth: 15,
    intimacy: null,
    intent: null,
  },

  // ── her tastes and opinions ───────────────────────────────────────────
  {
    id: 'mid-01',
    source: 'bookshop',
    user: 'Do you actually like crime novels or is it a guilty pleasure thing?',
    agent: 'Bit of both. I am not proud of the airport ones.',
    warmth: 32,
    intimacy: null,
    intent: null,
  },
  {
    id: 'mid-02',
    source: 'bookshop',
    user: 'What made you pick that one up in the first place?',
    agent: 'Read it twice already. Third time now, apparently.',
    warmth: 35,
    intimacy: null,
    intent: null,
  },

  // ── her life outside the room ─────────────────────────────────────────
  {
    id: 'out-01',
    source: 'bookshop',
    user: 'So what do you do when you are not in bookshops?',
    agent: 'Logistics. It is as dull as it sounds.',
    warmth: 38,
    intimacy: null,
    intent: null,
  },
  {
    id: 'out-02',
    source: 'bookshop',
    user: 'Do you live around here then?',
    agent: 'Sort of. Twenty minutes that way.',
    warmth: 40,
    intimacy: null,
    intent: null,
  },
  {
    id: 'out-03',
    source: 'bookshop',
    user: 'What are you up to for the rest of the weekend?',
    agent: 'Meeting my sister at four. That is about it.',
    warmth: 44,
    intimacy: null,
    intent: null,
  },

  // ── relationship status and contact details ───────────────────────────
  {
    id: 'high-01',
    source: 'bookshop',
    user: 'Can I ask if you are seeing anyone at the moment?',
    agent: 'You can ask.',
    warmth: 30,
    intimacy: null,
    intent: null,
  },
  {
    id: 'high-02',
    source: 'bookshop',
    user: 'Would you want to get a coffee sometime this week?',
    agent: 'Mm. Maybe. I do not know you.',
    warmth: 55,
    intimacy: null,
    intent: null,
  },

  // ── body, innuendo, pressing after a deflection ───────────────────────
  {
    id: 'top-01',
    source: 'bookshop',
    user: 'You have got a really good figure, you know that?',
    agent: 'Right. Okay.',
    warmth: 30,
    intimacy: null,
    intent: null,
  },
  {
    id: 'top-02',
    source: 'bookshop',
    user: 'You never actually answered me though. Are you single or not?',
    agent: 'I did answer. I said I am here to buy a book.',
    warmth: 22,
    intimacy: null,
    intent: null,
  },
]

export type ScoredFixture = CalibrationFixture & { intimacy: number; intent: number }

/** Fixtures that have been hand-scored and can be asserted against. */
export function scoredFixtures(): ScoredFixture[] {
  return CALIBRATION_FIXTURES.filter(
    (fixture): fixture is ScoredFixture =>
      typeof fixture.intimacy === 'number' && typeof fixture.intent === 'number',
  )
}

export function unscoredCount(): number {
  return CALIBRATION_FIXTURES.length - scoredFixtures().length
}
