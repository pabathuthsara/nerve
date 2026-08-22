/**
 * Voice casting CLI. Standalone — not part of the app, not imported by it.
 *
 *   npm run voice:design   -- nadia
 *   npm run voice:audition -- <voice_id>
 *
 * `design` builds the Voice Design prompt in ElevenLabs' documented format and
 * saves the three previews it returns. `audition` renders Nadia's real lines
 * from round 8 against both TTS models, so all four combinations of voice and
 * model can be compared on the register the product actually uses.
 *
 * Every request here spends real credits off a 10,000-credit free plan, so the
 * script prices the run before making it and refuses anything that would take
 * the account past its budget.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getPersona } from '@/lib/personas'
import {
  AUDITION_LINES,
  auditionCharacterCost,
  auditionFilename,
  briefFor,
  renderDesignPrompt,
} from '@/lib/voice/elevenlabs/design'
import { TTS_MODELS, type ElevenLabsTtsModelId } from '@/lib/voice/elevenlabs/config'

const API = 'https://api.elevenlabs.io/v1'
const OUT_ROOT = resolve(process.cwd(), 'voice-lab')

/** Free-plan safe. `mp3_44100_128` and above need a paid tier on some plans. */
const AUDITION_FORMAT = process.env['ELEVENLABS_AUDITION_FORMAT'] ?? 'mp3_44100_128'
const FALLBACK_FORMAT = 'mp3_22050_32'

/**
 * `.env.local`, read by hand.
 *
 * Next loads it for the app; a standalone script gets nothing. Twelve lines
 * here beats a dependency and beats asking for a runner flag every time.
 */
