'use client'

/**
 * The mission, drawn.
 *
 * Three sizes, one object, and that is the whole point — the audit's complaint
 * was that the scorecard's recommendation and the next rep "feel like
 * unrelated links". They are the same sentence now, so somebody who reads it on
 * the scorecard recognises it on Train, again on the brief, and one last time
 * on the live screen while she is talking.
 *
 *   `<MissionCard>`   Train and the scorecard. Target, objective, done-when.
 *   `<MissionNote>`   the brief. One line, above the Start button.
 *   `<MissionLine>`   the live rep. §05 rule 6 allows exactly "timer, waveform,
 *                     mission", so this is the shortest of the three and it
 *                     never animates, never updates and never reacts to
 *                     anything she says. A mission that moved would be
 *                     coaching.
 */

import { Crosshair } from 'lucide-react'
import type { Mission } from '@/lib/data/mission'

export function MissionCard({ mission, kicker = 'Your mission' }: { mission: Mission; kicker?: string }) {
  return (
    <section className="mission-card">
      <div className="mission-card__head">
        <Crosshair size={16} strokeWidth={1.75} className="volt" aria-hidden="true" />
        <span className="label">{kicker} · {mission.target}</span>
      </div>
      <p className="mission-card__objective">{mission.objective}</p>
      <p className="mission-card__done"><span className="label">Done when</span> {mission.doneWhen}</p>
    </section>
  )
}

export function MissionNote({ mission }: { mission: Mission }) {
  return (
    <p className="mission-note">
      <Crosshair size={14} strokeWidth={1.75} aria-hidden="true" />
      <span><span className="label">{mission.target}</span> {mission.objective}</span>
    </p>
  )
}

export function MissionLine({ mission }: { mission: Mission }) {
  // `aria-hidden` is deliberate. The live screen already has two polite live
  // regions — the mic status and the band announcement — and a third string
  // read out while she is mid-sentence is the audio equivalent of coaching.
  // It is stated on the brief, which is where a screen-reader user meets it.
  return <span className="mission-live label" aria-hidden="true">{mission.inRep}</span>
}
