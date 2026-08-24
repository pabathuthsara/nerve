/**
 * The things that go wrong inside a live rep, counted.
 *
 * Every one of these already had an event. None of them had a listener on the
 * screen a real user is actually on: `lib/data/rep.ts` subscribed to `error` and
 * acted only when `fatal`, so `agent.overlap`, `agent.double-turn`,
 * `agent.unheard`, `agent.tool-leak`, `agent.truncated`, `user.echo-rejected`
 * and the response gate's stall watchdog were all emitted and dropped.
 *
 * The M0 harness at `/rep` counted every one of them and put them in a
 * downloadable report. Production counted none — which is why the first
 * evidence that she was being cut off mid-word was somebody noticing by ear.
 *
 * These are not errors in the sense the user should ever see. They are the
 * difference between a pipeline that is working and one that is quietly
 * failing, and the only way to tell those apart is a number.
 */

import type { VoiceProvider } from './provider'

export interface RepIncidents {
  /** A second response appeared while one was already generating or playing. */
  overlaps: number
  /** She spoke twice with no user turn between, both audible. */
  doubleTurns: number
  /** A reply was generated and never reached the speakers. */
  unheard: number
  /** She was cut off mid-line and the transcript was cut back to match. */
  truncated: number
  /** A user turn was discarded as her own voice returning through the mic. */
  echoRejected: number
  /** Tool-call syntax was suppressed from something she said out loud. */
  toolLeaks: number
  /** Non-fatal provider errors, including the turn gate releasing itself. */
  providerErrors: number
}

export function emptyIncidents(): RepIncidents {
  return {
    overlaps: 0,
    doubleTurns: 0,
    unheard: 0,
    truncated: 0,
    echoRejected: 0,
    toolLeaks: 0,
    providerErrors: 0,
  }
}

/**
 * Is this rep going badly enough that the transcript should not be trusted?
 *
 * Rates rather than counts, because a handful of anything across three minutes
 * is a conversation with some barge-in in it. The thresholds are what "the
 * pipeline is broken" actually looks like: she is being cut off on most replies,
 * or real turns are being deleted repeatedly, or she is talking into a void.
 */
export function incidentsAreAlarming(
  incidents: RepIncidents,
  agentTurns: number,
): boolean {
  if (agentTurns < 4) return false
  if (incidents.unheard >= 3) return true
  if (incidents.echoRejected >= 3) return true
  return incidents.truncated / agentTurns > 0.5
}

/**
 * Subscribe a counter to every incident a provider can report.
 *
 * Returns an unsubscribe. Deliberately takes the provider interface rather than
 * an adapter: an incident is a fact about a rep, not about a vendor, and the
 * ElevenLabs arm emits the same events.
 */
export function countIncidents(
  voice: VoiceProvider,
  onChange: (incidents: RepIncidents) => void,
): { incidents: RepIncidents; stop: () => void } {
  const incidents = emptyIncidents()
  const bump = <K extends keyof RepIncidents>(key: K) => () => {
    incidents[key] += 1
    onChange(incidents)
  }

  const offs = [
    voice.on('agent.overlap', bump('overlaps')),
    voice.on('agent.double-turn', bump('doubleTurns')),
    voice.on('agent.unheard', bump('unheard')),
    voice.on('agent.truncated', bump('truncated')),
    voice.on('user.echo-rejected', bump('echoRejected')),
    voice.on('agent.tool-leak', bump('toolLeaks')),
    voice.on('error', ({ error }) => {
      if (error.fatal) return
      incidents.providerErrors += 1
      onChange(incidents)
    }),
  ]

  return { incidents, stop: () => offs.forEach((off) => off()) }
}
