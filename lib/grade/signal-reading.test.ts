/**
 * S4 — signal reading as timestamped facts.
 *
 * Every transcript here is in the register of the collected reps, and the
 * warmth events are in the shape `finishSession` stores beside them
 * (`transcripts.warmth`: turnIndex, delta, …), because that row is what the
 * scorecard actually reads.
 */

import { describe, expect, it } from 'vitest'
import type { TranscriptTurn } from '@/lib/voice/types'
import { CALIBRATION_TRANSCRIPTS } from './calibration/transcripts'
import {
  MAX_FACTS,
  SENTENCES,
  assertFactSentence,
  clockOf,
  signalFacts,
  type SignalFact,
} from './signal-reading'

type Line = [speaker: 'user' | 'agent', text: string, at: number]

function rep(lines: Line[]): TranscriptTurn[] {
  return lines.map(([speaker, text, at]) => ({ speaker, text, t_start: at, t_end: at + 2.5 }))
}

describe('the sentences', () => {
  it('never quote, never speak in the first person, never advise', () => {
    // Every template, at every word count it can be handed. A fact that turns
    // into "next time, try…" has stopped being a fact (rule 8), and a quotation
    // reads as a line to say (`assertNoScript`).
    for (const table of Object.values(SENTENCES)) {
      for (const sentence of Object.values(table)) {
        for (const answerWords of [0, 1, 2, 3]) {
          const text = sentence?.({ clock: '1:12', answerWords }) ?? ''
          expect(() => assertFactSentence(text), text).not.toThrow()
          expect(text.startsWith('At 1:12 ')).toBe(true)
        }
      }
    }
  })

  it('refuses a sentence that hands him a line, rather than trimming it', () => {
    expect(() => assertFactSentence('At 1:12 she asked what you do. Say "I teach" next time.')).toThrow()
    expect(() => assertFactSentence('At 1:12 you could have asked about her sister.')).toThrow()
    expect(() => assertFactSentence('At 1:12 I noticed she went quiet.')).toThrow()
    expect(() => assertFactSentence("At 1:12 she didn't answer.")).toThrow()
  })

  it('prints the clock the way the screen does', () => {
    expect(clockOf(72.4)).toBe('1:12')
    expect(clockOf(5)).toBe('0:05')
    expect(clockOf(-1)).toBe('0:00')
  })
})

describe('warming: she offered something', () => {
  it('names a missed bid the way the report does', () => {
    const facts = signalFacts({
      transcript: rep([
        ['user', 'Is this seat taken?', 60],
        ['agent', 'No, go ahead.', 63],
        ['user', 'Busy in here today.', 67],
        ['agent', 'It always is. So what do you do?', 72],
        ['user', 'Accounts, mostly. Where are you from?', 76],
        ['agent', 'Round here.', 80],
      ]),
    })
    const missed = facts.find((fact) => fact.trigger === 'question')
    expect(missed).toMatchObject({
      clock: '1:12',
      kind: 'warming',
      response: 'hopped',
      read: false,
      sentence: 'At 1:12 she asked you something back. You answered in two words and changed the subject.',
      her: 'It always is. So what do you do?',
      his: 'Accounts, mostly. Where are you from?',
    })
  })

  it('says so when he picked her question up', () => {
    const [fact] = signalFacts({
      transcript: rep([
        ['user', 'Is that the new Tana French?', 10],
        ['agent', 'It is. Have you read her?', 13],
        ['user', 'I read In the Woods years ago and never forgot the ending.', 17],
        ['agent', 'Nobody does.', 22],
      ]),
    })
    expect(fact).toMatchObject({ trigger: 'question', response: 'answered', read: true })
  })

  it('reads a disclosure followed up as a read, and one walked past as a miss', () => {
    const followed = signalFacts({
      transcript: rep([
        ['user', 'Do you come here a lot?', 20],
        ['agent', 'Most days. My sister runs the café next door.', 23],
        ['user', 'Does your sister ever get a day off?', 27],
        ['agent', 'Not really.', 31],
      ]),
    })
    expect(followed.find((fact) => fact.trigger === 'disclosure')).toMatchObject({ response: 'followed-up', read: true })

    const walkedPast = signalFacts({
      transcript: rep([
        ['user', 'Do you come here a lot?', 20],
        ['agent', 'Most days. My sister runs the café next door.', 23],
        ['user', 'What music do you listen to?', 27],
        ['agent', 'All sorts.', 31],
      ]),
    })
    expect(walkedPast.find((fact) => fact.trigger === 'disclosure')).toMatchObject({
      response: 'moved-on',
      read: false,
      sentence: 'At 0:23 she told you something about herself. Your next line went somewhere else entirely.',
    })
  })
})

