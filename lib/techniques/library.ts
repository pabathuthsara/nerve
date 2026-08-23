/**
 * The library (§10 D).
 *
 * Six techniques, one per sub-score, so the scorecard can point at the thing
 * that would actually move the number it just showed you. Plus the openers,
 * the ladder, the recovery lines and the exits — the same shape, so they live
 * in the same table under a `kind`.
 *
 * Every card is short on purpose. This is not a course; it is the two
 * sentences somebody reads on the way out of a bad rep, and the drill they run
 * on the next one. Hand-written, seeded by `npm run db:content`, never
 * generated.
 */

export type TechniqueKind = 'technique' | 'opener' | 'ladder' | 'recovery' | 'exit'

/** The six sub-scores, as they are named in `scores` (§07). */
export type SubScore =
  | 'opening'
  | 'curiosity'
  | 'listening'
  | 'signalReading'
  | 'composure'
  | 'close'

export interface Technique {
  slug: string
  kind: TechniqueKind
  title: string
  /** One line, shown in the list. */
  summary: string
  /** The idea and why it works. Two or three short paragraphs. */
  body: string
  targets: SubScore[]
  /** Only for openers. */
  setting?: string
  /** Three concrete lines. Examples, never scripts to memorise. */
  examples: string[]
  /** The rep to run next, if there is one. */
  drill?: string
}

