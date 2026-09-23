/**
 * Render her turn-initial particles, once per voice (PERSONA-REALISM-REPORT R4).
 *
 *   npm run particles:render            render every dating voice
 *   npm run particles:render -- tess    one character
 *
 * The catalogue and every rule about WHEN one plays live in
 * `lib/warmth/particles.ts`; this only turns the catalogue into audio in each
 * cast voice, at casting time, so a live rep never pays to synthesise "Mm.".
 *
 * ── HOW A TAKE IS CHOSEN, WITHOUT AN EAR ────────────────────────────────
 *
 * v3 is nondeterministic and a two-letter prompt is its hardest case, so each
 * particle gets up to four takes and every take is checked three ways:
 *
 *   · trimmed of leading and trailing silence, with 15 ms fades, so the
 *     particle starts on the sound and never clicks;
 *   · a duration inside what the sound actually is (a "Mm." that runs a second
 *     is broken, one under 120 ms is a click);
 *   · transcribed back with the pipeline's own transcriber, and refused if it
 *     reads as a different word — "Well" must come back as "well", and a hum
 *     must not come back as a sentence.
 *
 * The best passing take is kept. **This is not a listening pass**, and the
 * report says so: casting is done by ear (`PERSONA-AUDIT.md` §14.6), and these
 * files are owed one. What this guarantees is that nothing obviously wrong —
 * a click, a spelled-out letter, a clipped word — can reach a customer.
 *
 * Cold particles are rendered at the cold end of her stability ramp and warm
 * ones at Natural, so "Well…" sounds like reluctance and "Oh." like interest
 * (`stabilityForWarmth`). It spends a few cents in all.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadEnvLocal } from './env'
import { DATING_PERSONAS } from '@/lib/personas'
import { PARTICLES, PARTICLES_BY_BAND, type ParticleId } from '@/lib/warmth/particles'
import { ElevenLabsPersonaCompiler, stabilityForWarmth } from '@/lib/voice/elevenlabs/persona'
import { resolvePipelineConfig, type PipelineEnv } from '@/lib/voice/elevenlabs/config'
import { DEFAULT_CALIBRATION, type Persona } from '@/lib/voice/types'
import { MAX_PARTICLE_SECONDS } from '@/lib/voice/elevenlabs/particles'

const SAMPLE_RATE = 24_000
const MODEL = 'eleven_v3_conversational'
const TAKES = 4
const MIN_SECONDS = 0.12

/**
 * What each particle may be heard as. Empty means "a hum; no word expected".
 *
 * A transcriber pinned to English still writes a HUM in whichever script has a
 * word for one — "음", "嗯", "응", "うん" — and "Oh" as "哦" or "오". That is
 * the same artefact `lib/warmth/turn-kind.ts` documents for a user's hum, and
 * here it is EVIDENCE: the take is the sound it should be. What is refused is a
 * take that came back as a different syllable ("아", "A", "Ja", "呀").
 */
const HEARD_AS: Record<ParticleId, RegExp> = {
  oh: /^(?:(?:oh|ooh|ohh|o)\b|哦$|오$|おお?$)/i,
  mm: /^$|^(?:(?:m+|hm+|mhm|hmm+|mm+)\b|음$|嗯$|응$|うん$|ん$)/i,
  yeah: /^(yeah|yea|yes)\b/i,
  hm: /^$|^(?:(?:h?m+|hmm+|huh|hm)\b|음$|嗯$|응$|うん$|ん$)/i,
  well: /^(well|wel)\b/i,
}

/** Which warmth a particle is rendered at: the coldest band that uses it. */
function renderWarmth(id: ParticleId): number {
  const cold = (['HOSTILE', 'CLOSED', 'GUARDED'] as const).some((band) => PARTICLES_BY_BAND[band].includes(id))
  return cold ? 25 : 70
}

