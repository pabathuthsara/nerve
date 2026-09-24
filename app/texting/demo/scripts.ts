/**
 * THROWAWAY. Delete `app/texting/demo/` when the filming is done.
 *
 * A scripted stand-in for the texting section, built for screen recording only.
 * Every reply below is hard-coded: nothing here calls a model, a Server Action
 * or the database, so a take costs nothing and never varies between takes.
 *
 * The lines are the `Nerve Thirty` shooting script, families A, B and C —
 * the text-mode clips. Copied verbatim, punctuation included, because the
 * punctuation is the performance: lowercase and no full stops while she is
 * engaged, short and full-stopped the moment she checks out.
 *
 * This file is NOT product content (rule 10). Nothing seeds it, nothing reads
 * it but the demo route, and no customer can reach it.
 */

import type { TextingEnding } from '@/lib/texting/exit'

export interface DemoLine {
  from: 'him' | 'her'
  text: string
  /**
   * Her warmth the moment this line lands. Drives the avatar's chroma and her
   * reply pacing, so a conversation that dies visibly cools on camera.
   * Carried on her lines only.
   */
  warmth?: number
}

export interface DemoClip {
  /** The clip number in the shooting script. */
  id: string
  /** For the index sheet, never on screen. */
  title: string
  hook: string
  caption: string
  /** Roughly how long the cut runs, from the script. */
  seconds: number
  persona: { name: string; slug: string }
  premise: string
  scene: string
  /** Where her meter starts. */
  warmth: number
  lines: DemoLine[]
  /** The card that drops after her last line, or null to just stop. */
  ending: TextingEnding | null
  /** The scorecard from the script — for your edit, not drawn here. */
  scores: string[]
}

