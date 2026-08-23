/**
 * The half of a character the user reads before they ever hear her.
 *
 * The contract, dials and voice in each persona file are what the engine
 * consumes. These six fields are what the roster card, the persona sheet and
 * the brief screen consume — and they are derived from the same authored
 * source, in the same registry, so the description a user is given and the
 * character they then meet cannot drift apart.
 *
 * Seeded into `personas` by `npm run db:seed` alongside everything else.
 * Hand-authored, like the contracts: no placeholder copy anywhere (§02).
 */

export interface PersonaPresentation {
  /** Scene, in the register the UI uses. Shorter than the engine's `scene`. */
  setting: string
  /** Two words at most. Roster cards and history rows. */
  settingShort: string
  /** What she is doing when you walk up. One sentence, present tense. */
  hook: string
  /** Who she is, in the second person's terms rather than the engine's. */
  blurb: string
  /** Drawn from her contract's own "what earns your warmth". */
  respondsTo: string[]
  /** Drawn from "what loses it". Never a list of tricks that don't work. */
  shutsDownOn: string[]
  /** Empty until portrait licensing lands; the UI draws a typographic mark. */
  portraitUrl: string
}

export const PRESENTATION: Record<string, PersonaPresentation> = {
  nadia: {
    setting: 'Second-hand bookshop, Saturday afternoon',
    settingShort: 'Bookshop',
    hook: 'She is hunting for a birthday present for her sister and getting nowhere.',
    blurb:
      'Dry, quiet, half-distracted, and in a good mood that has nothing to do with you. She is easy to talk to and very hard to lose.',
    respondsTo: ['saying anything at all', 'a real opinion', 'a thought about the book or the shop'],
    shutsDownOn: ['sustained rudeness', 'crossing a real boundary'],
    portraitUrl: '',
  },
  priya: {
    setting: 'Gym floor, weekday evening',
    settingShort: 'Gym',
    hook: 'She is between sets with three left to go.',
    blurb:
      'Friendly, direct, and mid-workout. She answers what she is asked and then waits to see whether you have anything else.',
    respondsTo: ['a second question', 'real curiosity', 'making it easy to leave'],
    shutsDownOn: ['going quiet after one answer', 'unasked-for form advice', 'standing in front of her rack'],
    portraitUrl: '',
  },
  maya: {
    setting: 'Coffee shop, Sunday morning',
    settingShort: 'Coffee shop',
    hook: 'She came alone with a notebook and is two-thirds through a drink.',
    blurb:
      'Warm, dry, and slightly guarded. She will keep this going while it is worth having and let it end when it is not.',
    respondsTo: ['building on her last answer', 'an actual opinion', 'noticing the moment you are both in'],
    shutsDownOn: ['three questions in a row', 'looks-first compliments', 'stretching it past the end'],
    portraitUrl: '',
  },
  jules: {
    setting: 'Loud bar, Friday night',
    settingShort: 'Bar',
    hook: 'She is mid-conversation with a friend she sees twice a year.',
    blurb:
      'Quick and sardonic, with her attention already spent. You have about twenty seconds to be worth turning away for.',
    respondsTo: ['an opener about this room', 'speed', 'not needing reassurance'],
    shutsDownOn: ['anything generic', 'ignoring her friend', 'fishing for a reaction'],
    portraitUrl: '',
  },
  erin: {
    setting: 'Train platform, evening',
    settingShort: 'Platform',
    hook: 'Four minutes until her train, headphones half in.',
    blurb:
      'Practical and elsewhere. She looks up when there is a reason to and goes back to her phone when there is not.',
    respondsTo: ['something specific to right here', 'being told rather than asked', 'not needing her enthusiasm'],
    shutsDownOn: ['openers that could be said anywhere', 'repeating himself', 'the headphones question'],
    portraitUrl: '',
  },
  sam: {
    setting: 'House party, in the kitchen',
    settingShort: 'House party',
    hook: 'Her friend vanished upstairs twenty minutes ago.',
    blurb:
      'Reserved with strangers and aware it reads as cold. She gives short answers until there is a reason not to.',
    respondsTo: ['patience', 'an opinion offered without asking for one back', 'being treated as a person, not a puzzle'],
    shutsDownOn: ['turning the energy up to fix it', 'asking why she is quiet', 'remarks about how she seems'],
    portraitUrl: '',
  },
  robin: {
    setting: 'Hotel lobby, early evening',
    settingShort: 'Hotel lobby',
    hook: 'Her car is fifteen minutes late and she is in no hurry about it.',
    blurb:
      'Unfailingly polite and almost impossible to read. Whether she is interested is a question she will not answer either way.',
    respondsTo: ['reading a shorter answer correctly', 'a real point of view', 'leaving cleanly at the right moment'],
    shutsDownOn: ['asking whether she is interested', 'getting louder', 'staying past the point'],
    portraitUrl: '',
  },
  alex: {
    setting: 'Gallery opening, early evening',
    settingShort: 'Gallery',
    hook: 'She came for one specific person and they have not arrived.',
    blurb:
      'Not unkind and not available, and long past pretending otherwise to spare anyone. What is being trained here is the exit.',
    respondsTo: ['unforced humour', 'something specific and true', 'taking a no gracefully'],
    shutsDownOn: ['persisting after a clear signal', 'compliments about her looks', 'making her carry the conversation'],
    portraitUrl: '',
  },
}

export function presentationFor(slug: string): PersonaPresentation | null {
  return PRESENTATION[slug] ?? null
}