async function loadEnvLocal(): Promise<void> {
  let contents: string
  try {
    contents = await readFile(resolve(process.cwd(), '.env.local'), 'utf8')
  } catch {
    return
  }
  for (const line of contents.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (!key || process.env[key] !== undefined) continue
    process.env[key] = (rawValue ?? '').trim().replace(/^["']|["']$/g, '')
  }
}

function apiKey(): string {
  const key = process.env['ELEVENLABS_API_KEY']
  if (!key) {
    fail(
      'ELEVENLABS_API_KEY is not set.\n'
      + '  Put it in .env.local — this script reads that file itself — or export it.',
    )
  }
  return key as string
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

function rule(): string {
  return '  ' + '─'.repeat(66)
}

/* ------------------------------------------------------------------ *
 * Credits
 * ------------------------------------------------------------------ */

interface Credits {
  used: number | null
  limit: number | null
}

async function readCredits(key: string): Promise<Credits> {
  try {
    const response = await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': key } })
    if (!response.ok) return { used: null, limit: null }
    const body = (await response.json()) as Record<string, unknown>
    const num = (value: unknown) => (typeof value === 'number' ? value : null)
    return { used: num(body['character_count']), limit: num(body['character_limit']) }
  } catch {
    return { used: null, limit: null }
  }
}

/** Read lazily: `.env.local` is loaded after this module is evaluated. */
function warnAt(): number {
  return Number(process.env['ELEVENLABS_CREDIT_WARN_AT'] ?? 8000)
}

/**
 * Spend gate.
 *
 * Loud rather than polite: the free plan has no overage, so the failure mode is
 * a session dying halfway rather than a surprise invoice.
 */
function gate(credits: Credits, cost: number): void {
  console.log(rule())
  if (credits.used === null || credits.limit === null) {
    console.log('  credits    could not be read — proceeding blind')
    console.log(`  this run   ~${cost} characters`)
    console.log(rule())
    return
  }

  const remaining = credits.limit - credits.used
  console.log(`  credits    ${credits.used} / ${credits.limit} used`)
  console.log(`  remaining  ${remaining}`)
  console.log(`  this run   ~${cost} characters`)
  console.log(rule())

  if (cost > remaining) {
    fail(
      `Refusing to start: this run needs ~${cost} characters and only ${remaining} remain.`,
    )
  }
  if (credits.used + cost >= warnAt()) {
    console.warn(
      `\n  ${'━'.repeat(64)}\n`
      + `  ELEVENLABS CREDITS RUNNING OUT — this run ends at ~${credits.used + cost}\n`
      + `  Warning threshold is ${warnAt()}. Stop testing after this one.\n`
      + `  ${'━'.repeat(64)}\n`,
    )
  }
}

/* ------------------------------------------------------------------ *
 * design
 * ------------------------------------------------------------------ */

async function design(personaId: string): Promise<void> {
  const persona = getPersona(personaId)
  if (!persona) fail(`No persona named "${personaId}". Try: nadia`)

  const key = apiKey()
  const prompt = renderDesignPrompt(briefFor(persona!))

  console.log(`\n  Voice design — ${persona!.name}\n`)
  console.log(rule())
  console.log(`  ${prompt}`)

  // The preview text is what the design model speaks back. Using her real
  // lines rather than the vendor's paragraph is the whole point: a voice that
  // only sounds right on long prose is no use to us.
  const previewText = AUDITION_LINES.join(' ')
  const cost = previewText.length * 3

  gate(await readCredits(key), cost)

  const response = await fetch(`${API}/text-to-voice/design`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_description: prompt,
      // v3 is the design-capable model; the previews are auditioned against
      // the delivery models separately by `audition`.
      model_id: 'eleven_ttv_v3',
      text: previewText,
      auto_generate_text: false,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    if (response.status === 403 && detail.includes('feature_not_available')) {
      fail(
        'Voice Design is a paid-plan feature — the free plan cannot create a voice.\n\n'
        + '  The prompt above is still the right brief; use it to pick from the premade\n'
        + '  library instead, which is free and auditions identically:\n\n'
        + '    npm run voice:voices\n'
        + '    npm run voice:audition -- <voice_id>\n\n'
        + '  Casting from the library costs nothing until you audition.',
      )
    }
    fail(`Design refused (${response.status}). ${detail.slice(0, 500)}`)
  }

  const body = (await response.json()) as {
    previews?: { audio_base_64?: string; generated_voice_id?: string; media_type?: string }[]
  }
  const previews = body.previews ?? []
  if (previews.length === 0) fail('Design returned no previews.')

  const dir = join(OUT_ROOT, persona!.id, 'design')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'prompt.txt'), `${prompt}\n`, 'utf8')

  console.log('')
  for (const [index, preview] of previews.entries()) {
    if (!preview.audio_base_64) continue
    const ext = preview.media_type?.includes('wav') ? 'wav' : 'mp3'
    const name = `preview-${index + 1}.${ext}`
    await writeFile(join(dir, name), Buffer.from(preview.audio_base_64, 'base64'))
    console.log(`  ${name}   generated_voice_id: ${preview.generated_voice_id ?? '—'}`)
  }

  await writeFile(
    join(dir, 'voice-ids.txt'),
    previews.map((p, i) => `preview-${i + 1}\t${p.generated_voice_id ?? ''}`).join('\n') + '\n',
    'utf8',
  )

  console.log(`\n  Written to ${dir}`)
  console.log('  Listen, then audition the one you like:')
  console.log(`    npm run voice:audition -- <generated_voice_id>\n`)
}

/* ------------------------------------------------------------------ *
 * voices
 * ------------------------------------------------------------------ */

/**
 * What this account can actually use, which on a free plan is the premade
 * library rather than anything designed.
 *
 * Free to list and free to hold. Nothing is spent until an audition renders a
 * line, so browse here as long as you like.
 */
async function voices(): Promise<void> {
  const key = apiKey()
  const response = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key } })
  if (!response.ok) {
    fail(`Could not list voices (${response.status}). ${(await response.text()).slice(0, 400)}`)
  }

  const body = (await response.json()) as {
    voices?: {
      voice_id?: string
      name?: string
      category?: string
      labels?: Record<string, string>
    }[]
  }
  const all = body.voices ?? []
  if (all.length === 0) fail('The account has no voices available.')

  console.log(`\n  ${all.length} voices on this account\n`)
  console.log(rule())
  for (const voice of all) {
    const labels = Object.entries(voice.labels ?? {})
      .filter(([field]) => field !== 'use_case')
      .map(([, value]) => value)
      .join(', ')
    console.log(
      `  ${(voice.voice_id ?? '').padEnd(22)} ${(voice.name ?? '').padEnd(14)} `
      + `${(voice.category ?? '').padEnd(10)} ${labels}`,
    )
  }
  console.log(rule())
  console.log('\n  Nadia wants: female, late twenties, flat, mildly bored, unhurried.')
  console.log('  Shortlist two or three, then hear them on her real lines:\n')
  console.log('    npm run voice:audition -- <voice_id>\n')
}

