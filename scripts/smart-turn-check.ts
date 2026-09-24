/**
 * Smart Turn end to end, without a microphone: `npm run smart-turn:check`.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ─────────────────────────────
 *
 * The unit suites prove each piece against its own reference — the log-mel
 * extractor against `transformers` (`features.test.ts`), the FFT against a
 * naive DFT, the gate against today's VAD frame for frame. None of them ever
 * runs the MODEL, so none of them can say the one thing that matters: that a
 * finished sentence scores higher than a sentence cut off in the middle, when
 * the whole browser chain is put together. This does, on synthesised speech,
 * for free: macOS `say` and `afconvert`, no vendor, no network.
 *
 * Each line is scored twice:
 *
 *  1. **The upstream recipe.** 16 kHz straight from `afconvert`, plus 200 ms
 *     of digital silence (what the VAD has heard by the time the gate asks),
 *     through `SmartTurnEngine`. This is the number to compare with Python —
 *     `inference.py` on the same WAV gives the same probability to six
 *     decimals, because the features match `transformers` to ~1e-5.
 *  2. **The live path.** 24 kHz — the AudioContext's rate — in 20 ms frames,
 *     with a little room noise under the VAD's gate, through the real
 *     `EndOfTurnGate`: VAD, resampler, turn mark, probe, policy. Each answer is
 *     handed back after the inference time it actually took, so the "conceded
 *     at" column is what the rule would do on this machine, against today's
 *     fixed silence.
 *
 * It does NOT prove anything about a real man on a real microphone, and the
 * first run showed why it cannot. Smart Turn listens to prosody, and `say`
 * reads every fragment with a finished, falling contour — "maybe we could",
 * "maybe we could," and "maybe we could..." come out as identical audio — so
 * its "unfinished" lines do not SOUND unfinished, and some score 0.95. Worse,
 * on synthesised speech the model sits on its decision boundary: moving the
 * trailing silence from 200 ms to 210 ms took one finished line from 0.79 to
 * 0.37, a bigger swing than anything the resampler does (its 16→24→16 kHz
 * round trip keeps the waveform at 41–50 dB SNR). So a run that SEPARATES is
 * encouraging and a run that OVERLAPS is expected; only a mean in the wrong
 * direction means the chain is broken, and only that exits non-zero.
 *
 * The number that matters is still the one `HUMANNESS-PLAN.md` §5.1 cares
 * about — how often she talks over a mid-sentence pause — and only recorded
 * human turns and real reps measure it. Pass 16-bit WAVs to score recordings:
 *
 *     npm run smart-turn:check -- path/to/turn.wav ...
 *
 * Flags: `--model=<path>` to try another export (the fp32 one, say), and
 * `--latency=<ms>` to hand answers back after a fixed delay instead of the
 * measured one — `--latency=700` is roughly what a mid-range phone would see.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SmartTurnEngine } from '../lib/voice/elevenlabs/smart-turn/engine'
import { EndOfTurnGate } from '../lib/voice/elevenlabs/smart-turn/gate'
import { CONFIDENT_COMPLETE, extendedSilenceMs } from '../lib/voice/elevenlabs/smart-turn/policy'
import { StreamingResampler } from '../lib/voice/elevenlabs/smart-turn/resample'
import { readWav16 } from '../lib/voice/elevenlabs/smart-turn/wav'
import { frameRms } from '../lib/voice/elevenlabs/vad'

/** The adapter's capture rate (`PCM_RATES` in `config.ts`) and frame. */
const CAPTURE_RATE = 24_000
const FRAME_MS = 20
const FRAME = (CAPTURE_RATE * FRAME_MS) / 1000
/** `resolveSilenceMs` with no calibration: today's whole rule. */
const CALIBRATED_MS = 600
/** What the VAD has heard by the probe; `PROBE_AFTER_MS` in `policy.ts`. */
const TRAILING_SILENCE_MS = 200
/** Room noise, RMS. Under the VAD's absolute gate (0.006), so still silence to it. */
const ROOM_NOISE = 0.0015

/*
 * Hand-authored, in the register the product actually hears: a man answering
 * a stranger, not reading. The unfinished ones stop where people really do
 * stop — after a conjunction, a filler, a preposition — and not mid-word,
 * which would be too easy.
 */
const COMPLETE = [
  "I work in logistics, it's pretty boring.",
  'Yeah, I grew up about ten minutes from here.',
  'Honestly, I just come here for the coffee.',
  "That's a really good question.",
]
const UNFINISHED = [
  'I was thinking that maybe we could',
  'So what I really wanted to ask you was',
  "I work in, um, it's sort of like",
  'Honestly, the reason I came over is',
]
const VOICES = ['Samantha', 'Daniel', 'Reed (English (US))']

interface Clip {
  label: string
  kind: 'complete' | 'unfinished' | 'file'
  /** 16 kHz, for the upstream recipe. */
  at16k: Float32Array
  /** Capture rate, for the live path. */
  atCapture: Float32Array
}

