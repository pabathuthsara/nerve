/**
 * Scribe v2 Realtime, through the real transcriber, without a microphone.
 *
 *   npm run scribe:probe                  # two sentences through Scribe
 *   npm run scribe:probe -- --openai      # and the same audio through today's OpenAI transcriber
 *   npm run scribe:probe -- --idle 20     # twenty silent seconds between them
 *   npm run scribe:probe -- --raw         # every message the socket sends, verbatim
 *
 * ── WHAT IT DRIVES ───────────────────────────────────────────────────────
 *
 * The same objects a rep does, as far as they go without a browser:
 *
 *   · the credential is minted by `mintElevenLabsSession`, the function the
 *     token route calls, with `PIPELINE_STT_MODEL=scribe_v2_realtime` — so the
 *     single-use token comes from `mintScribeToken` and the standing key never
 *     leaves this process
 *   · the transcriber is built by `transcriberFor`, the one line the adapter
 *     changes, off that minted session
 *   · audio is pushed through `pushFrame(frame, speaking)` in 20 ms frames in
 *     REAL TIME, with a silent lead-in the pre-roll ring fills from and the VAD
 *     window after the last syllable still marked as speech, exactly as our
 *     detector holds it; `commit` is called with the timing snapshot the
 *     adapter would take
 *
 * The speech is macOS `say`, converted by `afconvert` to 24 kHz 16-bit mono —
 * the rate `capture.ts` records at, so nothing resamples.
 *
 * ── WHAT IT MEASURES ─────────────────────────────────────────────────────
 *
 * Commit → final: the stage `pipeline.stages.sttMs` records, and the one
 * `PERSONA-REALISM-REPORT` §1.1 puts at 625–885 ms for `gpt-4o-mini-transcribe`
 * in production. Partials are printed against the time since he started
 * speaking, so "arrived while he was still talking" is visible rather than
 * claimed. `--openai` runs the same audio through the transcriber that ships
 * today, from the same machine, which is the only comparison worth making: a
 * latency measured from Colombo is not comparable to one measured anywhere else.
 *
 * `--idle 20` holds twenty seconds of silence between the sentences, which the
 * socket survives only because of the keep-alive (the server hangs up at
 * ~15.8 s without audio). It is the cheapest proof that her longest line does
 * not end his transcription.
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 *
 * Not a microphone, not a room and not a nervous man. A synthetic voice is the
 * easiest speech a transcriber will ever hear, so a clean transcript here says
 * nothing about accuracy; `npm run rep:audition` does not reach audio either.
 * Accuracy is owed by ear, on real reps (the report's L3 status).
 *
 * IT SPENDS MONEY, very little: Scribe is $0.39 an hour of audio sent, and a
 * default run sends about ten seconds — roughly a tenth of a cent. `--openai`
 * adds about the same again.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnvLocal } from './env'
import { getPersona } from '@/lib/personas'
import { DEFAULT_CALIBRATION, type Persona } from '@/lib/voice/types'
import { mintElevenLabsSession, type MintedPipelineSession } from '@/lib/voice/elevenlabs/mint'
import { SCRIBE_REALTIME_MODEL } from '@/lib/voice/elevenlabs/config'
import { transcriberFor } from '@/lib/voice/elevenlabs/transcriber'
import type { TranscriptionTiming } from '@/lib/voice/elevenlabs/stt'
import { priceTokens } from '@/lib/voice/rates'

const SENTENCES = [
  "Hi, I'm Alex. I just moved here from Chicago, and I'm still finding my way around.",
  'What brings you to this bookshop on a Tuesday afternoon?',
]

const RATE = 24_000
const FRAME = 480 // 20 ms
const LEAD_IN_MS = 400
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string, fallback: number) => {
  const at = args.indexOf(name)
  const value = at >= 0 ? Number(args[at + 1]) : Number.NaN
  return Number.isFinite(value) ? value : fallback
}
const IDLE_MS = option('--idle', 1.5) * 1000
/** The VAD window after his last syllable, during which he still counts as
 *  speaking. `DEFAULT_CALIBRATION.silenceMs` unless a flag says otherwise. */
const SILENCE_MS = option('--silence', DEFAULT_CALIBRATION.silenceMs)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Result {
  sentence: string
  final: string
  commitToFinalMs: number
  partialsBeforeCommit: number
  firstPartialMs: number | null
}

