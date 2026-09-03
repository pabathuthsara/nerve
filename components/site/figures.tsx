/**
 * The public site's figures (V8, V12 in `docs/VISUAL-AUDIT.md`).
 *
 * Everything here exists because the marketing pages were arguing in prose
 * about things that have a shape. The audit counted roughly 1,060 words across
 * `/` and `/how-it-works` whose entire job was to describe a sequence, a
 * split, a ladder or a matrix.
 *
 * **The rule that binds every figure here is §1.1 of the audit**, and it is
 * not stylistic: no photographs of people, no drawn characters, no lifestyle
 * imagery. `PAYMENTS-APPROVAL.md` §3 records that every merchant of record on
 * the shortlist bans dating products by name, that Creem already declined us
 * as a category call, and that a human opens `/` during Whop review. A picture
 * of a woman beside the words *get her number* reclassifies this product in
 * one screen. So the only imagery on the public site is diagrammatic.
 *
 * **Screenshots of the app were tried here and taken back out.** An `AppShot`
 * component put captured screens on the landing page and beside the sign-up
 * form; it was rejected on the look of it, so the pages are argument and
 * diagram again. `npm run shots` still exists and still captures from the
 * running app — its output is for use outside these pages, and nothing on the
 * site embeds it.
 */

/**
 * The loop, as a loop (V8).
 *
 * Four paragraphs in an ordered list is a cycle pretending not to be one, and
 * the thing the list could not say is the only thing that matters about it:
 * **it returns.** The arrow from "log it" back to "run the rep" is the product
 * thesis — practise inside, spend it outside, bring the result back — and it
 * was previously left for the reader to infer from the word "loop".
 *
 * Drawn as one SVG on a 4-node ring rather than as four boxes and some CSS
 * arrows, so it holds its proportions at any width and costs no JavaScript.
 * The copy stays in the DOM beside it; this carries the structure only, and is
 * `aria-hidden` because the ordered list underneath already says it in words.
 */
export function LoopDiagram({ steps }: { steps: readonly { kicker: string; title: string }[] }) {
  const size = 320
  const centre = size / 2
  const radius = 116
  // Twelve o'clock, clockwise. `-90°` because SVG angles start at three.
  const at = (index: number) => {
    const angle = (index / steps.length) * Math.PI * 2 - Math.PI / 2
    return { x: centre + Math.cos(angle) * radius, y: centre + Math.sin(angle) * radius }
  }
  return (
    <div className="loop-diagram" aria-hidden="true">
      <svg viewBox={`0 0 ${size} ${size}`} role="presentation">
        <defs>
          <marker id="loop-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 8 4 0 8" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </marker>
        </defs>
        {steps.map((step, index) => {
          const from = at(index)
          const to = at((index + 1) % steps.length)
          // Trimmed off both nodes so the arc starts and ends in open space
          // rather than under a numeral.
          const angle = Math.atan2(to.y - from.y, to.x - from.x)
          const inset = 30
          const x1 = from.x + Math.cos(angle) * inset
          const y1 = from.y + Math.sin(angle) * inset
          const x2 = to.x - Math.cos(angle) * inset
          const y2 = to.y - Math.sin(angle) * inset
          return (
            <path
              key={step.kicker}
              className="loop-diagram__arc"
              d={`M${x1} ${y1}A${radius * 1.35} ${radius * 1.35} 0 0 1 ${x2} ${y2}`}
              markerEnd="url(#loop-arrow)"
            />
          )
        })}
        {steps.map((step, index) => {
          const point = at(index)
          return (
            <g key={step.kicker} className="loop-diagram__node">
              <circle cx={point.x} cy={point.y} r="21" />
              <text x={point.x} y={point.y + 5} textAnchor="middle">{String(index + 1).padStart(2, '0')}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * The three minutes, as a track (V12).
 *
 * `/how-it-works` describes the rep's anatomy in six paragraphs. Five of the
 * six are positions in time, and the sixth — the wind-down — is a *window*,
 * which is the one thing prose is worst at and a shaded band is best at.
 *
 * The two numbers §05 keeps off the public site stay off it: this shows WHEN
 * she is told to wind down, never the warmth she has to be at to offer. A user
 * who knows that threshold is playing the meter instead of the person.
 */
export function RepTimeline({ marks }: { marks: readonly { at: string; label: string; position: number }[] }) {
  return (
    <div className="rep-timeline" aria-hidden="true">
      <div className="rep-timeline__track">
        {/* 2:30 to 3:00 — the wind-down, the only part of a rep that is a
            window rather than a moment. */}
        <span className="rep-timeline__wind" style={{ left: '83.333%', width: '16.667%' }} />
        {marks.map((mark) => (
          <span key={mark.at} className="rep-timeline__mark" style={{ left: `${mark.position}%` }}>
            <i />
            <b className="data">{mark.at}</b>
            <em>{mark.label}</em>
          </span>
        ))}
      </div>
      {/* The band needs naming or it is decoration. This is the one caption on
          the page that has to be exact: it says WHEN she is told to wind down
          and never the warmth she has to be at to offer, which is the number
          §05 keeps off the public site entirely. */}
      <p className="rep-timeline__key label">
        <span /> The shaded half-minute is the wind-down — she is told to land it, once, and you are not told which way it went.
      </p>
    </div>
  )
}

/**
 * Sixty measured, forty judged (V12).
 *
 * One bar. The section spends 140 words explaining a ratio, and a ratio is the
 * single easiest thing in the world to draw — the two lists underneath then do
 * the work they are actually good at, which is saying what is in each half.
 */
export function SplitBar({ left, right }: { left: { value: number; label: string }; right: { value: number; label: string } }) {
  return (
    <div className="split-bar">
      <div className="split-bar__track" aria-hidden="true">
        <span className="split-bar__measured" style={{ width: `${left.value}%` }} />
        <span className="split-bar__judged" style={{ width: `${right.value}%` }} />
      </div>
      <div className="split-bar__keys">
        <span><b className="data">{left.value}%</b> {left.label}</span>
        <span><b className="data">{right.value}%</b> {right.label}</span>
      </div>
    </div>
  )
}
