'use client'

/**
 * The guided rep, drawn.
 *
 * Two sizes, one script — the same relationship `mission.tsx` has, and for the
 * same reason: the prompts a user reads on the brief are the ones he is
 * reminded of live, in the same words, and they are the six the scorecard then
 * grades.
 *
 *   `<GuidedBrief>`  before the rep. A badge, a first line, and the rest of the
 *                    script one control away.
 *   `<GuidedLine>`   during the rep. One prompt, floating under her.
 *
 * ── WHY THE BRIEF IS NOT THE WHOLE SCRIPT ANY MORE (11 September) ────────
 *
 * It was: six numbered steps, each with a direction, a line and a sentence of
 * rationale, under a heading that read *"Guided rep · she will walk you through
 * it"*, over a three-sentence footnote. Around a hundred and fifty words of
 * instruction, immediately before the first time anybody in this product opens
 * a microphone — and above a mission note, a technique card and a rule block
 * that were all already there.
 *
 * Three things were wrong with it and only one of them was length.
 *
 * **It explained the mechanism instead of signalling it.** A first-time user
 * does not need to be taught how a rail works before seeing one; they need to
 * know this rep is different and then meet it. The badge and the six dimension
 * marks say that in a glance — and the marks are the same glyphs the scorecard
 * will use afterwards, so the row is also the promise that the prompts and the
 * grade are the same six things.
 *
 * **The heading described the mechanism instead of naming the thing.** *"she
 * will walk you through it"* is a sentence about how a feature works, written
 * at somebody who has not seen the feature; and it sets an expectation the
 * character then does not meet, because Cass is a stranger in a gallery with no
 * idea she is anybody's first rep — she does not narrate, prompt or check in.
 * The badge names it and the rail demonstrates it. What is said in words is
 * only what the landing page already promises: this rep gives you the words and
 * the ones after it do not.
 *
 * **Reading the whole script first spends the surprise.** The prompts land
 * better arriving one at a time, in the moment they apply. What is genuinely
 * useful up front is exactly one thing — the sentence to open with — because
 * the hardest part of a first rep is the first ten seconds.
 *
 * The rest is not deleted. It is behind a disclosure, closed by default, which
 * keeps the whole script in the DOM and one control away — the accessibility
 * path matters here, because the live rail is `aria-hidden` and this is still
 * where a screen-reader user meets the script.
 *
 * ── WHY THE LIVE ONE IS aria-hidden ──────────────────────────────────────
 *
 * The same reason `MissionLine` is. The live screen already carries two polite
 * live regions — the mic status and the band announcement — and a third string
 * read aloud while she is mid-sentence is not coaching, it is talking over the
 * person you are supposed to be listening to.
 *
 * ── AND WHAT "FLOATING" IS ALLOWED TO MEAN ───────────────────────────────
 *
 * This comment used to end *"nothing slides, nothing flashes"*, and the rail
 * was a centred label in the middle of the layout that looked exactly like the
 * mission line it replaces. It floats now — over the scene, anchored low, on
 * its own surface — and the distinction that keeps §02 intact is between
 * floating in POSITION and floating in MOTION. It is lifted off the ground and
 * out of the flow; a step change is still a cross-fade in place, six pixels of
 * rise at most, 280ms, and `prefers-reduced-motion` removes even that. Nothing
 * demands the eye while somebody is mid-sentence. It is a rail you can glance
 * at, and glancing is what a nervous person can actually do with a hundred
 * milliseconds.
 */

import { splitSay, type GuidedPrompt, type GuidedStep } from '@/lib/data/guided'
import { SUB_SCORE_LABELS } from '@/lib/data/scorecard'
import { Mark, dimensionMark, type MarkName } from '@/components/marks'

function stepMark(step: GuidedStep): MarkName {
  return dimensionMark(step.key) ?? 'dim-opening'
}

/**
 * What the scorecard will call this step.
 *
 * Read from `SUB_SCORE_LABELS` rather than authored here. The interview track
 * learned this the expensive way — a rename done for storage printed the wrong
 * product's word on a scorecard (INTERVIEW-TECHNICAL-PLAN §15) — and the whole
 * argument for keying the script to `SubScores` is that a user meets the same
 * six words on the rail, on the scorecard and in the library.
 */
function stepLabel(step: GuidedStep): string {
  return SUB_SCORE_LABELS[step.key] ?? step.key
}