export const TECHNIQUES: Technique[] = [
  /* --- one per sub-score ------------------------------------------- */
  {
    slug: 'the-shared-situation',
    kind: 'technique',
    title: 'Open with the room, not with her',
    summary: 'The strongest opener is about the thing you are both already standing in.',
    body: [
      'An opener about her — how she looks, what she is wearing — asks her to have an opinion about being approached. An opener about the room asks her to have an opinion about the room, which is a much easier thing to answer at two seconds of notice.',
      'It also gives you somewhere to go. "That queue is a disgrace" has a second line. "You have great style" does not.',
    ].join('\n\n'),
    targets: ['opening'],
    examples: [
      'That shelf looks like it has personally wronged you.',
      'I have been standing here long enough to have opinions about the music.',
      'Whatever they are making back there, it has taken four minutes.',
    ],
    drill: 'Run a rep and open with something you can see. No question in the first line.',
  },
  {
    slug: 'the-second-question',
    kind: 'technique',
    title: 'Ask the second question',
    summary: 'Almost every conversation that dies had exactly one question in it.',
    body: [
      'The first question is easy — it is why you walked over. The second one is the one that decides whether this is a conversation or a survey: it says you heard the answer to the first.',
      'It is almost always about the same thing she just said, one layer down. Not a new topic. The same topic, closer.',
    ].join('\n\n'),
    targets: ['curiosity'],
    examples: [
      '"A travel book." → "For yourself, or is somebody getting a present they did not ask for?"',
      '"I come here most Sundays." → "Is it the coffee or the not-being-at-home?"',
      '"Work, mostly." → "The kind you talk about at parties, or the other kind?"',
    ],
    drill: 'One rep where every question you ask is about the thing she said last.',
  },
  {
    slug: 'the-callback',
    kind: 'technique',
    title: 'Use what she already gave you',
    summary: 'Bring back a detail from four turns ago instead of starting something new.',
    body: [
      'Listening is not silence; it is evidence. The proof that you were listening is that something she said earlier turns up later, used rather than repeated.',
      'Never announce it. "You said your sister likes crime novels" is a receipt. "Your sister is getting the one with the terrible cover, then" is a callback.',
    ].join('\n\n'),
    targets: ['listening'],
    examples: [
      'So this is the sister who does not read the ones you recommend.',
      'Second time you have mentioned Thursday. Something happening on Thursday?',
      'For somebody who does not like crime novels you know a lot about them.',
    ],
    drill: 'One rep with at least two callbacks and no new topics after the first minute.',
  },
  {
    slug: 'the-shorter-answer',
    kind: 'technique',
    title: 'Read the shorter answer',
    summary: 'Interest shows up in length long before it shows up in words.',
    body: [
      'People are polite. Almost nobody says "I would like to stop talking now" — they give you four words instead of twelve, and then three, and then two.',
      'When the answers get shorter, you have two good moves and one bad one. Slow down, or leave. The bad one is to ask another question, which turns a fading conversation into an interrogation.',
    ].join('\n\n'),
    targets: ['signalReading'],
    examples: [
      'Two short answers in a row → say one thing about yourself and let it sit.',
      'Three short answers in a row → "I will let you get on. Enjoy the book."',
      'She asks you something back → it is going fine. Keep going.',
    ],
    drill: 'Run Robin, and end the rep yourself the moment you think it has turned.',
  },
  {
    slug: 'let-it-sit',
    kind: 'technique',
    title: 'Let the pause sit',
    summary: 'The silence is not yours to rescue.',
    body: [
      'A two-second gap feels like ten when you are nervous, so people fill it — with a joke, another question, or an explanation of the last thing they said. All three read as pressure.',
      'Count to three. Most of the time she fills it, and what she fills it with is better than anything you were about to say.',
    ].join('\n\n'),
    targets: ['composure'],
    examples: [
      'Say your line. Stop. Count three.',
      'If you have just asked something, the pause is hers. Do not answer it for her.',
      'If nothing comes back twice in a row, that is information — see "Read the shorter answer".',
    ],
    drill: 'One rep where you never speak twice in a row.',
  },
  {
    slug: 'the-specific-ask',
    kind: 'technique',
    title: 'Ask for something specific',
    summary: '"Coffee on Thursday" is a question. "We should hang out sometime" is a wish.',
    body: [
      'A vague ask puts the work on her: she has to invent the plan, the day and the shape of it before she can even answer. Most people, faced with that at the end of a nice four minutes, say something warm and vague back and nothing happens.',
      'Name the thing and name the day. It is easier to say yes to, and — this is the part people miss — it is also easier to say no to, which is what makes it a real ask rather than a test.',
    ].join('\n\n'),
    targets: ['close'],
    examples: [
      'There is a place round the corner that does this properly. Thursday?',
      'I am going to the thing on Friday. Come.',
      'Give me your number and I will send you the one with the terrible cover.',
    ],
    drill: 'One rep where you make the ask before the ninety-second mark.',
  },

  /* --- the ladder --------------------------------------------------- */
  {
    slug: 'facts-opinions-feelings',
    kind: 'ladder',
    title: 'Facts, then opinions, then feelings',
    summary: 'Conversations get deeper in that order, and skipping a rung is what makes people flinch.',
    body: [
      'Facts are free: what it is, where you are, what happened. Opinions cost something: whether it is any good, whether you would. Feelings cost most: what you actually want.',
      'Every stalled conversation is stuck on facts, and every uncomfortable one has jumped to feelings. Move one rung at a time and match whatever she gives back.',
    ].join('\n\n'),
    targets: ['curiosity', 'listening'],
    examples: [
      'Fact — "You are the fourth person to pick that one up today."',
      'Opinion — "It is not as good as the first one, but nobody wants to hear that."',
      'Feeling — "I read it in a week when I was avoiding something."',
    ],
    drill: 'One rep that climbs one rung a minute.',
  },

  /* --- openers, by setting ------------------------------------------ */
  {
    slug: 'openers-cafe',
    kind: 'opener',
    title: 'Openers — café',
    summary: 'Slow room, shared objects, everybody waiting for something.',
    body: 'The queue, the drink, the thing on the table. Say it to the person beside you like you would to somebody you already knew.',
    targets: ['opening'],
    setting: 'cafe',
    examples: [
      'Is the food here as good as the queue suggests?',
      'You have got the one I nearly ordered. Worth it?',
      'I have been staring at that board for a minute and I still do not know what a flat white is meant to cost.',
    ],
  },
  {
    slug: 'openers-gym',
    kind: 'opener',
    title: 'Openers — gym',
    summary: 'Short, between sets, and easy to end.',
    body: 'People here are mid-task. Say one thing, make it obvious the conversation can stop, and never comment on how somebody is training unless they ask.',
    targets: ['opening'],
    setting: 'gym',
    examples: [
      'How many sets have you got left on that?',
      'Is it always this busy at six?',
      'I am going to need that when you are done, no rush.',
    ],
  },
  {
    slug: 'openers-transit',
    kind: 'opener',
    title: 'Openers — platform and bus',
    summary: 'Shared misfortune is the easiest opener there is.',
    body: 'Everybody on a platform is having the same experience, which means anything true about the delay is already a shared joke.',
    targets: ['opening'],
    setting: 'transit',
    examples: [
      'Four minutes has been four minutes for a while now.',
      'That announcement said something, and I have no idea what.',
      'You look like somebody who knows whether this one stops at the junction.',
    ],
  },
  {
    slug: 'openers-party',
    kind: 'opener',
    title: 'Openers — party',
    summary: 'The kitchen, the queue for the drinks, the dog. Never the middle of a dance floor.',
    body: 'At a party you have a shared friend and a shared room. Both are free openers, and both give the other person an easy way to place you.',
    targets: ['opening'],
    setting: 'party',
    examples: [
      'How do you know everybody here? I have got about two.',
      'This is the good room, isn\'t it. It is always the kitchen.',
      'Someone said there was a dog and I have been looking for twenty minutes.',
    ],
  },
  {
    slug: 'openers-work',
    kind: 'opener',
    title: 'Openers — work and conferences',
    summary: 'The context is doing half the work. Use it.',
    body: 'Nobody at a work thing needs an excuse to talk to somebody else at the work thing. The trick is having a second line ready that is not about work.',
    targets: ['opening'],
    setting: 'work',
    examples: [
      'Have you been in the one upstairs? I cannot tell if it is worth leaving this for.',
      'You are the third person today to say that, so either it is true or we are all reading the same thing.',
      'I am going to get a coffee before the next one. Come with?',
    ],
  },

  /* --- recovery and exit -------------------------------------------- */
  {
    slug: 'recovery-flat-response',
    kind: 'recovery',
    title: 'When it lands flat',
    summary: 'One flat answer is not a rejection. Two is information.',
    body: [
      'The instinct after a flat response is to explain the thing you just said, or to ask something else immediately. Both make it worse: one is apologising, the other is pressure.',
      'Say something of your own instead — an opinion, not a question — and let it sit. It gives her a way back in that costs her nothing.',
    ].join('\n\n'),
    targets: ['composure', 'signalReading'],
    examples: [
      '"Mm." → "I am told my book recommendations are a lot. This is what they mean."',
      '"Not really." → "Fair. I would not have asked me either."',
      'Silence → say nothing for three seconds. Genuinely.',
    ],
  },
  {
    slug: 'exit-clean',
    kind: 'exit',
    title: 'Leaving well',
    summary: 'The exit is scored, and it is the only part you fully control.',
    body: [
      'Most people end a conversation by letting it decay — the answers get shorter, the gaps get longer, and eventually somebody escapes. Leaving on purpose is better for both of you and it is the single clearest signal that you are fine either way.',
      'Warm, short, no bargaining, no joke to soften it. Then actually go.',
    ].join('\n\n'),
    targets: ['close', 'composure'],
    examples: [
      'I will let you get on. Good luck with the blue one.',
      'That was a nice two minutes. Enjoy your afternoon.',
      'No problem at all — have a good one.',
    ],
    drill: 'Run the Tier 4 field challenge "Take a no well".',
  },
]

export function techniqueFor(subScore: SubScore): Technique | null {
  return TECHNIQUES.find((technique) => technique.kind === 'technique' && technique.targets.includes(subScore)) ?? null
}