async function synthesise(voiceId: string, text: string, stability: number, apiKey: string): Promise<Int16Array> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_${SAMPLE_RATE}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text, model_id: MODEL,
        voice_settings: { stability, similarity_boost: 0.75, speed: 1 },
        apply_text_normalization: 'off',
      }),
    },
  )
  if (!response.ok) throw new Error(`synthesis ${response.status}: ${(await response.text()).slice(0, 200)}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1).slice()
}

/** Trim silence either side, then fade 15 ms in and out so it never clicks. */
export function trim(samples: Int16Array): Int16Array {
  const window = Math.round(SAMPLE_RATE * 0.01)
  const threshold = 500
  const loud = (start: number) => {
    let peak = 0
    for (let i = start; i < Math.min(samples.length, start + window); i += 1) peak = Math.max(peak, Math.abs(samples[i] ?? 0))
    return peak > threshold
  }
  let start = 0
  while (start < samples.length && !loud(start)) start += window
  let end = samples.length
  while (end > start && !loud(Math.max(start, end - window))) end -= window
  const pad = Math.round(SAMPLE_RATE * 0.02)
  const out = samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad))
  const fade = Math.min(Math.round(SAMPLE_RATE * 0.015), out.length >> 1)
  for (let i = 0; i < fade; i += 1) {
    out[i] = Math.round((out[i] ?? 0) * (i / fade))
    out[out.length - 1 - i] = Math.round((out[out.length - 1 - i] ?? 0) * (i / fade))
  }
  return out
}

function wav(samples: Int16Array): Blob {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)) }
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.byteLength, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  write(36, 'data'); view.setUint32(40, samples.byteLength, true)
  return new Blob([header, samples.buffer as ArrayBuffer], { type: 'audio/wav' })
}

async function transcribe(samples: Int16Array, apiKey: string): Promise<string> {
  const form = new FormData()
  form.append('file', wav(samples), 'particle.wav')
  form.append('model', 'gpt-4o-mini-transcribe')
  form.append('language', 'en')
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  })
  if (!response.ok) return '?'
  const body = await response.json() as { text?: string }
  return (body.text ?? '').trim().replace(/[^\p{L}\s]/gu, '').trim()
}

interface Take { samples: Int16Array; seconds: number; heard: string; ok: boolean }

async function renderVoice(persona: Persona, keys: { el: string; openai: string }): Promise<void> {
  const voiceId = persona.voice.ids.elevenlabs
  if (!voiceId) return
  const compiled = new ElevenLabsPersonaCompiler(resolvePipelineConfig(process.env as PipelineEnv)).compile(persona, DEFAULT_CALIBRATION)
  const dir = join(process.cwd(), 'public', 'particles', voiceId)
  await mkdir(dir, { recursive: true })
  const manifest: { voiceId: string; sampleRate: number; persona: string; particles: Record<string, string>; takes: Record<string, unknown> } = {
    voiceId, sampleRate: SAMPLE_RATE, persona: persona.slug, particles: {}, takes: {},
  }
  for (const particle of Object.values(PARTICLES)) {
    const stability = stabilityForWarmth(persona, compiled.tts.stability, renderWarmth(particle.id))
    const takes: Take[] = []
    for (let attempt = 0; attempt < TAKES; attempt += 1) {
      const samples = trim(await synthesise(voiceId, particle.text, stability, keys.el))
      const seconds = samples.length / SAMPLE_RATE
      const heard = await transcribe(samples, keys.openai)
      const ok = seconds >= MIN_SECONDS && seconds <= MAX_PARTICLE_SECONDS && HEARD_AS[particle.id].test(heard)
      takes.push({ samples, seconds, heard, ok })
      console.log(`  ${persona.name.padEnd(6)} ${particle.id.padEnd(5)} take ${attempt + 1}: ${seconds.toFixed(2)}s heard "${heard}" ${ok ? 'ok' : 'refused'}`)
      if (ok && takes.filter((take) => take.ok).length >= 2) break
    }
    // The shortest passing take: a particle is a beat, and the long ones are
    // the ones where the model decided to perform it.
    const best = takes.filter((take) => take.ok).sort((a, b) => a.seconds - b.seconds)[0]
    manifest.takes[particle.id] = takes.map((take) => ({ seconds: Number(take.seconds.toFixed(3)), heard: take.heard, ok: take.ok }))
    if (!best) { console.log(`  ${persona.name} ${particle.id}: no take passed; not shipped`); continue }
    const file = `${particle.id}.pcm`
    await writeFile(join(dir, file), Buffer.from(best.samples.buffer, best.samples.byteOffset, best.samples.byteLength))
    manifest.particles[particle.id] = file
  }
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${persona.name}: ${Object.keys(manifest.particles).length}/${Object.keys(PARTICLES).length} particles → public/particles/${voiceId}/`)
}

async function main(): Promise<void> {
  await loadEnvLocal()
  const el = process.env.ELEVENLABS_API_KEY
  const openai = process.env.OPENAI_API_KEY
  if (!el || !openai) throw new Error('ELEVENLABS_API_KEY and OPENAI_API_KEY are both needed.')
  const only = process.argv.slice(2)
  const personas = Object.values(DATING_PERSONAS).filter((persona) => only.length === 0 || only.includes(persona.slug))
  for (const persona of personas) await renderVoice(persona, { el, openai })
}

void main()
