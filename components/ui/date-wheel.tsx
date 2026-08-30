'use client'

/**
 * The date-of-birth wheel, for a thumb.
 *
 * Three snap columns over the same `lib/safety/dob-field.ts` rules the typed
 * boxes use, so there is one set of date logic in the product and one set of
 * tests covering it. This file is scroll position and nothing else.
 *
 * Built on `scroll-snap-type` rather than on drag maths, which buys native
 * momentum, native rubber-banding and native accessibility scrolling on every
 * platform for free — and means there is no gesture code here to get wrong.
 *
 * **Every column opens on a blank row.** That is the important decision in
 * this file and it is a §16.4 decision, not a visual one. A wheel that opens
 * pre-set to some plausible birthday is a wheel a thirteen-year-old passes by
 * tapping Continue without ever entering a date — and §16.4's entire claim is
 * that a minor has to lie *deliberately* to get in. A blank first row keeps
 * the lie deliberate, and it doubles as the placeholder: the band reads
 * `DD MMM YYYY` until somebody answers.
 *
 * The settled row is read off a debounced `scroll` rather than `scrollend`,
 * which Safari does not implement.
 */

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { tap } from '@/lib/haptics'
import {
  clampDay,
  monthLabel,
  PLACEHOLDER,
  SEGMENT_ORDER,
  segmentOptions,
  type DobParts,
  type Segment,
  type YearBounds,
} from '@/lib/safety/dob-field'

/** Kept in step with `--wheel-row` in globals.css. */
const ROW = 40
/** How long the column must be still before we call it settled. */
const SETTLE_MS = 110

const NAMES: Record<Segment, string> = { day: 'Day', month: 'Month', year: 'Year' }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface DateWheelProps {
  parts: DobParts
  onChange: (parts: DobParts) => void
  bounds: YearBounds
}

export function DateWheel({ parts, onChange, bounds }: DateWheelProps) {
  return (
    <div className="wheel" role="group" aria-label="Date of birth">
      <div className="wheel__band" aria-hidden="true" />
      {SEGMENT_ORDER.map((segment) => (
        <Column
          key={segment}
          segment={segment}
          value={parts[segment]}
          // The blank row is index 0 in every column. See the note above.
          options={['', ...segmentOptions(segment, parts, bounds)]}
          onPick={(picked) => {
            // Clamped here rather than in the day column, because the change
            // that invalidates a day is always a change to one of the others:
            // spin the year off a leap February with the 29th showing and the
            // date stops existing.
            onChange(clampDay({ ...parts, [segment]: picked }))
          }}
        />
      ))}
    </div>
  )
}

interface ColumnProps {
  segment: Segment
  options: string[]
  value: string
  onPick: (value: string) => void
}

function Column({ segment, options, value, onPick }: ColumnProps) {
  const ref = useRef<HTMLDivElement>(null)
  /** The row last reported, so a tick fires once per row crossed. */
  const seen = useRef(0)
  const timer = useRef<number | null>(null)

  const index = Math.max(0, options.indexOf(value))

  // Put the column on its value when the value came from somewhere other than
  // this column's own scrolling — a clamped day, a pasted date, a reset. The
  // half-row tolerance is what stops this fighting a scroll in progress.
  useEffect(() => {
    const node = ref.current
    if (!node || node.offsetParent === null) return
    const target = index * ROW
    if (Math.abs(node.scrollTop - target) < ROW / 2) return
    node.scrollTop = target
    seen.current = index
  }, [index])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const handleScroll = () => {
    const node = ref.current
    if (!node) return

    const current = clamp(Math.round(node.scrollTop / ROW), 0, options.length - 1)
    // One tick per row crossed, during the scroll — not one at the end. A
    // wheel that buzzes once when it stops feels like a confirmation; a wheel
    // that ticks past every row feels like a wheel.
    if (current !== seen.current) {
      seen.current = current
      tap()
    }

    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const settled = clamp(Math.round(node.scrollTop / ROW), 0, options.length - 1)
      const picked = options[settled]
      if (picked !== undefined && picked !== value) onPick(picked)
    }, SETTLE_MS)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const next = clamp(index + (event.key === 'ArrowDown' ? 1 : -1), 0, options.length - 1)
    const picked = options[next]
    if (picked !== undefined && picked !== value) onPick(picked)
  }

  return (
    <div
      ref={ref}
      className={`wheel__col wheel__col--${segment}`}
      role="listbox"
      aria-label={NAMES[segment]}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, position) => (
        <div
          key={option || 'blank'}
          role="option"
          aria-selected={position === index}
          aria-label={option ? label(segment, option) : `No ${NAMES[segment].toLowerCase()} chosen`}
          className={`wheel__row${option ? '' : ' wheel__row--blank'}`}
        >
          {option ? label(segment, option) : PLACEHOLDER[segment]}
        </div>
      ))}
    </div>
  )
}

function label(segment: Segment, option: string): string {
  return segment === 'month' ? monthLabel(option) : option
}
