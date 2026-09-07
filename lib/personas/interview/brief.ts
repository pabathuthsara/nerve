/**
 * What the interviewer knows about this candidate, before they say anything.
 *
 * ── WHY IT IS IN THE SYSTEM PROMPT AND NOT APPENDED PER TURN ─────────────
 *
 * C5. The CV, the job description and the custom questions are the same text on
 * every turn of a rep, and the pipeline already caches its system-prompt prefix
 * at a measured 72.5%. Put there, a three-thousand-token CV is close to free.
 * Appended to each turn's messages it would be paid for in full, every turn,
 * twenty-two times — which is most of the difference between the $0.45 this was
 * costed at and something nobody would ship.
 *
 * So this composes ONE block that is appended to the character contract, which
 * is what `compileInstructions` emits first and therefore what the cache
 * prefix contains. It is identical for every turn of a rep by construction: the
 * setup is read once, at the moment the session is opened, and stored on
 * `voice_sessions.context`.
 *
 * ── AND WHY A MISSING CV IS NOT A MISSING BRIEF ──────────────────────────
 *
 * §5.9 and C4: the field is what makes a missing CV survivable rather than a
 * substitute for one. Somebody who skips the upload still meets an interviewer
 * who knows what questions belong in their world; somebody who uploads one gets
 * the same interviewer asking about their actual last job. Every section below
 * is omitted when it is empty rather than rendered with a placeholder — a
 * heading followed by nothing tells a model there is something it is missing.
 */

import { interviewField, type InterviewFieldId } from '@/lib/data/interview-fields'
import { roundType, type RoundTypeId } from '@/lib/data/interview-credits'
import { difficultySpec, type DifficultyLevel } from '@/lib/data/interview-difficulty'
import { probeDomainsFor, renderProbeDomains } from '@/lib/data/interview-probes'
import { designBriefFor, renderDesignBrief } from '@/lib/data/interview-briefs'

export interface InterviewBriefInput {
  roleTitle: string
  company: string
  jobDescription: string
  field: InterviewFieldId
  round: RoundTypeId
  /** The extracted CV, already capped. Null when there is none or it failed. */
  cvText: string | null
  customQuestions: string[]
  /**
   * How hard the questions are (§5). Nothing about her mood.
   *
   * Resolved on the server from `interview_setups` — the stored slider, or the
   * level the role title implies when the slider was never touched.
   */
  difficulty: DifficultyLevel
  /**
   * Which design brief a `system_design` round poses.
   *
   * Any stable per-rep string. In production it is a fresh id minted when the
   * session is opened, which is what makes two consecutive deep technicals land
   * on different problems without anything having to remember the last one.
   */
  seed: string
}

/** How much of the job description reaches the prompt. */
export const JD_PROMPT_LIMIT = 4_000

/**
 * The brief, as one block appended to the contract.
 *
 * Returns an empty string when there is genuinely nothing — a brand-new account
 * running the free screener before it has filled anything in. That is a
 * legitimate interview and the character is complete without this.
 */
