'use client'

/**
 * The scorecard's and the result screen's pictures (27 Sep 2026).
 *
 * Both screens were rows of the same hairline box — a label, a number, a thin
 * bar — so the eye had nowhere to land and the rows that cost eighteen points
 * looked exactly like the rows that cost none. These are the four places a
 * picture says it faster than a row:
 *
 *   ScoreRail        where the score landed against the 70 line
 *   PointsBar        where the hundred points went, and which parts leaked
 *   ConversationCurve the warmth across the rep, with its best and worst turn
 *   SkillHexagon     the six judged dimensions as one shape
 *
 * Rules they share, all from the design system: Ink and hairlines, amber only
 * for what was lost, and NO volt — the screen's one volt is its primary
 * action. Every one of them is finished on first paint under
 * `prefers-reduced-motion`, and every one says in text what it shows, so a
 * screen reader gets the sentence rather than the drawing.
 */

import { useEffect, useRef, useState } from 'react'
import type { PointPart } from '@/lib/data/result-view'
import type { Moment, TranscriptTurn } from '@/lib/data/types'

function reduced(): boolean {
  if (typeof window === 'undefined') return true
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return true }
}

/** True once the element has been on screen, and stays true. */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen) return
    const node = ref.current
    if (!node || reduced() || typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setSeen(true); observer.disconnect() }
    }, { threshold: 0.35 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [seen])
  return [ref, seen]
}

/* ------------------------------------------------------------------ *
 * ScoreRail
 * ------------------------------------------------------------------ */

/**
 * 0–100 with the line marked. The marker rides the counting value, so it
 * arrives with the number rather than after it; the tick is the one fact
 * "70+" never said on its own — where the line is.
 */