/* ------------------------------------------------------------------ *
 * audition
 * ------------------------------------------------------------------ */

async function audition(voiceId: string): Promise<void> {
  const key = apiKey()
  const models = Object.keys(TTS_MODELS) as ElevenLabsTtsModelId[]

  console.log(`\n  Audition — ${voiceId}`)
  console.log(`  ${AUDITION_LINES.length} lines against ${models.length} models\n`)

  gate(await readCredits(key), auditionCharacterCost(AUDITION_LINES, models.length))

  for (const model of models) {
    const dir = join(OUT_ROOT, 'auditions', voiceId, model)
    await mkdir(dir, { recursive: true })
    console.log(`\n  ${model}`)

    for (const [index, line] of AUDITION_LINES.entries()) {
      const audio = await synthesize(key, voiceId, model, line)
      const name = `${auditionFilename(index, line)}.mp3`
      await writeFile(join(dir, name), audio)
      console.log(`    ${name.padEnd(46)} "${line}"`)
    }
  }

  console.log(`\n  Written to ${join(OUT_ROOT, 'auditions', voiceId)}`)
  console.log('  Judge the two-word lines first. They are the product.\n')
}

async function synthesize(
  key: string,
  voiceId: string,
  model: ElevenLabsTtsModelId,
  text: string,
  format = AUDITION_FORMAT,
): Promise<Buffer> {
  const response = await fetch(
    `${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${format}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: Number(process.env['ELEVENLABS_STABILITY'] ?? 0.5),
          similarity_boost: Number(process.env['ELEVENLABS_SIMILARITY'] ?? 0.75),
          speed: Number(process.env['ELEVENLABS_SPEED'] ?? 1),
        },
        apply_text_normalization: 'off',
      }),
    },
  )

  if (!response.ok) {
    // Higher bitrates are gated behind paid tiers on some plans. Drop once,
    // loudly, rather than failing the whole run over an output format.
    if (format !== FALLBACK_FORMAT && (response.status === 401 || response.status === 403)) {
      console.warn(`    (${format} refused — falling back to ${FALLBACK_FORMAT})`)
      return synthesize(key, voiceId, model, text, FALLBACK_FORMAT)
    }
    fail(`Synthesis refused (${response.status}). ${(await response.text()).slice(0, 400)}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  await loadEnvLocal()
  const [command, argument] = process.argv.slice(2)

  if (command === 'voices') return voices()
  if (command === 'design' && argument) return design(argument)
  if (command === 'audition' && argument) return audition(argument)

  console.log(
    [
      '',
      '  Nerve voice CLI',
      '',
      '    npm run voice:voices                   list the voices this plan can use',
      '    npm run voice:design   -- <persona>    build the design prompt, save 3 previews',
      '                                           (paid plans only — free plans use voices)',
      '    npm run voice:audition -- <voice_id>   render her real lines on both TTS models',
      '',
      '  Needs ELEVENLABS_API_KEY in the environment.',
      '',
    ].join('\n'),
  )
  process.exit(argument ? 1 : 0)
}

void main()
