/**
 * Regression cover for the round-11 silent deadlock.
 *
 * The failure mode these guard against is the worst one this component can
 * produce: the character stops replying for the rest of the session while
 * every surrounding system — VAD, warmth, steering, the clock — keeps running
 * as though the rep were healthy. Nothing errors. The session just stops
 * answering. It cost a live rep to find, so it gets tests.
 */

import { describe, expect, it, vi } from 'vitest'
import { OpenAIResponseGate } from './response-gate'
import { OpenAIEventTranslator } from './translate'
import { VoiceEmitter } from '../emitter'
import type { TranscriptTurn } from '../types'

describe('OpenAIResponseGate', () => {
  function gate(options: { stallMs?: number } = {}) {
    const created: number[] = []
    const stalls: number[] = []
    let now = 0
    const timers: { fn: () => void; due: number }[] = []

    const instance = new OpenAIResponseGate(() => created.push(now), {
      stallMs: options.stallMs ?? 12_000,
      onStall: () => stalls.push(now),
      setTimer: (fn, ms) => {
        const timer = { fn, due: now + ms }
        timers.push(timer)
        return timer
      },
      clearTimer: (handle) => {
        const index = timers.indexOf(handle as { fn: () => void; due: number })
        if (index >= 0) timers.splice(index, 1)
      },
    })

    return {
      instance,
      created,
      stalls,
      advance(ms: number) {
        now += ms
        for (const timer of [...timers]) {
          if (timer.due > now) continue
          timers.splice(timers.indexOf(timer), 1)
          timer.fn()
        }
      },
    }
  }

  it('creates one response per committed turn', () => {
    const h = gate()
    h.instance.userTurnCommitted()
    h.instance.responseSettled()
    h.instance.userTurnCommitted()
    expect(h.created).toHaveLength(2)
  })

  it('coalesces turns that land while a response is in flight', () => {
    const h = gate()
    h.instance.userTurnCommitted()
    h.instance.userTurnCommitted()
    h.instance.userTurnCommitted()
    expect(h.created).toHaveLength(1)

    h.instance.responseSettled()
    expect(h.created).toHaveLength(2)

    // Three commits collapse to one pending response, not a queue of three.
    h.instance.responseSettled()
    expect(h.created).toHaveLength(2)
  })

  it('releases the gate and reports when a response never settles', () => {
    const h = gate({ stallMs: 12_000 })
    h.instance.userTurnCommitted()
    expect(h.instance.busy).toBe(true)

    h.advance(11_999)
    expect(h.stalls).toHaveLength(0)
    expect(h.instance.busy).toBe(true)

    h.advance(1)
    expect(h.stalls).toHaveLength(1)
    expect(h.instance.busy).toBe(false)
  })

  it('answers the turn that was waiting behind a stalled response', () => {
    const h = gate({ stallMs: 1_000 })
    h.instance.userTurnCommitted()
    h.instance.userTurnCommitted() // coalesced while stuck
    expect(h.created).toHaveLength(1)

    h.advance(1_000)
    expect(h.stalls).toHaveLength(1)
    expect(h.created).toHaveLength(2)
  })

  it('does not fire the watchdog for a response that settled normally', () => {
    const h = gate({ stallMs: 1_000 })
    h.instance.userTurnCommitted()
    h.instance.responseSettled()
    h.advance(10_000)
    expect(h.stalls).toHaveLength(0)
  })

  it('does not fire the watchdog after a reset', () => {
    const h = gate({ stallMs: 1_000 })
    h.instance.userTurnCommitted()
    h.instance.reset()
    h.advance(10_000)
    expect(h.stalls).toHaveLength(0)
    expect(h.instance.busy).toBe(false)
  })
})

describe('response settling', () => {
  function harness() {
    const emitter = new VoiceEmitter()
    const turns: TranscriptTurn[] = []
    let settles = 0
    let clock = 0

    const translator = new OpenAIEventTranslator(
      emitter,
      () => clock,
      (turn) => turns.push(turn),
      { onResponseSettled: () => { settles += 1 } },
    )

    return {
      settles: () => settles,
      at: (t: number, payload: Record<string, unknown>) => {
        clock = t
        translator.ingest(JSON.stringify(payload))
      },
    }
  }

  const withAudio = (status: string) => ({
    type: 'response.done',
    response: {
      id: 'resp_1',
      status,
      output: [{ content: [{ type: 'audio', transcript: 'Hey.' }] }],
    },
  })

  it('settles a cancelled response whose audio never reached the speakers', () => {
    // The live failure: a barge-in over the opening greeting. `response.done`
    // carries audio in its output, but playback never started, so no
    // `output_audio_buffer.stopped` is ever coming.
    const h = harness()
    h.at(0.5, { type: 'response.created', response: { id: 'resp_1' } })
    h.at(1.2, withAudio('cancelled'))
    expect(h.settles()).toBe(1)
  })

  it('settles a failed response that never played', () => {
    const h = harness()
    h.at(0.5, { type: 'response.created', response: { id: 'resp_1' } })
    h.at(1.2, withAudio('failed'))
    expect(h.settles()).toBe(1)
  })

  it('still waits for playback on a completed response — the round-10 race', () => {
    // `response.done` routinely arrives BEFORE `output_audio_buffer.started`.
    // Settling here would let a second response land on top of a reply that is
    // about to speak, which is the fault this ordering was built to prevent.
    const h = harness()
    h.at(0.5, { type: 'response.created', response: { id: 'resp_1' } })
    h.at(1.2, withAudio('completed'))
    expect(h.settles()).toBe(0)

    h.at(1.4, { type: 'output_audio_buffer.started' })
    h.at(3.0, { type: 'output_audio_buffer.stopped' })
    expect(h.settles()).toBe(1)
  })

  it('waits for the clear when a response is cancelled mid-sentence', () => {
    // Playback DID start, so the server will send `cleared`. Settling at
    // response.done would release the gate while she is still audible.
    const h = harness()
    h.at(0.5, { type: 'response.created', response: { id: 'resp_1' } })
    h.at(1.4, { type: 'output_audio_buffer.started' })
    h.at(2.0, withAudio('cancelled'))
    expect(h.settles()).toBe(0)

    h.at(2.1, { type: 'output_audio_buffer.cleared' })
    expect(h.settles()).toBe(1)
  })

  it('settles a cancelled response that emitted transcript but never opened its buffer', () => {
    // The round-11 fix, second pass. `markSpeaking` is reachable from
    // transcript deltas as a compatibility fallback, so a response can look
    // like it started speaking without its audio buffer ever opening — and
    // then no `stopped` or `cleared` is coming. Keying the flag on the
    // transcript delta let this exact sequence deadlock a live rep a second
    // time, at 106s, with the character silent for the remaining 30 seconds.
    const h = harness()
    h.at(0.5, { type: 'response.created', response: { id: 'resp_1' } })
    h.at(0.7, { type: 'response.output_audio_transcript.delta', delta: 'Not so easy,' })
    h.at(0.9, withAudio('cancelled'))
    expect(h.settles()).toBe(1)
  })

  it('settles a response with no audio at all', () => {
    const h = harness()
    h.at(0.5, { type: 'response.created', response: { id: 'resp_1' } })
    h.at(1.2, {
      type: 'response.done',
      response: { id: 'resp_1', status: 'completed', output: [] },
    })
    expect(h.settles()).toBe(1)
  })
})