export function ScoreRail({ value, line, lineLabel, pending = false }: {
  value: number
  line: number | null
  lineLabel?: string
  pending?: boolean
}) {
  const at = Math.max(0, Math.min(100, value))
  const over = line !== null && at >= line
  return (
    <div className={`score-rail${pending ? ' score-rail--pending' : ''}${over ? ' score-rail--over' : ''}`} aria-hidden="true">
      <span className="score-rail__track">
        <i className="score-rail__fill" style={{ width: `${pending ? 0 : at}%` }} />
        {line !== null ? <b className="score-rail__line" style={{ left: `${line}%` }}><em>{lineLabel ?? line}</em></b> : null}
        {pending ? null : <span className="score-rail__dot" style={{ left: `${at}%` }} />}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * PointsBar
 * ------------------------------------------------------------------ */

/**
 * The hundred points, as one bar split into the parts that make it up. Each
 * part is as wide as it was worth; what it scored fills it and what it lost is
 * hatched amber. The biggest leaks are named underneath, because "you lost 37"
 * is only useful once it says where.
 */
export function PointsBar({ parts, onPick }: { parts: readonly PointPart[]; onPick?: (key: string) => void }) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const total = parts.reduce((sum, part) => sum + part.max, 0) || 100
  const lost = parts.reduce((sum, part) => sum + part.lost, 0)
  const leaks = [...parts].filter((part) => part.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 3)
  return (
    <section className="points-bar" ref={ref} data-seen={seen}>
      <div className="points-bar__head">
        <h2 className="display-md">Where your points went</h2>
        {lost > 0 ? <span className="data points-bar__lost">−{lost}</span> : null}
      </div>
      <div className="points-bar__track" role="img" aria-label={parts.map((part) => `${part.label} ${part.points} of ${part.max}`).join(', ')}>
        {parts.map((part, index) => (
          <button
            key={part.key}
            type="button"
            className="points-bar__part"
            style={{ flexBasis: `${(part.max / total) * 100}%`, ['--delay' as string]: `${index * 70}ms` }}
            onClick={() => onPick?.(part.key)}
            aria-label={`${part.label}: ${part.points} of ${part.max}`}
          >
            <i style={{ width: `${part.max ? (part.points / part.max) * 100 : 0}%` }} />
          </button>
        ))}
      </div>
      {leaks.length ? (
        <p className="points-bar__leaks">
          {leaks.map((part, index) => (
            <span key={part.key}>{index > 0 ? ' · ' : ''}<button type="button" onClick={() => onPick?.(part.key)}>{part.label}</button> <b className="data">−{part.lost}</b></span>
          ))}
        </p>
      ) : <p className="points-bar__leaks">Nothing left on the table.</p>}
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * ConversationCurve
 * ------------------------------------------------------------------ */

/**
 * The rep, as the meter saw it. One line across the whole conversation with
 * the best and worst turn marked on it, replacing two cards that each drew the
 * same line at forty pixels with one dot. Tapping a marker swaps the quote
 * underneath. The dashed line is where she decides — the rule of the rep,
 * drawn where it applies.
 */
export function ConversationCurve({ turns, best, worst, label, line, describe }: {
  turns: readonly TranscriptTurn[]
  best: Moment | null
  worst: Moment | null
  label: string
  line: number | null
  describe: (note: string) => string
}) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const scored = turns.filter((turn) => turn.warmthAfter !== null)
  const moments = [best ? { tone: 'up' as const, moment: best } : null, worst ? { tone: 'down' as const, moment: worst } : null]
    .filter((entry): entry is { tone: 'up' | 'down'; moment: Moment } => entry !== null)
  const [pick, setPick] = useState<'up' | 'down'>(moments[0]?.tone ?? 'up')
  if (scored.length < 2 || moments.length === 0) return null
  const W = 320
  const H = 132
  const pad = { l: 6, r: 6, t: 12, b: 20 }
  const x = (index: number) => pad.l + (index / (scored.length - 1)) * (W - pad.l - pad.r)
  const y = (value: number) => pad.t + (1 - Math.max(0, Math.min(100, value)) / 100) * (H - pad.t - pad.b)
  const path = scored.map((turn, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(turn.warmthAfter ?? 0).toFixed(1)}`).join(' ')
  const area = `${path} L${x(scored.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`
  const end = scored[scored.length - 1]
  const current = moments.find((entry) => entry.tone === pick) ?? moments[0]!
  return (
    <section className="curve" ref={ref} data-seen={seen}>
      <div className="curve__head">
        <h2 className="display-md">The conversation</h2>
        <span className="label">{label} {scored[0]?.warmthAfter} → {end?.warmthAfter}</span>
      </div>
      <svg className="curve__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} across the rep, from ${scored[0]?.warmthAfter} to ${end?.warmthAfter}`}>
        {line !== null ? <><line className="curve__line" x1={pad.l} x2={W - pad.r} y1={y(line)} y2={y(line)} /><text className="curve__line-label" x={pad.l} y={y(line) - 4}>she decides · {line}</text></> : null}
        <path className="curve__area" d={area} />
        <path className="curve__path" d={path} pathLength={1} />
        {moments.map((entry) => {
          const at = scored.findIndex((turn) => turn.index === entry.moment.turnIndex)
          if (at < 0) return null
          const cx = x(at)
          const cy = y(scored[at]?.warmthAfter ?? 0)
          return (
            <g key={entry.tone} className={`curve__mark curve__mark--${entry.tone}${pick === entry.tone ? ' curve__mark--on' : ''}`} onClick={() => setPick(entry.tone)} role="button" tabIndex={0} aria-label={entry.tone === 'up' ? 'The moment it worked' : 'The moment it cost you'} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPick(entry.tone) } }}>
              <circle className="curve__halo" cx={cx} cy={cy} r="11" />
              <circle cx={cx} cy={cy} r="4.5" />
            </g>
          )
        })}
        <text className="curve__axis" x={pad.l} y={H - 4}>start</text>
        <text className="curve__axis" x={W - pad.r} y={H - 4} textAnchor="end">end</text>
      </svg>
      {moments.length > 1 ? (
        <div className="curve__tabs" role="tablist">
          {moments.map((entry) => (
            <button key={entry.tone} type="button" role="tab" aria-selected={pick === entry.tone} className={`curve__tab curve__tab--${entry.tone}`} onClick={() => setPick(entry.tone)}>
              {entry.tone === 'up' ? 'It worked' : 'It cost you'}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`curve__moment curve__moment--${current.tone}`} key={current.tone}>
        <blockquote>&ldquo;{current.moment.quote}&rdquo;</blockquote>
        <p><b className="data">{current.moment.delta > 0 ? '+' : ''}{current.moment.delta}</b> {describe(current.moment.note)}</p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * SkillHexagon
 * ------------------------------------------------------------------ */

/**
 * The judged dimensions as one shape. Six scores on the same 0–100 scale is
 * the case a radar is for: the reader is meant to see the SHAPE — lopsided
 * toward composure, short on listening — not to compare two numbers, which the
 * values at each corner still do for them.
 */
export function SkillHexagon({ scores, title, points, max }: {
  scores: readonly { key: string; label: string; value: number }[]
  title: string
  points: number
  max: number
}) {
  const [ref, seen] = useInView<HTMLDivElement>()
  if (scores.length < 3) return null
  const W = 320
  const H = 250
  const cx = W / 2
  const cy = H / 2 + 2
  const R = 78
  const angle = (index: number) => -Math.PI / 2 + (index / scores.length) * Math.PI * 2
  const at = (index: number, value: number) => {
    const r = (Math.max(0, Math.min(100, value)) / 100) * R
    return [cx + Math.cos(angle(index)) * r, cy + Math.sin(angle(index)) * r] as const
  }
  const ring = (value: number) => scores.map((_, index) => at(index, value).join(',')).join(' ')
  const shape = scores.map((entry, index) => at(index, entry.value).join(',')).join(' ')
  return (
    <section className="hexagon" ref={ref} data-seen={seen}>
      <div className="hexagon__head">
        <h2 className="display-md">{title}</h2>
        <span className="data hexagon__points">{points}/{max}</span>
      </div>
      <svg className="hexagon__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={scores.map((entry) => `${entry.label} ${entry.value}`).join(', ')}>
        {[100, 66, 33].map((value) => <polygon key={value} className="hexagon__ring" points={ring(value)} />)}
        {scores.map((_, index) => { const [ex, ey] = at(index, 100); return <line key={index} className="hexagon__spoke" x1={cx} y1={cy} x2={ex} y2={ey} /> })}
        <g className="hexagon__shape" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <polygon points={shape} />
          {scores.map((entry, index) => { const [px, py] = at(index, entry.value); return <circle key={entry.key} cx={px} cy={py} r="3" /> })}
        </g>
        {scores.map((entry, index) => {
          const [lx, ly] = at(index, 124)
          const cos = Math.cos(angle(index))
          const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end'
          return (
            <g key={entry.key} className="hexagon__label">
              <text x={lx} y={ly - 2} textAnchor={anchor}>{entry.label}</text>
              <text className="hexagon__value" x={lx} y={ly + 11} textAnchor={anchor}>{entry.value}</text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}
