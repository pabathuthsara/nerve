/**
 * Records the landing page's hero rep, in Nadia's own voice.
 *
 *   npm run hero:audio
 *
 * The hero on `/` has to answer one question in about ten seconds: is this a
 * person talking, or is it a chat window. Nothing answers that like hearing
 * it — so this records both sides of one rep into `public/hero/`.
 *
 * ── THE TWO SIDES ARE CAPTURED DIFFERENTLY, ON PURPOSE ──────────────────
 *
 * HER side is generated. Each of his lines goes into the real provider as a
 * real turn, against the real compiled persona and the real voice (`marin`,
 * one of the two that shipped with `gpt-realtime`), and whatever comes back is
 * what ships — words, timing, hesitation and all. Her replies are not authored
 * and must not be: what she says IS the product, and a hand-written version of
 * it would be advertising this file's prose rather than the thing being sold.
 * Run it a few times and keep the take you like.
 *
 * HIS side is read. His five lines are authored — he is the demo and the arc
 * has to build — so there is nothing for a conversational model to decide, and
 * asking one to improvise them would only risk it saying something other than
 * the script the page is built around. A speech model reading a fixed script
 * verbatim is the honest tool for a fixed script, so his half goes through
 * `gpt-4o-mini-tts` in `ash` (the same voice `VOICE_BY_TIMBRE.masculine`
 * already picks for a masculine persona).
 *
 * That asymmetry is the whole argument the hero is making, and it is worth not
 * flattening: the scripted half sounds scripted because it is, and the half
 * that carries the product was not written by anyone.
 *
 * ── WHAT IT COSTS ───────────────────────────────────────────────────────
 *
 * Whatever `OPENAI_REALTIME_MODEL` is set to — which in this repo's .env.local
 * is `gpt-realtime` at $0.16/minute, not the mini at $0.065 (`lib/voice/rates.ts`).
 * A take is under a minute of her speech, so tens of cents rather than six.
 * This is the one script in the repo that spends money without a user asking
 * it to, which is why it is run by hand and never from a build. The model that
 * actually spoke is recorded in the manifest and stamped on the hero from
 * there, so the page can never advertise a model it did not use.
 *
 * ── THE OUTPUT ──────────────────────────────────────────────────────────
 *
 * `public/hero/manifest.json` — the turn list the hero renders, with her real
 * transcript and the measured duration of every clip — plus one mp3 per turn.
 * `RepReplay` fetches the manifest on mount; if it is not there, the hero falls
 * back to the authored script and runs silently, and says so in the frame.
 * Nothing breaks before this is run.
 *
 * The clips are written as WAV and transcoded to mp3 with ffmpeg, which is
 * what the page is pointed at. Without ffmpeg on PATH it leaves the WAVs, says
 * so, and points the manifest at them — a heavier hero, never a broken one.
 */

