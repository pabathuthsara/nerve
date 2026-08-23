/**
 * Round 12 — the echo cascade.
 *
 * One 160.1s Nadia rep produced three counters that could not all be true:
 *
 *   warmth.steeringItemsSent   24   (one per VAD speech-start)
 *   user turns in transcript   19
 *   usage.samples              23   (one per response generated)
 *   agent turns in transcript  19
 *   technical.overlapResponses  5
 *
 * Five VAD triggers were not the user, and four responses were generated,
 * spoken and then deleted from the record. Both symptoms the founder reported
 * live — "she starts saying something then changes and says something else
 * entirely" and "some of her dialogue is not audible" — came out of that gap.
 *
 * These are the regressions. Each one fails against the previous code.
 */

import { describe, expect, it } from 'vitest'
import { VoiceEmitter } from '../emitter'
import { OpenAIEventTranslator } from './translate'
import { OpenAIResponseGate } from './response-gate'
import { echoOverlap, isAgentEcho } from './noise'
import type { PhantomReason } from './noise'
import type { TranscriptTurn } from '../types'

interface Rejection {
  at: number
  reason: PhantomReason
  responseId: string | null
}

function harness(options: { gateBusy?: boolean } = {}) {
  const emitter = new VoiceEmitter()
  const turns: TranscriptTurn[] = []
  const rejections: Rejection[] = []
  const overlaps: (string | null)[] = []
  const doubleTurns: number[] = []
  let clock = 0
  let commits = 0
  let busy = options.gateBusy ?? false

  const translator = new OpenAIEventTranslator(
    emitter,
    () => clock,
    (turn) => turns.push(turn),
    {
      onOverlap: (id) => overlaps.push(id),
      onDoubleTurn: (at) => doubleTurns.push(at),
      onUserTurnCommitted: () => {
        commits += 1
        return busy ? ('queued' as const) : ('created' as const)
      },
      onPhantomTurn: (at, reason, responseId) => rejections.push({ at, reason, responseId }),
    },
  )

  return {
    turns,
    rejections,
    overlaps,
    doubleTurns,
    commits: () => commits,
    setBusy: (value: boolean) => { busy = value },
    at(t: number, payload: Record<string, unknown>) {
      clock = t
      translator.ingest(JSON.stringify(payload))
    },
  }
}

describe('echo overlap scoring', () => {
  it('scores a clipped fragment of her turn as a near-total match', () => {
    // VAD clips the echo at both ends, so it is a SUBSET of what she said.
    // A symmetric similarity would divide by her full length and miss this.
    expect(echoOverlap('history and gardening stuff', "She's into history and gardening stuff."))
      .toBeGreaterThan(0.9)
  })

  it('does not treat a shared stopword as evidence', () => {
    expect(echoOverlap('yeah', 'Yeah, but I do not work here, Bob.')).toBe(0)
  })

  it('leaves a genuine callback alone when it lands outside her playback', () => {
    // "non-fiction, huh? OK." is the user echoing HER word back at her. That is
    // a callback, which the fast scorer rewards — suppressing it would punish
    // exactly the behaviour the product is teaching.
    expect(
      isAgentEcho({
        text: 'non-fiction, huh? OK.',
        agentText: 'Mostly crime novels, some non-fiction.',
        duringAgentSpeech: false,
      }),
    ).toBe(false)
  })

  it('catches her own sentence coming back during playback', () => {
    expect(
      isAgentEcho({
        text: 'looking for a gift for my sister',
        agentText: 'Looking for a gift, for my sister.',
        duringAgentSpeech: true,
      }),
    ).toBe(true)
  })

  it('has nothing to compare against before she has spoken', () => {
    expect(isAgentEcho({ text: 'Hello.', agentText: null, duringAgentSpeech: false })).toBe(false)
  })
})

