'use client'

/**
 * The date-of-birth field (§16.4).
 *
 * Two surfaces over one value. A thumb gets the wheel; a keyboard gets three
 * typed boxes, because a wheel on a laptop is slower than typing and needs a
 * mouse to drag. Both drive `lib/safety/dob-field.ts`, so there is one set of
 * date rules in the product and one set of tests covering them.
 *
 * Which surface shows is decided in CSS by `(pointer: coarse)`, not by a
 * `matchMedia` call in an effect. The server cannot know what is holding the
 * page, so a JavaScript answer means rendering one surface and swapping it
 * after hydration — a visible flip on every phone. A media query is resolved
 * before the first paint and both surfaces are already bound to the same
 * state, so there is nothing to reconcile.
 *
 * The typed boxes read a keystroke off the input event's `data` rather than by
 * diffing the box against its last value, because the box does not show what
 * it holds — the month box holds `04` and shows `APR` — and a diff against a
 * rendered label is a diff against the wrong string. `data` also survives a
 * phone, where a soft keyboard may send no key event worth reading.
 *
 * Every path through the input handler ends in a fresh `parts` object even
 * when nothing about the date changed. The boxes are controlled and their
 * rendered value is computed, so a keystroke React decides to ignore is a
 * stray character left sitting in the DOM.
 *
 * The value leaves as `YYYY-MM-DD` on a hidden input, so a form posting to a
 * Server Action sees exactly what the native field used to post, and
 * `checkAge` on the server remains the only thing that decides anything.
 */

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { DateWheel } from './date-wheel'
import {
  composeDob,
  describeDob,
  monthLabel,
  nextSegment,
  parsePastedDate,
  PLACEHOLDER,
  previousSegment,
  SEGMENT_LENGTH,
  SEGMENT_ORDER,
  splitDob,
  stepSegment,
  typeInto,
  yearBounds,
  type DobParts,
  type Segment,
  type YearBounds,
} from '@/lib/safety/dob-field'

const NAMES: Record<Segment, string> = { day: 'Day', month: 'Month', year: 'Year' }

interface DateOfBirthProps {
  label?: string
  hint?: ReactNode
  error?: string
  /** Posts `YYYY-MM-DD` under this name, for a form driven by a Server Action. */
  name?: string
  /** Controlled use: `YYYY-MM-DD`, or empty while the field is unfinished. */
  value?: string
  onChange?: (value: string) => void
}

export function DateOfBirth({ label = 'Date of birth', hint, error, name, value, onChange }: DateOfBirthProps) {
  const groupId = useId()
  const [parts, setParts] = useState<DobParts>(() => splitDob(value ?? ''))
  /** The letters typed into the month box so far. `ju` is not yet a month. */
  const [prefix, setPrefix] = useState('')

  // Today, once the component is on a screen. The year range depends on the
  // date, and a server-rendered range would be baked into the HTML and then
  // cached. It bounds the wheel and the arrow keys; `checkAge` is the gate.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])
  const bounds = useMemo(() => yearBounds(now ?? new Date()), [now])

  const dob = composeDob(parts)
  const echo = describeDob(parts)

  const commit = (next: DobParts) => {
    setParts(next)
    onChange?.(composeDob(next))
  }

  // A value set from outside — a parent clearing the field, or one opening it
  // on a date already on file. Our own input never lands here: what `onChange`
  // sent is exactly what `composeDob` reads back, so the guard is false for
  // everything this component did itself.
  useEffect(() => {
    if (value === undefined || value === dob) return
    setParts(splitDob(value))
    setPrefix('')
  }, [value, dob])

  return (
    <div className="field dob-field">
      <span className="label" id={groupId}>{label}</span>

      <DateBoxes
        parts={parts}
        prefix={prefix}
        bounds={bounds}
        error={!!error}
        labelledBy={groupId}
        onParts={commit}
        onPrefix={setPrefix}
      />

      {/* Hidden on a pointer device. Both surfaces read the same state, so
          whichever one the viewer gets is showing the same date. */}
      <div className="dob-wheel-wrap">
        <DateWheel parts={parts} bounds={bounds} onChange={commit} />
      </div>

      <div className="dob__foot">
        {hint ? <span className="field__hint">{hint}</span> : <span />}
        <span className="dob__echo" aria-live="polite">{echo ?? ''}</span>
      </div>
      {error ? <span className="field__error">{error}</span> : null}
      {name ? <input type="hidden" name={name} value={dob} readOnly /> : null}
    </div>
  )
}

