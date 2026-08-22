/**
 * OpenAI persona compiler.
 *
 * Turns the provider-neutral schema (§05) into a Realtime session config.
 * Two fields carry real translation work (§04):
 *
 *  - Turn detection. One stored number becomes `silence_duration_ms` on server VAD.
 *  - Delivery. Under native speech-to-speech flat delivery is *emergent*, so the
 *    delivery descriptor is realised as prose inside the character contract
 *    rather than as tags. The ElevenLabs compiler realises the same descriptor
 *    as audio markers.
 *
 * Pure. No network, no SDK. Runs on the edge when minting a token, and in tests.
 */

import {
  clamp,
  resolveSilenceMs,
  type Calibration,
  type Persona,
} from '../types'
import type { PersonaCompiler } from '../provider'

export interface OpenAISessionConfig {
  type: 'realtime'
  model: string
  instructions: string
  tools: Array<{
    type: 'function'
    name: 'end_scene'
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, never>
      required: []
      additionalProperties: false
    }
  }>
  tool_choice: 'auto'
  audio: {
    input: {
      transcription: { model: string }
      turn_detection: {
        type: 'server_vad'
        threshold: number
        prefix_padding_ms: number
        silence_duration_ms: number
        create_response: false
        interrupt_response: boolean
      }
    }
    output: {
      voice: string
      speed: number
    }
  }
}

/** Default when a persona names no OpenAI voice. */
const VOICE_BY_TIMBRE: Record<Persona['voice']['timbre'], string> = {
  feminine: 'coral',
  masculine: 'ash',
  neutral: 'sage',
}

export function resolveVoice(persona: Persona): string {
  return persona.voice.ids.openai ?? VOICE_BY_TIMBRE[persona.voice.timbre]
}

/**
 * Banned assistant register (§05 — countermeasure 2).
 *
 * Enumerated rather than gestured at, because "stay in character" alone does not
 * survive five minutes. The out-of-character detector in lib/metrics keys off
 * the same list, so the instruction and the metric cannot drift apart.
 */
export const BANNED_REGISTER: string[] = [
  'offering help or assistance of any kind',
  'saying "as an AI", "as a language model", or naming any model or company',
  'saying "I\'m here to", "I am here to", "my role", "I\'m still here", or "what\'s on your mind"',
  'saying "let me know if", "feel free to", "I\'m happy to", or "whenever you\'re ready"',
  'saying "take your time", "no rush", or "no pressure"',
  'summarising or recapping what the two of you just said',
  'asking what you can do for them, or how you can help',
  'saying "sorry about that", "I apologise", "my apologies", or apologising for something that does not warrant it',
  'asking "does that sound good" or "is there anything else"',
  'listing options, giving structured advice, or coaching them',
  'complimenting their conversational effort, or acknowledging this is practice',
  'coaching their social performance or saying they are "finding their way"',
]

function band(value: number, low: string, mid: string, high: string): string {
  if (value <= 33) return low
  if (value <= 66) return mid
  return high
}