describe('a phantom turn queued behind a real reply', () => {
  /**
   * THE ROUND-12 FAULT, reproduced.
   *
   * She is mid-reply. Her voice reaches the microphone, server VAD commits it,
   * and the gate coalesces that commit into `pending` — so the phantom owns NO
   * response of its own. The old code cancelled `activeResponseId` anyway,
   * which here is the reply the user is listening to.
   */
  function playingReplyWhenEchoArrives() {
    const h = harness()
    h.at(0.5, { type: 'input_audio_buffer.speech_started' })
    h.at(2.0, { type: 'input_audio_buffer.speech_stopped' })
    h.at(2.1, { type: 'input_audio_buffer.committed' })
    h.at(2.2, { type: 'response.created', response: { id: 'resp_real' } })
    h.at(2.3, {
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'What are you doing here?',
    })
    h.at(2.6, { type: 'output_audio_buffer.started' })
    // Her transcript streams while she speaks, which is what the echo has to be
    // matched against — it reaches the microphone mid-utterance, long before
    // the turn seals.
    h.at(2.8, {
      type: 'response.output_audio_transcript.delta',
      delta: 'Looking for a gift, for my sister.',
    })

    // Her voice, back in through the microphone, entirely inside her playback.
    h.setBusy(true)
    h.at(3.0, { type: 'input_audio_buffer.speech_started' })
    h.at(3.9, { type: 'input_audio_buffer.speech_stopped' })
    h.at(4.0, { type: 'input_audio_buffer.committed' })
    h.at(4.2, {
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'looking for a gift for my sister',
    })
    return h
  }

  it('reports no owned response, so the reply in flight is never cancelled', () => {
    const h = playingReplyWhenEchoArrives()
    expect(h.rejections).toHaveLength(1)
    expect(h.rejections[0]!.reason).toBe('agent-echo')
    // The load-bearing assertion. `resp_real` here is what truncated her
    // mid-word and produced "she starts saying something then changes".
    expect(h.rejections[0]!.responseId).toBeNull()
  })

  it('keeps the echo out of the transcript entirely', () => {
    const h = playingReplyWhenEchoArrives()
    expect(h.turns.filter((t) => t.speaker === 'user').map((t) => t.text)).toEqual([
      'What are you doing here?',
    ])
  })
})

describe('a phantom turn that created its own response', () => {
  it('names that response so the adapter can cancel the right one', () => {
    const h = harness()
    h.at(1.0, { type: 'input_audio_buffer.speech_started' })
    h.at(1.6, { type: 'input_audio_buffer.speech_stopped' })
    h.at(1.7, { type: 'input_audio_buffer.committed' })
    h.at(1.8, { type: 'response.created', response: { id: 'resp_phantom' } })
    h.at(2.0, { type: 'conversation.item.input_audio_transcription.completed', transcript: '啊。' })

    expect(h.rejections).toEqual([{ at: 2.0, reason: 'no-latin', responseId: 'resp_phantom' }])
  })

  it('defers the verdict when the response id has not arrived yet', () => {
    const h = harness()
    h.at(1.0, { type: 'input_audio_buffer.speech_started' })
    h.at(1.6, { type: 'input_audio_buffer.speech_stopped' })
    h.at(1.7, { type: 'input_audio_buffer.committed' })
    // Transcription beats `response.created` back. Acting now would mean a
    // cancel with no id, which cancels whatever the server is generating.
    h.at(1.9, { type: 'conversation.item.input_audio_transcription.completed', transcript: '啊。' })
    expect(h.rejections).toHaveLength(0)

    h.at(2.0, { type: 'response.created', response: { id: 'resp_late' } })
    expect(h.rejections).toEqual([{ at: 1.9, reason: 'no-latin', responseId: 'resp_late' }])
  })
})

describe('speech that overlaps only one end of her turn', () => {
  it('survives, because talking over her is a real turn', () => {
    const h = harness()
    // She is speaking; he starts over her and carries on after she stops.
    h.at(1.0, { type: 'output_audio_buffer.started' })
    h.at(2.0, { type: 'input_audio_buffer.speech_started' })
    h.at(2.5, { type: 'response.output_audio_transcript.done', transcript: 'Maybe, if they are good.' })
    h.at(2.6, { type: 'output_audio_buffer.stopped' })
    h.at(3.5, { type: 'input_audio_buffer.speech_stopped' })
    h.at(3.6, { type: 'input_audio_buffer.committed' })
    h.at(3.8, {
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Maybe, but are they good though?',
    })

    expect(h.rejections).toHaveLength(0)
    expect(h.turns.some((t) => t.speaker === 'user')).toBe(true)
  })
})

describe('the response gate undo', () => {
  it('drops a queued turn without disturbing the one in flight', () => {
    const created: number[] = []
    const gate = new OpenAIResponseGate(() => created.push(created.length), {
      setTimer: () => null,
      clearTimer: () => undefined,
    })

    expect(gate.userTurnCommitted()).toBe('created')
    expect(gate.userTurnCommitted()).toBe('queued')
    expect(created).toHaveLength(1)

    // The queued turn was echo. Drop it — and leave the reply playing.
    gate.cancelPending()
    expect(gate.busy).toBe(true)

    // When the real reply settles, nothing spurious follows it.
    gate.responseSettled()
    expect(created).toHaveLength(1)
    expect(gate.busy).toBe(false)
  })

  it('still answers a real turn that was queued', () => {
    const created: number[] = []
    const gate = new OpenAIResponseGate(() => created.push(created.length), {
      setTimer: () => null,
      clearTimer: () => undefined,
    })
    gate.userTurnCommitted()
    gate.userTurnCommitted()
    gate.responseSettled()
    expect(created).toHaveLength(2)
  })
})