interface DateBoxesProps {
  parts: DobParts
  prefix: string
  bounds: YearBounds
  error: boolean
  labelledBy: string
  onParts: (parts: DobParts) => void
  onPrefix: (prefix: string) => void
}

function DateBoxes({ parts, prefix, bounds, error, labelledBy, onParts, onPrefix }: DateBoxesProps) {
  const [active, setActive] = useState<Segment | null>(null)
  const refs = useRef<Partial<Record<Segment, HTMLInputElement | null>>>({})

  const focus = (segment: Segment) => {
    const input = refs.current[segment]
    input?.focus()
    input?.select()
  }

  const clear = (segment: Segment) => {
    if (segment === 'month') onPrefix('')
    onParts({ ...parts, [segment]: '' })
  }

  /**
   * The characters an input event delivered, handed to the state machine and
   * the caret moved to wherever it left off. `typeInto` is where the rules
   * are; this only turns its answer back into focus and React state.
   */
  const handleInput = (segment: Segment) => (event: ChangeEvent<HTMLInputElement>) => {
    const native = event.nativeEvent as InputEvent
    if (native.inputType?.startsWith('delete')) { clear(segment); return }

    const next = typeInto({ parts, prefix, cursor: segment }, native.data ?? '')
    onPrefix(next.prefix)
    onParts(next.parts)
    if (next.cursor !== segment) focus(next.cursor)
  }

  const handleKeyDown = (segment: Segment) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      onPrefix('')
      onParts({ ...parts, [segment]: stepSegment(segment, parts[segment], event.key === 'ArrowUp' ? 1 : -1, bounds) })
      return
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const target = event.key === 'ArrowLeft' ? previousSegment(segment) : nextSegment(segment)
      if (!target) return
      event.preventDefault()
      focus(target)
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      // An empty box hands the backspace to the box before it, so holding the
      // key clears the whole date rather than stopping at the first gap.
      const previous = previousSegment(segment)
      if (!parts[segment] && previous) {
        focus(previous)
        clear(previous)
        return
      }
      clear(segment)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = parsePastedDate(event.clipboardData.getData('text'))
    if (!pasted) return
    event.preventDefault()
    onPrefix('')
    onParts(pasted)
    focus('year')
  }

  const shown = (segment: Segment): string => {
    if (segment !== 'month') return parts[segment]
    if (parts.month.length === SEGMENT_LENGTH.month) return monthLabel(parts.month)
    return prefix ? prefix.toUpperCase() : parts.month
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={`dob${error ? ' dob--error' : ''}`}
      // Clicking the frame rather than a box lands on the first box still
      // waiting for an answer, which is the one you meant.
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        focus(SEGMENT_ORDER.find((segment) => !parts[segment]) ?? 'day')
      }}
    >
      {SEGMENT_ORDER.map((segment, index) => (
        <span key={segment} className="dob__cell">
          {index > 0 ? <span className="dob__sep" aria-hidden="true">/</span> : null}
          <input
            ref={(node) => { refs.current[segment] = node }}
            className={`dob__seg dob__seg--${segment}${active === segment ? ' is-active' : ''}`}
            value={shown(segment)}
            placeholder={PLACEHOLDER[segment]}
            aria-label={NAMES[segment]}
            inputMode="numeric"
            autoComplete={`bday-${segment}`}
            spellCheck={false}
            onChange={handleInput(segment)}
            onKeyDown={handleKeyDown(segment)}
            onPaste={handlePaste}
            onFocus={(event) => { setActive(segment); event.target.select() }}
            onBlur={() => { setActive(null); onPrefix('') }}
          />
        </span>
      ))}
    </div>
  )
}
