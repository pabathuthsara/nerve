/**
 * The fields an interview can be in, and what an interviewer in each one asks.
 *
 * ── WHY THIS IS AUTHORED AND NOT GENERATED ───────────────────────────────
 *
 * Rule 10: content is authored in the repo and seeded, never generated at
 * runtime. A model handed a job title and asked to invent an interviewer would
 * produce a different character every session, which is the opposite of a
 * ladder you can measure yourself against — and §5.8 already settled that the
 * interview type IS the interviewer.
 *
 * ── WHAT IT IS ACTUALLY FOR ──────────────────────────────────────────────
 *
 * **It is what makes a missing CV survivable rather than a substitute for one**
 * (§5.9). Somebody who skips the upload should still meet an interviewer who
 * knows what questions belong in their world; somebody who uploads one gets the
 * same interviewer asking about their actual last job. So a field supplies
 * VOCABULARY and STEMS — the shape of a question — and never a script and never
 * an answer.
 *
 * A stem is a question an interviewer in this field would really ask. They are
 * context for the compiled prompt, not a queue to be read out: `lib/data/
 * interview-agenda.ts` decides which ones the round is built around, and the
 * character asks them in her own words like everything else she says.
 */

export type InterviewFieldId =
  | 'software'
  | 'data'
  | 'design'
  | 'product'
  | 'sales'
  | 'marketing'
  | 'finance'
  | 'operations'
  | 'healthcare'
  | 'teaching'
  | 'customer_support'
  | 'general'

export interface InterviewField {
  id: InterviewFieldId
  label: string
  /** The words somebody in this field uses without thinking about it. */
  vocabulary: string[]
  /**
   * Questions an interviewer here would actually ask, in their plainest form.
   *
   * Written as things a person says, not as prompt fragments — they end up
   * inside a character contract and a stem that reads like a form field makes
   * her read like one.
   */
  stems: string[]
  /**
   * What a vague answer sounds like in this field, so the interviewer knows
   * what to push on. Never shown to the user; §05 forbids coaching mid-rep and
   * §11 forbids the caption ever carrying a hint.
   */
  vagueness: string
}

export const INTERVIEW_FIELDS: readonly InterviewField[] = [
  {
    id: 'software',
    label: 'Software engineering',
    vocabulary: ['service', 'deploy', 'incident', 'latency', 'review', 'migration', 'on-call'],
    stems: [
      'Walk me through something you built end to end.',
      'Tell me about a bug that took you longer than it should have.',
      'How do you decide when something is done enough to ship?',
      'Describe a time you disagreed with a technical decision.',
      'What broke in production and what did you do about it?',
      'How do you pick up a codebase you have never seen?',
    ],
    vagueness: 'naming a technology instead of a decision they made with it',
  },
  {
    id: 'data',
    label: 'Data and analytics',
    vocabulary: ['pipeline', 'model', 'metric', 'cohort', 'stakeholder', 'baseline', 'sample'],
    stems: [
      'Tell me about an analysis that changed what somebody did.',
      'How do you know when a result is real?',
      'Describe a time your number disagreed with somebody else’s.',
      'What did you do when the data was too messy to use?',
      'How do you decide which metric actually matters?',
      'Walk me through a model you put in front of a non-technical audience.',
    ],
    vagueness: 'describing a tool rather than a question they answered with it',
  },
  {
    id: 'design',
    label: 'Design',
    vocabulary: ['flow', 'research', 'critique', 'constraint', 'prototype', 'handoff', 'system'],
    stems: [
      'Take me through one project from brief to shipped.',
      'Tell me about a time research changed your mind.',
      'How do you handle a stakeholder who is redesigning it for you?',
      'What did you cut, and how did you decide?',
      'Describe something you shipped that did not work.',
      'How do you know a design is finished?',
    ],
    vagueness: 'showing a screen instead of explaining the problem behind it',
  },
  {
    id: 'product',
    label: 'Product management',
    vocabulary: ['roadmap', 'trade-off', 'discovery', 'launch', 'adoption', 'stakeholder', 'scope'],
    stems: [
      'What did you decide not to build, and why?',
      'Tell me about a launch that missed.',
      'How do you resolve engineering and sales wanting opposite things?',
      'Describe how you found out what the problem actually was.',
      'What is a number you moved, and by how much?',
      'How do you prioritise when everything is urgent?',
    ],
    vagueness: 'describing a process rather than a call they made',
  },
  {
    id: 'sales',
    label: 'Sales',
    vocabulary: ['pipeline', 'quota', 'objection', 'close', 'renewal', 'territory', 'discovery'],
    stems: [
      'Tell me about a deal you lost and why.',
      'How do you open a conversation with somebody who did not ask for it?',
      'Describe the hardest objection you have had to handle.',
      'What did you do in a quarter you were behind?',
      'How do you decide a deal is not going to happen?',
      'Talk me through your last big close.',
    ],
    vagueness: 'quoting a number without the work that produced it',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    vocabulary: ['channel', 'positioning', 'campaign', 'audience', 'spend', 'conversion', 'brand'],
    stems: [
      'Tell me about a campaign that did not work.',
      'How do you decide where the next pound goes?',
      'Describe how you found out who the customer actually was.',
      'What is the sharpest thing you have written, and why did it land?',
      'How do you argue for spend you cannot yet prove?',
      'Walk me through a launch you owned.',
    ],
    vagueness: 'talking about reach instead of what changed because of it',
  },
  {
    id: 'finance',
    label: 'Finance',
    vocabulary: ['forecast', 'variance', 'close', 'control', 'audit', 'model', 'accrual'],
    stems: [
      'Tell me about a forecast you got wrong.',
      'How do you present bad numbers to somebody who does not want them?',
      'Describe a control you put in place.',
      'What did you find that nobody was looking for?',
      'How do you decide what is material?',
      'Walk me through a model you built and who used it.',
    ],
    vagueness: 'describing a report rather than a decision it supported',
  },
  {
    id: 'operations',
    label: 'Operations',
    vocabulary: ['throughput', 'process', 'supplier', 'escalation', 'shift', 'backlog', 'SLA'],
    stems: [
      'Tell me about a process you changed and what it cost.',
      'Describe the worst day you have had to run.',
      'How do you decide what to fix first when everything is behind?',
      'What did you do when a supplier let you down?',
      'How do you get people to follow a new process?',
      'Walk me through a number you brought down.',
    ],
    vagueness: 'describing a system rather than what they personally changed',
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    vocabulary: ['handover', 'protocol', 'caseload', 'escalation', 'consent', 'audit', 'ward'],
    stems: [
      'Tell me about a time you had to escalate.',
      'How do you handle a colleague who is not following protocol?',
      'Describe a difficult conversation with a patient or a family.',
      'What did you do when you were the most senior person available?',
      'How do you keep going at the end of a long shift?',
      'Talk me through a mistake and what changed afterwards.',
    ],
    vagueness: 'reciting a policy rather than describing their own judgement',
  },
  {
    id: 'teaching',
    label: 'Teaching and education',
    vocabulary: ['cohort', 'differentiation', 'assessment', 'behaviour', 'curriculum', 'parent', 'progress'],
    stems: [
      'Tell me about a class that was not working.',
      'How do you know somebody has actually understood it?',
      'Describe a conversation with a parent that went badly.',
      'What did you change after a lesson went wrong?',
      'How do you handle the two students at either end of the room?',
      'Talk me through how you plan a term.',
    ],
    vagueness: 'describing an activity rather than what the students learned',
  },
  {
    id: 'customer_support',
    label: 'Customer support',
    vocabulary: ['ticket', 'escalation', 'resolution', 'queue', 'refund', 'churn', 'handover'],
    stems: [
      'Tell me about the angriest customer you have handled.',
      'How do you say no to somebody who is already upset?',
      'Describe something you fixed that was not your job.',
      'What do you do when you do not know the answer?',
      'How do you decide when to escalate?',
      'Talk me through a pattern you spotted in the queue.',
    ],
    vagueness: 'describing the policy rather than what they said to the person',
  },
  {
    id: 'general',
    label: 'Something else',
    vocabulary: ['deadline', 'colleague', 'responsibility', 'change', 'pressure', 'handover'],
    stems: [
      'Tell me about something you are proud of at work.',
      'Describe a time you disagreed with your manager.',
      'What is the hardest thing you have had to learn quickly?',
      'Tell me about a deadline you missed.',
      'How do you handle work you do not enjoy?',
      'Why this role, and why now?',
    ],
    vagueness: 'describing the situation without saying what they did in it',
  },
]

