/**
 * S3 — the four responsiveness counts, on transcripts shaped like real reps.
 *
 * The lines below are written in the register the calibration set records
 * (`lib/grade/calibration/transcripts.ts`): short, transcribed, occasionally
 * unpunctuated on his side and always punctuated on hers.
 */

import { describe, expect, it } from 'vitest'
import type { TranscriptTurn } from '@/lib/voice/types'
import { CALIBRATION_TRANSCRIPTS } from './calibration/transcripts'
import {
  answerPart,
  blocksOf,
  isDisclosure,
  questionPart,
  readBid,
  responsivenessOf,
  sameWord,
  sharedWord,
} from './responsiveness'

type Line = [speaker: 'user' | 'agent', text: string]

/** Three seconds a line, half a second between. Timing is not what is under test. */
function rep(lines: Line[]): TranscriptTurn[] {
  return lines.map(([speaker, text], index) => ({
    speaker,
    text,
    t_start: index * 3.5,
    t_end: index * 3.5 + 3,
  }))
}

const her = (text: string, at = 0): TranscriptTurn => ({ speaker: 'agent', text, t_start: at, t_end: at + 2 })
const him = (text: string, at = 3): TranscriptTurn => ({ speaker: 'user', text, t_start: at, t_end: at + 2 })

describe('the shared word', () => {
  it('matches an inflection of the same root', () => {
    expect(sameWord('teach', 'teaching')).toBe(true)
    expect(sameWord('place', 'places')).toBe(true)
    expect(sameWord('write', 'writing')).toBe(true)
    expect(sameWord('note', 'notes')).toBe(true)
  })

  it('does not match a different word that happens to share letters', () => {
    expect(sameWord('note', 'nothing')).toBe(false)
    expect(sameWord('book', 'bookshop')).toBe(false)
    expect(sameWord('read', 'ready')).toBe(true) // the documented cost of the rule, pinned so it is a choice
  })

  it('finds the follow-up the exact-match meter cannot see', () => {
    expect(sharedWord('How long have you been teaching?', 'I teach piano, mostly kids.')).toBe('teaching')
  })
})

describe('statements and questions inside one turn', () => {
  it('splits an answer from the question that follows it', () => {
    const text = 'Accounts, mostly. Where are you from?'
    expect(answerPart(text)).toBe('Accounts, mostly.')
    expect(questionPart(text)).toBe('Where are you from?')
  })

  it('reads an unpunctuated spoken question as a question', () => {
    expect(questionPart('so where are you from')).toBe('so where are you from')
  })

  it('does not read a statement that opens with an interrogative as a question', () => {
    expect(questionPart('What a day.')).toBe('')
  })

  it('knows a disclosure from a shrug', () => {
    expect(isDisclosure('I work in insurance claims during the day.')).toBe(true)
    expect(isDisclosure('My sister got me into it.')).toBe(true)
    expect(isDisclosure("I don't know.")).toBe(false)
    expect(isDisclosure('Crime is fiction. Just not the sad-house kind.')).toBe(false)
  })

  it('merges one speaker holding the floor across a transcription split', () => {
    const blocks = blocksOf(rep([
      ['user', 'So, you are still sketching them?'],
      ['agent', 'Yeah, still sketching, badly.'],
      ['agent', 'Not today. Just the notebook.'],
      ['user', 'What do you usually draw?'],
    ]))
    expect(blocks.map((block) => block.speaker)).toEqual(['user', 'agent', 'user'])
    expect(blocks[1]?.text).toBe('Yeah, still sketching, badly. Not today. Just the notebook.')
    expect(blocks[2]?.userOrdinals).toEqual([2])
  })

  it('counts an empty turn of his toward the ordinals, as the meter and the gutter do', () => {
    // `WarmthSession.onUserTurn` counts every finalised user turn and
    // `fetchTranscript` keys the gutter the same way. Skipping the empty one
    // would hang the third turn's warmth event on the second.
    const blocks = blocksOf([
      { speaker: 'user', text: 'Hi, is this seat free?', t_start: 0, t_end: 1.5 },
      { speaker: 'agent', text: 'Go ahead.', t_start: 2, t_end: 3 },
      { speaker: 'user', text: '  ', t_start: 4, t_end: 4.2 },
      { speaker: 'user', text: 'Busy day?', t_start: 5, t_end: 6 },
    ])
    expect(blocks.map((block) => block.userOrdinals)).toEqual([[1], [], [3]])
    expect(blocks[2]?.turns).toHaveLength(1)
  })
})

