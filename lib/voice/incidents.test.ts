/**
 * What a rep records about the replies the user never heard.
 *
 * B11's open question was never a missing measurement — the adapter had been
 * computing the inbound packet delta across every silent turn all along and
 * formatting it into a console string. It was a missing *column*. Five reps'
 * worth of the answer went past before anybody noticed the number was read and
 * dropped, so the recording of it gets tests.
 */

import { describe, expect, it } from 'vitest'
import { VoiceEmitter } from './emitter'
import {
  countIncidents,
  emptyIncidents,
  incidentsAreAlarming,
  MAX_UNHEARD_RECORDS,
  type RepIncidents,
} from './incidents'
import type { VoiceProvider } from './provider'

/** `countIncidents` reads nothing but `on`; the rest of the surface is unused. */
function fakeVoice() {
  const emitter = new VoiceEmitter()
  const voice = {
    on: emitter.on.bind(emitter),
  } as unknown as VoiceProvider
  return { emitter, voice }
}

function counted(): {
  emitter: VoiceEmitter
  incidents: RepIncidents
  stop: () => void
} {
  const { emitter, voice } = fakeVoice()
  const { incidents, stop } = countIncidents(voice, () => {})
  return { emitter, incidents, stop }
}

describe('countIncidents', () => {
  it('starts at zero with no unheard turns recorded', () => {
    const empty = emptyIncidents()
    expect(empty.unheard).toBe(0)
    expect(empty.unheardTurns).toEqual([])
  })

  it('records the evidence for a locally measured silent turn', () => {
    const h = counted()
    h.emitter.emit('agent.unheard', {
      at: 5.05,
      peak: 0.00257,
      samples: 48,
      packetDelta: 0,
      recovered: true,
    })

    expect(h.incidents.unheard).toBe(1)
    expect(h.incidents.unheardTurns).toEqual([
      { at: 5.05, peak: 0.00257, samples: 48, packetDelta: 0, recovered: true },
    ])
  })

  it('keeps a zero packet delta rather than losing it to a falsy check', () => {
    // Zero is the finding, not a missing value: it means her audio never left
    // the model. A `packetDelta || null` here would erase the answer.
    const h = counted()
    h.emitter.emit('agent.unheard', { at: 1, peak: 0.0001, samples: 20, packetDelta: 0 })
    expect(h.incidents.unheardTurns[0]?.packetDelta).toBe(0)
  })

  it('stores null when the packet counter could not be read', () => {
    const h = counted()
    h.emitter.emit('agent.unheard', { at: 1, peak: 0.0001, samples: 20, packetDelta: null })
    expect(h.incidents.unheardTurns[0]?.packetDelta).toBeNull()
  })

  it('counts a reply whose buffer never opened without inventing evidence', () => {
    // The provider's own event stream already explains this one, and the
    // adapter measured nothing — so it counts, and records no reading.
    const h = counted()
    h.emitter.emit('agent.unheard', { at: 2.5 })
    expect(h.incidents.unheard).toBe(1)
    expect(h.incidents.unheardTurns).toEqual([])
  })

  it('caps the records without capping the count', () => {
    const h = counted()
    for (let i = 0; i < MAX_UNHEARD_RECORDS + 7; i += 1) {
      h.emitter.emit('agent.unheard', { at: i, peak: 0.0001, samples: 10, packetDelta: 0 })
    }
    expect(h.incidents.unheardTurns).toHaveLength(MAX_UNHEARD_RECORDS)
    expect(h.incidents.unheard).toBe(MAX_UNHEARD_RECORDS + 7)
  })

  it('still counts every other incident', () => {
    const h = counted()
    h.emitter.emit('agent.overlap', { at: 1 })
    h.emitter.emit('agent.double-turn', { at: 2 })
    h.emitter.emit('agent.truncated', { at: 3 })
    h.emitter.emit('user.echo-rejected', { at: 4, overlap: 0.5 })
    h.emitter.emit('agent.tool-leak', { at: 5 })

    expect(h.incidents.overlaps).toBe(1)
    expect(h.incidents.doubleTurns).toBe(1)
    expect(h.incidents.truncated).toBe(1)
    expect(h.incidents.echoRejected).toBe(1)
    expect(h.incidents.toolLeaks).toBe(1)
  })

  it('stops counting once unsubscribed', () => {
    const h = counted()
    h.stop()
    h.emitter.emit('agent.unheard', { at: 1, peak: 0.0001, samples: 10, packetDelta: 0 })
    expect(h.incidents.unheard).toBe(0)
    expect(h.incidents.unheardTurns).toEqual([])
  })
})

describe('incidentsAreAlarming', () => {
  it('is unmoved by the new records', () => {
    // The verdict is a rate over counts and must stay that way; adding
    // evidence to a rep does not make it a worse rep.
    const incidents = emptyIncidents()
    incidents.unheard = 2
    incidents.unheardTurns = [
      { at: 1, peak: 0, samples: 10, packetDelta: 0, recovered: true },
      { at: 2, peak: 0, samples: 10, packetDelta: 0, recovered: true },
    ]
    expect(incidentsAreAlarming(incidents, 20)).toBe(false)

    incidents.unheard = 3
    expect(incidentsAreAlarming(incidents, 20)).toBe(true)
  })
})
