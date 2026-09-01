'use client'

/**
 * The staged score reveal (§02, `M3-PLAN.md` Phase D).
 *
 * "Composite counting up over 900ms, sub-scores at 60ms." Two hooks, because
 * they are two different jobs: a number that climbs, and a list that arrives.
 *
 * ── WHY A SCORE IS WORTH STAGING AT ALL ──────────────────────────────────
 *
 * The scorecard is the payoff of three minutes of something genuinely hard,
 * and it used to appear complete and instantly, which reads as a page load
 * rather than a result. Counting the composite up is not decoration — it is
 * the half-second in which somebody finds out how it went, and the audit's
 * whole complaint is that this product has data where it should have moments.
 *
 * It also does something practical: the sub-scores arriving one at a time is
 * the only thing that makes a six-row list read in order rather than as a
 * block to be skimmed.
 *
 * ── REDUCED MOTION IS NOT A SLOWER VERSION, IT IS NO VERSION ─────────────
 *
 * §02 says respected everywhere, "score reveal included" — it is the one
 * example the rule names. Under a reduced-motion preference both hooks return
 * their finished state on the first render: the composite is simply the
 * number, every row is simply present, and nothing counts, staggers or moves.
 */

import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // A browser with no `matchMedia` gets the still version, which is the one
    // that is correct for everybody rather than merely acceptable.
    return true
  }
}

/** §02's number: the composite takes this long to climb. */
export const COMPOSITE_MS = 900

/** §02's number: one sub-score every this many milliseconds. */
export const STAGGER_MS = 60

/**
 * A number that climbs to `target`.
 *
 * Eased rather than linear — a linear count-up reads as a loading bar, and the
 * point is a result landing, not progress being made. `null` target means the
 * grade has not arrived, and the hook stays at zero without starting.
 */
export function useCountUp(target: number | null, durationMs = COMPOSITE_MS): { value: number; done: boolean } {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? (target ?? 0) : 0))
  const [done, setDone] = useState(() => prefersReducedMotion())
  const started = useRef(false)

  useEffect(() => {
    if (target === null || started.current) return
    started.current = true
    if (prefersReducedMotion()) {
      setValue(target)
      setDone(true)
      return
    }
    const begin = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - begin) / durationMs)
      // Cubic ease-out. Fast at the start, settling at the end, so the last
      // few points feel like the number arriving rather than still moving.
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) {
        frame = requestAnimationFrame(step)
        return
      }
      setValue(target)
      setDone(true)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [durationMs, target])

  return { value, done }
}

/**
 * How many of `count` items have arrived.
 *
 * Starts once `ready` is true — on the scorecard that is "the composite has
 * finished counting", so the rows follow the number rather than racing it.
 */
export function useStagger(count: number, ready: boolean, stepMs = STAGGER_MS): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? count : 0))

  useEffect(() => {
    if (!ready) return
    if (prefersReducedMotion()) {
      setShown(count)
      return
    }
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setShown(index)
      if (index >= count) window.clearInterval(timer)
    }, stepMs)
    return () => window.clearInterval(timer)
  }, [count, ready, stepMs])

  return shown
}