/**
 * A suggested line, with its blank drawn as a blank.
 *
 * `[her thing]` is the one word he has to supply from what she just said. It
 * used to reach the screen as two literal brackets with the convention
 * explained in a footnote on another screen; it is underlined and dimmed here,
 * which needs no footnote.
 */
function SayLine({ say }: { say: string }) {
  return (
    <>
      {splitSay(say).map((part, index) => (
        part.slot
          ? <i key={index} className="guided-slot">{part.text}</i>
          : <span key={index}>{part.text}</span>
      ))}
    </>
  )
}

/**
 * The live rail: one prompt, floating low, under her.
 *
 * Three tiers, and the order is their importance mid-rep read backwards:
 *
 *   · the DIMENSION, smallest — orientation, and the word the scorecard uses
 *   · the AIM — the direction, which is the half that transfers
 *   · the LINE, largest — what gets you through the next ten seconds
 *
 * A prompt with no line promotes its aim into the line's slot rather than
 * leaving the space empty. Two things arrive that way and neither is padding:
 * `composure`'s first beat, whose whole lesson is that there is nothing to say,
 * and `ANSWER_HER`, where the right sentence is the answer to a question we
 * have not read and are not going to write for him.
 *
 * The dots are position, not progress: six prompts, this is the one you are on.
 * They keep showing the LADDER's position while a reactive prompt is up,
 * because the ladder has not moved — they answer "where are we in the rep",
 * not "what is on the card". No volt — the live screen spends its one accent on
 * the orb and the time arc, and a rail that glowed would pull the eye off the
 * person you are supposed to be listening to.
 */
export function GuidedLine({ prompt }: { prompt: GuidedPrompt }) {
  const { step, say, index, total } = prompt
  return (
    <div className="guided-live" aria-hidden="true">
      {/* Keyed on what is actually being shown, so the cross-fade replays when
          the prompt changes and only then. A step whose line advances is a new
          prompt; a re-render that changes nothing is not. */}
      <div className="guided-live__card" key={`${step.key}:${say ?? ''}`}>
        <p className="guided-live__tag">
          <Mark name={stepMark(step)} size={13} />
          <span className="label">{stepLabel(step)}</span>
        </p>
        {say ? (
          <>
            <p className="guided-live__aim">{step.aim}</p>
            <p className="guided-live__say"><SayLine say={say} /></p>
          </>
        ) : (
          <p className="guided-live__say guided-live__say--direction">{step.aim}</p>
        )}
      </div>
      <ol className="guided-live__dots">
        {Array.from({ length: total }, (_, dot) => (
          <li key={dot} className={dot === index ? 'is-now' : dot < index ? 'is-done' : ''} />
        ))}
      </ol>
    </div>
  )
}

/**
 * The signifier, on the brief.
 *
 * A badge, the six marks, one sentence, and the line to open with. Everything
 * else is behind the disclosure. See the header for why this is not the whole
 * script any more.
 */
export function GuidedBrief({ script }: { script: readonly GuidedStep[] }) {
  const firstLine = script[0]?.says[0] ?? null
  return (
    <section className="guided-note">
      <div className="guided-note__head">
        <span className="label">Guided</span>
        <span className="guided-note__marks">
          {script.map((step) => <Mark key={step.key} name={stepMark(step)} size={13} />)}
        </span>
      </div>
      <p className="guided-note__lead">
        A prompt appears under her, one at a time, for each of the six things you are scored on. Read it or say
        it your way — Cass is the only rep that gives you the words.
      </p>
      {firstLine ? (
        <p className="guided-note__first">
          <span className="label">Start with</span>
          <strong>{firstLine}</strong>
        </p>
      ) : null}
      <details className="guided-note__all">
        <summary><span className="label">All six prompts</span></summary>
        <ol className="guided-brief__steps">
          {script.map((step, index) => (
            <li key={step.key}>
              <span className="guided-brief__n data">{index + 1}</span>
              <div className="guided-brief__body">
                <p className="guided-brief__aim">
                  <Mark name={stepMark(step)} size={15} />
                  <span>{step.aim}</span>
                </p>
                {step.says.filter((line): line is string => Boolean(line)).map((line) => (
                  <p key={line} className="guided-brief__say"><SayLine say={line} /></p>
                ))}
                <p className="guided-brief__why">{step.why}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="guided-brief__foot">
          The lines are examples, not a script to read. An underlined word is the one you fill in from what she
          just said. After Cass, the words are yours.
        </p>
      </details>
    </section>
  )
}