async function main(): Promise<void> {
  await loadEnvLocal()
  if (!process.env['ELEVENLABS_API_KEY']) throw new Error('ELEVENLABS_API_KEY is not set in .env.local.')
  if (!process.env['OPENAI_API_KEY']) throw new Error('OPENAI_API_KEY is not set in .env.local; the mint requires it for the character model.')

  const clips = SENTENCES.map(synthesise)
  console.log(`Synthesised ${clips.length} sentences: ${clips.map((clip) => `${(clip.length * 20 / 1000).toFixed(2)} s`).join(', ')}.`)
  console.log(`VAD window after each: ${SILENCE_MS} ms. Silence between: ${(IDLE_MS / 1000).toFixed(1)} s.\n`)

  const arms: [string, string][] = [['Scribe v2 Realtime', SCRIBE_REALTIME_MODEL]]
  if (flag('--openai')) arms.push(['OpenAI (today)', process.env['PIPELINE_STT_MODEL']?.trim() || 'gpt-4o-mini-transcribe'])

  const summary: [string, Result[]][] = []
  for (const [label, model] of arms) summary.push([label, await run(label, model, clips)])

  console.log('\n── Summary ──')
  for (const [label, results] of summary) {
    const latencies = results.map((result) => result.commitToFinalMs)
    console.log(`${label}: commit → final ${latencies.map((ms) => `${Math.round(ms)} ms`).join(', ')}; `
      + `last syllable → final ${latencies.map((ms) => `${Math.round(ms + SILENCE_MS)} ms`).join(', ')}; `
      + `partials before commit ${results.map((result) => result.partialsBeforeCommit).join(', ')}`)
  }
}

async function run(label: string, model: string, clips: Float32Array[][]): Promise<Result[]> {
  console.log(`── ${label} (${model}) ──`)
  const tess = getPersona('tess') as Persona
  const minted = await mintElevenLabsSession(tess, DEFAULT_CALIBRATION, {
    pipeline: { ...(process.env as Record<string, string | undefined>), PIPELINE_STT_MODEL: model },
  })
  describeMint(minted)

  const t0 = performance.now()
  const at = () => `${String(Math.round(performance.now() - t0)).padStart(6)} ms`
  let speechStartedAt = 0
  let committed = false
  let partials = 0
  let firstPartial: number | null = null
  let usageMs = 0
  let usageTokens = 0
  let settle: ((value: { text: string; latencyMs: number }) => void) | null = null
  let fail: ((error: Error) => void) | null = null

  const stt = transcriberFor(minted, {
    clock: () => performance.now(),
    onDelta: (text) => {
      const since = performance.now() - speechStartedAt
      if (!committed) {
        partials += 1
        firstPartial ??= since
      }
      console.log(`${at()}  partial  +${Math.round(since)} ms into his turn${committed ? ' (after commit)' : ''}: ${text}`)
    },
    onFinal: (text, _timing, latencyMs) => {
      console.log(`${at()}  FINAL    ${Math.round(latencyMs)} ms after commit: ${text || '(empty)'}`)
      settle?.({ text, latencyMs })
    },
    onError: (error) => {
      console.log(`${at()}  ERROR    ${error.fatal ? 'fatal' : 'not fatal'}: ${error.message}`)
      if (error.fatal) fail?.(error)
    },
    onUsage: (usage) => {
      if (model === SCRIBE_REALTIME_MODEL) usageMs += usage.audio
      else usageTokens += usage.audio + usage.text
    },
    ...(flag('--raw') ? { socketFactory: rawSocket(at) } : {}),
  })

  const results: Result[] = []
  try {
    await stt.connect()
    console.log(`${at()}  connected`)
    for (const [index, clip] of clips.entries()) {
      committed = false
      partials = 0
      firstPartial = null
      await stream(stt, Array.from({ length: LEAD_IN_MS / 20 }, () => new Float32Array(FRAME)), false)
      speechStartedAt = performance.now()
      await stream(stt, clip, true)
      const stoppedAt = performance.now()
      await stream(stt, Array.from({ length: Math.round(SILENCE_MS / 20) }, () => new Float32Array(FRAME)), true)
      const timing: TranscriptionTiming = {
        startedAtMs: speechStartedAt, stoppedAtMs: stoppedAt, committedAtMs: performance.now(),
      }
      const final = new Promise<{ text: string; latencyMs: number }>((resolve, reject) => { settle = resolve; fail = reject })
      committed = true
      if (!stt.commit(timing)) throw new Error('The transcriber refused the commit.')
      console.log(`${at()}  commit`)
      const { text, latencyMs } = await final
      results.push({
        sentence: SENTENCES[index]!, final: text, commitToFinalMs: latencyMs,
        partialsBeforeCommit: partials, firstPartialMs: firstPartial,
      })
      if (index < clips.length - 1) {
        await stream(stt, Array.from({ length: Math.round(IDLE_MS / 20) }, () => new Float32Array(FRAME)), false)
      }
    }
  } finally {
    stt.close()
  }

  if (model === SCRIBE_REALTIME_MODEL) {
    const cost = priceTokens(model, { audioInput: usageMs })
    console.log(`Sent ${(usageMs / 1000).toFixed(2)} s of audio, lead-ins, padding and keep-alives included: $${cost?.toFixed(5)}.`)
  } else {
    const cost = priceTokens(model, { audioInput: usageTokens })
    console.log(`Reported ${usageTokens} tokens: ~$${cost?.toFixed(5)}.`)
  }
  for (const result of results) {
    const heard = normalise(result.final) === normalise(result.sentence) ? 'word for word' : 'DIFFERS'
    console.log(`  ${heard}: "${result.final}"`)
    if (result.firstPartialMs !== null) console.log(`    first partial ${Math.round(result.firstPartialMs)} ms into his turn`)
  }
  console.log('')
  return results
}

