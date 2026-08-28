/**
 * Where somebody is sent when a rep stops being an exercise (§16.8).
 *
 * *"If a session surfaces genuine distress, we exit the exercise, drop the
 * training frame entirely, and offer real resources without diagnosing
 * anything."* Every word of that is a constraint on this file:
 *
 * **Real.** Authored here, reviewed in a pull request, never generated — the
 * same rule the field challenges live under (§16.5), and for a harder reason.
 * A model-invented helpline is a wrong number given to somebody at the worst
 * possible moment.
 *
 * **Without diagnosing anything.** Nothing here names a condition, suggests
 * one, or implies we think we know what is happening. §16.1 forbids clinical
 * claims across the product and this is the screen where the temptation to
 * make one is strongest. The list is offered, not prescribed.
 *
 * **International first.** We sell into forty countries from Colombo. A
 * Sri Lankan number at the top of the list is the wrong first thing for most
 * of the people who will ever see this, so the directory that covers everyone
 * leads and the local lines follow it.
 *
 * VERIFY BEFORE LAUNCH. Helpline numbers change and a stale one is worse than
 * none. This list is checked into the repo precisely so that checking it is a
 * reviewable task rather than an assumption.
 */

export interface SafetyResource {
  name: string
  /** What it is, in the fewest words that are still honest. */ 
  detail: string
  /** A number to dial, a web address, or both. */
  contact: string
  href: string
}

export const DISTRESS_RESOURCES: readonly SafetyResource[] = [
  {
    name: 'Find a Helpline',
    detail: 'Free, confidential lines in over 130 countries.',
    contact: 'findahelpline.com',
    href: 'https://findahelpline.com',
  },
  {
    name: 'Sri Lanka — National Mental Health Helpline',
    detail: 'Twenty-four hours.',
    contact: '1926',
    href: 'tel:1926',
  },
  {
    name: 'Sri Lanka — Sumithrayo',
    detail: 'Confidential emotional support, by phone.',
    contact: '011 269 6666',
    href: 'tel:+94112696666',
  },
]

/**
 * The words on the sheet.
 *
 * Kept beside the list rather than in the component because they are the part
 * most likely to be got wrong, and because this is the file a reviewer reads
 * when they ask what the product says at its most serious moment.
 *
 * What it does NOT say, on purpose: anything about what we think is going on,
 * anything about how the user should feel, and anything that could be read as
 * a claim that using this product would have helped or hurt.
 */
export const DISTRESS_COPY = {
  title: 'We stopped the rep',
  body: 'That is not something to practise on a character, and carrying on as though it were would be the wrong thing to do. Nothing was scored and nothing counted against you.',
  offer: 'If you want to talk to a person, these are free and confidential:',
  close: 'Back to training',
} as const
