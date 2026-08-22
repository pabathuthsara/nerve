/**
 * A typed, tiny event emitter shared by adapters. Deliberately not an
 * EventTarget: handlers must not be able to cancel or reorder domain events.
 */

import type { VoiceEventHandler, VoiceEventMap, VoiceEventName } from './types'

type HandlerSet = Set<(payload: never) => void>

export class VoiceEmitter {
  private readonly handlers = new Map<VoiceEventName, HandlerSet>()

  on<E extends VoiceEventName>(event: E, handler: VoiceEventHandler<E>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as (payload: never) => void)
    return () => {
      set?.delete(handler as (payload: never) => void)
    }
  }

  emit<E extends VoiceEventName>(event: E, payload: VoiceEventMap[E]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of [...set]) {
      try {
        ;(handler as VoiceEventHandler<E>)(payload)
      } catch (cause) {
        // A subscriber throwing must not tear down the session it is watching.
        console.error(`[voice] handler for ${event} threw`, cause)
      }
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
