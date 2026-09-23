/**
 * Her pre-rendered particles, loaded for the voice she is cast in
 * (PERSONA-REALISM-REPORT R4).
 *
 * The rules — which sound, when, and how often — are the warmth layer's and
 * live in `lib/warmth/particles.ts`. This file only fetches the audio
 * `scripts/render-particles.ts` wrote under `public/particles/<voice id>/`, once
 * per rep, and hands the adapter raw samples at the pipeline's sample rate.
 *
 * FAILS QUIET, by construction. A voice nobody has rendered particles for, a
 * manifest at the wrong rate, a network blip — every one of them is an empty
 * bank, and an empty bank is a rep that plays no particles, which is exactly
 * the rep this product shipped before they existed. A particle is never worth
 * an error on a live rep (§05).
 */

import { pcm16ToFloat } from './capture'

/** Particle id to mono samples at the pipeline's rate. */
export type ParticleBank = Map<string, Float32Array>

/** What the render script writes beside the audio. */
export interface ParticleManifest {
  voiceId: string
  sampleRate: number
  /** Particle id to file name, relative to the manifest. */
  particles: Record<string, string>
}

/** Where a voice's particles live. The voice id is the directory. */
export function particleBase(voiceId: string): string {
  return `/particles/${encodeURIComponent(voiceId)}`
}

/** The longest particle worth playing. A "Mm." that runs a second is broken. */
export const MAX_PARTICLE_SECONDS = 1.2

export function isParticleManifest(value: unknown): value is ParticleManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Record<string, unknown>
  return typeof manifest.voiceId === 'string'
    && typeof manifest.sampleRate === 'number'
    && !!manifest.particles && typeof manifest.particles === 'object'
}

export async function loadParticles(
  voiceId: string,
  sampleRate: number,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<ParticleBank> {
  const bank: ParticleBank = new Map()
  const base = particleBase(voiceId)
  let manifest: unknown
  try {
    const response = await fetchImpl(`${base}/manifest.json`)
    if (!response.ok) return bank
    manifest = await response.json()
  } catch {
    return bank
  }
  // A manifest at another rate would play at the wrong pitch. None is better.
  if (!isParticleManifest(manifest) || manifest.sampleRate !== sampleRate || manifest.voiceId !== voiceId) return bank

  await Promise.all(Object.entries(manifest.particles).map(async ([id, file]) => {
    if (typeof file !== 'string' || !/^[a-z0-9-]+\.pcm$/.test(file)) return
    try {
      const response = await fetchImpl(`${base}/${file}`)
      if (!response.ok) return
      const samples = pcm16ToFloat(new Uint8Array(await response.arrayBuffer()))
      const seconds = samples.length / sampleRate
      if (seconds > 0.05 && seconds <= MAX_PARTICLE_SECONDS) bank.set(id, samples)
    } catch {
      /* This one particle is not played. The rest are fine. */
    }
  }))
  return bank
}
