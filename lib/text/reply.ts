import 'server-only'

/**
 * The character, replying in text.
 *
 * Same contract, same steering vocabulary, same memory as a voice rep — the
 * whole point of text mode is that it is the same character, so a person who
 * warms up here and then opens their microphone meets somebody they have
 * already met.
 *
 * What is different is stated in the addendum below and nowhere else: she is
 * typing, and there is no clock. Both are true of the medium rather than of
 * her, which is why they are a short appended block rather than a second
 * contract — a character rewritten per surface is two characters.
 *
 * The contract is compiled here from a persona id the caller resolved, never
 * from anything a client sent. Same rule as the token route, same reason: a
 * client that can post its own instructions can post its own character.
 */

import { compileInstructions } from '@/lib/voice/openai/persona'
import { composeSteering } from '@/lib/warmth/steering'
import { chatApiKey, completeChat, type ChatMessage } from '@/lib/voice/chat'
import { resolvePipelineConfig, type PipelineEnv } from '@/lib/voice/elevenlabs/config'
import { EXIT_SENTINEL, stripSentinel } from '@/lib/voice/elevenlabs/llm'
import type { Persona } from '@/lib/voice/types'
import { historyFrom, type TextTurn } from './thread'
import { textWarmth } from './warmth'

/**
 * The two things that are true of the medium and not of the character.
 *
 * Deliberately short. Every temptation to explain more here is a temptation to
 * write a second character contract, and the failure mode of that is the
 * bookshop stranger sounding like a chat assistant the moment she is typed at.
 */
const TEXT_MEDIUM = [
  '# You are typing, not speaking',
  'This is a message thread. Write the way that person would text: lower case is fine, contractions are normal, no stage directions, no emoji, no markdown, no asterisks.',
  'One short message. Two at the very most, and only when the second is genuinely a separate thought.',
  'There is no clock on this conversation and nothing is being timed. Do not hurry it and do not wind it down early.',
].join('\n')

/** Reply length. A text reply is shorter than a spoken one, not longer. */
const MAX_TOKENS = 160
const TEMPERATURE = 0.9

export interface TextReplyInput {
  persona: Persona
  /** The thread so far, oldest first, INCLUDING the turn just typed. */
  turns: readonly TextTurn[]
  /**
   * A one-off direction for this reply only (§16.3).
   *
   * Today there is exactly one caller: the moderation layer, telling her that
   * the message she is about to answer crossed a line and that she should
   * decline it in her own words. It is a direction rather than a scripted
   * sentence for the same reason every other reinforcement in this product is
   * — a canned line here would be the one message in the thread that sounds
   * like an app, at the exact moment it must not.
   */
  directive?: string
}

/**
 * The same character model the pipeline arm uses, resolved from the same
 * config. Text mode is not a place to run a cheaper character.
 */
function textModel(): string {
  return resolvePipelineConfig(process.env as unknown as PipelineEnv).llm.model
}

export type TextReplyResult =
  | { ok: true; text: string; ended: boolean }
  | { ok: false; message: string }

/**
 * Her next message.
 *
 * `ended` is the same end-of-scene sentinel the pipeline arm uses, and it is
 * stripped before the text is stored — it can never be spoken there and it can
 * never be read here. A scene that ends in text is not a loss and is not
 * graded; it simply means she has gone, and the screen offers to start fresh.
 */
export async function characterReply(input: TextReplyInput): Promise<TextReplyResult> {
  const key = chatApiKey()
  if (!key.ok) return { ok: false, message: 'Text mode is not configured yet.' }

  const userTurns = input.turns.filter((turn) => turn.speaker === 'user').length
  const warmth = textWarmth(input.persona, userTurns)

  const messages: ChatMessage[] = [
    { role: 'system', content: compileInstructions(input.persona, { canEndScene: false }) },
    { role: 'system', content: TEXT_MEDIUM },
    {
      role: 'system',
      content:
        `When one of the listed exit conditions is genuinely met, finish your short final line and then write ${EXIT_SENTINEL} on the end. `
        + `It is silent bookkeeping and is removed before anything is shown. Never write it for any other reason, and never merely because the conversation paused.`,
    },
    ...historyFrom(input.turns),
    // The band direction, last, so it is the most recent thing she reads —
    // exactly where the pipeline arm puts it, and for the same reason.
    { role: 'system', content: composeSteering({ persona: input.persona, warmth }) },
    // After the steering, so it is the very last thing she reads. A decline
    // has to outrank the band direction it contradicts.
    ...(input.directive ? [{ role: 'system' as const, content: input.directive }] : []),
  ]

  const completion = await completeChat({
    apiKey: key.key,
    model: textModel(),
    messages,
    temperature: TEMPERATURE,
    maxTokens: MAX_TOKENS,
  })

  if (!completion.ok) {
    // Honest and short. The thread is already saved with his turn on it, so
    // "she did not answer" is recoverable by sending again.
    return { ok: false, message: 'She did not answer. Try that again in a moment.' }
  }

  const text = stripSentinel(completion.text)
  if (!text) return { ok: false, message: 'She did not answer. Try that again in a moment.' }

  return { ok: true, text, ended: completion.text.includes(EXIT_SENTINEL) }
}