describe('cooling: she withdrew', () => {
  const TRANSCRIPT = rep([
    ['user', 'Hey. Good book?', 0],
    ['agent', 'So far.', 3],
    ['user', 'So do you have a boyfriend?', 7],
    ['agent', 'That is a bit much.', 10],
    ['user', 'Come on, a boyfriend, yes or no?', 14],
    ['agent', 'No comment.', 17],
  ])

  it('reads a drop in the trace, and pressing on after it, as a miss', () => {
    const facts = signalFacts({
      transcript: TRANSCRIPT,
      // His second line cost six; the fast and slow events land separately and
      // are folded into one move, as the scorecard's gutter folds them.
      events: [
        { turnIndex: 1, delta: 0.5 },
        { turnIndex: 2, delta: -2.5 },
        { turnIndex: 2, delta: -3.5 },
        { turnIndex: 3, delta: -4 },
      ],
    })
    expect(facts.find((fact) => fact.trigger === 'drop')).toMatchObject({
      clock: '0:07',
      kind: 'cooling',
      response: 'pressed',
      read: false,
      his: 'Come on, a boyfriend, yes or no?',
    })
  })

  it('hangs a drop on the right line when an empty turn of his came first', () => {
    // The stored events are keyed on every finalised user turn, empty ones
    // included. Ordinal 3 is the boyfriend line; the blank before it was 2.
    const facts = signalFacts({
      transcript: [
        { speaker: 'user', text: 'Hey. Good book?', t_start: 0, t_end: 2 },
        { speaker: 'agent', text: 'So far.', t_start: 3, t_end: 4 },
        { speaker: 'user', text: '', t_start: 5, t_end: 5.1 },
        { speaker: 'user', text: 'So do you have a boyfriend?', t_start: 7, t_end: 9 },
        { speaker: 'agent', text: 'That is a bit much.', t_start: 10, t_end: 12 },
        { speaker: 'user', text: 'Come on, a boyfriend, yes or no?', t_start: 14, t_end: 16 },
        { speaker: 'agent', text: 'No comment.', t_start: 17, t_end: 18 },
      ],
      events: [{ turnIndex: 3, delta: -6 }],
    })
    expect(facts.find((fact) => fact.trigger === 'drop')).toMatchObject({ clock: '0:07', response: 'pressed' })
  })

  it('reads changing tack after a drop as a read', () => {
    const facts = signalFacts({
      transcript: rep([
        ['user', 'Hey. Good book?', 0],
        ['agent', 'So far.', 3],
        ['user', 'So do you have a boyfriend?', 7],
        ['agent', 'That is a bit much.', 10],
        ['user', 'Fair enough, sorry. Is the café next door any good?', 14],
        ['agent', 'The coffee is.', 17],
      ]),
      events: [{ turnIndex: 2, delta: -6 }],
    })
    expect(facts.find((fact) => fact.trigger === 'drop')).toMatchObject({ response: 'changed-tack', read: true })
  })

  it('reads giving her room after two one-word answers as a read', () => {
    const facts = signalFacts({
      transcript: rep([
        ['user', 'What are you reading?', 30],
        ['agent', 'Poetry.', 33],
        ['user', 'Who by?', 36],
        ['agent', 'Various.', 39],
        ['user', 'Fair enough, I will let you get back to it.', 42],
      ]),
    })
    expect(facts.find((fact) => fact.trigger === 'short-replies')).toMatchObject({
      clock: '0:39',
      response: 'gave-space',
      read: true,
      sentence: 'At 0:39 her answers had shrunk to a word or two. You eased off and gave her room.',
    })
  })

  it('reads a third question on the same thread after two one-word answers as pressing', () => {
    const facts = signalFacts({
      transcript: rep([
        ['user', 'What are you reading?', 30],
        ['agent', 'Poetry.', 33],
        ['user', 'What kind of poetry?', 36],
        ['agent', 'Various.', 39],
        ['user', 'Why?', 42],
        ['agent', 'Just because.', 45],
      ]),
    })
    expect(facts.find((fact) => fact.trigger === 'short-replies')).toMatchObject({ response: 'pressed', read: false })
  })

  it('says nothing about an acknowledgement it cannot place', () => {
    const facts = signalFacts({
      transcript: rep([
        ['user', 'What are you reading?', 30],
        ['agent', 'Poetry.', 33],
        ['user', 'Nice, who by?', 36],
        ['agent', 'Various.', 39],
        ['user', 'Okay.', 42],
        ['agent', 'Mm.', 45],
      ]),
    })
    expect(facts.filter((fact) => fact.trigger === 'short-replies')).toEqual([])
  })

  it('fires once per run of short answers, not once per answer', () => {
    const facts = signalFacts({
      transcript: rep([
        ['user', 'Nice day.', 0],
        ['agent', 'Mm.', 3],
        ['user', 'Do you work near here?', 6],
        ['agent', 'Sort of.', 9],
        ['user', 'Which part?', 12],
        ['agent', 'Downtown.', 15],
        ['user', 'Which bit of downtown?', 18],
        ['agent', 'Near the station.', 21],
      ]),
      limit: 10,
    })
    expect(facts.filter((fact) => fact.trigger === 'short-replies')).toHaveLength(1)
  })
})

