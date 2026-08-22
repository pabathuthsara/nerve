/**
 * The pipeline's own suite.
 *
 * The conformance suite next door proves this adapter satisfies the same
 * interface as the OpenAI one. This proves the parts that only exist here — the
 * ones a managed API used to do for us and now do not.
 *
 * Everything under test is pure. Nothing here opens a microphone, a socket or
 * an AudioContext, which is deliberate: the pieces that decide what gets stored
 * in a transcript must be testable without hardware, or they only get tested by
 * spending credits.
 */

import { describe, expect, it } from 'vitest'

import { nadia } from '../../personas/nadia'
import { DEFAULT_CALIBRATION, resolveSilenceMs } from '../types'
import { ElevenLabsPersonaCompiler, compileDeliveryTags } from './persona'
import { SpokenTurn, proportionalPrefix, snapToWordBoundary } from './truncate'
import { VadDetector, frameRms } from './vad'
import { PipelineMeter, CreditGuard } from './telemetry'
import { shouldFlush, parseAlignment } from './tts'
import { stripSentinel, EXIT_SENTINEL, historyFrom } from './llm'
import {
  AUDITION_LINES,
  auditionCharacterCost,
  auditionFilename,
  briefFor,
  renderDesignPrompt,
} from './design'
import { TTS_MODELS, resolvePipelineConfig, ttsModelSpec } from './config'

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/**
 * The long line she actually said in round 8, with synthetic per-character
 * timing. Even pacing is a simplification; the point of the test is the cut,
 * and uneven pacing would only move where 40% lands.
 */
const LINE = 'Yeah, sometimes it feels like people being sad in nice houses.'
const CLIP_SECONDS = 3.0

function alignmentFor(text: string, seconds: number) {
  const per = seconds / text.length
  return {
    characters: [...text],
    characterStartTimesSeconds: [...text].map((_, i) => i * per),
    characterEndTimesSeconds: [...text].map((_, i) => (i + 1) * per),
  }
}

/* ------------------------------------------------------------------ *
 * Barge-in truncation — the hard part
 * ------------------------------------------------------------------ */

