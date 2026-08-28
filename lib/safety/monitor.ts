'use client'

/**
 * The browser half of moderation (§16.3).
 *
 * It carries turns to `/api/safety` and hands back the action. It decides
 * nothing: the verdict and the escalation are the server's, because the strike
 * count has to survive a reload and because a client that grades its own
 * conduct is not a control.
 *
 * TWO PROPERTIES, AND BOTH ARE THE POINT.
 *
 * **It never blocks a rep.** `observe` returns immediately. The classification
 * happens while she is already answering, and the action lands a beat later.
 * Anything else would put a third party's latency in front of every reply she
 * speaks, and §05 does not have a budget for that.
 *
 * **It is a queue of one.** Turns are classified strictly in order, one at a
 * time. Two in flight together would each read the strike count before the
 * other's row was written, so a user who crossed the line twice in four
 * seconds would collect two first strikes and be declined twice instead of
 * being stopped. Ordering is the whole correctness argument here.
 */

import type { SafetyAction } from './escalation'
import type { SafetySpeaker } from './moderation'

export interface SafetyMonitorOptions {
  /** Called for every action but `none`, in the order the turns were spoken. */
  onAction: (action: SafetyAction) => void
  /** Injected for tests. Nothing else has a reason to pass it. */
  fetchImpl?: typeof fetch
  endpoint?: string
}

interface Pending {
  speaker: SafetySpeaker
  text: string
}

export class SafetyMonitor {
  private readonly queue: Pending[] = []
  private running = false
  private stopped = false
  private session: string | null = null
  private readonly controller = new AbortController()
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: SafetyMonitorOptions) {
    this.endpoint = options.endpoint ?? '/api/safety'
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
  }

  /**
   * The row id, once the insert lands.
   *
   * A rep's first turns are spoken before `startSession` has come back, so the
   * earliest events are written with a null session id and counted against the
   * user instead. Attaching the id late is better than delaying moderation
   * until the database has caught up.
   */
  setSessionId(id: string): void {
    this.session = id
  }

  /** Enqueue a committed turn. Returns immediately; never throws. */
  observe(speaker: SafetySpeaker, text: string): void {
    if (this.stopped) return
    const trimmed = text.trim()
    if (!trimmed) return
    // A cap on the backlog, not on the rep. If the classifier is slow enough
    // for turns to pile up this deep, the ones at the front are the ones worth
    // having — a queue that grows without bound would still be draining a
    // three-minute rep an hour later.
    if (this.queue.length >= 40) return
    this.queue.push({ speaker, text: trimmed })
    void this.drain()
  }

  /** The rep is over. In-flight work is abandoned, not awaited. */
  stop(): void {
    this.stopped = true
    this.queue.length = 0
    this.controller.abort()
  }

  private async drain(): Promise<void> {
    if (this.running || this.stopped) return
    this.running = true
    try {
      while (this.queue.length > 0 && !this.stopped) {
        const next = this.queue.shift()
        if (!next) break
        const action = await this.classify(next)
        if (this.stopped) return
        if (action !== 'none') this.options.onAction(action)
      }
    } finally {
      this.running = false
    }
  }

  private async classify(pending: Pending): Promise<SafetyAction> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.session,
          speaker: pending.speaker,
          text: pending.text,
        }),
        signal: this.controller.signal,
      })
      if (!response.ok) return 'none'
      const payload = (await response.json()) as { action?: unknown }
      return isAction(payload.action) ? payload.action : 'none'
    } catch {
      // Aborted, offline, unparseable. The rep carries on — see the note on
      // failing open in `lib/safety/assess.ts`.
      return 'none'
    }
  }
}

const ACTIONS: readonly SafetyAction[] = ['none', 'decline', 'correct', 'end', 'distress']

function isAction(value: unknown): value is SafetyAction {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}
