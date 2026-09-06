'use client'

/**
 * The guided rep, drawn.
 *
 * Two sizes, one script — the same relationship `mission.tsx` has, and for the
 * same reason: the six steps a user reads on the brief are the six he is
 * reminded of live, in the same words, and they are the six the scorecard then
 * grades.
 *
 *   `<GuidedBrief>`  before the rep. All six steps, readable, unhurried. This
 *                    is where the coaching actually belongs and where a
 *                    screen-reader user meets it.
 *   `<GuidedLine>`   during the rep. One step, the current one.
 *
 * ── WHY THE LIVE ONE IS aria-hidden ──────────────────────────────────────
 *
 * The same reason `MissionLine` is. The live screen already carries two polite
 * live regions — the mic status and the band announcement — and a third string
 * read aloud while she is mid-sentence is not coaching, it is talking over the
 * person you are supposed to be listening to. The whole script is announced on
 * the brief instead, which is why `<GuidedBrief>` is not decorative.
 *
 * ── AND WHY IT DOES NOT ANIMATE IN ───────────────────────────────────────
 *
 * A step change is a change of text in place. Nothing slides, nothing flashes,
 * nothing demands the eye while somebody is mid-sentence — §02's motion budget,
 * and the reason a "pop-up" is the one shape this could not take. It is a rail
 * you can glance at, and glancing is what a nervous person can actually do
 * with a hundred milliseconds.
 */

import type { GuidedStep } from '@/lib/data/guided'
import { Mark, dimensionMark } from '@/components/marks'

function stepMark(step: GuidedStep) {
  return dimensionMark(step.key) ?? 'dim-opening'
}

/**
 * The live rail: the aim, and the line if the step has one.
 *
 * The aim is the thing that transfers and it leads. The line is offered
 * underneath it, marked as an example rather than as an instruction, because a
 * user who reads it verbatim has still done the rep and a user who paraphrases
 * it has done a better one.
 */
export function GuidedLine({ step }: { step: GuidedStep }) {
  return (
    <div className="guided-live" aria-hidden="true">
      <span className="guided-live__aim label">{step.aim}</span>
      {step.say ? <span className="guided-live__say">{step.say}</span> : null}
    </div>
  )
}

/**
 * The whole script, on the brief.
 *
 * Numbered, because the order is the argument: it is what a three-minute
 * conversation actually does, and a user who reads it once before starting
 * needs the live rail as a reminder rather than as a first encounter.
 */
export function GuidedBrief({ script }: { script: readonly GuidedStep[] }) {
  return (
    <section className="guided-brief">
      <div className="guided-brief__head">
        <span className="label">Guided rep · she will walk you through it</span>
      </div>
      <ol className="guided-brief__steps">
        {script.map((step, index) => (
          <li key={step.key}>
            <span className="guided-brief__n data">{index + 1}</span>
            <div className="guided-brief__body">
              <p className="guided-brief__aim">
                <Mark name={stepMark(step)} size={15} />
                <span>{step.aim}</span>
              </p>
              {step.say ? <p className="guided-brief__say">{step.say}</p> : null}
              <p className="guided-brief__why">{step.why}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="guided-brief__foot">
        The lines are examples, not a script to read. Anything in [brackets] is the word you fill in from what
        she just said. This is the only character who does this — after Tess, the words are yours.
      </p>
    </section>
  )
}