describe('barge-in truncation', () => {
  it('stores only the portion that actually played, cut at 40%', () => {
    const spoken = new SpokenTurn()
    spoken.appendAligned(alignmentFor(LINE, CLIP_SECONDS))

    // The user starts talking 40% of the way through her reply.
    const played = spoken.playedText(CLIP_SECONDS * 0.4)

    expect(spoken.wasTruncated(CLIP_SECONDS * 0.4)).toBe(true)
    expect(LINE.startsWith(played)).toBe(true)
    expect(played.length).toBeLessThan(LINE.length)
    // 40% of this 61-character line lands on character 24, which is the space
    // after "feels" — a clean boundary, so nothing is snapped back.
    expect(played).toBe('Yeah, sometimes it feels')
    // She must never remember the part he did not hear.
    expect(played).not.toContain('sad in nice houses')
  })

  it('never cuts inside a word', () => {
    const spoken = new SpokenTurn()
    spoken.appendAligned(alignmentFor(LINE, CLIP_SECONDS))

    // Every playhead position across the whole clip, at 10ms resolution.
    for (let t = 0; t <= CLIP_SECONDS; t += 0.01) {
      const played = spoken.playedText(t)
      if (played === '') continue
      expect(LINE.startsWith(played)).toBe(true)
      const next = LINE[played.length] ?? ''
      // Either the clip ended, or the next character is not part of the word
      // we stopped on.
      expect(next === '' || !/[\p{L}\p{N}'’-]/u.test(next)).toBe(true)
    }
  })

  it('does not reproduce the round-8 mid-word cut', () => {
    // "Depends, a lot's just sad people in" — a real line from the log, cut
    // where the apostrophe made it worst.
    const line = "Depends, a lot's just sad people in nice houses."
    const spoken = new SpokenTurn()
    spoken.appendAligned(alignmentFor(line, 2.4))

    // A playhead landing inside "lot's".
    const played = spoken.playedText((2.4 / line.length) * 15)
    expect(played).toBe('Depends, a')
    expect(played.endsWith('lot')).toBe(false)
  })

  it('keeps the whole line when playback finished', () => {
    const spoken = new SpokenTurn()
    spoken.appendAligned(alignmentFor(LINE, CLIP_SECONDS))
    expect(spoken.playedText(CLIP_SECONDS)).toBe(LINE)
    expect(spoken.playedText(CLIP_SECONDS + 5)).toBe(LINE)
    expect(spoken.wasTruncated(CLIP_SECONDS)).toBe(false)
  })

  it('stores nothing when the cut lands before a single word left the speaker', () => {
    const spoken = new SpokenTurn()
    spoken.appendAligned(alignmentFor(LINE, CLIP_SECONDS))
    expect(spoken.playedText(0.01)).toBe('')
    expect(spoken.playedText(0)).toBe('')
  })

  it('carries alignment offsets across chunks', () => {
    const spoken = new SpokenTurn()
    spoken.appendAligned(alignmentFor('Yeah, maybe. ', 0.9))
    spoken.appendAligned(alignmentFor('More Tana French.', 1.1))

    expect(spoken.fullText).toBe('Yeah, maybe. More Tana French.')
    expect(spoken.audioSeconds).toBeCloseTo(2.0, 5)
    // A cut inside the second chunk must not resurrect the first chunk's clock.
    expect(spoken.playedText(1.3)).toBe('Yeah, maybe. More')
  })

  it('degrades to a proportional cut when alignment never arrives', () => {
    const spoken = new SpokenTurn()
    spoken.appendUnaligned(LINE, CLIP_SECONDS)

    expect(spoken.hasAlignment).toBe(false)
    const played = spoken.playedText(CLIP_SECONDS * 0.4)
    expect(LINE.startsWith(played)).toBe(true)
    // Same answer as the aligned path here only because the synthetic timing is
    // even. On a real clip these diverge, which is why alignment is preferred.
    expect(played).toBe('Yeah, sometimes it feels')
  })

  it('snaps only when the cut is mid-word', () => {
    expect(snapToWordBoundary('Yeah, mayb', 'e')).toBe('Yeah,')
    expect(snapToWordBoundary('Yeah, maybe', '.')).toBe('Yeah, maybe')
    expect(snapToWordBoundary('Yeah, maybe. ', 'M')).toBe('Yeah, maybe.')
    expect(snapToWordBoundary('Hey', '')).toBe('Hey')
    // Nothing to fall back to: one unfinished word is no words.
    expect(snapToWordBoundary('Yea', 'h')).toBe('')
  })

  it('slices proportionally without inventing characters', () => {
    expect(proportionalPrefix('abcdefghij', 0.5)).toBe('abcde')
    expect(proportionalPrefix('abcdefghij', 0)).toBe('')
    expect(proportionalPrefix('abcdefghij', 2)).toBe('abcdefghij')
  })
})

/* ------------------------------------------------------------------ *
 * Turn-taking
 * ------------------------------------------------------------------ */

describe('our VAD', () => {
  /** Drives the detector with a frame every 20ms, as the capture node does. */
  function run(detector: VadDetector, pattern: { rms: number; ms: number }[]) {
    const events = []
    let t = 0
    for (const segment of pattern) {
      for (let elapsed = 0; elapsed < segment.ms; elapsed += 20) {
        const event = detector.push(segment.rms, t)
        if (event) events.push(event)
        t += 20
      }
    }
    return events
  }

  it('concedes the turn only after the calibrated silence', () => {
    const detector = new VadDetector({ silenceMs: 600 })
    const events = run(detector, [
      { rms: 0.001, ms: 400 },
      { rms: 0.2, ms: 800 },
      { rms: 0.001, ms: 1000 },
    ])

    expect(events.map((event) => event.type)).toEqual(['speech.start', 'speech.stop'])
    const stop = events[1]
    expect(stop?.silenceMs).toBeGreaterThanOrEqual(600)
    expect(stop?.silenceMs).toBeLessThan(700)
  })

  it('does not concede on a mid-sentence pause shorter than the threshold', () => {
    const detector = new VadDetector({ silenceMs: 600 })
    const events = run(detector, [
      { rms: 0.001, ms: 400 },
      { rms: 0.2, ms: 500 },
      // The hesitant speaker this product is built for.
      { rms: 0.001, ms: 400 },
      { rms: 0.2, ms: 500 },
      { rms: 0.001, ms: 800 },
    ])
    expect(events.map((event) => event.type)).toEqual(['speech.start', 'speech.stop'])
  })

  it('fires onset fast enough to be worth calling barge-in', () => {
    const detector = new VadDetector({ silenceMs: 600 })
    const events = run(detector, [
      { rms: 0.001, ms: 400 },
      { rms: 0.3, ms: 300 },
    ])
    const start = events[0]
    expect(start?.type).toBe('speech.start')
    // Onset is believed within ~100ms of the first loud frame, not after the
    // silence window. Nothing else in the pipeline can be that quick.
    expect((start?.atMs ?? 0) - 400).toBeLessThanOrEqual(100)
  })

  it('raises the bar while she is audible, so she cannot barge in on herself', () => {
    const detector = new VadDetector({ silenceMs: 600 })
    run(detector, [{ rms: 0.001, ms: 600 }])
    const open = detector.threshold
    detector.setDucked(true)
    expect(detector.threshold).toBeGreaterThan(open)
  })

  it('lets the Level 5 dial change how hard the floor is to take back', () => {
    const detector = new VadDetector({ silenceMs: 600 })
    detector.setDucked(true)
    const yielding = detector.threshold
    detector.setDuckedActivationRatio(6)
    expect(detector.threshold).toBeGreaterThan(yielding)
  })

  it('measures frame energy', () => {
    expect(frameRms(new Float32Array([0, 0, 0]))).toBe(0)
    expect(frameRms(new Float32Array([1, -1, 1, -1]))).toBe(1)
    expect(frameRms(new Float32Array())).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * Telemetry
 * ------------------------------------------------------------------ */

describe('per-stage telemetry', () => {
  function meter(warn?: (message: string) => void) {
    return new PipelineMeter({
      models: {
        ttsModel: 'eleven_flash_v2_5',
        sttModel: 'gpt-4o-mini-transcribe',
        llmModel: 'gpt-4.1-mini',
      },
      credits: { budget: 10_000, warnAt: 8_000 },
      ...(warn ? { warn } : {}),
    })
  }

  it('reports median and p90 for every stage', () => {
    const m = meter()
    for (const ms of [100, 120, 140, 160, 900]) m.record('ttsFirstByteMs', ms)
    const stages = m.stages()

    expect(stages.ttsFirstByteMs.median).toBe(140)
    expect(stages.ttsFirstByteMs.p90).toBeGreaterThan(140)
    expect(stages.ttsFirstByteMs.count).toBe(5)
    // A stage with no samples reads zero rather than null, so the JSON shape is
    // stable across runs and diffs cleanly against round 8.
    expect(stages.sttMs).toEqual({ median: 0, p90: 0, count: 0 })
  })

  it('drops implausible samples rather than letting one stall skew the median', () => {
    const m = meter()
    m.record('llmFirstTokenMs', 200)
    m.record('llmFirstTokenMs', 45_000)
    m.record('llmFirstTokenMs', -5)
    expect(m.stages().llmFirstTokenMs.count).toBe(1)
  })

  it('prices characters, not tokens, and both TTS models identically', () => {
    expect(TTS_MODELS.eleven_flash_v2_5.usdPer1kChars).toBe(
      TTS_MODELS.eleven_v3_conversational.usdPer1kChars,
    )

    const flash = meter()
    flash.addTtsCharacters(1000)
    expect(flash.usage(60).elevenlabs.costUsd).toBeCloseTo(0.05, 6)
    expect(flash.usage(60).elevenlabs.characters).toBe(1000)
    expect(flash.usage(60).elevenlabs.creditsUsed).toBe(1000)
  })

  it('sums the two vendors into one cost per minute', () => {
    const m = meter()
    m.addTtsCharacters(2000) // $0.10
    m.addLlmTokens({ input: 1_000_000, output: 0 }) // $0.40 at gpt-4.1-mini
    const usage = m.usage(120)

    expect(usage.openai.llmTokens).toBe(1_000_000)
    expect(usage.totalCostUsd).toBeCloseTo(0.5, 6)
    expect(usage.costPerMinuteUsd).toBeCloseTo(0.25, 6)
  })

  it('counts characters sent, including the ones a barge-in threw away', () => {
    const m = meter()
    m.addTtsCharacters(LINE.length)
    m.bargeIn()
    m.truncated()
    const telemetry = m.telemetry(60)

    expect(telemetry.bargeIns).toBe(1)
    expect(telemetry.truncatedTurns).toBe(1)
    // The invoice does not care that she was interrupted.
    expect(telemetry.usage.elevenlabs.characters).toBe(LINE.length)
  })

  it('carries the model ids so a run is attributable', () => {
    const telemetry = meter().telemetry(60)
    expect(telemetry.ttsModel).toBe('eleven_flash_v2_5')
    expect(telemetry.sttModel).toBe('gpt-4o-mini-transcribe')
    expect(telemetry.llmModel).toBe('gpt-4.1-mini')
  })
})

describe('the credit guard', () => {
  it('says nothing below the threshold', () => {
    const seen: string[] = []
    new CreditGuard({ budget: 10_000, warnAt: 8_000, warn: (m) => seen.push(m) }).check(7_999)
    expect(seen).toHaveLength(0)
  })

  it('screams at eight thousand', () => {
    const seen: string[] = []
    const guard = new CreditGuard({ budget: 10_000, warnAt: 8_000, warn: (m) => seen.push(m) })
    guard.check(8_000)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('ELEVENLABS CREDITS RUNNING OUT')
    expect(seen[0]).toContain('2,000')
  })

  it('keeps screaming, because a warning scrolled past is not a warning', () => {
    const seen: string[] = []
    const guard = new CreditGuard({ budget: 10_000, warnAt: 8_000, warn: (m) => seen.push(m) })
    guard.check(8_100)
    guard.check(8_400)
    expect(seen).toHaveLength(2)
  })

  it('changes its wording once there is nothing left', () => {
    const seen: string[] = []
    new CreditGuard({ budget: 10_000, warnAt: 8_000, warn: (m) => seen.push(m) }).check(10_000)
    expect(seen[0]).toContain('EXHAUSTED')
  })

  it('fires through the meter as characters accumulate', () => {
    const seen: string[] = []
    const m = new PipelineMeter({
      models: {
        ttsModel: 'eleven_flash_v2_5',
        sttModel: 'gpt-4o-mini-transcribe',
        llmModel: 'gpt-4.1-mini',
      },
      credits: { budget: 10_000, warnAt: 8_000 },
      warn: (message) => seen.push(message),
    })
    m.addTtsCharacters(7_000)
    expect(seen).toHaveLength(0)
    m.addTtsCharacters(1_500)
    expect(seen).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ *
 * The pieces around the edges
 * ------------------------------------------------------------------ */

describe('synthesis chunking', () => {
  it('sends a short reply the moment its sentence closes', () => {
    // The common case. For a three-word answer the first flush and the last are
    // usually the same moment, which is the reason not to over-engineer this.
    expect(shouldFlush('Yeah, maybe.', false)).toBe(true)
    expect(shouldFlush('Really, I am sure.', false)).toBe(true)
  })

  it('holds a fragment that is not a sentence yet', () => {
    expect(shouldFlush('Yeah, sometimes it feels like', false)).toBe(false)
    // A two-character "sentence" is an abbreviation or a false positive, and
    // one request per fragment costs a whole round trip for nothing.
    expect(shouldFlush('Hey.', false)).toBe(false)
    expect(shouldFlush('Hey.', true)).toBe(true)
  })

  it('never flushes nothing', () => {
    expect(shouldFlush('   ', true)).toBe(false)
    expect(shouldFlush('', false)).toBe(false)
  })
})

describe('alignment parsing', () => {
  it('reads the vendor frame', () => {
    const parsed = parseAlignment({
      characters: ['H', 'i'],
      character_start_times_seconds: [0, 0.1],
      character_end_times_seconds: [0.1, 0.2],
    })
    expect(parsed?.characters).toEqual(['H', 'i'])
    expect(parsed?.characterEndTimesSeconds).toEqual([0.1, 0.2])
  })

  it('returns null rather than a half-built chunk', () => {
    expect(parseAlignment(null)).toBeNull()
    expect(parseAlignment({ characters: ['a'] })).toBeNull()
  })
})

describe('the exit sentinel', () => {
  it('never reaches synthesis or the transcript', () => {
    expect(stripSentinel(`Really, I'm sure. Thanks though. ${EXIT_SENTINEL}`)).toBe(
      "Really, I'm sure. Thanks though.",
    )
  })

  it('leaves an ordinary line alone', () => {
    expect(stripSentinel('Yeah, maybe.')).toBe('Yeah, maybe.')
  })
})

describe('conversation history', () => {
  it('maps our normalised turns onto chat roles and drops empty ones', () => {
    expect(
      historyFrom([
        { speaker: 'user', text: 'Hi', t_start: 0, t_end: 1 },
        { speaker: 'agent', text: 'Hey.', t_start: 1, t_end: 2 },
        { speaker: 'agent', text: '   ', t_start: 2, t_end: 3 },
      ]),
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hey.' },
    ])
  })
})

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

describe('the TTS model dial', () => {
  it('defaults to Flash and accepts the expressive model', () => {
    expect(resolvePipelineConfig({}).tts.model).toBe('eleven_flash_v2_5')
    expect(
      resolvePipelineConfig({ ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational' }).tts.model,
    ).toBe('eleven_v3_conversational')
  })

  it('ignores a model it does not know rather than failing a rep', () => {
    expect(resolvePipelineConfig({ ELEVENLABS_TTS_MODEL: 'eleven_nonsense' }).tts.model)
      .toBe('eleven_flash_v2_5')
  })

  it('only tags on the model that reads tags', () => {
    const flash = new ElevenLabsPersonaCompiler({ ELEVENLABS_TTS_MODEL: 'eleven_flash_v2_5' })
    const v3 = new ElevenLabsPersonaCompiler({
      ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational',
    })
    expect(flash.compile(nadia, DEFAULT_CALIBRATION).delivery_tags).toEqual([])
    expect(v3.compile(nadia, DEFAULT_CALIBRATION).delivery_tags.length).toBeGreaterThan(0)
    expect(compileDeliveryTags(nadia)).toContain('[neutral]')
  })

  it('lets the ear override the persona on the tuning dials', () => {
    const compiled = new ElevenLabsPersonaCompiler({
      ELEVENLABS_STABILITY: '0.2',
      ELEVENLABS_SPEED: '0.9',
      ELEVENLABS_SIMILARITY: '0.6',
    }).compile(nadia, DEFAULT_CALIBRATION)

    expect(compiled.tts.stability).toBe(0.2)
    expect(compiled.tts.speed).toBe(0.9)
    expect(compiled.tts.similarity_boost).toBe(0.6)
  })

  it('keeps the calibrated silence threshold ours, in both units', () => {
    const compiled = new ElevenLabsPersonaCompiler().compile(nadia, {
      silenceMs: 900,
      patienceOffsetMs: 400,
    })
    expect(compiled.turn.silenceMs).toBe(1300)
    expect(compiled.turn.turn_timeout).toBe(1.3)
    expect(compiled.turn.silenceMs).toBe(resolveSilenceMs({ silenceMs: 900, patienceOffsetMs: 400 }))
  })

  it('prices both models the same, so the choice is never about cost', () => {
    expect(ttsModelSpec('eleven_v3_conversational').usdPer1kChars).toBe(
      ttsModelSpec('eleven_flash_v2_5').usdPer1kChars,
    )
    expect(ttsModelSpec('eleven_flash_v2_5').nominalFirstByteMs).toBeLessThan(
      ttsModelSpec('eleven_v3_conversational').nominalFirstByteMs,
    )
  })
})

/* ------------------------------------------------------------------ *
 * Casting
 * ------------------------------------------------------------------ */

describe('voice design', () => {
  it('renders the documented prompt format for Nadia', () => {
    expect(renderDesignPrompt(briefFor(nadia))).toBe(
      'Native English. Female, late twenties. High quality, clean recording. '
      + '| Persona: distracted bookshop browser. Emotion: flat, mildly bored, unhurried.',
    )
  })

  it('derives a starting brief for a character nobody has cast', () => {
    const prompt = renderDesignPrompt(briefFor({ ...nadia, id: 'uncast' }))
    expect(prompt).toMatch(/^Native English\. Female, /)
    expect(prompt).toContain('| Persona:')
    expect(prompt).toContain('Emotion:')
  })

  it('auditions her real lines, not a narration paragraph', () => {
    expect(AUDITION_LINES).toContain('Yeah, maybe.')
    expect(AUDITION_LINES).toContain('Hey.')
    // Two-word replies are the product, so most of the set has to be short.
    const short = AUDITION_LINES.filter((line) => line.split(' ').length <= 3)
    expect(short.length).toBeGreaterThanOrEqual(3)
  })

  it('names rendered files so they sort into the order she said them', () => {
    expect(auditionFilename(0, 'Hey.')).toBe('01-hey')
    expect(auditionFilename(3, 'Yeah, maybe.')).toBe('04-yeah-maybe')
    expect(auditionFilename(2, "My sister's birthday.")).toBe('03-my-sisters-birthday')
  })

  it('prices an audition run before it is run', () => {
    // Both models, all seven lines. Small enough to spend off a free plan.
    expect(auditionCharacterCost()).toBeLessThan(500)
    expect(auditionCharacterCost(AUDITION_LINES, 1) * 2).toBe(auditionCharacterCost())
  })
})
