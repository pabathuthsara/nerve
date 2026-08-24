'use client'

/**
 * Predicted against actual — §09's "one chart that does the therapeutic work".
 *
 * Two lines and the space between them. Predicted is the cool series because
 * it is the one that turns out to be wrong; actual is volt because it is the
 * reading the whole product is arguing for, and on this screen it is the data
 * hero. The shaded gap is the finding rendered as an area rather than as a
 * sentence: it is the distance between what the user thought it would cost and
 * what it cost.
 *
 * The chart never flatters. When actual sits above predicted the fill is amber
 * and the copy underneath says to ease back a tier — a chart that only curves
 * one way is a chart nobody should believe, and §09's own warning is that
 * going too hard too early sensitises rather than habituates.
 */

import { anxietyVerdict, POINTS_FOR_A_LINE, type AnxietySeries } from '@/lib/field/anxiety'

const VIEW = { width: 400, height: 130, padX: 12, padY: 10 }
/** The scale is the instrument: always the full 0–10, never fitted to data. */
const SCALE_MAX = 10

/** Where a value sits vertically. Zero at the bottom, ten at the top. */
function y(value: number): number {
  const usable = VIEW.height - VIEW.padY * 2
  return VIEW.padY + usable * (1 - value / SCALE_MAX)
}

function x(index: number, count: number): number {
  const usable = VIEW.width - VIEW.padX * 2
  return VIEW.padX + (count <= 1 ? usable / 2 : (usable * index) / (count - 1))
}

export function AnxietyChart({ series }: { series: AnxietySeries }) {
  const { points } = series
  const enough = points.length >= POINTS_FOR_A_LINE

  // Axes are drawn before there is anything to plot (§15). An empty chart that
  // shows the shape of what is coming is a promise; a blank card is a dead end.
  const grid = [0, 5, 10].map((value) => (
    <g key={value}>
      <line x1={VIEW.padX} y1={y(value)} x2={VIEW.width - VIEW.padX} y2={y(value)} />
      <text x={0} y={y(value) + 3} className="anxiety-chart__tick data">{value}</text>
    </g>
  ))

  if (!enough) return <ChartShell grid={grid} note={waitingCopy(points.length)} />

  const count = points.length
  const predicted = points.map((point, index) => `${x(index, count)},${y(point.predicted)}`)
  const actual = points.map((point, index) => `${x(index, count)},${y(point.actual)}`)
  // The band between the two lines: down the predicted line and back along the
  // actual one.
  const band = [...predicted, ...actual.slice().reverse()].join(' ')
  // Positive gap means it landed easier than feared, which is the ordinary
  // case. Negative is real and is shown as such rather than smoothed away.
  const worse = (series.meanGap ?? 0) < 0

  return (
    <ChartShell
      grid={grid}
      note={anxietyVerdict(series)}
      legend
      body={
        <>
          <polygon className={`anxiety-chart__band${worse ? ' anxiety-chart__band--worse' : ''}`} points={band} />
          <polyline className="anxiety-chart__predicted" points={predicted.join(' ')} />
          <polyline className="anxiety-chart__actual" points={actual.join(' ')} />
          {points.map((point, index) => (
            <circle key={`${point.on}-${index}`} cx={x(index, count)} cy={y(point.actual)} r="2.4" />
          ))}
        </>
      }
    />
  )
}

/** Hand-written per case, and it counts down honestly (§02 rule 12). */
function waitingCopy(logged: number): string {
  if (logged === 0) return 'Three more asks and this becomes a line.'
  if (logged === 1) return 'Two more asks and this becomes a line.'
  return 'One more ask and this becomes a line.'
}

function ChartShell({ grid, note, body, legend = false }: {
  grid: React.ReactNode
  note: string | null
  body?: React.ReactNode
  legend?: boolean
}) {
  return (
    <div className="anxiety-chart">
      {legend ? <div className="chart-legend"><span><i className="cool" /> Predicted</span><span><i /> Actual</span></div> : null}
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label="Predicted anxiety against what it actually felt like, zero to ten, oldest ask first">
        <g className="chart-grid">{grid}</g>
        {body}
      </svg>
      {note ? <p className="anxiety-chart__note">{note}</p> : null}
    </div>
  )
}