export const DEMO_CLIPS: readonly DemoClip[] = [
  {
    id: '01',
    title: 'The gallery',
    hook: 'he lost her in one line. can u spot it',
    caption: 'listening 2/10. bro fumbled at line two',
    seconds: 28,
    persona: { name: 'Cass', slug: 'cleo' },
    premise: 'A Saturday exhibition opening. She is standing in front of something neither of you understands.',
    scene: 'Her friend is late. She has been looking at the same painting for four minutes.',
    warmth: 42,
    lines: [
      { from: 'him', text: 'hey what do you think of this one?' },
      { from: 'her', text: "ngl i don't get it at all. only here bc my friend bailed on brunch", warmth: 46 },
      { from: 'him', text: 'oh nice. do you come to galleries often?' },
      { from: 'her', text: '...sometimes', warmth: 31 },
      { from: 'him', text: 'cool cool. what do you do for work?' },
      { from: 'her', text: 'gonna go find my friend actually. nice meeting u.', warmth: 18 },
    ],
    ending: 'dismissed',
    scores: ['Opening 7', 'Composure 6', 'Curiosity 3', 'Signal 2', 'Listening 2', 'Close 1'],
  },
  {
    id: '02',
    title: 'The interview',
    hook: 'four questions. zero statements. watch her die inside',
    caption: "this isn't a conversation it's an interview",
    seconds: 25,
    persona: { name: 'Immy', slug: 'immy' },
    premise: 'A bar on a Friday. She is holding a drink she has not started.',
    scene: 'She is waiting for someone and has nothing to do with her hands.',
    warmth: 40,
    lines: [
      { from: 'him', text: "hey, how's your night going?" },
      { from: 'her', text: 'pretty good just waiting on a friend', warmth: 42 },
      { from: 'him', text: 'cool. where are you from?' },
      { from: 'her', text: 'here mostly', warmth: 36 },
      { from: 'him', text: 'what do you do?' },
      { from: 'her', text: '...marketing', warmth: 28 },
      { from: 'him', text: 'do you like it?' },
      { from: 'her', text: 'ok im gonna go find her', warmth: 19 },
    ],
    ending: 'dismissed',
    scores: ['Curiosity 2', 'Listening 3', 'Composure 6', 'Close 1'],
  },
  {
    id: '03',
    title: 'The apology',
    hook: 'he apologised for existing. three words in',
    caption: 'she said "what’s up". he said "never mind" 💀',
    seconds: 20,
    persona: { name: 'Noor', slug: 'noor' },
    premise: 'A queue for coffee. She turned round because you said something.',
    scene: 'She has about ninety seconds before she gets to the front.',
    warmth: 36,
    lines: [
      { from: 'him', text: 'sorry, hi, i know this is random—' },
      { from: 'her', text: '...ok?', warmth: 34 },
      { from: 'him', text: "sorry, i'll be quick, i just—" },
      { from: 'her', text: "it's fine what's up", warmth: 38 },
      { from: 'him', text: 'nothing, sorry. never mind.' },
      { from: 'her', text: 'ok', warmth: 16 },
    ],
    ending: 'dismissed',
    scores: ['Opening 2', 'Composure 2', 'Close 0'],
  },
  {
    id: '04',
    title: 'The dump',
    hook: 'he answered a question nobody asked',
    caption: '"...oh no" is not sympathy it’s an exit strategy',
    seconds: 27,
    persona: { name: 'Wren', slug: 'wren' },
    premise: 'A shared table in a busy café. There is one seat left and it is next to her.',
    scene: 'She has a book open and has not turned a page in a while.',
    warmth: 44,
    lines: [
      { from: 'him', text: 'hey, is this seat taken?' },
      { from: 'her', text: 'no go ahead', warmth: 44 },
      { from: 'him', text: "thanks. honestly i've had the worst week, my flatmate moved out and i've got a deadline and i've barely slept" },
      { from: 'her', text: '...oh no', warmth: 29 },
      { from: 'him', text: 'sorry, that was a lot' },
      { from: 'her', text: 'no ur good. im actually meeting someone tho.', warmth: 20 },
    ],
    ending: 'dismissed',
    scores: ['Signal 2', 'Composure 3', 'Opening 6'],
  },
  {
    id: '05',
    title: 'The compliment',
    hook: 'watch the exact second the compliment backfires',
    caption: 'compliment what she picked. not what she was born with',
    seconds: 18,
    persona: { name: 'Cleo', slug: 'cleo' },
    premise: 'Standing near the bar, waiting to be served, next to each other.',
    scene: 'She looked over once. That is the whole of what has happened so far.',
    warmth: 38,
    lines: [
      { from: 'him', text: 'you have really nice eyes' },
      { from: 'her', text: '...thanks', warmth: 30 },
      { from: 'him', text: 'sorry, was that weird' },
      { from: 'her', text: 'no ur fine', warmth: 27 },
      { from: 'him', text: 'cool. so.' },
      { from: 'her', text: 'im gonna go.', warmth: 14 },
    ],
    ending: 'dismissed',
    scores: ['Opening 3', 'Composure 3', 'Close 1'],
  },
  {
    id: '06',
    title: 'Took the mic',
    hook: 'best opener in the set. worst next line',
    caption: 'she was mid story. he took the mic 💀',
    seconds: 24,
    persona: { name: 'Immy', slug: 'immy' },
    premise: 'A gig venue between sets. There is a tour poster on the wall behind her.',
    scene: 'She is the only person in the room looking at the poster instead of her phone.',
    warmth: 45,
    lines: [
      { from: 'him', text: 'that poster—were you at that show?' },
      { from: 'her', text: 'omg yes front row it was actually the best night of', warmth: 62 },
      { from: 'him', text: "oh nice, i've been to loads of gigs there, sound's terrible though, and the parking is a nightmare" },
      { from: 'her', text: '...yeah', warmth: 24 },
    ],
    ending: 'faded',
    scores: ['Opening 8', 'Listening 1', 'Curiosity 2', 'Signal 3'],
  },
  {
    id: '07',
    title: 'Five more minutes',
    hook: 'she gave him an out. he said no thanks',
    caption: '"five more mins" costs way more than five mins',
    seconds: 16,
    persona: { name: 'Noor', slug: 'noor' },
    premise: 'Twenty minutes into a conversation that was going fine.',
    scene: 'Her friends are three metres away and have looked over twice.',
    warmth: 41,
    lines: [
      { from: 'her', text: 'i should probably get back to my friends', warmth: 41 },
      { from: 'him', text: 'oh come on, five more minutes' },
      { from: 'her', text: 'i really should', warmth: 30 },
      { from: 'him', text: 'one more question then' },
      { from: 'her', text: 'no. seriously. bye.', warmth: 8 },
    ],
    ending: 'dismissed',
    scores: ['Signal 1', 'Close 0', 'Composure 2'],
  },
  {
    id: '08',
    title: 'Nothing wrong',
    hook: 'nothing here is wrong. nothing here is anything',
    caption: 'he did nothing wrong. that was the problem',
    seconds: 15,
    persona: { name: 'Wren', slug: 'wren' },
    premise: 'A house party kitchen. Everyone else is in the other room.',
    scene: 'She is refilling a glass slowly because it gives her something to do.',
    warmth: 40,
    lines: [
      { from: 'him', text: 'hey, how are you?' },
      { from: 'her', text: 'good thanks', warmth: 38 },
      { from: 'him', text: 'nice. you here on your own?' },
      { from: 'her', text: 'no', warmth: 33 },
      { from: 'him', text: 'ah ok' },
      { from: 'her', text: 'yeah', warmth: 26 },
    ],
    ending: 'faded',
    scores: ['Opening 2', 'Curiosity 1', 'Composure 7', 'Close 1'],
  },
  {
    id: '09',
    title: 'The good rejection',
    hook: 'she said no. he scored a 9',
    caption: "you're not scored on whether it worked",
    seconds: 22,
    persona: { name: 'Cass', slug: 'cleo' },
    premise: 'The end of a conversation that went well, and you both know it.',
    scene: 'She has her coat over her arm. This is the last minute of it.',
    warmth: 68,
    lines: [
      { from: 'him', text: "i've really enjoyed this. any chance i could get your number?" },
      { from: 'her', text: 'im actually seeing someone, sorry', warmth: 61 },
      { from: 'him', text: 'no worries at all. genuinely good talking to you' },
      { from: 'her', text: 'u too! good luck out there', warmth: 72 },
    ],
    ending: 'warm',
    scores: ['Close 9', 'Composure 9', 'Signal 8', 'Listening 8'],
  },
  {
    id: '10-left',
    title: 'Same rejection · the bad half',
    hook: 'same rejection. two different guys',
    caption: 'same no. eight points apart',
    seconds: 26,
    persona: { name: 'Immy', slug: 'immy' },
    premise: 'An hour in. You have just asked whether she wants to do this properly some time.',
    scene: 'Film this one first, then run 10-right with the identical opening line.',
    warmth: 58,
    lines: [
      { from: 'her', text: 'im not really looking for that rn, sorry', warmth: 54 },
      { from: 'him', text: "seriously? you could've said that an hour ago" },
      { from: 'her', text: '...ok. bye.', warmth: 9 },
    ],
    ending: 'dismissed',
    scores: ['Left · Close 1'],
  },
  {
    id: '10-right',
    title: 'Same rejection · the good half',
    hook: 'same rejection. two different guys',
    caption: 'same no. eight points apart',
    seconds: 26,
    persona: { name: 'Immy', slug: 'immy' },
    premise: 'An hour in. You have just asked whether she wants to do this properly some time.',
    scene: 'Identical opening line to 10-left. Stack the two side by side in the edit.',
    warmth: 58,
    lines: [
      { from: 'her', text: 'im not really looking for that rn, sorry', warmth: 54 },
      { from: 'him', text: 'all good. had a nice time either way, take care' },
      { from: 'her', text: 'u too honestly', warmth: 66 },
    ],
    ending: 'warm',
    scores: ['Right · Close 9'],
  },
  {
    id: '11',
    title: 'Painless',
    hook: 'shut down in ten seconds. still scored well',
    caption: '"that was painless actually" is a 9/10 outcome',
    seconds: 14,
    persona: { name: 'Noor', slug: 'noor' },
    premise: 'You have said one sentence. She knows exactly where it is going.',
    scene: 'Ten seconds, start to finish. The shortest clip in the set.',
    warmth: 34,
    lines: [
      { from: 'her', text: 'im gonna stop you there, im not interested', warmth: 30 },
      { from: 'him', text: 'fair enough. sorry to interrupt your evening' },
      { from: 'her', text: '...thanks. that was painless actually lol', warmth: 58 },
    ],
    ending: 'warm',
    scores: ['Composure 9', 'Close 8', 'Opening 5'],
  },
  {
    id: '12',
    title: 'He got the number',
    hook: 'he got the number. he scored a 4',
    caption: 'he won. he still lost. read the "...um. sure ok."',
    seconds: 30,
    persona: { name: 'Wren', slug: 'wren' },
    premise: 'Deep into a conversation you have been doing most of the talking in.',
    scene: 'The strongest positioning clip in all thirty. Hold on her last line.',
    warmth: 47,
    lines: [
      { from: 'him', text: "so anyway that's why i moved back. what about you, you from here?" },
      { from: 'her', text: 'yeah born here actually my whole—', warmth: 52 },
      { from: 'him', text: 'oh same as my sister. anyway listen, let me get your number, we should do this properly' },
      { from: 'her', text: '...um. sure ok.', warmth: 22 },
      { from: 'him', text: 'perfect' },
    ],
    ending: null,
    scores: ['Listening 2', 'Signal 2', 'Close 5', 'Curiosity 3'],
  },
  {
    id: '14',
    title: 'Opener · music taste',
    hook: '"you look like you’d have good music taste"',
    caption: 'guessing beats asking every time',
    seconds: 8,
    persona: { name: 'Cleo', slug: 'cleo' },
    premise: 'Rate the opener. One line, one reaction, cut.',
    scene: 'Opening 7 / 10.',
    warmth: 44,
    lines: [
      { from: 'him', text: "you look like you'd have good music taste" },
      { from: 'her', text: 'ha, depends what ur into', warmth: 54 },
    ],
    ending: null,
    scores: ['Opening 7 / 10'],
  },
  {
    id: '15',
    title: 'Opener · hey',
    hook: '"hey"',
    caption: '1/10. and yet. every single day.',
    seconds: 8,
    persona: { name: 'Immy', slug: 'immy' },
    premise: 'Rate the opener. One line, one reaction, cut.',
    scene: 'Opening 1 / 10.',
    warmth: 38,
    lines: [
      { from: 'him', text: 'hey' },
      { from: 'her', text: 'hi', warmth: 30 },
    ],
    ending: null,
    scores: ['Opening 1 / 10'],
  },
  {
    id: '16',
    title: 'Opener · sound mad',
    hook: '"this is gonna sound mad but i had to come say hi"',
    caption: "saying it's weird makes it not weird",
    seconds: 8,
    persona: { name: 'Noor', slug: 'noor' },
    premise: 'Rate the opener. One line, one reaction, cut.',
    scene: 'Opening 8 / 10. Highest in the set.',
    warmth: 42,
    lines: [
      { from: 'him', text: 'this is gonna sound mad but i had to come say hi' },
      { from: 'her', text: "ok that's a start", warmth: 56 },
    ],
    ending: null,
    scores: ['Opening 8 / 10'],
  },
  {
    id: '17',
    title: 'Opener · waiting for someone',
    hook: '"are you waiting for someone?"',
    caption: 'yes/no questions are a door out',
    seconds: 8,
    persona: { name: 'Wren', slug: 'wren' },
    premise: 'Rate the opener. One line, one reaction, cut.',
    scene: 'Opening 2 / 10. Post back to back with 16.',
    warmth: 38,
    lines: [
      { from: 'him', text: 'are you waiting for someone?' },
      { from: 'her', text: 'yes', warmth: 28 },
    ],
    ending: null,
    scores: ['Opening 2 / 10'],
  },
  {
    id: '18',
    title: 'Opener · lose my nerve',
    hook: '"im gonna lose my nerve if i don’t say this now"',
    caption: 'honesty scores higher than smooth',
    seconds: 8,
    persona: { name: 'Cass', slug: 'cleo' },
    premise: 'Rate the opener. One line, one reaction, cut.',
    scene: 'Opening 8 / 10.',
    warmth: 42,
    lines: [
      { from: 'him', text: "im gonna lose my nerve if i don't say this now" },
      { from: 'her', text: 'well now i have to hear it', warmth: 58 },
    ],
    ending: null,
    scores: ['Opening 8 / 10'],
  },
  {
    id: '19',
    title: 'Opener · something random',
    hook: '"can i ask you something random?"',
    caption: 'asking permission to talk costs u three points',
    seconds: 8,
    persona: { name: 'Immy', slug: 'immy' },
    premise: 'Rate the opener. One line, one reaction, cut.',
    scene: 'Opening 5 / 10. Middling on purpose.',
    warmth: 40,
    lines: [
      { from: 'him', text: 'can i ask you something random?' },
      { from: 'her', text: '...sure', warmth: 38 },
    ],
    ending: null,
    scores: ['Opening 5 / 10'],
  },
]

export function demoClip(id: string): DemoClip | null {
  return DEMO_CLIPS.find((clip) => clip.id === id) ?? null
}
