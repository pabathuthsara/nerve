/**
 * The live scorer's prompt, selected by track (INTERVIEW-PLAN B2, B5).
 *
 * Its own tiny module rather than a function on `lib/warmth/track.ts`, because
 * that file is imported by `WarmthSession` — which runs in the browser — and
 * this one is only ever called from the edge scoring route. Keeping the roster
 * lookup and two prompt tables out of the client bundle costs one file.
 *
 * `lib/warmth/prompt.ts` is not opened (rule 19). Dating is the default branch
 * and reaches the byte-identical string it reached yesterday, which A0 pins.
 */

import { PERSONAS, RETIRED_PERSONAS } from '@/lib/personas'
import { buildSystemPrompt, scorerPlaceFor } from './prompt'
import { buildInterviewSystemPrompt, interviewScorerPlaceFor } from './interview/anchors'

function trackOf(personaName: string): string {
  const match = [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)].find(
    (persona) => persona.name.toLowerCase() === personaName.trim().toLowerCase(),
  )
  return match?.track ?? 'dating'
}

export function scorerPromptFor(personaName: string): string {
  return trackOf(personaName) === 'interview'
    ? buildInterviewSystemPrompt(personaName, interviewScorerPlaceFor(personaName))
    : buildSystemPrompt(personaName, scorerPlaceFor(personaName))
}
