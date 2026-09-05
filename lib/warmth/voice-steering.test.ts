import { describe, expect, it, vi } from 'vitest'
import { bindVoiceSteering } from './voice-steering'
import { WarmthSession } from './session'
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
    expect(read().steering).toBe(fresh.steering)
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
