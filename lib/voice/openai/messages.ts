/**
 * Outbound message builders.
 *
 * Separated so the one rule that costs real money if broken can be tested
 * without a peer connection: steering is appended to the conversation, never
 * written into session instructions.
 */

/**
 * Character steering — the band directive, or a re-injected reminder.
 *
 * MUST stay a conversation item. The character contract is the cached prefix;
 * a session.update carrying instructions rewrites that prefix and re-charges
 * the entire contract on the next turn. Round 5 measured exactly that at 2.9x
 * a normal response.
 */
export function buildSteeringItem(text: string): Record<string, unknown> {
  return {
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'system',
      content: [{ type: 'input_text', text }],
    },
  }
}

/** Turn-detection changes are safe: they do not touch the text prefix. */
export function buildTurnDetectionUpdate(
  turnDetection: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      audio: { input: { turn_detection: { ...turnDetection } } },
    },
  }
}