export function compileInterviewBrief(input: InterviewBriefInput): string {
  const field = interviewField(input.field)
  const round = roundType(input.round)
  const sections: string[] = []

  // A SYSTEM DESIGN ROUND IS A DIFFERENT INTERVIEW (§4.3).
  //
  // Their own projects do not come up at all, so the CV, the experiential field
  // stems and the job description are all suppressed below. That is not a
  // saving, it is the round: rep `e9c74f80` spent eleven consecutive turns on
  // one of the candidate's web apps because everything in this brief pointed
  // her at their history and the round's own description said "one problem,
  // taken all the way down".
  const design = round.opener === 'brief'
    ? designBriefFor({ field: input.field, seed: input.seed })
    : null

  const role = input.roleTitle.trim()
  const company = input.company.trim()
  if (role) {
    sections.push([
      '# The role you are interviewing for',
      company ? `${role}, at ${company}.` : `${role}.`,
    ].join('\n'))
  }

  sections.push([
    '# This round',
    `${round.label}. ${round.description}`,
    // The number is a plan, never a script. She asks in her own words and the
    // rail counts completed exchanges, not items ticked off (C6).
    `Plan for roughly ${round.questions} questions. It is a guide, not a list to get through.`,
    OPENER_LINE[round.opener],
  ].join('\n'))

  if (design) {
    sections.push(renderDesignBrief(design, input.difficulty))
  } else {
    sections.push([
      '# Their field',
      `${field.label}. People here talk about ${field.vocabulary.slice(0, 5).join(', ')}.`,
      'Questions an interviewer in this field would really ask, for reference. Ask them in your own'
      + ' words, in whatever order the conversation takes, and never read one out verbatim:',
      ...field.stems.map((stem) => `- ${stem}`),
      `A vague answer here usually means ${field.vagueness}. That is what to push on.`,
    ].join('\n'))
  }

  // THE DOMAIN IS AUTHORED, THE QUESTION IS HERS (§6.1).
  //
  // Rendered on any round that probes, design included — a system design round
  // still tests fundamentals, it just reaches them through the problem rather
  // than through their CV. Absent entirely on a behavioural round and on the
  // eleven fields with no domains authored yet, both of which run exactly as
  // they did before this plan.
  const domains = round.probeShare > 0 ? probeDomainsFor(input.field) : []
  if (domains.length > 0) {
    const level = difficultySpec(input.difficulty)
    sections.push([
      '# What you may test that they KNOW',
      'Most of this round is not about what they did. It is about whether they understand what they'
      + ' used. Listen for a technical thing they name, then ask how it actually works — the'
      + ' mechanism, not their experience of it. Never read one of these out as a question and never'
      + ' announce that you are changing subject; find the one their own answer just made relevant,'
      + ' and ask it in your own words.',
      `Pitch every one of them at this level — ${level.label}, ${level.tests.toLowerCase()}.`
      + ` ${level.directive}`,
      '',
      renderProbeDomains(domains, input.difficulty),
      '',
      'If their answers stop leading anywhere, ask the fundamental with no pretence that it came'
      + ' from something they said. "Have you studied X? Tell me about it" is a fair question and is'
      + ' better than a sixth follow-up on the same project.',
    ].join('\n'))
  }

  const jd = design ? '' : input.jobDescription.trim().slice(0, JD_PROMPT_LIMIT)
  if (jd) sections.push(['# The job description they were given', jd].join('\n'))

  if (design) {
    // Said explicitly rather than left out. A model holding a CV it has been
    // told nothing about will reach for it, and one turn of "so, tell me about
    // your last job" undoes the whole round.
    sections.push([
      '# Do not ask about their background',
      'You may have their CV and their job description. This round does not use them. Do not ask'
      + ' what they have built, where they have worked or what they are proud of — stay on the'
      + ' problem you set. Their history is somebody else\'s round.',
    ].join('\n'))
  } else if (input.cvText?.trim()) {
    sections.push([
      '# Their CV',
      'You have read this. Ask about what is actually in it rather than asking them to'
      + ' repeat it, and never read it aloud.',
      input.cvText.trim(),
    ].join('\n'))
  } else if (role) {
    // Said explicitly, because a model with no CV and no acknowledgement of
    // that fact invents one. An interviewer who asks about a job the candidate
    // never had is worse than one who admits they have not seen a CV.
    sections.push([
      '# You have not seen their CV',
      'Do not refer to it, do not imply you have read anything, and do not ask why it is'
      + ' missing. Ask about their background directly instead.',
    ].join('\n'))
  }

  const asked = design ? [] : input.customQuestions.map((question) => question.trim()).filter(Boolean)
  if (asked.length > 0) {
    sections.push([
      '# Questions they asked to be asked',
      'They set these up themselves, so they want them. Work them in where they fit rather'
      + ' than reading them in order:',
      ...asked.map((question) => `- ${question}`),
    ].join('\n'))
  }

  return sections.join('\n\n')
}

/**
 * What her FIRST TURN is about (§4.1).
 *
 * She still answers rather than opens — the unprompted opening turn was cut on
 * 7 September and is deliberately not in this plan (§9) — so this steers what
 * her first reply reaches for, not a line she says into silence.
 */
const OPENER_LINE: Record<ReturnType<typeof roundType>['opener'], string> = {
  background:
    'Start on who they are and why they are here. Their motivation and their background, in their'
    + ' own account of it.',
  project:
    'Start on something they have built or done, end to end. It is where the rest of the round'
    + ' comes from rather than the subject of it — you are listening for something to take apart.',
  brief:
    'Your first turn is the problem above. Pose it, then be quiet and let them start.',
}
