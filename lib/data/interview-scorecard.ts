/**
 * The session breakdown, read in interview words.
 *
 * ── THE SCORECARD WAS TALKING ABOUT A DATE ───────────────────────────────
 *
 * `lib/data/scorecard.ts` holds one set of axes and one set of focus
 * instructions, and every line of both is written about a stranger in a shop.
 * On an interview scorecard they read as nonsense, and two of them read as
 * advice that would actively lose somebody an offer:
 *
 *   *"You left most of the work to her. Room to say more of what you actually
 *   think."* — against a talk ratio a candidate is supposed to have.
 *
 *   *"Questions stacked up faster than answers. It reads as an interview."*
 *   — on an interview.
 *
 *   *"Make the ask early enough that it grows out of the conversation."*
 *   — as the thing to try next time, after a technical round.
 *
 * So this is the parallel set: the same shape, the same `Axis` contract, the
 * same six-plus-judgement rendering, with the prose and the bands rewritten for
 * somebody who is being interviewed. `lib/data/scorecard.ts` selects between
 * them on the session's track and the dating branch is untouched.
 *
 * ── THE BANDS HERE MIRROR THE ONES IT WAS SCORED AGAINST ─────────────────
 *
 * `targetMin`/`targetMax` are `lib/grade/interview/metrics.ts`'s bands in bar
 * coordinates, duplicated deliberately for the same reason the dating ones are:
 * `lib/grade` is scoring and this is presentation, and the day a band moves the
 * scorecard should keep drawing the band the stored grade was actually scored
 * against.
 */

import type { Axis } from './scorecard-axis'

export const INTERVIEW_AXES: Record<string, Axis> = {
  talkRatio: {
    key: 'talk_ratio',
    label: 'Answer share',
    max: 1,
    // 55–78% of 100.
    targetMin: 55,
    targetMax: 78,
    format: (value) => `${Math.round(value * 100)}%`,
    notes: {
      below: 'They had to draw it out of you. In an interview the floor is yours — take it.',
      inside: 'You did the talking, without leaving her nowhere to steer.',
      above: 'You barely gave the room back. She had to wait for a gap to ask anything.',
    },
  },
  longestMonologue: {
    key: 'longest_monologue',
    label: 'Longest answer',
    max: 150,
    // 25–85s of 150.
    targetMin: 16.7,
    targetMax: 56.7,
    format: (value) => `${Math.round(value)}s`,
    notes: {
      below: 'Your longest answer was still short. A real example needs room to land.',
      inside: 'Your longest answer had room in it and still ended.',
      above: 'One answer ran long enough that she stopped hearing the point of it.',
    },
  },
  fillerRate: {
    key: 'filler_words',
    label: 'Filler control',
    max: 12,
    targetMin: 0,
    targetMax: 33,
    format: (value) => `${value.toFixed(1)}/min`,
    notes: {
      below: 'Clean delivery under pressure.',
      inside: 'A few fillers, never enough to blur what you were saying.',
      above: 'Fillers crowded the sentences and softened the answers inside them.',
    },
  },
  meanResponseLatency: {
    key: 'response_latency',
    label: 'Thinking time',
    max: 8,
    // ≤ 3s of 8.
    targetMin: 0,
    targetMax: 37.5,
    format: (value) => `${value.toFixed(1)}s`,
    notes: {
      below: 'You came straight back. Quick, and it never read as rushed.',
      inside: 'You took a beat before the hard ones. That reads as considered.',
      above: 'The gaps before your answers got long enough to read as stuck.',
    },
  },
  questionsAsked: {
    key: 'questions_asked_back',
    label: 'Questions back',
    max: 8,
    // ≥ 1 of 8.
    targetMin: 12.5,
    targetMax: 100,
    format: (value) => `${Math.round(value)}`,
    notes: {
      below: 'You asked them nothing. It is the most common avoidable mistake there is.',
      inside: 'You had something to ask them, which most people do not.',
      above: 'You had plenty to ask them.',
    },
  },
}

/**
 * One hand-written instruction per sub-score. Never model-generated (§07).
 *
 * The keys are the six the grader returns — `structure` and `specificity` are
 * renamed onto `opening` and `curiosity` before anything downstream sees them
 * (`normaliseInterviewScores`), so these are keyed the same way and mean the
 * interview thing.
 */
export const INTERVIEW_FOCUS_INSTRUCTIONS: Record<string, string> = {
  // structure
  opening: 'Give the next answer a shape before you start it: the situation, what you did, what happened.',
  // specificity
  curiosity: 'Put one number or one decision into your next answer. "I argued for X and we saw Y" beats "I was responsible for".',
  listening: 'Answer the question you were actually asked. If it is not the one you prepared, say the first line back in their words.',
  signalReading: 'When she stops following up, stop expanding. Finish the point and hand it back.',
  composure: 'On the one you do not know, say so in four words and then say what you would do to find out.',
  close: 'Have two questions ready about the work itself, and ask them even if it has gone well.',
}

/** The fallback when nothing was weak enough to name. */
export const INTERVIEW_TRY_NEXT =
  'Run it back and change one thing on purpose. One change is readable; three are not.'
