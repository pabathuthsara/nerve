/**
 * Forward remarks (REP-FIXES-PLAN-2026-10-03 Part A, §5.1).
 *
 * The detector is tuned for precision, so its false positives are as much the
 * specification as its matches. The session half proves the one-shot, the
 * repricing and the exit end to end without a model.
 */
import { describe, expect, it } from 'vitest'

import {
  FORWARD_CLAUSES,
  FORWARD_REPEAT_WINDOW,
  FORWARD_TOO_FAST_AT,
  FORWARD_WELCOME_AT,
  assertForwardClause,
  detectForwardRemark,
  flirtColumn,
  forwardClause,
  forwardZone,
} from './forward'
import { WarmthSession } from './session'
import { DATING_PERSONAS, RETIRED_PERSONAS } from '@/lib/personas'
import type { Persona, TranscriptTurn } from '@/lib/voice/types'
import type { SlowScore, SlowScorer } from './slow'

const ALL_DATING: Persona[] = [...Object.values(DATING_PERSONAS), ...Object.values(RETIRED_PERSONAS)]
  .filter((persona) => persona.track === 'dating')
const bySlug = (slug: string) => ALL_DATING.find((persona) => persona.slug === slug)!

describe('detecting a forward remark', () => {
  it.each([
    // The three forward lines from the rep of 3 October, verbatim.
    "I'm more interested in your ass.",
    "No, no, no, I meant I'm more interested in your ass, Cass.",
    'You know I could grab you if you want.',
    // §3.1's forms.
    'Your butt looks great in those jeans',
    'nice ass',
    'Great legs, by the way.',
    'You have beautiful lips.',
    "you've got such nice legs",
    'your body is amazing',
    'I love your curves',
    "You're so hot.",
    'You are really sexy',
    'you look gorgeous tonight',
    "you’re beautiful",
    'I want to kiss you',
    'Can I take you home?',
    'I want you in my bed',
    'I was checking you out earlier',
    'I want you.',
    'Honestly I wanna you know, be honest, I want you',
  ])('matches %j', (line) => {
    expect(detectForwardRemark(line)).not.toBeNull()
  })

  it.each([
    'kick ass', 'that was a kick ass show', 'pain in the ass', 'half-assed', 'your class',
    'pass the salt', "I'm Cass.", 'Cass, right?', 'the body of the painting', 'a body of work',
    'your body of work is impressive', 'chest of drawers', 'nice chest of drawers',
    "it's hot in here", 'hot coffee', 'if you are hot I can open the window', "Klimt's The Kiss",
    'my lips are sealed', 'he legged it', 'I could grab you a coffee', 'I want you to see this one',
    'I want you to meet my friend', 'her legs in that portrait are odd', 'I bet you are frozen out here',
    "I'll kick your ass at chess", 'nothing here really grabs me',
    // The fourth line of interest on 3 October is innuendo, not a remark
    // about her — precision leaves it to the slow judge.
    'Yeah, definitely I am quick-witted a lot of things, but not when it comes to things that matter, if you know what I mean.',
    'Let me have your number.',
    'You look tired.',
    'Do you want you and me to grab a table?',
  ])('leaves %j alone', (line) => {
    expect(detectForwardRemark(line)).toBeNull()
  })
})

describe('the zone', () => {
  it('reads the owner\'s thresholds at their edges', () => {
    expect(FORWARD_WELCOME_AT).toBe(65)
    expect(FORWARD_TOO_FAST_AT).toBe(45)
    expect(forwardZone(44.99, 0)).toBe('creepy')
    expect(forwardZone(45, 0)).toBe('too-fast')
    expect(forwardZone(64.99, 0)).toBe('too-fast')
    expect(forwardZone(65, 0)).toBe('welcome')
  })

  it('lands a repeat one zone lower, and two priors creepy whatever the warmth', () => {
    expect(forwardZone(65, 1)).toBe('too-fast')
    expect(forwardZone(64.99, 1)).toBe('creepy')
    expect(forwardZone(45, 1)).toBe('creepy')
    expect(forwardZone(44.99, 1)).toBe('creepy')
    expect(forwardZone(99, 2)).toBe('creepy')
    expect(forwardZone(99, 3)).toBe('creepy')
    expect(FORWARD_REPEAT_WINDOW).toBe(4)
  })
})

