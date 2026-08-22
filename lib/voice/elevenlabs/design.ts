/**
 * Voice design and audition.
 *
 * Casting, not plumbing. It is here rather than in the adapter because the
 * output is a `voice_id` that goes into a persona record by hand — the same way
 * every other line of a character contract does (§09's rule about hand-written
 * content applies to who she sounds like as much as to what she says).
 *
 * The audition lines are the important part of this file.
 *
 * A narration-tuned voice sounds superb on a paragraph and falls apart on
 * "Yeah, maybe." Two-word replies are what this product is made of: at CLOSED
 * the warmth band gives her one to four words, and that is the register the
 * illusion has to survive in. So the audition renders her real lines from round
 * 8 and never the vendor's preview paragraph.
 *
 * Pure. The CLI in `scripts/voice.ts` does the network and the file writing.
 */

import type { Persona } from '../types'

/* ------------------------------------------------------------------ *
 * Voice design prompts
 * ------------------------------------------------------------------ */

/**
 * The documented Voice Design prompt format:
 *
 *   Native <Language>. <Gender>, <Age range>. <Quality>. |
 *   Persona: <2-5 words>. Emotion: <2-3 adjectives>.
 */
export interface VoiceDesignBrief {
  language: string
  gender: string
  ageRange: string
  quality: string
  /** Two to five words. */
  persona: string
  /** Two or three adjectives. */
  emotion: string
}

/**
 * Hand-written, one per character, exactly like the contracts themselves.
 *
 * The derived fallback below covers a persona nobody has cast yet; it is a
 * starting point for a listening pass, not a substitute for one.
 */
export const VOICE_DESIGN_BRIEFS: Record<string, VoiceDesignBrief> = {
  nadia: {
    language: 'English',
    gender: 'Female',
    ageRange: 'late twenties',
    quality: 'High quality, clean recording',
    persona: 'distracted bookshop browser',
    emotion: 'flat, mildly bored, unhurried',
  },
}

const GENDER_BY_TIMBRE: Record<Persona['voice']['timbre'], string> = {
  feminine: 'Female',
  masculine: 'Male',
  neutral: 'Neutral',
}

/** A brief for a persona nobody has cast yet, read off the dials. */
export function deriveBrief(persona: Persona): VoiceDesignBrief {
  const { warmth, expansiveness } = persona.delivery
  const emotion = [
    warmth <= 33 ? 'flat' : warmth <= 66 ? 'even' : 'warm',
    persona.distraction >= 50 ? 'distracted' : 'attentive',
    expansiveness <= 40 ? 'unhurried' : 'easy',
  ].join(', ')

  return {
    language: 'English',
    gender: GENDER_BY_TIMBRE[persona.voice.timbre],
    ageRange: 'late twenties',
    quality: 'High quality, clean recording',
    persona: persona.room_tone.replace(/_/g, ' ') + ' regular',
    emotion,
  }
}

export function briefFor(persona: Persona): VoiceDesignBrief {
  return VOICE_DESIGN_BRIEFS[persona.id] ?? deriveBrief(persona)
}

export function renderDesignPrompt(brief: VoiceDesignBrief): string {
  return (
    `Native ${brief.language}. ${brief.gender}, ${brief.ageRange}. ${brief.quality}. `
    + `| Persona: ${brief.persona}. Emotion: ${brief.emotion}.`
  )
}

/* ------------------------------------------------------------------ *
 * Audition
 * ------------------------------------------------------------------ */

/**
 * Nadia's actual lines from round 8, in the order they came out.
 *
 * Chosen because they cover the range the product lives in: a one-word
 * greeting, a quiet aside, two dead-end answers, a bare noun phrase, the one
 * long opinion she offered all session, and a polite refusal. If a voice
 * survives all seven it will survive a rep.
 */
export const AUDITION_LINES: readonly string[] = [
  'Hey.',
  "I'm just speaking quietly.",
  "My sister's birthday.",
  'Yeah, maybe.',
  'More Tana French.',
  'Yeah, sometimes it feels like people being sad in nice houses.',
  "Really, I'm sure. Thanks though.",
]

/** Filesystem-safe stem for a rendered line: `03-yeah-maybe`. */
export function auditionFilename(index: number, line: string): string {
  const slug = line
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${String(index + 1).padStart(2, '0')}-${slug || 'line'}`
}

/** What an audition run will cost, before it is run. */
export function auditionCharacterCost(
  lines: readonly string[] = AUDITION_LINES,
  models = 2,
): number {
  return lines.reduce((total, line) => total + line.length, 0) * models
}
