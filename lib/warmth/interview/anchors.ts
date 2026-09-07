/**
 * The live scorer's prompt, for an interview.
 *
 * A NEW FILE BESIDE `lib/warmth/prompt.ts`, WHICH IS NOT OPENED (rule 19).
 *
 * ── WHY `INTIMACY_ANCHORS` CANNOT BE REUSED, IN ONE LINE ─────────────────
 *
 * The dating scale runs from *"the shop, the books, the weather"* at 0–10 to
 * *"comments on her body"* at 80–90, with **"work, where she lives" pinned at
 * 40–50**. In an interview, work IS the topic. A candidate describing their last
 * job would be scored halfway up a scale whose top is sexual, and the overreach
 * rule — `intimacy − warmth` — would fire on the correct answer, every time.
 * There is no parameterisation of that table that fixes it, which is why §4
 * says copy rather than share.
 *
 * ── WHAT REPLACES IT: SPECIFICITY ────────────────────────────────────────
 *
 * The interview's axis is **how specific the turn was** — did the answer name a
 * decision, a number, a consequence, or was it a description of a job title.
 * That is what an interviewer is actually reading, it is the thing that
 * separates a good candidate from a rehearsed one, and unlike intimacy it is a
 * property of the answer rather than of the topic.
 *
 * The scale runs the same direction as intimacy did — low is safe, high is
 * committed — so the engine's arithmetic is unchanged and unforked. What
 * changes is what the numbers mean.
 *
 * ── AND THE OVERREACH RULE IS RE-DERIVED, NOT DROPPED ────────────────────
 *
 * `intimacy − warmth` catches somebody going further than they have earned.
 * The interview's version of going too far is not being too specific; being
 * specific is the whole point and it is rewarded at every impression. It is
 * **volunteering something nobody asked for** — salary expectations, why they
 * left, an opinion about the last employer — at a point where nobody has
 * invited it. So the top of the scale is unprompted disclosure rather than
 * detail, and the arithmetic that reads it stays exactly as it is.
 */

import { PERSONAS, RETIRED_PERSONAS } from '@/lib/personas'
import type { FewShot } from '../prompt'

/**
 * The few-shots, in this arm's speaker labels.
 *
 * `renderFewShots` in `lib/warmth/prompt.ts` writes `HIM:` and `HER:`, which is
 * correct there and wrong here — and that file is Tier 0. Eleven lines of
 * duplication against opening it is the trade §0 asks for. The JSON shape is
 * deliberately identical, keys included: `clampSlowScore` parses both, and
 * `intimacy` is the field the engine's overreach arithmetic already reads.
 */
export function renderInterviewFewShots(shots: readonly FewShot[] = INTERVIEW_FEW_SHOTS): string {
  return shots
    .map(
      (shot) =>
        `THEM: ${shot.user}\nINTERVIEWER: ${shot.agent}\nIMPRESSION: ${shot.warmth}\n`
        + `{"intimacy":${shot.intimacy},"intent":${shot.intent},`
        + `"quote":${JSON.stringify(shot.quote)},"reason":${JSON.stringify(shot.reason)}}`,
    )
    .join('\n\n')
}

export const SPECIFICITY_ANCHORS = `SPECIFICITY — how much the turn actually commits to. Absolute scale.

  0-10    filler, agreement, a question about logistics, "that's a good question"
  20-30   a job title, a technology, a team name, a description of a role
  40-50   a real project or situation, named, with what they were doing in it
  60-70   a decision they made, a number they moved, or a consequence they owned
  80-90   something unprompted and costly — why they left, what they got wrong,
          what they want to be paid
  100     an unprompted claim about someone else, or about money, that nobody asked for

Use the whole range. Most ordinary interview talk is 20-50. "I was the tech lead
on the billing service" is 30 whether or not it was said confidently. "We cut
checkout failures from 4% to 0.9% and I owned the rollback plan" is 65 whether or
not it was said nervously.`

/**
 * The same rule the dating scorer states, for the same reason.
 *
 * The engine already computes `specificity − impression`, so a model that ALSO
 * discounted for how the interview was going would subtract it twice and the
 * overreach rule would go quiet — which is the exact failure `lib/warmth/
 * prompt.ts` was written to fix. Impression is context for INTENT only.
 */
export const IMPRESSION_IS_CONTEXT_ONLY = `You are told the current impression the interviewer has formed. It is context for
INTENT only. It must NOT change your specificity number. Specificity is a property
of what the answer contained, not of whether it landed. Rate the same sentence
identically at impression 5 and at impression 80.`

export const INTERVIEW_SCOPE = `You judge INTENT and SPECIFICITY only.

Do NOT reward or penalise: answer length, how many words they used, whether they
asked a question back, filler words, hesitation, or accent. All of those are
measured separately and precisely elsewhere, and your opinion on them is noise
that cancels the real measurement.

Do NOT judge whether the candidate is qualified. You are rating one turn.`

