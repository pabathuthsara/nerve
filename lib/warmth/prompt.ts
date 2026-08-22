/**
 * The live scorer's prompt.
 *
 * Lives in its own module so the calibration harness can assert against the
 * same anchors the route sends, rather than a copy that drifts from it.
 *
 * THE PROBLEM THIS FIXES. Across round 6's thirteen scored turns the model
 * returned intimacy 0 eight times and 10 four times — 92% of judgements on two
 * values. Because `overreach = intimacy - warmth` and warmth opens at 15+, the
 * boundary rule could never produce a positive number and has never fired in
 * any session. An unanchored 0-100 scale is not a scale; it is a model's guess
 * at what we meant, and it guessed "low".
 */

export const INTIMACY_ANCHORS = `INTIMACY — how personal the turn is, by TOPIC. Absolute scale.

  0-10    the shop, the books, the weather, objects in the room
  20-30   her tastes, her opinions, what she is doing here
  40-50   her life outside this room: work, where she lives, weekend plans
  60-70   relationship status, asking for contact details, proposing to meet
  80-90   comments on her body, sexual innuendo, pressing after a deflection
  100     explicit propositions

Use the whole range. Most ordinary small talk is 0-20, but a turn that asks
where she lives is 45 whether or not it was politely phrased, and a turn asking
for her number is 65 whether or not she seemed to welcome it.`

/**
 * Intimacy must stay absolute or the engine double-counts.
 *
 * The brief asked both for an anchored absolute scale and for the scorer to
 * "judge intimacy relative to what has been earned". Taken literally those
 * conflict: the engine already computes `intimacy - warmth`, so a model that
 * also discounted for warmth would subtract it twice and the boundary rule
 * would go quiet again — the exact failure being fixed. Warmth is therefore
 * supplied as context for INTENT only, with intimacy explicitly pinned to topic.
 */
export const WARMTH_IS_CONTEXT_ONLY = `You are told the current warmth of the conversation. It is context for INTENT only.
It must NOT change your intimacy number. Intimacy is a property of the topic, not
of whether the topic was welcome. Rate the same sentence identically at warmth 5
and at warmth 80 — deciding whether it was appropriate is done elsewhere.`

/** Disjoint responsibilities (§2c). */
export const SCOPE = `You judge INTENT and INTIMACY only.

Do NOT reward or penalise: reply length, how many words he used, whether he
asked a question, what kind of question it was, callbacks to earlier lines,
filler words, or hesitation. All of those are measured separately and precisely
elsewhere, and your opinion on them is noise that cancels the real measurement.`

export const PAIR_RULE = `You are shown HIS line and HER REPLY to it.

Her reply is your check on the transcript. Speech recognition mangles words: it
once turned "Sherlock Holmes" into "cello combs" and the turn was penalised as
confusing while she had understood him perfectly and answered about Sherlock.
If her reply shows she understood him, he was coherent — score what she plainly
understood him to mean, not the garbled text.`

export const INTENT_SCALE = `INTENT — how the turn was meant, toward her.

  +6 to +10   warm, genuinely curious about her, funny at his own expense
  +1 to +5    friendly, ordinary, engaged
  0           neutral
  -1 to -5    self-absorbed, dismissive, bored, negging
  -6 to -10   hostile, contemptuous, deliberately crossing a line`

export interface FewShot {
  user: string
  agent: string
  warmth: number
  intimacy: number
  intent: number
  quote: string
  reason: string
}

/** Spans the full anchor range. Every band above has at least one example. */
export const FEW_SHOTS: FewShot[] = [
  {
    user: 'Is this place always this quiet?',
    agent: 'Pretty much. Saturdays especially.',
    warmth: 12,
    intimacy: 5,
    intent: 3,
    quote: 'always this quiet',
    reason: 'About the room itself.',
  },
  {
    user: 'What are you reading there?',
    agent: 'Tana French. Third time through.',
    warmth: 18,
    intimacy: 10,
    intent: 4,
    quote: 'What are you reading',
    reason: 'About the book in her hand.',
  },
  {
    user: 'So do you actually like crime novels or is it a guilty thing?',
    agent: 'Bit of both, honestly.',
    warmth: 30,
    intimacy: 25,
    intent: 5,
    quote: 'do you actually like crime novels',
    reason: 'Her tastes and opinions.',
  },
  {
    user: 'What do you do when you are not hiding in bookshops?',
    agent: 'Logistics. It is as dull as it sounds.',
    warmth: 35,
    intimacy: 45,
    intent: 5,
    quote: 'What do you do',
    reason: 'Her life outside this room.',
  },
  {
    user: 'Do you live round here then?',
    agent: 'Sort of. Twenty minutes that way.',
    warmth: 40,
    intimacy: 45,
    intent: 2,
    quote: 'Do you live round here',
    reason: 'Where she lives; outside-the-room detail.',
  },
  {
    user: 'Maybe you should get down my number and we could arrange a date sometime',
    agent: 'Ha. That was quick.',
    warmth: 22,
    intimacy: 65,
    intent: 2,
    quote: 'get down my number',
    reason: 'Contact details and proposing to meet.',
  },
  {
    user: 'You have got a really good figure, you know that?',
    agent: 'Right. Okay.',
    warmth: 30,
    intimacy: 85,
    intent: -3,
    quote: 'really good figure',
    reason: 'Comment on her body.',
  },
  {
    user: 'You never answered me though. Are you single or not?',
    agent: 'I did answer. I said I am here to buy a book.',
    warmth: 25,
    intimacy: 85,
    intent: -6,
    quote: 'You never answered me',
    reason: 'Pressing after a clear deflection.',
  },
]

export function renderFewShots(shots: readonly FewShot[] = FEW_SHOTS): string {
  return shots
    .map(
      (shot) =>
        `HIM: ${shot.user}\nHER: ${shot.agent}\nWARMTH: ${shot.warmth}\n` +
        `{"intimacy":${shot.intimacy},"intent":${shot.intent},` +
        `"quote":${JSON.stringify(shot.quote)},"reason":${JSON.stringify(shot.reason)}}`,
    )
    .join('\n\n')
}

export function buildSystemPrompt(personaName: string): string {
  return [
    `You rate one exchange between a man and ${personaName}, a woman he has just started talking to in a second-hand bookshop.`,
    '',
    PAIR_RULE,
    '',
    SCOPE,
    '',
    INTIMACY_ANCHORS,
    '',
    WARMTH_IS_CONTEXT_ONLY,
    '',
    INTENT_SCALE,
    '',
    'QUOTE: the exact words from HIS line that drove your judgement. Copy them verbatim, at most ten words. If you cannot quote him, return "".',
    'REASON: at most twelve words. Describe, do not advise.',
    '',
    'Examples:',
    '',
    renderFewShots(),
    '',
    'Reply with JSON only: {"intimacy":n,"intent":n,"quote":"...","reason":"..."}',
  ].join('\n')
}