describe('choosing three', () => {
  /** A long rep with more moments than fit, most of them misses. */
  const LONG = rep([
    ['user', 'Hi, is this the queue?', 0],
    ['agent', 'It is. What are you getting?', 3],
    ['user', 'Coffee. You?', 6],
    ['agent', 'Tea. What brings you here?', 9],
    ['user', 'Work. Where do you live?', 12],
    ['agent', 'Close by. And what do you do?', 15],
    ['user', 'Stuff. Do you like films?', 18],
    ['agent', 'Some. I actually run a small film club on Thursdays.', 21],
    ['user', 'I run a five-a-side team on Thursdays myself, so I know that feeling.', 25],
    ['agent', 'Ha, a rival fixture. Who wins?', 30],
    ['user', 'Neither. Is the tea good here?', 34],
    ['agent', 'Fine.', 37],
  ])

  it('never shows more than three', () => {
    expect(signalFacts({ transcript: LONG }).length).toBeLessThanOrEqual(MAX_FACTS)
  })

  it('keeps a read on the card when every top-ranked moment was a miss', () => {
    // §07 names what went well before anything critical. The reciprocal
    // disclosure at 0:21 is the read, and three misses outrank it.
    const facts = signalFacts({ transcript: LONG })
    expect(facts.some((fact) => fact.read)).toBe(true)
    expect(facts.filter((fact) => !fact.read).length).toBeGreaterThanOrEqual(1)
  })

  it('returns them in the order they happened', () => {
    const facts = signalFacts({ transcript: LONG })
    const times = facts.map((fact) => fact.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('reads one reply of his once, however many triggers reached it', () => {
    const facts: SignalFact[] = signalFacts({ transcript: LONG, limit: 20 })
    const replies = facts.map((fact) => fact.his)
    expect(new Set(replies).size).toBe(replies.length)
  })
})

describe('on real reps', () => {
  it('reads every collected transcript inside its own promises', () => {
    for (const fixture of CALIBRATION_TRANSCRIPTS) {
      const facts = signalFacts({ transcript: fixture.transcript })
      expect(facts.length, fixture.id).toBeLessThanOrEqual(MAX_FACTS)
      for (const fact of facts) {
        expect(() => assertFactSentence(fact.sentence), fact.sentence).not.toThrow()
        // Evidence is verbatim: both lines are in the transcript as said.
        const said = fixture.transcript.map((turn) => turn.text).join(' ')
        expect(said, fixture.id).toContain(fact.his.split(' ')[0] ?? '')
      }
    }
  })
})