interface LiveResult {
  /**
   * Every probe: when it fired relative to the last audible frame of the line
   * (negative means inside it — a comma pause), and what the model said.
   */
  probes: Array<{ offsetMs: number; probability: number }>
  /** Silence waited before she took the floor, or null if the gate never conceded. */
  concededAfterMs: number | null
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

function synthesise(dir: string, text: string, voice: string, index: number): { at16k: Float32Array; atCapture: Float32Array } {
  const aiff = join(dir, `${index}.aiff`)
  execFileSync('say', ['-v', voice, '-o', aiff, text])
  const read = (rate: number) => {
    const wav = join(dir, `${index}-${rate}.wav`)
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${rate}`, '-c', '1', aiff, wav])
    return readWav16(new Uint8Array(readFileSync(wav))).samples
  }
  return { at16k: read(16_000), atCapture: read(CAPTURE_RATE) }
}

function fromFile(path: string): Clip {
  const wav = readWav16(new Uint8Array(readFileSync(path)))
  const to = (rate: number) => {
    if (wav.sampleRate === rate) return wav.samples
    const resampler = new StreamingResampler(wav.sampleRate, rate)
    const head = resampler.push(wav.samples)
    const tail = resampler.push(new Float32Array(resampler.latencySamples))
    const out = new Float32Array(head.length + tail.length)
    out.set(head)
    out.set(tail, head.length)
    return out
  }
  return { label: path, kind: 'file', at16k: to(16_000), atCapture: to(CAPTURE_RATE) }
}

function withTrailingSilence(samples: Float32Array, ms: number, rate: number): Float32Array {
  const out = new Float32Array(samples.length + Math.round((ms * rate) / 1000))
  out.set(samples)
  return out
}

/** Deterministic room noise, so two runs print the same table. */
function noise(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    // Uniform in [-a, a] has RMS a / √3.
    return (state / 0x100000000 - 0.5) * 2 * ROOM_NOISE * Math.sqrt(3)
  }
}

const timings = { featureMs: [] as number[], inferenceMs: [] as number[] }

async function score(engine: SmartTurnEngine, samples: Float32Array): Promise<{ probability: number; delayMs: number }> {
  const result = await engine.infer(samples)
  timings.featureMs.push(result.featureMs)
  timings.inferenceMs.push(result.inferenceMs)
  return { probability: result.probability, delayMs: result.featureMs + result.inferenceMs }
}

async function live(engine: SmartTurnEngine, clip: Clip, fixedLatency: number | null): Promise<LiveResult> {
  const gate = new EndOfTurnGate({ calibratedMs: CALIBRATED_MS, inputRate: CAPTURE_RATE })
  const rand = noise(clip.label.length * 7919 + clip.at16k.length)
  const lead = Math.round(0.4 * CAPTURE_RATE)
  const after = 2 * CAPTURE_RATE
  const total = lead + clip.atCapture.length + after
  const frames = Math.floor(total / FRAME)

  // The last frame of the line itself that clears the VAD's absolute gate:
  // "the end of what he said", for placing each probe.
  let lastAudible = 0
  for (let f = 0; f * FRAME < clip.atCapture.length; f += 1) {
    if (frameRms(clip.atCapture.subarray(f * FRAME, (f + 1) * FRAME)) >= 0.006) lastAudible = f
  }
  const speechEndMs = ((lead + (lastAudible + 1) * FRAME) / CAPTURE_RATE) * 1000

  const probes: LiveResult['probes'] = []
  let pending: { pause: number; probability: number; dueAt: number } | null = null
  let speaking = false

  for (let f = 0; f < frames; f += 1) {
    const frame = new Float32Array(FRAME)
    for (let i = 0; i < FRAME; i += 1) {
      const at = f * FRAME + i - lead
      const voice = at >= 0 && at < clip.atCapture.length ? clip.atCapture[at]! : 0
      frame[i] = voice + rand()
    }
    const atMs = f * FRAME_MS
    const step = gate.push(frame, atMs)

    if (step.event?.type === 'speech.start') speaking = true
    if (step.event?.type === 'speech.stop' && speaking) {
      return { probes, concededAfterMs: step.event.silenceMs ?? atMs - step.event.atMs }
    }

    if (step.probe !== null) {
      const { probability, delayMs } = await score(engine, gate.turnAudio())
      probes.push({ offsetMs: Math.round(atMs + FRAME_MS - speechEndMs), probability })
      pending = { pause: step.probe, probability, dueAt: atMs + (fixedLatency ?? delayMs) }
    }
    if (pending && atMs >= pending.dueAt) {
      const stop = gate.answer(pending.pause, pending.probability, atMs)
      pending = null
      if (stop && speaking) return { probes, concededAfterMs: stop.silenceMs ?? atMs - stop.atMs }
    }
  }
  return { probes, concededAfterMs: null }
}

function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))

async function main(): Promise<void> {
  const modelPath = arg('model') ?? 'public/models/smart-turn-v3.2-cpu.onnx'
  const latencyArg = arg('latency')
  const fixedLatency = latencyArg === undefined ? null : Number(latencyArg)
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))

  const clips: Clip[] = []
  let dir: string | null = null
  if (files.length > 0) {
    for (const file of files) clips.push(fromFile(file))
  } else {
    if (process.platform !== 'darwin') {
      console.error('Synthesis needs macOS `say` and `afconvert`. Pass 16-bit WAV files instead.')
      process.exit(2)
    }
    dir = mkdtempSync(join(tmpdir(), 'smart-turn-'))
    let index = 0
    for (const voice of VOICES) {
      for (const [kind, lines] of [
        ['complete', COMPLETE],
        ['unfinished', UNFINISHED],
      ] as const) {
        for (const text of lines) {
          const audio = synthesise(dir, text, voice, index)
          index += 1
          clips.push({ label: `${voice.split(' ')[0]}: ${text}`, kind, ...audio })
        }
      }
    }
  }

  const engine = new SmartTurnEngine({ modelBytes: new Uint8Array(readFileSync(modelPath)) })
  const loadStarted = performance.now()
  await engine.load()
  const loadMs = performance.now() - loadStarted
  // The first run through freshly compiled WebAssembly is the slow one; the
  // worker pays it during the countdown (`protocol.ts`), so it is left out here.
  await engine.infer(new Float32Array(16_000))

  console.log(`model ${modelPath}, loaded in ${loadMs.toFixed(0)} ms`)
  console.log(
    `live path: calibrated ${CALIBRATED_MS} ms, extended ${extendedSilenceMs(CALIBRATED_MS)} ms, ` +
      `answers after ${fixedLatency === null ? 'the measured inference time' : `${fixedLatency} ms`}\n`,
  )
  console.log(`${pad('line', 58)} ${pad('kind', 10)} ${pad('p(done)', 8)} ${pad('live probes (ms from end → p)', 34)} conceded after`)

  const byKind: Record<string, number[]> = { complete: [], unfinished: [], file: [] }
  const conceded: Record<string, number[]> = { complete: [], unfinished: [], file: [] }
  for (const clip of clips) {
    const { probability } = await score(engine, withTrailingSilence(clip.at16k, TRAILING_SILENCE_MS, 16_000))
    byKind[clip.kind]!.push(probability)
    const result = await live(engine, clip, fixedLatency)
    if (result.concededAfterMs !== null) conceded[clip.kind]!.push(result.concededAfterMs)
    const probes = result.probes.map((p) => `${p.offsetMs > 0 ? '+' : ''}${p.offsetMs}→${p.probability.toFixed(2)}`).join(' ')
    const at = result.concededAfterMs === null ? 'never' : `${result.concededAfterMs} ms`
    console.log(`${pad(clip.label, 58)} ${pad(clip.kind, 10)} ${pad(probability.toFixed(3), 8)} ${pad(probes, 34)} ${at}`)
  }

  console.log('')
  for (const kind of ['complete', 'unfinished', 'file'] as const) {
    const ps = byKind[kind]!
    if (ps.length === 0) continue
    const mean = ps.reduce((a, b) => a + b, 0) / ps.length
    const confident = ps.filter((p) => p >= CONFIDENT_COMPLETE).length
    const waits = conceded[kind]!
    const meanWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : Number.NaN
    console.log(
      `${pad(kind, 10)} n=${ps.length}  p mean ${mean.toFixed(3)}  min ${Math.min(...ps).toFixed(3)}  max ${Math.max(...ps).toFixed(3)}  ` +
        `≥${CONFIDENT_COMPLETE}: ${confident}/${ps.length}  live wait mean ${meanWait.toFixed(0)} ms (today ${CALIBRATED_MS})`,
    )
  }
  console.log(
    `\nper call: features p50 ${percentile(timings.featureMs, 0.5).toFixed(1)} ms (p90 ${percentile(timings.featureMs, 0.9).toFixed(1)}), ` +
      `inference p50 ${percentile(timings.inferenceMs, 0.5).toFixed(0)} ms (p90 ${percentile(timings.inferenceMs, 0.9).toFixed(0)}), ` +
      `${timings.inferenceMs.length} calls, one thread`,
  )

  if (dir) rmSync(dir, { recursive: true, force: true })
  await engine.dispose()

  if (byKind.complete!.length && byKind.unfinished!.length) {
    const lowestDone = Math.min(...byKind.complete!)
    const highestOpen = Math.max(...byKind.unfinished!)
    const meanDone = byKind.complete!.reduce((a, b) => a + b, 0) / byKind.complete!.length
    const meanOpen = byKind.unfinished!.reduce((a, b) => a + b, 0) / byKind.unfinished!.length
    console.log(
      lowestDone > highestOpen
        ? '\nSEPARATES: every finished line scored above every unfinished one.'
        : meanDone > meanOpen
          ? `\nOVERLAPS: finished lines score higher on average, but the lowest (${lowestDone.toFixed(3)}) is under the highest unfinished (${highestOpen.toFixed(3)}).`
          : '\nFAILS: unfinished lines score as high as finished ones. Check the features before believing any of this.',
    )
    if (meanDone <= meanOpen) process.exit(1)
  }
  process.exit(0)
}

main().catch((cause: unknown) => {
  console.error(cause)
  process.exit(1)
})