describe('her questions, and what he did with them', () => {
  it('names the report’s own example: two words, then a new subject', () => {
    const reading = readBid(her('So what do you do?'), him('Accounts, mostly. Where are you from?'))
    expect(reading.verdict).toBe('hopped')
    expect(reading.answerWords).toBe(2)
  })

  it('counts a real answer that then asks her something new as answered', () => {
    const reading = readBid(her('So what do you do?'), him("I'm an accountant, which is less boring than it sounds. Where are you from?"))
    expect(reading.verdict).toBe('answered')
  })

  it('calls one word handed straight back thin, and still turned toward', () => {
    const reading = readBid(her('So what do you do?'), him('Accounting. You?'))
    expect(reading.verdict).toBe('thin')
    expect(reading.askedBack).toBe(true)
  })

  it('does not call a yes to a yes/no question thin', () => {
    expect(readBid(her('Do you come here often?'), him('Yeah.')).verdict).toBe('answered')
    expect(readBid(her('Do you come here often?'), him('Yeah, twice.')).verdict).toBe('answered')
  })

  it('calls a question ignored for another one a hop with no answer at all', () => {
    const reading = readBid(her('What made you come over?'), him('Where did you get that coat?'))
    expect(reading.verdict).toBe('hopped')
    expect(reading.answerWords).toBe(0)
  })

  it('separates a dead end from a short answer, and both from a dismissal', () => {
    // "Yeah." answers a yes/no question and does not answer an open one.
    expect(readBid(her('Do you read much?'), him('Yeah.')).verdict).toBe('answered')
    expect(readBid(her('What are you reading?'), him('Yeah.')).verdict).toBe('dead-end')
    expect(readBid(her('What are you reading?'), him('Mm.')).verdict).toBe('dead-end')
    expect(readBid(her('What are you reading?'), him('Murakami.')).verdict).toBe('thin')
    expect(readBid(her('What are you reading?'), him('Why are you still here?')).verdict).toBe('dismissed')
  })
})

