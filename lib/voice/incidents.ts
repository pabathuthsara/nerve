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

/**
 * One inaudible reply, with the evidence that says whose fault it was.
 *
 * The counts below say a rep went wrong. This says *how*, and it exists
 * because the one measurement that separates the two possible causes was
 * being computed and thrown away: `settleHerVoice` read the inbound RTP
 * counter across every silent turn, formatted it into a console string and
 * dropped it. Five reps' worth of the answer was lost that way before anybody
 * noticed the number was never stored.
 *
 * `packetDelta` is the whole point. Zero packets means her audio never left
 * the model — a vendor fault, and the recovery is a product decision. A
 * healthy count means it arrived and the browser did not render it — a graph
 * fault, and ours.
 */
export interface UnheardTurn {
  /** Seconds since connect, at the moment the turn closed. */
  at: number
  /** Loudest RMS measured on her analyser across the turn. */
  peak: number
  /** How many analyser reads the verdict rests on. */
  samples: number
  /** `inbound-rtp.packetsReceived` across the turn. Null if unreadable. */
  packetDelta: number | null
  /** True when the adapter asked her to say the line again. */
  recovered: boolean
}

/**
 * How many `unheardTurns` records a single rep may store.
 *
 * A rep whose transport has failed completely could otherwise write one record
 * per reply into a column every debrief reads. Well past
 * `incidentsAreAlarming`'s threshold of three, so the cap can never hide a
 * verdict; the counter keeps counting after the records stop.
 */
export const MAX_UNHEARD_RECORDS = 20

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
  /**
   * The inaudible replies, individually, up to `MAX_UNHEARD_RECORDS`.
   *
   * Only the locally measured ones carry evidence, so only those are recorded
   * here — a reply whose buffer never opened is already fully explained by the
   * provider's event stream. `unheard` therefore counts at least as many turns
   * as this lists.
   */
  unheardTurns: UnheardTurn[]
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
    unheardTurns: [],
  }
}

/** The keys `countIncidents` may increment: the counters, and nothing else. */
type CountKey = {
  [K in keyof RepIncidents]: RepIncidents[K] extends number ? K : never
}[keyof RepIncidents]

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
  const bump = (key: CountKey) => () => {
    incidents[key] += 1
    onChange(incidents)
  }

  const offs = [
    voice.on('agent.overlap', bump('overlaps')),
    voice.on('agent.double-turn', bump('doubleTurns')),
    voice.on('agent.unheard', ({ at, peak, samples, packetDelta, recovered }) => {
      incidents.unheard += 1
      // Absent diagnostics mean the provider's own event stream already
      // explained this one; there is nothing to record beyond the count.
      if (peak !== undefined && samples !== undefined) {
        if (incidents.unheardTurns.length < MAX_UNHEARD_RECORDS) {
          incidents.unheardTurns.push({
            at,
            peak,
            samples,
            packetDelta: packetDelta ?? null,
            recovered: recovered ?? false,
          })
        }
      }
      onChange(incidents)
    }),
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