import { writeFile, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { nadia } from '@/lib/personas/nadia'
import { OpenAIPersonaCompiler, compileInstructions } from '@/lib/voice/openai/persona'
import { DEFAULT_CALIBRATION } from '@/lib/voice/types'
import { loadEnvLocal } from './env'

const run = promisify(execFile)

/**
 * His half of the rep.
 *
 * Five lines, each short enough to say out loud without sounding written, and
 * each doing one of the things the §07 scorecard measures. In order: a
 * statement opener rather than a question; curiosity that goes past her first
 * answer; a real opinion; a small piece of self-disclosure offered without
 * asking for anything back; and a close that leaves warmly, first.
 *
 * Line three is the one the whole demo turns on. It lands directly on her
 * contract — she is mildly embarrassed by how much she likes airport
 * thrillers — so if she is going to sound like a person, it happens there.
 */
const HUMAN_LINES = [
  "That's the third one you've picked up and put back.",
  'What does she actually read? Not what you think she should read.',
  "Then don't buy her literature. Buy her the thing she'd be embarrassed to be seen with.",
  "I've got a shelf of those. I keep them behind the good ones.",
  "Anyway — good luck with the sister. I'll let you get on.",
]

/**
 * His voice.
 *
 * `ash` is not a taste call — it is what `VOICE_BY_TIMBRE.masculine` in the
 * OpenAI compiler already resolves to, so the man on the landing page and a
 * masculine persona inside the product are the same voice.
 */
const TTS_MODEL = 'gpt-4o-mini-tts'
const HIS_VOICE = 'ash'
const TTS_URL = 'https://api.openai.com/v1/audio/speech'

/**
 * How he is told to read.
 *
 * Every instruction here pushes away from performance. He is not selling
 * anything and he is not narrating a demo — he is a person who noticed
 * something in a bookshop, and the line only works if it sounds like it cost
 * him nothing to say. The one thing that must not happen on this page is a
 * voice that sounds like an advertisement, because the product's whole claim
 * is that the other half of it does not.
 */
const HIS_DELIVERY = [
  'A man in his late twenties, speaking quietly to a stranger a few feet away in a second-hand bookshop.',
  'Relaxed and unhurried, faintly amused, entirely unbothered about how it lands.',
  'Conversational and a little offhand — not an announcer, not a narrator, not selling anything.',
  'Let the ends of sentences fall rather than lift. No brightness, no emphasis for effect.',
].join(' ')

/** A beat of air after every clip, so the two of them do not talk over a cut. */
const BEAT_MS = 320

interface ManifestTurn {
  who: 'you' | 'her'
  text: string
  /** Milliseconds this turn occupies: the clip's real length, plus a beat. */
  ms: number
  /** Relative to `public/`. */
  audio?: string
}

const REALTIME_URL = 'wss://api.openai.com/v1/realtime'

/** PCM16 mono at 24kHz is what the Realtime API emits. */
const SAMPLE_RATE = 24_000

function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Duration of a WAV, read out of the file rather than assumed.
 *
 * Mine is built by `wav()` above and is trivially predictable; the one that
 * comes back from the speech endpoint is not ours, so the chunks are walked
 * rather than trusted to sit at fixed offsets.
 */
function wavDurationMs(buffer: Buffer): number {
  const rate = buffer.readUInt32LE(24)
  const bytesPerFrame = (buffer.readUInt16LE(22) * buffer.readUInt16LE(34)) / 8
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4)
    if (buffer.toString('ascii', offset, offset + 4) === 'data') {
      // A streamed WAV declares 0xFFFFFFFF here because the length was not
      // known when the header went out. Trusting it yields a clip roughly a
      // day long, so the bytes actually present win over the declaration.
      const bytes = Math.min(size, buffer.length - offset - 8)
      return Math.round((bytes / bytesPerFrame / rate) * 1000)
    }
    offset += 8 + size + (size % 2)
  }
  return 0
}