/** Frames in real time, drift-corrected, the way the audio worklet delivers them. */
async function stream(
  stt: { pushFrame: (frame: Float32Array, speaking: boolean) => void },
  frames: Float32Array[],
  speaking: boolean,
): Promise<void> {
  const start = performance.now()
  for (const [index, frame] of frames.entries()) {
    stt.pushFrame(frame, speaking)
    const wait = start + (index + 1) * 20 - performance.now()
    if (wait > 0) await sleep(wait)
  }
}

/** `say` → 24 kHz 16-bit mono WAV → 20 ms float frames. */
function synthesise(text: string): Float32Array[] {
  const dir = mkdtempSync(join(tmpdir(), 'scribe-probe-'))
  try {
    const aiff = join(dir, 'speech.aiff')
    const wav = join(dir, 'speech.wav')
    execFileSync('say', ['-o', aiff, text])
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav])
    const pcm = wavData(readFileSync(wav))
    const frames: Float32Array[] = []
    for (let offset = 0; offset < pcm.length; offset += FRAME) {
      const frame = new Float32Array(FRAME)
      for (let i = 0; i < FRAME && offset + i < pcm.length; i += 1) frame[i] = pcm[offset + i]! / 0x8000
      frames.push(frame)
    }
    return frames
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function wavData(file: Buffer): Int16Array {
  let offset = 12
  while (offset + 8 <= file.length) {
    const id = file.toString('ascii', offset, offset + 4)
    const size = file.readUInt32LE(offset + 4)
    if (id === 'data') {
      const bytes = file.subarray(offset + 8, offset + 8 + size)
      return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))
    }
    offset += 8 + size + (size & 1)
  }
  throw new Error('afconvert produced a WAV with no data chunk.')
}

/** The mint, minus anything secret. */
function describeMint(minted: MintedPipelineSession): void {
  const redact = (value: string) => (value ? `${value.slice(0, 6)}… (${value.length} chars)` : '(empty)')
  console.log('Minted:', JSON.stringify({
    provider: minted.provider,
    clientSecret: redact(minted.clientSecret),
    ...(minted.stt ? { stt: minted.stt.vendor === 'elevenlabs' ? { ...minted.stt, token: redact(minted.stt.token) } : minted.stt } : {}),
    pipelineStt: minted.pipeline.stt,
  }))
}

/**
 * Node's WebSocket, with every inbound message printed verbatim — the capture
 * rule 14 asks for. The URL is never printed: it carries the token.
 */
function rawSocket(at: () => string) {
  return (url: string, protocols: string[]): WebSocket => {
    const socket = new WebSocket(url, protocols)
    socket.addEventListener('message', (event) => console.log(`${at()}  RAW      ${String(event.data)}`))
    socket.addEventListener('close', (event) => console.log(`${at()}  RAW      close ${event.code} ${event.reason}`))
    return socket
  }
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
