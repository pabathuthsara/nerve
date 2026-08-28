/**
 * The browser half: ordering, and never getting in the way.
 *
 * The correctness argument for this class is the queue. Two turns classified
 * concurrently each read the strike count before the other's row was written,
 * so a user who crossed the line twice in four seconds would collect two FIRST
 * strikes and be declined twice instead of stopped. That is the bug this file
 * exists to prevent and it is the first thing asserted.
 *
 * The rest is the promise that nothing here can end a rep by accident: an
 * offline classifier, a 500, a body that will not parse and an action nobody
 * has heard of all have to come out as `none`.
 */

import { describe, expect, it, vi } from 'vitest'
import { SafetyMonitor } from './monitor'
import type { SafetyAction } from './escalation'

/** A fetch that resolves when we say so, so ordering can be observed. */
function deferred() {
  const calls: { body: Record<string, unknown>; resolve: (action: SafetyAction) => void }[] = []
  const fetchImpl = ((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    return new Promise<Response>((resolve) => {
      calls.push({
        body,
        resolve: (action) => resolve(new Response(JSON.stringify({ action }), { status: 200 })),
      })
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

/** A fetch that answers immediately, always the same way. */
function always(payload: unknown, status = 200) {
  const impl = vi.fn(async () => new Response(JSON.stringify(payload), { status }))
  return impl as unknown as typeof fetch & typeof impl
}

/** The body of the nth request, parsed. */
function sentBody(impl: typeof fetch, index = 0): Record<string, unknown> {
  const mock = impl as unknown as ReturnType<typeof vi.fn>
  const init = mock.mock.calls[index]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
}

/** How many requests it made. */
function sentCount(impl: typeof fetch): number {
  return (impl as unknown as ReturnType<typeof vi.fn>).mock.calls.length
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('ordering', () => {
  it('classifies one turn at a time', async () => {
    const { calls, fetchImpl } = deferred()
    const monitor = new SafetyMonitor({ onAction: () => {}, fetchImpl })

    monitor.observe('user', 'first')
    monitor.observe('user', 'second')
    await tick()

    // The second must not be in flight while the first is unanswered — it
    // would read a strike count the first has not yet written.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body.text).toBe('first')

    calls[0]?.resolve('none')
    await tick()
    expect(calls).toHaveLength(2)
    expect(calls[1]?.body.text).toBe('second')
  })

  it('reports actions in the order the turns were spoken', async () => {
    const { calls, fetchImpl } = deferred()
    const seen: SafetyAction[] = []
    const monitor = new SafetyMonitor({ onAction: (action) => seen.push(action), fetchImpl })

    monitor.observe('user', 'one')
    monitor.observe('user', 'two')
    await tick()
    calls[0]?.resolve('decline')
    await tick()
    calls[1]?.resolve('end')
    await tick()

    expect(seen).toEqual(['decline', 'end'])
  })

  it('returns immediately rather than waiting for a verdict', () => {
    const { fetchImpl } = deferred()
    const monitor = new SafetyMonitor({ onAction: () => {}, fetchImpl })
    // Nothing about a live rep may wait on a classifier (§05). `observe`
    // returning void rather than a promise is what makes that structural.
    expect(monitor.observe('user', 'hello')).toBeUndefined()
  })
})

describe('what it sends', () => {
  it('carries the stream and the session', async () => {
    const fetchImpl = always({ action: 'none' })
    const monitor = new SafetyMonitor({ onAction: () => {}, fetchImpl })
    monitor.setSessionId('11111111-2222-3333-4444-555555555555')
    monitor.observe('agent', 'her line')
    await tick()

    expect(sentBody(fetchImpl)).toMatchObject({
      speaker: 'agent',
      text: 'her line',
      sessionId: '11111111-2222-3333-4444-555555555555',
    })
  })

  it('sends turns before the session row exists', async () => {
    // A rep's first turns are spoken before `startSession` comes back.
    // Moderating them late would leave the opening of every rep unwatched.
    const fetchImpl = always({ action: 'none' })
    const monitor = new SafetyMonitor({ onAction: () => {}, fetchImpl })
    monitor.observe('user', 'hello')
    await tick()
    expect(sentBody(fetchImpl).sessionId).toBeNull()
  })

  it('ignores an empty turn', async () => {
    const fetchImpl = always({ action: 'none' })
    const monitor = new SafetyMonitor({ onAction: () => {}, fetchImpl })
    monitor.observe('user', '   ')
    await tick()
    expect(sentCount(fetchImpl)).toBe(0)
  })
})

describe('nothing here ends a rep by accident', () => {
  it('does nothing when the route fails', async () => {
    const seen: SafetyAction[] = []
    const monitor = new SafetyMonitor({ onAction: (a) => seen.push(a), fetchImpl: always({}, 500) })
    monitor.observe('user', 'hello')
    await tick()
    expect(seen).toEqual([])
  })

  it('does nothing when the network is gone', async () => {
    const seen: SafetyAction[] = []
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    const monitor = new SafetyMonitor({ onAction: (a) => seen.push(a), fetchImpl: failing })
    monitor.observe('user', 'hello')
    await tick()
    expect(seen).toEqual([])
  })

  it('ignores an action it does not recognise', async () => {
    const seen: SafetyAction[] = []
    const monitor = new SafetyMonitor({
      onAction: (a) => seen.push(a),
      fetchImpl: always({ action: 'delete-everything' }),
    })
    monitor.observe('user', 'hello')
    await tick()
    expect(seen).toEqual([])
  })

  it('keeps working after a failure', async () => {
    // One bad round trip must not silence moderation for the rest of the rep.
    const { calls, fetchImpl } = deferred()
    const seen: SafetyAction[] = []
    const monitor = new SafetyMonitor({ onAction: (a) => seen.push(a), fetchImpl })
    monitor.observe('user', 'one')
    monitor.observe('user', 'two')
    await tick()
    calls[0]?.resolve('none')
    await tick()
    calls[1]?.resolve('end')
    await tick()
    expect(seen).toEqual(['end'])
  })
})

describe('stop', () => {
  it('drops the queue and takes no further turns', async () => {
    const fetchImpl = always({ action: 'none' })
    const monitor = new SafetyMonitor({ onAction: () => {}, fetchImpl })
    monitor.stop()
    monitor.observe('user', 'hello')
    await tick()
    expect(sentCount(fetchImpl)).toBe(0)
  })

  it('reports nothing that lands after the rep is over', async () => {
    const { calls, fetchImpl } = deferred()
    const seen: SafetyAction[] = []
    const monitor = new SafetyMonitor({ onAction: (a) => seen.push(a), fetchImpl })
    monitor.observe('user', 'one')
    await tick()
    monitor.stop()
    calls[0]?.resolve('end')
    await tick()
    // Ending a rep that already ended, on a screen that has moved on.
    expect(seen).toEqual([])
  })
})

describe('the backlog', () => {
  it('is bounded', async () => {
    // If the classifier is slow enough for turns to pile up this deep, the
    // ones at the front are the ones worth having — a queue that grew without
    // bound would still be draining a three-minute rep an hour later.
    const { calls, fetchImpl } = deferred()
    const monitor = new SafetyMonitor({ onAction: () => {}, fetchImpl })
    for (let index = 0; index < 60; index += 1) monitor.observe('user', `turn ${index}`)
    await tick()

    for (let index = 0; index < 45; index += 1) {
      calls[index]?.resolve('none')
      await tick()
    }
    expect(calls.length).toBeLessThanOrEqual(41)
  })
})