describe('the four counts on a whole rep', () => {
  const GOOD = rep([
    ['user', 'Sorry, is this place always this quiet?'],
    ['agent', 'Pretty much. It is why I come here to read.'],
    ['user', 'What are you reading at the moment?'],
    ['agent', 'Tana French. I read her whenever I need a proper mystery.'],
    ['user', 'I read her last one on a train. Which mystery of hers is your favourite?'],
    ['agent', 'The Likeness, probably. What do you read?'],
    ['user', 'Mostly history, which I know sounds dull. I got into it through my grandad.'],
    ['agent', 'Not dull. My sister is a history teacher.'],
    ['user', 'Does she teach round here?'],
    ['agent', 'Across town. She hates the commute.'],
    ['user', 'Going back to the train thing, do you ever read on the way to work?'],
    ['agent', 'Every day, actually.'],
  ])

  it('counts follow-ups over the questions that had something to follow', () => {
    const counted = responsivenessOf(GOOD)
    // The opener had nothing before it; "Does she teach round here?" follows
    // "teacher"; "Which mystery…" follows "mystery"; "What are you reading…"
    // follows "read"; the train question follows nothing she said last.
    expect(counted.followUps).toEqual({ count: 3, of: 4 })
  })

  it('does not call an echo or his own word a callback', () => {
    // "Going back to the train thing" returns to HIS word, not hers, and the
    // "read" in it is one she said three turns back — an echo by the meter's
    // own definition (`LONG_RANGE_TURNS`), not proof of attention.
    expect(responsivenessOf(GOOD).callbacks).toEqual({ count: 0, moments: [] })
  })

  it('counts her question as turned toward when he answered it', () => {
    expect(responsivenessOf(GOOD).bidsTurnedToward).toEqual({ count: 1, of: 1 })
  })

  it('counts a disclosure of his straight after hers as reciprocal', () => {
    // Three of hers: "It is why I come here to read." (met with a question),
    // "I read her whenever…" (met with "I read her last one on a train." —
    // the one that counts) and "My sister is a history teacher." (met with
    // "Does she teach…", a follow-up rather than a disclosure of his own).
    expect(responsivenessOf(GOOD).reciprocalDisclosures).toEqual({ count: 1, of: 3 })
  })

  it('finds a callback that reaches four of her turns back', () => {
    const counted = responsivenessOf(rep([
      ['user', 'Hey, is that a sketchbook?'],
      ['agent', 'It is. My sketchbook goes everywhere with me.'],
      ['user', 'Do you ever show anyone?'],
      ['agent', 'Not really.'],
      ['user', 'What else do you do?'],
      ['agent', 'Work, mostly.'],
      ['user', 'Right. Is it busy today?'],
      ['agent', 'Quiet enough.'],
      ['user', 'So what are you going to do with the sketchbook when it is full?'],
      ['agent', 'Start another one.'],
    ]))
    expect(counted.callbacks.count).toBe(1)
    expect(counted.callbacks.moments[0]).toMatchObject({ word: 'sketchbook', distance: 4 })
  })

  it('measures a callback in her raw turns, which is what the meter was handed', () => {
    // Her second reply arrived split in two. As blocks, "sketchbook" is three
    // of her turns back and an echo; as the meter heard it, four and a
    // callback. The scorecard must say what the meter said.
    const counted = responsivenessOf(rep([
      ['user', 'Hey, is that a sketchbook?'],
      ['agent', 'It is. My sketchbook goes everywhere with me.'],
      ['user', 'Do you ever show anyone?'],
      ['agent', 'Not really.'],
      ['agent', 'Maybe my sister.'],
      ['user', 'Is it busy today?'],
      ['agent', 'Quiet enough.'],
      ['user', 'So what happens to the sketchbook when it is full?'],
      ['agent', 'Start another one.'],
    ]))
    expect(counted.callbacks.moments).toHaveLength(1)
    expect(counted.callbacks.moments[0]).toMatchObject({ word: 'sketchbook', distance: 4 })
  })

  it('does not call a new question a follow-up because the answer before it used her word', () => {
    const counted = responsivenessOf(rep([
      ['user', 'Hi, sorry, is the coffee here any good?'],
      ['agent', 'The coffee is fine. Do you like the coffee here?'],
      ['user', 'The coffee is fine. Where are you from?'],
      ['agent', 'Round here.'],
    ]))
    expect(counted.followUps).toEqual({ count: 0, of: 1 })
  })

  it('pays nothing for contempt that happens to repeat her word', () => {
    const counted = responsivenessOf(rep([
      ['user', 'Hi.'],
      ['agent', 'Hi. I am just finishing this chapter, it is so boring.'],
      ['user', 'You are so boring, why is that chapter so boring?'],
      ['agent', 'Because I want to.'],
    ]))
    expect(counted.followUps.of).toBe(0)
  })

  it('leaves a question she asked as the rep ended out of the denominator', () => {
    const counted = responsivenessOf(rep([
      ['user', 'Nice to meet you anyway.'],
      ['agent', 'You too. Where are you off to?'],
    ]))
    expect(counted.bidsTurnedToward.of).toBe(0)
  })

  it('reads every collected real rep without throwing, inside its own bounds', () => {
    for (const fixture of CALIBRATION_TRANSCRIPTS) {
      const counted = responsivenessOf(fixture.transcript)
      for (const count of [counted.followUps, counted.bidsTurnedToward, counted.reciprocalDisclosures]) {
        expect(count.count, fixture.id).toBeLessThanOrEqual(count.of)
        expect(count.count, fixture.id).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