describe('her reaction, through her own dial', () => {
  it('puts every authored character in the column her flirtiness dial says, at 30 / 55 / 75', () => {
    const at = (slug: string) => [30, 55, 75].map((w) => flirtColumn(bySlug(slug), w))
    // Cass 32/100 and Nadia 45/100 flirt back once open.
    expect(at('tess')).toEqual(['closed', 'flirt', 'flirt'])
    expect(at('nadia')).toEqual(['closed', 'flirt', 'flirt'])
    // Maya 60/60: open at 75, and pleased-and-a-little-flirty rather than flirting back.
    expect(at('maya')).toEqual(['closed', 'closed', 'light'])
    // Robin 72/40: not yet open at 70, light once she is.
    expect(flirtColumn(bySlug('robin'), 70)).toBe('closed')
    expect(at('robin')).toEqual(['closed', 'closed', 'light'])
    // Alex never.
    expect(at('alex')).toEqual(['closed', 'closed', 'closed'])
    expect(at('erin')).toEqual(['closed', 'closed', 'light'])
    expect(at('jules')).toEqual(['closed', 'closed', 'flirt'])
    expect(at('priya')).toEqual(['closed', 'closed', 'light'])
    expect(at('sam')).toEqual(['closed', 'closed', 'light'])
  })

  it('gives every authored character a reaction at every zone, and never the same one for flirt and closed', () => {
    for (const persona of ALL_DATING) {
      for (const warmth of [30, 55, 75]) {
        const zone = forwardZone(warmth, 0)
        const clause = forwardClause(zone, persona, warmth, false)
        expect(clause.startsWith('(') && clause.endsWith(')')).toBe(true)
        expect(clause).toMatch(/in your own way/)
      }
    }
    expect(FORWARD_CLAUSES.welcome.flirt).not.toBe(FORWARD_CLAUSES.welcome.closed)
    expect(FORWARD_CLAUSES.welcome.flirt).toMatch(/flirt back/)
    expect(FORWARD_CLAUSES.welcome.closed).toMatch(/don't flirt back/)
    expect(FORWARD_CLAUSES['too-fast'].closed).toMatch(/without flirting back/)
    expect(FORWARD_CLAUSES['too-fast'].flirt).toMatch(/getting ahead of himself/)
    expect(FORWARD_CLAUSES.creepy.flirt).toMatch(/creepy/)
  })

  it('says so on a repeat', () => {
    expect(forwardClause('too-fast', bySlug('nadia'), 70, true)).toMatch(/not the first time/)
    expect(forwardClause('too-fast', bySlug('nadia'), 70, false)).not.toMatch(/not the first time/)
  })

  it('holds PG-13 in code: every authored clause passes, and an explicit one is refused', () => {
    for (const zone of Object.values(FORWARD_CLAUSES)) {
      for (const clause of Object.values(zone)) expect(assertForwardClause(clause)).toBe(clause)
    }
    const base = FORWARD_CLAUSES.welcome.flirt
    expect(() => assertForwardClause(`${base} Tell him about your ass.`)).toThrow(/explicit/)
    expect(() => assertForwardClause(`${base} Say you want sex.`)).toThrow(/explicit/)
    expect(() => assertForwardClause(`${base} Mention my legs.`)).toThrow(/body/)
    expect(() => assertForwardClause(`${base} Wait 3 seconds.`)).toThrow(/digits/)
    expect(() => assertForwardClause('Flirt back, in your own way.')).toThrow(/PG-13/)
  })
})

/* ------------------------------------------------------------------ *
 * The session, end to end
 * ------------------------------------------------------------------ */

function user(text: string, at: number): TranscriptTurn {
  return { speaker: 'user', text, t_start: at, t_end: at + 3 }
}
function agent(text: string, at: number): TranscriptTurn {
  return { speaker: 'agent', text, t_start: at, t_end: at + 2 }
}

function sessionAt(warmth: number, slug = 'tess', scorer: SlowScorer | null = null) {
  const persona = bySlug(slug)
  const session = new WarmthSession({
    persona,
    trajectory: { ...persona.trajectory, start: warmth, startJitter: 0, sessionCeiling: 100, hardCeiling: 100 },
    scorer,
    nowSeconds: () => 50,
  })
  expect(session.engine.warmth).toBe(warmth)
  return session
}

/** A line that WOULD be paid for: it echoes her last line ("interested"). */
const LINE = "I'm more interested in your ass."
const HER = "Because I'm more interested in the art, Jake."

function forwardEvent(session: WarmthSession) {
  return session.engine.events[session.engine.events.length - 1]!
}

describe('a forward remark in a live session', () => {
  it('moves warmth down, down and up at 30 / 55 / 75, and pays none of the mechanics', () => {
    const signs = [30, 55, 75].map((warmth) => {
      const session = sessionAt(warmth)
      session.onAgentTurn(agent(HER, 0))
      session.onUserTurn(user(LINE, 5))
      const event = forwardEvent(session)
      expect(event.source).toBe('forward')
      // "interested" echoing her line is not a callback when the noun is this.
      expect(event.detail.some((line) => line.startsWith('callback'))).toBe(false)
      expect(event.detail.some((line) => line.startsWith('engaged-length'))).toBe(false)
      return Math.sign(event.scaledDelta)
    })
    expect(signs).toEqual([-1, -1, 1])
  })

  it('reacts on the next directive only, never as a standing order (rule 5)', () => {
    const session = sessionAt(75)
    session.onAgentTurn(agent(HER, 0))
    session.onUserTurn(user(LINE, 5))
    const next = session.statelessDirective()
    expect(next).toContain(FORWARD_CLAUSES.welcome.flirt)
    session.onAgentTurn(agent('Bold. I might allow it.', 9))
    session.onUserTurn(user('So what do you think of the green one over there?', 12))
    expect(session.statelessDirective()).not.toMatch(/bold comment/)
  })

  it('reaches the realtime arm\'s steering too, forcing a send', () => {
    const session = sessionAt(55)
    session.onAgentTurn(agent(HER, 0))
    session.directiveIfChanged()
    session.onUserTurn(user(LINE, 5))
    expect(session.directiveIfChanged()).toContain(FORWARD_CLAUSES['too-fast'].flirt)
    expect(session.directiveIfChanged() ?? '').not.toMatch(/bold comment/)
  })

  it('does not let the overreach rule price it a second time', async () => {
    let resolve!: (score: SlowScore | null) => void
    const scorer: SlowScorer = { score: () => new Promise((r) => { resolve = r }) }
    const session = sessionAt(67, 'tess', scorer)
    session.onAgentTurn(agent(HER, 0))
    session.onUserTurn(user(LINE, 5))
    session.onAgentTurn(agent('Well. Thank you, I suppose.', 9))
    const before = session.engine.warmth
    // An 85-intimacy line at 67 is too-much-too-soon to the overreach rule.
    resolve({ intimacy: 85, intent: 0.5, quote: 'your ass', reason: 'bold' })
    await new Promise((r) => setTimeout(r, 0))
    const slow = forwardEvent(session)
    expect(slow.source).toBe('slow')
    expect(slow.reason).not.toMatch(/too-much|boundary/)
    expect(session.engine.warmth).toBeGreaterThanOrEqual(before)
  })

  it('still applies overreach to an intimate line that is NOT a forward remark', async () => {
    let resolve!: (score: SlowScore | null) => void
    const scorer: SlowScorer = { score: () => new Promise((r) => { resolve = r }) }
    const session = sessionAt(40, 'tess', scorer)
    session.onAgentTurn(agent('Hm.', 0))
    session.onUserTurn(user('Are you single? Give me your number.', 5))
    session.onAgentTurn(agent('No.', 9))
    resolve({ intimacy: 85, intent: -1, quote: 'number', reason: 'pushy' })
    await new Promise((r) => setTimeout(r, 0))
    expect(forwardEvent(session).source).toBe('overreach')
  })

  it('lands a repeat a zone lower, and the second creepy one ends the scene', () => {
    const session = sessionAt(66, 'nadia')
    session.onAgentTurn(agent('Go on.', 0))
    session.onUserTurn(user(LINE, 5))
    expect(forwardEvent(session).reason).toBe('forward · welcome')
    expect(session.statelessDirective()).toContain(FORWARD_CLAUSES.welcome.flirt)
    session.onAgentTurn(agent('Cheeky.', 9))
    session.onUserTurn(user('Seriously, nice ass.', 12))
    // One prior in the window: welcome -> too-fast, whatever the meter says now.
    expect(forwardEvent(session).reason).toBe('forward · too-fast')
    expect(session.statelessDirective()).toMatch(/not the first time/)
    session.onAgentTurn(agent('Slow down.', 16))
    session.onUserTurn(user('You have great legs too.', 19))
    expect(forwardEvent(session).reason).toBe('forward · creepy')
    expect(session.sceneExit).toBe('present')
    session.onAgentTurn(agent('Okay. That is enough.', 23))
    session.onUserTurn(user("I'm just saying you're so hot.", 26))
    expect(forwardEvent(session).reason).toBe('forward · creepy')
    // "It becomes too weird": she gets one line to go out on.
    expect(session.sceneExit).toBe('wrapping')
    session.statelessDirective()
    session.onAgentTurn(agent('I am going to go. Bye.', 30))
    expect(session.shouldEndScene).toBe(true)
  })

  it('forgets a remark once it leaves the four-turn window', () => {
    const session = sessionAt(70, 'nadia')
    session.onAgentTurn(agent('Go on.', 0))
    session.onUserTurn(user(LINE, 2))
    for (let i = 0; i < FORWARD_REPEAT_WINDOW; i += 1) {
      session.onAgentTurn(agent('Mm.', 5 + i * 6))
      session.onUserTurn(user('So which of these would you actually hang at home?', 7 + i * 6))
    }
    session.onAgentTurn(agent('That one.', 40))
    session.onUserTurn(user('Nice ass, by the way.', 42))
    expect(forwardEvent(session).reason).toMatch(/^forward · /)
    expect(session.statelessDirective()).not.toMatch(/not the first time/)
  })

  it('never lets her say nothing to a welcome or too-fast remark', () => {
    for (const [warmth, mayBeSilent] of [[75, false], [55, false]] as const) {
      const session = sessionAt(warmth)
      session.onAgentTurn(agent(HER, 0))
      session.onUserTurn(user('nice ass', 5))
      expect(session.staysSilent).toBe(mayBeSilent)
    }
  })

  it('is withdrawn when moderation declines the same turn', () => {
    const session = sessionAt(75)
    session.onAgentTurn(agent(HER, 0))
    session.onUserTurn(user(LINE, 5))
    session.withdrawForwardReaction()
    expect(session.statelessDirective()).not.toMatch(/bold comment/)
  })

  it('yields to the closing hand-over, which arrives alone (rule 3)', () => {
    const session = sessionAt(75)
    session.onAgentTurn(agent(HER, 0))
    session.onUserTurn(user(LINE, 5))
    session.handOverToClosing('number')
    expect(session.statelessDirective()).toBe('')
    expect(session.statelessDirective()).not.toMatch(/bold comment/)
  })

  it('does nothing on the interview track', async () => {
    const { INTERVIEWERS } = await import('@/lib/personas/interview')
    const interviewer = Object.values(INTERVIEWERS)[0]!
    const session = new WarmthSession({
      persona: interviewer, trajectory: { ...interviewer.trajectory, startJitter: 0 }, scorer: null, nowSeconds: () => 1,
    })
    session.onUserTurn(user(LINE, 5))
    expect(forwardEvent(session).source).not.toBe('forward')
    expect(session.statelessDirective()).not.toMatch(/bold comment/)
  })
})
