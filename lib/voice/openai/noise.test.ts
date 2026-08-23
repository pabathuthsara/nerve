/**
 * Phantom turn and response-gate tests.
 *
 * Written from the round-10 session JSON: every phantom below is a transcript
 * the live sessions actually produced, and the race test reproduces the event
 * ordering that made her start one sentence and finish another.
 */

import { describe, expect, it, vi } from 'vitest'

import { classifyPhantom } from './noise'
import { OpenAIEventTranslator } from './translate'
import { VoiceEmitter } from '../emitter'
import type { TranscriptTurn } from '../types'

describe('phantom turns', () => {
  /** Verbatim from the four round-10 reps. All six were noise. */
  const FROM_ROUND_10 = ['好。', 'อ่า เนาะ', 'ヘイレ', '啊。', '什拉卡姆斯', 'في يوسف']

  it('catches every phantom the live sessions produced', () => {
    for (const text of FROM_ROUND_10) {
      expect(classifyPhantom({ text, speechSeconds: 1.2 }).phantom, text).toBe(true)
    }
  })

  it('catches a sub-quarter-second utterance whatever it says', () => {
    // "ヘイレ" arrived on 0.12 seconds of audio. Nothing said that fast is a turn.
    expect(classifyPhantom({ text: 'hey', speechSeconds: 0.12 }))
      .toMatchObject({ phantom: true, reason: 'too-short' })
  })

  it('catches a transcript that is only a sound', () => {
    for (const text of ['uh', 'um', 'mm', 'Ah.', 'erm', '  uh…  ']) {
      expect(classifyPhantom({ text, speechSeconds: 1 }).phantom, text).toBe(true)
    }
  })

  it('never suppresses a real turn, however badly heard', () => {
    // Round 6's ASR turned "Sherlock Holmes" into "cello combs". That is a real
    // turn poorly transcribed, and punishing it is worse than accepting it.
    const real = [
      'Hello.',
      'Yeah, maybe.',
      'cello combs',
      'An afraid?',
      "Uh, not really. Have you found anything good?",
      'So,',
      'definitely',
      "I'm pretty sure I can handle it.",
      'Really? I want what I want.',
    ]
    for (const text of real) {
      expect(classifyPhantom({ text, speechSeconds: 1.5 }).phantom, text).toBe(false)
    }
  })

  it('keeps hesitation that is part of a sentence', () => {
    // The fast scorer measures fillers; only a transcript that is NOTHING but a
    // filler is noise.
    expect(classifyPhantom({ text: 'uh, not really', speechSeconds: 1.5 }).phantom).toBe(false)
    expect(classifyPhantom({ text: 'I mean, um, maybe', speechSeconds: 2 }).phantom).toBe(false)
  })

  it('treats an unknown duration as no evidence, not as noise', () => {
    expect(classifyPhantom({ text: 'Hello.', speechSeconds: null }).phantom).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * The response gate
 * ------------------------------------------------------------------ */

function harness() {
  const emitter = new VoiceEmitter()
  const turns: TranscriptTurn[] = []
  const settled = vi.fn()
  const overlap = vi.fn()
  const phantom = vi.fn()
  let clock = 0

  const translator = new OpenAIEventTranslator(
    emitter,
    () => clock,
    (turn) => turns.push(turn),
    { onResponseSettled: settled, onOverlap: overlap, onPhantomTurn: phantom },
  )

  const send = (event: Record<string, unknown>, at?: number) => {
    if (at !== undefined) clock = at
    translator.ingest(JSON.stringify(event))
  }

  /** A response.done carrying spoken audio, as the provider sends it. */
  const doneWithAudio = (id: string) => ({
    type: 'response.done',
    response: {
      id,
      usage: { total_tokens: 100 },
      output: [{ content: [{ type: 'audio' }] }],
    },
  })

  return { send, turns, settled, overlap, phantom, translator, doneWithAudio }
}

describe('the response gate', () => {
  it('does not settle a reply whose audio has not started yet', () => {
    // THE ROUND-10 RACE. `response.done` arrives before
    // `output_audio_buffer.started`, so "she is not audible" was being read as
    // "she has finished". The gate released, a second response.create landed on
    // top, and the overlap guard cancelled one of the two — which is why she
    // began one sentence and finished another, and why some turns got no reply.
    const h = harness()
    h.send({ type: 'response.created', response: { id: 'resp_1' } }, 1)
    h.send(h.doneWithAudio('resp_1'), 2)
    expect(h.settled).not.toHaveBeenCalled()

    h.send({ type: 'output_audio_buffer.started' }, 2.4)
    h.send({ type: 'output_audio_buffer.stopped' }, 5)
    expect(h.settled).toHaveBeenCalledTimes(1)
  })

  it('settles a reply that will never speak, so the gate cannot deadlock', () => {
    // A bare function call has no audio; nothing else would ever settle it.
    const h = harness()
    h.send({ type: 'response.created', response: { id: 'resp_1' } }, 1)
    h.send({
      type: 'response.done',
      response: { id: 'resp_1', usage: { total_tokens: 5 }, output: [] },
    }, 2)
    expect(h.settled).toHaveBeenCalledTimes(1)
  })

  it('settles when playback finished before generation reported done', () => {
    const h = harness()
    h.send({ type: 'response.created', response: { id: 'resp_1' } }, 1)
    h.send({ type: 'output_audio_buffer.started' }, 2)
    h.send({ type: 'output_audio_buffer.stopped' }, 4)
    h.send(h.doneWithAudio('resp_1'), 4.2)
    expect(h.settled).toHaveBeenCalledTimes(1)
  })

  it('keeps a phantom turn out of the transcript and flags the reply', () => {
    const h = harness()
    h.send({ type: 'response.created', response: { id: 'resp_1' } }, 1)
    h.send({ type: 'input_audio_buffer.speech_started' }, 10)
    h.send({ type: 'input_audio_buffer.speech_stopped' }, 11.2)
    h.send({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: '什拉卡姆斯',
    }, 11.5)

    expect(h.turns).toHaveLength(0)
    expect(h.phantom).toHaveBeenCalledTimes(1)
    expect(h.phantom.mock.calls[0]?.[1]).toBe('no-latin')
  })

  it('lets a real turn through untouched', () => {
    const h = harness()
    h.send({ type: 'input_audio_buffer.speech_started' }, 10)
    h.send({ type: 'input_audio_buffer.speech_stopped' }, 12 )
    h.send({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'What are you doing here?',
    }, 12.3)

    expect(h.phantom).not.toHaveBeenCalled()
    expect(h.turns).toHaveLength(1)
    expect(h.turns[0]).toMatchObject({ speaker: 'user', text: 'What are you doing here?' })
  })
})