export const INTERVIEW_PAIR_RULE = `You are shown THEIR answer and the INTERVIEWER'S reply to it.

The reply is your check on the transcript. Speech recognition mangles words and
mangles technical vocabulary worst. If the interviewer's reply shows she
understood them, they were coherent — score what she plainly understood them to
mean, not the garbled text.`

export const INTERVIEW_INTENT_SCALE = `INTENT — how the turn was meant, toward the interviewer.

  +6 to +10   candid, takes responsibility, engages with the actual question
  +1 to +5    cooperative, ordinary, on topic
  0           neutral
  -1 to -5    evasive, rehearsed, answering a different question
  -6 to -10   blaming a former employer or colleague, contemptuous, hostile`

/**
 * Spans the full anchor range, and every one is a turn somebody has really had.
 *
 * Deliberately not a translation of the dating few-shots: those are bookshop
 * exchanges and recalibrating them one at a time would produce a scale that is
 * half interview and half small talk.
 */
export const INTERVIEW_FEW_SHOTS: FewShot[] = [
  {
    user: 'Yeah, no, that sounds right.',
    agent: 'Right. So take me through the last one you shipped.',
    warmth: 30,
    intimacy: 5,
    intent: 0,
    quote: 'that sounds right',
    reason: 'Agreement with no content in it.',
  },
  {
    user: 'I was a senior engineer on the payments team for about three years.',
    agent: 'And what were you actually responsible for there?',
    warmth: 32,
    intimacy: 25,
    intent: 3,
    quote: 'senior engineer on the payments team',
    reason: 'A title and a team, not a thing they did.',
  },
  {
    user: 'We rebuilt the checkout flow because the old one was falling over at peak.',
    agent: 'What did you change first?',
    warmth: 38,
    intimacy: 45,
    intent: 4,
    quote: 'rebuilt the checkout flow',
    reason: 'A real project, named, with a reason.',
  },
  {
    user: 'I argued for shipping it behind a flag, and we cut failures from four percent to under one.',
    agent: 'Who disagreed with you?',
    warmth: 52,
    intimacy: 65,
    intent: 7,
    quote: 'argued for shipping it behind a flag',
    reason: 'A decision they made and a number it moved.',
  },
  {
    user: 'Honestly I left because I was underpaid and I am looking for about ninety.',
    agent: 'Noted. We can come to that.',
    warmth: 40,
    intimacy: 85,
    intent: 2,
    quote: 'I am looking for about ninety',
    reason: 'Unprompted, and about money.',
  },
  {
    user: 'My last manager had no idea what he was doing, which is really why the project failed.',
    agent: 'Okay. What would you have done differently?',
    warmth: 30,
    intimacy: 90,
    intent: -7,
    quote: 'no idea what he was doing',
    reason: 'Unprompted blame directed at a colleague.',
  },
  {
    user: 'I would rather not go into the specifics of that one.',
    agent: 'Fair enough. Pick a different one.',
    warmth: 35,
    intimacy: 20,
    intent: -2,
    quote: 'rather not go into the specifics',
    reason: 'Declines the question without offering anything.',
  },
  {
    user: 'That is a great question. Let me think about how to frame this properly.',
    agent: 'Take it in whatever order you like.',
    warmth: 34,
    intimacy: 5,
    intent: 1,
    quote: 'That is a great question',
    reason: 'Preamble, no answer yet.',
  },
]

/**
 * The room the scorer is told this is happening in.
 *
 * Authored per interviewer the same way `scorerPlaceFor` reads `room.place` —
 * an interview over a video call and one across a table in a glass meeting room
 * are different rooms, and the room is the one piece of scene that steers the
 * scale.
 */
export const DEFAULT_INTERVIEW_PLACE = 'a first-round interview'

export function interviewScorerPlaceFor(personaName: string): string {
  const match = [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)].find(
    (persona) => persona.name.toLowerCase() === personaName.trim().toLowerCase(),
  )
  const place = match?.room.place
  if (!place) return DEFAULT_INTERVIEW_PLACE
  return `${/^[aeiou]/i.test(place) ? 'an' : 'a'} ${place}`
}

export function buildInterviewSystemPrompt(
  interviewerName: string,
  place: string = DEFAULT_INTERVIEW_PLACE,
): string {
  return [
    `You rate one exchange between a candidate and ${interviewerName}, who is interviewing them in ${place}.`,
    '',
    INTERVIEW_PAIR_RULE,
    '',
    INTERVIEW_SCOPE,
    '',
    SPECIFICITY_ANCHORS,
    '',
    IMPRESSION_IS_CONTEXT_ONLY,
    '',
    INTERVIEW_INTENT_SCALE,
    '',
    'QUOTE: the exact words from THEIR answer that drove your judgement. Copy them verbatim, at most ten words. If you cannot quote them, return "".',
    'REASON: at most twelve words. Describe, do not advise.',
    '',
    'Examples:',
    '',
    renderInterviewFewShots(),
    '',
    'Reply with JSON only: {"intimacy":n,"intent":n,"quote":"...","reason":"..."}',
  ].join('\n')
}
