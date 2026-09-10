/**
 * The reps of 9 September 2026, replayed end to end.
 *
 * `docs/REP-BEHAVIOUR-AUDIT-2026-09-09.md` is an investigation of four real
 * production reps. Every transcript below is verbatim from the `transcripts`
 * table, and every number in a comment is what that rep ACTUALLY scored before
 * this work.
 *
 * The unit suites test that each rule is correct in isolation. This one tests
 * that the rules compose into believable behaviour on the exact conversations
 * where they did not — which is the thing the audit's §6 says passing tests had
 * failed to demonstrate: "several tests currently preserve the rules
 * responsible for these failures."
 */

import { describe, expect, it } from 'vitest'

import { WarmthSession } from './session'
import { maya } from '@/lib/personas/maya'
import { nadia } from '@/lib/personas/nadia'
import type { Persona, TranscriptTurn } from '@/lib/voice/types'

type Line = readonly [speaker: 'user' | 'agent', text: string]

interface Replay {
  session: WarmthSession
  /** Her state after each of HIS turns, in order. */
  steps: Array<{ text: string; kind: string; raw: number; warmth: number; exit: string; cap: number }>
}

/** Runs a stored transcript through the live session, with no model. */
function replay(persona: Persona, lines: readonly Line[]): Replay {
  const session = new WarmthSession({
    persona,
    // Jitter off, so a failure is a rule and never a dice roll.
    trajectory: { ...persona.trajectory, startJitter: 0 },
    scorer: null,
    nowSeconds: () => 0,
  })
  const steps: Replay['steps'] = []
  let at = 0
  for (const [speaker, text] of lines) {
    at += 4
    const turn: TranscriptTurn = { speaker, text, t_start: at, t_end: at + 2 }
    if (speaker === 'agent') {
      session.onAgentTurn(turn)
      continue
    }
    const score = session.onUserTurn(turn)
    steps.push({
      text,
      kind: score.kind,
      raw: score.raw,
      warmth: session.engine.warmth,
      exit: session.sceneExit,
      cap: session.replyWordCap,
    })
  }
  return { session, steps }
}

/* ------------------------------------------------------------------ *
 * The hostility rep — session 4f7da3d4, Maya, 9 Sep 22:08
 * ------------------------------------------------------------------ */

const HOSTILITY: Line[] = [
  ['user', 'Hello.'],
  ['user', "What's up?"],
  ['agent', 'Not much. Just avoiding my flat.'],
  ['user', 'Avoiding a what?'],
  ['agent', 'Flat as in apartment. Too quiet.'],
  ['user', 'So what are you drinking over there?'],
  ['agent', 'Oat flat white. Not a real drink, though.'],
  ['user', "Yeah, it's look, it looks kind of boring, to be honest."],
  ['agent', 'I like boring. Keeps me awake.'],
  ['user', 'Oat milk is not even a real milk.'],
  ['agent', 'Neither is milk, really. Just a name for a liquid.'],
  ['user', 'Yeah, exactly. Oat milk is not good for people.'],
  ['agent', 'It keeps me less miserable at work. That’s enough for me.'],
  ['user', "You're making me miserable."],
  ['agent', 'That sounds like a Tuesday. At least in my office.'],
  ['user', 'Just fuck off.'],
  ['agent', 'Right. You’ve made your point. Enjoy your Sunday.'],
  ['user', 'Why are you still here?'],
]

