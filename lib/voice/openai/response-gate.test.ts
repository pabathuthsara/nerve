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
import { DEFAULT_STALL_MS, OpenAIResponseGate } from './response-gate'
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

  it('takes the turn again for a line the user never heard', () => {
    const h = gate()
    expect(h.instance.requestRepeat()).toBe(true)
    expect(h.created).toHaveLength(1)
    expect(h.instance.busy).toBe(true)
  })

  it('declines a repeat while a response is generating', () => {
    const h = gate()
    h.instance.userTurnCommitted()
    expect(h.instance.requestRepeat()).toBe(false)
    // The reply in flight is untouched; nothing extra was created.
    expect(h.created).toHaveLength(1)
  })

  it('declines a repeat when a real turn is already waiting', () => {
    // The user has spoken again. The moment the repeat belonged to is gone,
    // and answering the older line first would put her two turns behind.
    const h = gate()
    h.instance.userTurnCommitted()
    h.instance.userTurnCommitted()
    expect(h.instance.hasPending).toBe(true)

    h.instance.responseSettled()
    expect(h.created).toHaveLength(2)
    expect(h.instance.requestRepeat()).toBe(false)
    expect(h.created).toHaveLength(2)
  })

  it('arms the watchdog for a repeat, so one that never settles cannot wedge', () => {
    const h = gate({ stallMs: 12_000 })
    h.instance.requestRepeat()
    h.advance(12_000)
    expect(h.stalls).toHaveLength(1)
    expect(h.instance.busy).toBe(false)
  })

  it('does not sit on a repeat for the warmth beat', () => {
    // `startResponse` pauses before she answers. A repeat is her finishing
    // something she already started, so it goes immediately.
    const created: number[] = []
    const instance = new OpenAIResponseGate(() => created.push(1), {
      delayMs: () => 900,
    })
    instance.requestRepeat()
    expect(created).toHaveLength(1)
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

describe('the beat before she answers', () => {
  /** A gate with controllable timers, so the pause is deterministic. */
  function gated(delay: number) {
    const created: number[] = []
    const timers: { fn: () => void; ms: number; id: number }[] = []
    let nextId = 1
    const gate = new OpenAIResponseGate(() => created.push(created.length), {
      delayMs: () => delay,
      setTimer: (fn, ms) => {
        const id = nextId++
        timers.push({ fn, ms, id })
        return id
      },
      clearTimer: (handle) => {
        const index = timers.findIndex((timer) => timer.id === handle)
        if (index >= 0) timers.splice(index, 1)
      },
    })
    return {
      gate,
      created,
      /** Fire every pending timer shorter than the stall watchdog. */
      runPause: () => {
        for (const timer of [...timers]) {
          if (timer.ms >= DEFAULT_STALL_MS) continue
          const index = timers.findIndex((t) => t.id === timer.id)
          if (index >= 0) timers.splice(index, 1)
          timer.fn()
        }
      },
    }
  }

  it('holds the reply for the beat, then sends it', () => {
    const { gate, created, runPause } = gated(600)
    gate.userTurnCommitted()
    expect(created).toHaveLength(0)
    runPause()
    expect(created).toHaveLength(1)
  })

  it('looks busy for the whole pause, so a second turn cannot race it', () => {
    // The safety argument for the whole feature: `inFlight` is set BEFORE the
    // pause, so a turn arriving during it coalesces exactly as one arriving
    // mid-generation would. A delay must never be able to produce two replies.
    const { gate, created, runPause } = gated(600)
    expect(gate.userTurnCommitted()).toBe('created')
    expect(gate.userTurnCommitted()).toBe('queued')
    expect(gate.busy).toBe(true)
    runPause()
    expect(created).toHaveLength(1)
  })

  it('answers immediately when she is warm enough not to pause', () => {
    const { gate, created } = gated(0)
    gate.userTurnCommitted()
    expect(created).toHaveLength(1)
  })

  it('drops a pause that a reset overtook', () => {
    // The turn belongs to whatever is happening now, not to a timer from
    // before — a stall or a phantom cancel released the gate mid-pause.
    const { gate, created, runPause } = gated(600)
    gate.userTurnCommitted()
    gate.reset()
    runPause()
    expect(created).toHaveLength(0)
  })
})

/**
 * Holding a line the user never heard, so a repeat can replace it.
 *
 * The recovery's whole safety argument is that a held turn is never lost: it
 * is dropped only once something has actually arrived to stand in its place,
 * and released back into the transcript on every other path. These cover the
 * paths, because the failure they guard against is silent — a line vanishing
 * from a transcript nobody is comparing against the audio.
 */
describe('holding an unheard turn', () => {
  function harness() {
    const emitter = new VoiceEmitter()
    const turns: TranscriptTurn[] = []
    let clock = 0
    const translator = new OpenAIEventTranslator(
      emitter,
      () => clock,
      (turn) => turns.push(turn),
      {},
    )

    const at = (t: number, payload: Record<string, unknown>) => {
      clock = t
      translator.ingest(JSON.stringify(payload))
    }

    /**
     * One complete reply, from created to sealed.
     *
     * `onSpeechStop` stands in for the adapter's audibility check, which runs
     * on `agent.speech.stop` — emitted from inside the same
     * `output_audio_buffer.stopped` event that seals the turn, and before it.
     * That ordering is what the hold depends on, so the test reproduces it
     * rather than calling the translator directly.
     */
    const reply = (id: string, text: string, t: number, onSpeechStop?: () => void) => {
      at(t, { type: 'response.created', response: { id } })
      at(t + 0.1, { type: 'output_audio_buffer.started' })
      at(t + 0.2, { type: 'response.output_audio_transcript.done', transcript: text })
      const off = onSpeechStop ? emitter.on('agent.speech.stop', onSpeechStop) : null
      at(t + 1.0, { type: 'output_audio_buffer.stopped' })
      off?.()
    }

    return { translator, turns, reply }
  }

  it('keeps the line out of the transcript while a repeat is pending', () => {
    const h = harness()
    h.reply('resp_1', 'Hey.', 1, () => h.translator.holdNextAgentTurn())
    expect(h.turns).toHaveLength(0)
  })

  it('drops the held line once a replacement is committed', () => {
    const h = harness()
    h.reply('resp_1', 'Hey.', 1, () => h.translator.holdNextAgentTurn())
    h.translator.markHeldTurnReplaced()
    expect(h.turns).toHaveLength(0)

    h.reply('resp_2', 'Hey, sorry — hi.', 3)
    // One line in the transcript, and it is the one that was audible.
    expect(h.turns).toHaveLength(1)
    expect(h.turns[0]?.text).toBe('Hey, sorry — hi.')
  })

  it('releases the held line when no repeat was requested after all', () => {
    const h = harness()
    h.reply('resp_1', 'Hey.', 1, () => h.translator.holdNextAgentTurn())
    expect(h.turns).toHaveLength(0)

    // The gate declined — a real user turn was already queued behind it.
    h.translator.releaseHeldAgentTurn()
    expect(h.turns).toHaveLength(1)
    expect(h.turns[0]?.text).toBe('Hey.')
  })

  it('releases a held line when the rep ends before the repeat lands', () => {
    const h = harness()
    h.reply('resp_1', 'Hey.', 1, () => h.translator.holdNextAgentTurn())
    h.translator.markHeldTurnReplaced()
    expect(h.turns).toHaveLength(0)

    h.translator.flush(4)
    expect(h.turns).toHaveLength(1)
    expect(h.turns[0]?.text).toBe('Hey.')
  })

  it('keeps exactly one copy when the repeat is also never heard', () => {
    // One recovery per line, never a chain: the repeat's own turn is committed
    // normally even if it too was inaudible, so the transcript still ends up
    // with what she said rather than nothing.
    const h = harness()
    h.reply('resp_1', 'Hey.', 1, () => h.translator.holdNextAgentTurn())
    h.translator.markHeldTurnReplaced()
    h.reply('resp_2', 'Hey.', 3)
    expect(h.turns).toHaveLength(1)
  })

  it('does not disturb an ordinary turn', () => {
    const h = harness()
    h.reply('resp_1', 'Looking for a present.', 1)
    expect(h.turns).toHaveLength(1)
    expect(h.turns[0]?.text).toBe('Looking for a present.')
  })
})