/** Reads one of his authored lines aloud, verbatim. */
async function speak(line: string, apiKey: string): Promise<Buffer> {
  const response = await fetch(TTS_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: HIS_VOICE,
      input: line,
      instructions: HIS_DELIVERY,
      response_format: 'wav',
    }),
  })
  if (!response.ok) {
    throw new Error(`Speech request failed (${response.status}): ${await response.text()}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function main(): Promise<void> {
  await loadEnvLocal()
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set. Add it to .env.local.')
    process.exit(1)
  }

  const model = process.env['OPENAI_REALTIME_MODEL'] ?? 'gpt-realtime-mini'
  const session = new OpenAIPersonaCompiler(model).compile(nadia, DEFAULT_CALIBRATION)

  // Two things about a live rep do not apply to a capture, and both of them
  // produce a silent turn if left in.
  //
  // Server VAD is for a microphone. This script drives the turns itself, so it
  // is off — otherwise the socket waits for audio that never arrives and the
  // first response never fires.
  //
  // `end_scene` is the mechanic that lets her walk away. Her contract tells her
  // to speak a final line and invoke it in the same response; on the goodbye
  // she invoked it and skipped the line, which is a legal reading and a useless
  // recording. The capture ends when the authored lines run out, so the tool
  // has nothing to decide. Removing it is not a softer Nadia — the character
  // contract below is recompiled identically, minus the one paragraph about
  // the function she no longer has.
  const config = {
    ...session,
    instructions: compileInstructions(nadia, { canEndScene: false }),
    tools: [],
    tool_choice: 'none',
    audio: { ...session.audio, input: { ...session.audio.input, turn_detection: null } },
    output_modalities: ['audio'],
  }

  const outDir = resolve(process.cwd(), 'public/hero')
  await mkdir(outDir, { recursive: true })

  // The key travels as a subprotocol because the WHATWG WebSocket in Node has
  // no way to set a request header. This is OpenAI's documented shape for it.
  //
  // There is deliberately no `openai-beta.realtime-v1` here. That subprotocol
  // opts into the retired Beta API, which now refuses the connection outright
  // ("The Realtime Beta API is no longer supported"). GA is the bare endpoint,
  // and the session shape the compiler emits — `type: 'realtime'` — is already
  // the GA one.
  const socket = new WebSocket(`${REALTIME_URL}?model=${encodeURIComponent(model)}`, [
    'realtime',
    `openai-insecure-api-key.${apiKey}`,
  ])

  const send = (payload: unknown) => socket.send(JSON.stringify(payload))

  let index = 0
  let chunks: Buffer[] = []
  let spoken = ''
  const turns: ManifestTurn[] = []

  const askNext = () => {
    const line = HUMAN_LINES[index]
    if (line === undefined) return
    // His duration is filled in below, once his line has actually been read.
    turns.push({ who: 'you', text: line, ms: 0 })
    chunks = []
    spoken = ''
    send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: line }] },
    })
    send({ type: 'response.create' })
  }

  await new Promise<void>((done, fail) => {
    socket.onopen = () => {
      send({ type: 'session.update', session: config })
      askNext()
    }

    socket.onerror = () => fail(new Error('The realtime socket failed. Check the key and the model name.'))

    socket.onmessage = async (event) => {
      const message = JSON.parse(String(event.data)) as { type: string; delta?: string; transcript?: string; error?: { message?: string } }

      if (message.type === 'error') {
        fail(new Error(message.error?.message ?? 'The provider returned an error.'))
        return
      }
      // The event name has moved across API versions; accept either.
      if (message.type.endsWith('audio.delta') && message.delta) {
        chunks.push(Buffer.from(message.delta, 'base64'))
        return
      }
      if (message.type.endsWith('audio_transcript.done') && message.transcript) {
        spoken = message.transcript.trim()
        return
      }
      if (message.type === 'response.done') {
        const pcm = Buffer.concat(chunks)
        const name = `nadia-${String(index + 1).padStart(2, '0')}.wav`
        await writeFile(resolve(outDir, name), wav(pcm))
        const ms = Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000) + BEAT_MS
        turns.push({ who: 'her', text: spoken, ms, audio: `/hero/${name}` })
        console.log(`  her  ${name}  ${(ms / 1000).toFixed(1)}s  "${spoken}"`)

        index += 1
        if (index >= HUMAN_LINES.length) { done(); return }
        askNext()
      }
    }
  })

  socket.close()

  // His half. Read after hers rather than before, so that a failure in the
  // expensive half fails before the cheap half has been paid for.
  console.log('')
  let spokenLines = 0
  for (const turn of turns) {
    if (turn.who !== 'you') continue
    spokenLines += 1
    const name = `you-${String(spokenLines).padStart(2, '0')}.wav`
    const buffer = await speak(turn.text, apiKey)
    await writeFile(resolve(outDir, name), buffer)
    turn.ms = wavDurationMs(buffer) + BEAT_MS
    turn.audio = `/hero/${name}`
    console.log(`  you  ${name}  ${(turn.ms / 1000).toFixed(1)}s  "${turn.text}"`)
  }

  // mp3 is what ships: the WAVs are about six times the size for audio nobody
  // is going to master. Without ffmpeg the WAVs stay and the manifest points at
  // them, because a heavy hero is still a working hero.
  const encoded = await transcode(outDir, turns)

  const totalMs = turns.reduce((sum, turn) => sum + turn.ms, 0)
  await writeFile(
    resolve(outDir, 'manifest.json'),
    `${JSON.stringify({
      persona: 'nadia',
      recordedAt: new Date().toISOString(),
      her: { voice: nadia.voice.ids.openai, model, scripted: false },
      his: { voice: HIS_VOICE, model: TTS_MODEL, scripted: true },
      totalMs,
      turns,
    }, null, 2)}\n`,
  )

  console.log(`\nWrote public/hero/manifest.json — ${turns.length} turns, ${(totalMs / 1000).toFixed(1)}s.`)
  if (!encoded) {
    console.log('ffmpeg was not on PATH, so the clips shipped as .wav. Install it and re-run to halve the page weight.')
  }
}

/**
 * WAV to mp3, in place, rewriting the manifest paths to match.
 *
 * Returns false when ffmpeg is missing, which is not an error: the caller
 * leaves the WAVs pointed at and says so.
 */
async function transcode(outDir: string, turns: ManifestTurn[]): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version'])
  } catch {
    return false
  }
  for (const turn of turns) {
    if (!turn.audio?.endsWith('.wav')) continue
    const wavName = turn.audio.slice('/hero/'.length)
    const mp3Name = `${wavName.slice(0, -4)}.mp3`
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', resolve(outDir, wavName), '-b:a', '64k', resolve(outDir, mp3Name)])
    await rm(resolve(outDir, wavName))
    turn.audio = `/hero/${mp3Name}`
  }
  return true
}

void main()