/**
 * THE FIELDS A USER MAY ACTUALLY PICK, AND WHY IT IS ONE.
 *
 * `INTERVIEW_FIELDS` is the authored superset and stays that way: a stored row
 * naming any of the twelve still resolves, and the prose is written and
 * reviewed rather than deleted and rewritten later. What a user is OFFERED is a
 * different question, and the honest answer today is **software engineering
 * only**.
 *
 * `INTERVIEW-TECHNICAL-PLAN.md` §7.2 is the reason. Probe domains, design
 * briefs and the technical-accuracy grader are authored for `software` and for
 * nothing else — deliberately, because authoring twelve fields before any of
 * them had been heard out loud is exactly how the stems ended up
 * all-experiential without anybody noticing. A picker offering "Healthcare"
 * would be selling a round that cannot ask a healthcare fundamental, cannot
 * pose a healthcare design brief and cannot say whether a healthcare answer was
 * right. That is a promise the build does not keep, and §14 has a
 * merchant-of-record reviewer for exactly that class of claim.
 *
 * **This list grows by authoring, not by editing.** It is derived from which
 * fields have probe domains, so writing the next field's domains is what opens
 * it — there is no second place to remember.
 */
export const DEFAULT_FIELD: InterviewFieldId = 'software'

export function interviewField(id: string | null | undefined): InterviewField {
  return INTERVIEW_FIELDS.find((field) => field.id === id)
    ?? INTERVIEW_FIELDS.find((field) => field.id === DEFAULT_FIELD)!
}

export function isInterviewFieldId(value: unknown): value is InterviewFieldId {
  return typeof value === 'string' && INTERVIEW_FIELDS.some((field) => field.id === value)
}

/**
 * The fields the setup screen offers, in the authored order.
 *
 * Derived at module load from `lib/data/interview-probes.ts` rather than listed
 * again here — a hand-kept second list is a list that disagrees with the first
 * one the day somebody authors a field and forgets. The import is one-way:
 * `interview-probes.ts` does not import this file.
 */
export function selectableInterviewFields(
  hasProbes: (field: InterviewFieldId) => boolean,
): InterviewField[] {
  return INTERVIEW_FIELDS.filter((field) => hasProbes(field.id))
}