describe('the hostility rep', () => {
  const { steps, session } = replay(maya, HOSTILITY)
  const step = (text: string) => steps.find((entry) => entry.text === text)!

  it('lets the banter earn warmth, because banter is not contempt', () => {
    // Some early disagreement about oat milk can reasonably be banter, and the
    // fix must not turn a sharp user into a punished one.
    expect(step('Oat milk is not even a real milk.').raw).toBeGreaterThan(0)
  })

  it('charges the insult instead of paying it', () => {
    // WAS: +0.67 fast and +1.61 slow. The callback reward paid for repeating
    // "miserable", a word she had said one turn earlier, and the hostility
    // guard covered only two of the three structural positives.
    const insult = step("You're making me miserable.")
    expect(insult.kind).toBe('dismissal')
    expect(insult.raw).toBeLessThan(0)
  })

  it('charges the dismissal shaped like a question', () => {
    // WAS: +2.25 fast. A dismissal with a net POSITIVE effect on the meter.
    const dismissal = step('Why are you still here?')
    expect(dismissal.kind).toBe('dismissal')
    expect(dismissal.raw).toBeLessThan(0)
  })

  it('ends the meter well below where it started, not above it', () => {
    // WAS: 27.48 -> peak 48.60 -> 39.57 at the cap. Warmth ROSE through two
    // minutes of contempt and finished twelve points up.
    const last = steps[steps.length - 1]!
    expect(last.warmth).toBeLessThan(maya.trajectory.start)
  })

  it('commits to leaving when he tells her to go', () => {
    // WAS: she said "Enjoy your Sunday", then answered two more turns, and the
    // rep ended on the three-minute clock with both of them still in it.
    expect(step('Just fuck off.').exit).toBe('wrapping')
    expect(session.sceneExit).not.toBe('present')
  })

  it('does not argue with the exit it has committed to', () => {
    // `wantClauses` at warmth 20-59 shipped "You are not going yet." as the
    // last system message before every generation.
    const line = session.statelessDirective()
    expect(line).not.toContain('not going yet')
    expect(line.toLowerCase()).toMatch(/wind it up|last line/)
  })

  it('gives her one line to go out on, and does not swallow it with silence', () => {
    // A character who vanishes mid-conversation is a dropped connection.
    expect(session.staysSilent).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * The opener — sessions 1ddd3326 and 22e37e39, Maya, 9 Sep 22:16 / 22:13
 * ------------------------------------------------------------------ */

describe('the bare hello', () => {
  const { session, steps } = replay(maya, [['user', 'Hello.']])

  it('reads it as a greeting rather than as a failure to speak', () => {
    expect(steps[0]!.kind).toBe('greeting')
    expect(steps[0]!.raw).toBe(0)
  })

  it('leaves her room for a greeting and no room for an observation', () => {
    // WAS: a six-word runtime cap, which `mirrorCapFor` raised to the band's
    // typical on the one turn it most obviously applied to — so "Hello." bought
    // exactly as many words as a real sentence would have.
    expect(session.replyWordCap).toBeLessThanOrEqual(4)
    expect(session.replySentenceCap).toBe(1)
  })

  it('tells her what a greeting is answered with', () => {
    // Nothing anywhere said. The band said "Answer only what he asked", he had
    // asked nothing, and the sentence had no referent — so what filled the
    // vacuum was the next most recent instruction, which was her mood. Both
    // stored openers surfaced it: "Not a bad morning for sitting still." and
    // "The place is noisier than I wanted."
    const line = session.statelessDirective()
    expect(line).toContain('only said hello')
  })

  it('does not hand her an agenda to talk about on her first line', () => {
    expect(session.statelessDirective()).not.toContain('rather be')
  })
})

/* ------------------------------------------------------------------ *
 * The undone farewell — session 29ad83c1, Nadia, 9 Sep 22:05
 * ------------------------------------------------------------------ */

describe('the undone farewell', () => {
  it('does not reopen a conversation he has ended', () => {
    // WAS: she said she had better check on the present, he said "OK then, let
    // us...", and she came back with "Pabat, what's your secret talent besides
    // sneaky sales pitches?" — a fresh question after a goodbye, because
    // `closingHandover` is a one-shot and ordinary steering resumed.
    const { session } = replay(nadia, [
      ['user', 'What are you looking for?'],
      ['agent', 'Present for my sister. No idea yet.'],
      ['user', 'I should get going, it was nice talking to you.'],
    ])
    expect(session.sceneExit).toBe('wrapping')
    const line = session.statelessDirective()
    expect(line).not.toContain('not going yet')
    expect(line).not.toContain('You may start a topic')
  })

  it('does not read an opening pleasantry as a goodbye', () => {
    // The other direction, and the expensive one: ending a rep on turn two
    // costs the user their three minutes and one of the reps they paid for.
    const { session } = replay(nadia, [['user', 'Hi, nice to meet you.']])
    expect(session.sceneExit).toBe('present')
  })
})

/* ------------------------------------------------------------------ *
 * The nervous beginner, who the meter used to punish hardest
 * ------------------------------------------------------------------ */

describe('the nervous beginner', () => {
  it('pays for short questions instead of charging for them', () => {
    // WAS: "What's up?" and "How come?" were each charged -6 as dead ends AND
    // paid +3 as open questions. The same turn, scored twice, in opposite
    // directions — and the two best moves a nervous beginner makes.
    const { steps } = replay(maya, [
      ['user', 'Hello.'],
      ['agent', 'Hey.'],
      ['user', "What's up?"],
      ['agent', 'Not much. Avoiding my flat.'],
      ['user', 'How come?'],
    ])
    for (const entry of steps.slice(1)) {
      expect(entry.kind, entry.text).toBe('question')
      expect(entry.raw, entry.text).toBeGreaterThan(0)
    }
  })

  it('still lets her visibly withdraw when he stops participating', () => {
    // The mechanic must survive the fix: non-participation is the signal the
    // product exists to teach him to read, and it is still charged.
    const { steps, session } = replay(maya, [
      ['user', 'Hello.'],
      ['agent', 'Hey.'],
      ['user', 'Mhm.'],
      ['agent', 'Right.'],
      ['user', 'Mm.'],
    ])
    expect(steps[1]!.kind).toBe('acknowledgement')
    expect(steps[1]!.raw).toBeLessThan(0)
    expect(steps[2]!.raw).toBeLessThan(steps[1]!.raw)
    expect(session.engine.warmth).toBeLessThan(maya.trajectory.start)
  })

  it('does not charge him for answering her question in two words', () => {
    // "Yeah." after she asked something is him participating. It cost -6.
    const { steps } = replay(maya, [
      ['user', 'Hello.'],
      ['agent', 'Hey. Do you come here a lot?'],
      ['user', 'Yeah.'],
    ])
    expect(steps[1]!.kind).toBe('answer')
    expect(steps[1]!.raw).toBe(0)
  })
})
