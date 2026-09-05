import { describe, expect, it, vi } from 'vitest'
import { bindVoiceSteering } from './voice-steering'
import { STEER_HEARTBEAT_TURNS, WarmthSession } from './session'
import { nadia } from '@/lib/personas/nadia'
import type { VoiceProvider } from '@/lib/voice/provider'

describe('shared customer and preview steering', () => {
  it('reads current scores and live persona sliders only at reply time', () => {
    let persona = { ...nadia, trajectory: { ...nadia.trajectory, startJitter: 0 } }
    const session = new WarmthSession({ persona: () => persona, trajectory: () => persona.trajectory, scorer: null, nowSeconds: () => 0 })
    let read!: () => { steering: string; warmth: number }
    const on = vi.fn(), reinforce = vi.fn()
    bindVoiceSteering({ setReplyState: (reader: () => { steering: string; warmth: number }) => { read = reader }, on, reinforce } as unknown as VoiceProvider, session)
    expect(session.steeringItemsSent).toBe(0)
    expect(read().warmth).toBe(32)
    session.onUserTurn({ speaker: 'user', text: 'What do you like about that book?', t_start: 1, t_end: 3 })
    persona = { ...persona, personality: { ...persona.personality, expression: 'earnest' } }
    const fresh = read()
    expect(fresh.warmth).toBeGreaterThan(32)
    expect(fresh.steering).toContain('Straight, no irony.')
    expect(on).not.toHaveBeenCalled()
    expect(reinforce).not.toHaveBeenCalled()
    session.dispose()
  })

  it('preserves change detection for a provider that retains its instructions', () => {
    const session = new WarmthSession({ persona: nadia, trajectory: { ...nadia.trajectory, startJitter: 0 }, scorer: null, nowSeconds: () => 0 })
    let onset!: () => void
    const reinforce = vi.fn()
    bindVoiceSteering({ on: (event: string, callback: () => void) => { expect(event).toBe('user.speech.start'); onset = callback }, reinforce } as unknown as VoiceProvider, session)
    onset(); onset(); onset(); onset()
    expect(reinforce).toHaveBeenCalledOnce()
    onset()
    expect(reinforce).toHaveBeenCalledTimes(2)
    session.dispose()
  })
})

describe('a directive for a provider that keeps nothing', () => {
  const sessionFor = (persona = nadia) => new WarmthSession({
    persona,
    trajectory: { ...persona.trajectory, startJitter: 0 },
    scorer: null,
    nowSeconds: () => 0,
  })

  it('ships the band every turn and rations the agenda to the new ones', () => {
    const session = sessionFor()

    const fresh = session.statelessDirective()
    expect(fresh).toContain('rather be left alone with the shelf')

    const repeat = session.statelessDirective()
    // Her agenda is not restated immediately before every single reply. That
    // is what took Nadia's retreat rate from 17.4% of turns to 45.8%.
    expect(repeat).not.toContain('rather be')

    // But the band survives, because nothing else owns reply length and a
    // stateless request carries no memory of the last one.
    const band = fresh.slice(1, fresh.indexOf('.') + 1)
    expect(band.length).toBeGreaterThan(0)
    expect(repeat).toContain(band)
    session.dispose()
  })

  it('brings the agenda back on the heartbeat', () => {
    const session = sessionFor()
    session.statelessDirective()
    for (let turn = 1; turn < STEER_HEARTBEAT_TURNS; turn += 1) {
      expect(session.statelessDirective()).not.toContain('rather be')
    }
    expect(session.statelessDirective()).toContain('rather be')
    session.dispose()
  })

  it('hands the closing turn to the decision alone, for one turn', () => {
    const session = sessionFor()
    expect(session.statelessDirective()).not.toBe('')

    session.handOverToClosing()
    // Nothing at all, so the number offer is the only instruction she has.
    expect(session.statelessDirective()).toBe('')
    // And only that turn: she gets her band back afterwards.
    expect(session.statelessDirective()).not.toBe('')
    session.dispose()
  })

  it('stands the retained-instruction path down for the closing turn too', () => {
    let persona = { ...nadia, trajectory: { ...nadia.trajectory, startJitter: 0 } }
    const session = new WarmthSession({
      persona: () => persona,
      trajectory: () => persona.trajectory,
      scorer: null,
      nowSeconds: () => 0,
    })
    expect(session.directiveIfChanged()).not.toBeNull()

    // A line that would otherwise be sent, because it genuinely changed.
    persona = { ...persona, personality: { ...persona.personality, expression: 'earnest' } }
    session.handOverToClosing()
    expect(session.directiveIfChanged()).toBeNull()
    expect(session.directiveIfChanged()).not.toBeNull()
    session.dispose()
  })
})
