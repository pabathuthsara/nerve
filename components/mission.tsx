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

import type { Mission } from '@/lib/data/mission'
import { Mark, dimensionMark } from '@/components/marks'

/**
 * The mission's own dimension mark, not a generic crosshair (V1).
 *
 * All three sizes used to open with the same `Crosshair`, which said "this is
 * an objective" and nothing about WHICH objective — while `Mission.key` is
 * already the sub-score key the scorecard, Progress and the library all group
 * by. Drawing that key means the mark a user meets on the scorecard is the
 * same one on Train, on the brief and in text mode, which is the connective
 * tissue the mission was introduced to be.
 *
 * Falls back to the crosshair-shaped default only if a mission key ever has no
 * mark, which `lib/marks/registry.test.ts` makes impossible for the six that
 * exist.
 */
function missionMark(mission: Mission) {
  return dimensionMark(mission.key) ?? 'dim-opening'
}

export function MissionCard({ mission, kicker = 'Your mission' }: { mission: Mission; kicker?: string }) {
  return (
    <section className="mission-card">
      <div className="mission-card__head">
        {/* Ink-2, not volt. The card already carries a volt left border, and
            Arena allows volt once per screen — on Train this mark sat beside
            a volt rank, a volt Start button and a volt streak pill. The
            border is the accent; the mark is the identity. */}
        <Mark name={missionMark(mission)} size={17} />
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
      <Mark name={missionMark(mission)} size={15} />
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