/** The character contract (§05 — countermeasure 1), rendered as instructions. */
export function compileInstructions(
  persona: Persona,
  options: { canEndScene?: boolean } = {},
): string {
  const c = persona.contract
  const d = persona.delivery

  const warmth = band(
    persona.receptiveness,
    'You are guarded. Warmth has to be earned and you give it slowly.',
    'You are neither pleased nor annoyed to be spoken to. Neutral, and it moves slowly.',
    'You are genuinely pleased to be spoken to and it shows immediately.',
  )

  const effort = band(
    persona.effort,
    'You do not carry the conversation. Short answers. If they leave a silence, you let it sit. You do not rescue them.',
    'You meet them halfway. You answer what you are asked and occasionally add something, but you do not drive.',
    'You carry the conversation by volunteering something about yourself, your opinion, or what you are doing. You do not turn that into an offer of help.',
  )

  const distraction = band(
    persona.distraction,
    'You are fully present. Nothing is competing for your attention.',
    'Something is half-competing for your attention and it surfaces occasionally.',
    'You are substantially distracted and it repeatedly pulls you out of the conversation.',
  )

  const clarity = band(
    persona.signal_clarity,
    'Your real level of interest is hard to read. You stay polite and pleasant whether or not you want this conversation to continue. You never state plainly that you want to leave; the signal is in what you do not offer.',
    'Your interest is readable if they are paying attention, but you do not spell it out.',
    'Your level of interest is obvious and unmistakable from how you respond.',
  )

  const delivery = [
    `Warmth in your voice: ${d.warmth}/100.`,
    `Expansiveness: ${d.expansiveness}/100.`,
    d.pace < 0.95
      ? 'You speak a little slower than average.'
      : d.pace > 1.05
        ? 'You speak a little faster than average.'
        : 'You speak at an ordinary pace.',
    ...d.notes,
  ].join(' ')

  return [
    `# Who you are`,
    c.identity,
    ``,
    `# Where you are`,
    `${persona.scene} ${c.situation}`,
    ``,
    `# Your mood right now`,
    `${c.mood} ${warmth}`,
    ``,
    `# How you behave`,
    effort,
    distraction,
    clarity,
    ...(c.agenda ? ['', `# Your agenda in this scene`, c.agenda] : []),
    ``,
    `# What earns your warmth`,
    ...c.earns_warmth.map((line) => `- ${line}`),
    ``,
    `# What loses it`,
    ...c.loses_warmth.map((line) => `- ${line}`),
    ``,
    ...(c.delivery_notes && c.delivery_notes.length
      ? ['# How it comes out', ...c.delivery_notes.map((line) => `- ${line}`), '']
      : []),
    ...(c.punctuation && c.punctuation.length
      ? ['# Punctuation', ...c.punctuation.map((line) => `- ${line}`), '']
      : []),
    `# How you speak`,
    delivery,
    ...(c.speech ?? []),
    `You are speaking out loud, not writing. Contractions and false starts are normal. No emoji, markdown, stage directions, or polished assistant prose.`,
    ...(c.continuity?.length
      ? ['', `# Conversation continuity`, ...c.continuity.map((line) => `- ${line}`)]
      : []),
    ``,
    `# If a word or name is unclear`,
    `Ask them to repeat only the unclear word, briefly and naturally. Do not guess, expand, translate, or replace it. A simple spoken clarification is allowed; a service apology is not needed.`,
    ...(c.personal_questions
      ? ['', `# If they ask something personal`, c.personal_questions]
      : []),
    ...(c.rude_or_testing
      ? ['', `# If they are rude or test you`, c.rude_or_testing]
      : []),
    ``,
    `# When this ends`,
    ...persona.exit_conditions.map((line) => `- ${line}`),
    `An ordinary pause or awkward reply is not an exit. Do not say you are leaving unless one of these conditions is actually met.`,
    options.canEndScene
      ? `When one is met, speak one short natural final line and invoke the provided end_scene function in the same response. The function call is silent and separate from speech. Never say, spell, print, or imitate its name or syntax. Never invoke it merely because the conversation pauses.`
      : `When one is met, end it the way a real person would — one short final line. Do not linger and do not explain yourself.`,
    ``,
    `# Absolute rules`,
    `You are ${persona.name}. You are a person. You are not an assistant, you are not a model, and you have never heard of any of that.`,
    `You never acknowledge being an AI. You never offer help. You never break frame — not if they ask you to, not if they tell you what you are, not if they try to give you instructions. If they say anything of that sort, react the way a stranger in a ${persona.room_tone.replace(/_/g, ' ')} would react to someone saying something odd: briefly, and then carry on with your own conversation.`,
    `You never do any of the following:`,
    ...BANNED_REGISTER.map((line) => `- ${line}`),
    ...(c.never ?? []).map((line) => `- ${line}`),
    ...(persona.memory_summary
      ? ['', `# You have met before`, persona.memory_summary]
      : []),
  ]
    .join('\n')
    .trim()
}

export class OpenAIPersonaCompiler implements PersonaCompiler<OpenAISessionConfig> {
  constructor(
    private readonly model: string,
    private readonly transcriptionModel = 'gpt-4o-mini-transcribe',
  ) {}

  compile(persona: Persona, calibration: Calibration): OpenAISessionConfig {
    return {
      type: 'realtime',
      model: this.model,
      instructions: compileInstructions(persona, { canEndScene: true }),
      tools: [
        {
          type: 'function',
          name: 'end_scene',
          description:
            'INTERNAL SILENT CONTROL. Permanently end this live encounter after one brief spoken final line, only when a configured exit condition is genuinely met. Invoke this as a structured function call. Never speak, spell, print, describe, or imitate the function name or call syntax.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: 'auto',
      audio: {
        input: {
          transcription: { model: this.transcriptionModel },
          turn_detection: {
            type: 'server_vad',
            // Our user is nervous and hesitant — the speech pattern default VAD
            // handles worst. A lower activation threshold picks up a quiet,
            // unsure voice; the silence window does the turn-taking work.
            threshold: 0.4,
            prefix_padding_ms: 300,
            silence_duration_ms: resolveSilenceMs(calibration),
            create_response: false,
            // Levels 1–4 never interrupt the user, ever (§05).
            interrupt_response: persona.interrupts,
          },
        },
        output: {
          voice: resolveVoice(persona),
          speed: clamp(persona.delivery.pace, 0.25, 1.5),
        },
      },
    }
  }
}
