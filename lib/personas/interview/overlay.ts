/**
 * Applying the interview brief to a persona (C5).
 *
 * One function, two callers — `handleLlmRequest` and `createCombinedTurn` —
 * because both recompile the contract on every turn and a rule written in two
 * places is a rule that will be right in one of them.
 *
 * **A no-op without a brief**, which is every dating rep. That is what makes it
 * safe: `withInterviewBrief(nadia, {})` returns the identical object, so the
 * compiled prompt A0 pins does not move.
 *
 * The brief is appended to the CONTRACT rather than passed as a separate
 * message, because the contract is what `compileInstructions` emits first and
 * therefore what the cached system-prompt prefix contains.
 */

import type { Persona } from '@/lib/voice/types'

export function withInterviewBrief<T extends Persona>(
  persona: T,
  overlay: { interviewBrief?: string },
): T {
  const brief = overlay.interviewBrief?.trim()
  if (!brief) return persona
  return { ...persona, contract: `${persona.contract.trim()}\n\n${brief}` }
}
