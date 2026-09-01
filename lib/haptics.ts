/**
 * A tick against the thumb.
 *
 * One function, called when a wheel crosses a row. It is deliberately the only
 * haptics in the product, because the honest summary of web haptics is short:
 *
 *   Android (Chrome, Firefox)  the Vibration API works. A few milliseconds
 *                              reads as a tick rather than a buzz.
 *   iOS (every browser)        there is nothing. `navigator.vibrate` has never
 *                              been implemented on iOS and there is no flag,
 *                              no permission prompt and no alternative API
 *                              behind it.
 *
 * The one known iOS workaround is to toggle a hidden `<input type="checkbox"
 * switch>` — Safari 17.4 and later fire a system haptic as a side effect of
 * that control. It is not wired up here on purpose. It is a side effect rather
 * than an interface, it is undocumented as a capability, Apple can remove it
 * in a point release, and it cannot be verified anywhere except on real
 * hardware. Adding it is a few lines the day somebody has an iPhone in hand
 * and can say whether they felt it.
 *
 * Which is why nothing in the picker depends on this. The snap, the row
 * settling under the band and the date resolving underneath carry the feel on
 * their own; on an iPhone the wheel is not missing anything, it is quieter.
 */

/** Milliseconds. Long enough to feel, short enough not to buzz. */
const TICK = 8

/**
 * The rep's own patterns (§02, `M3-PLAN.md` Phase D).
 *
 * Three, and no more. Haptics carry meaning only while they stay
 * distinguishable, and a product with six vibration patterns has one
 * vibration pattern that nobody can tell apart.
 *
 *   countdown  one count of 3·2·1. The same tick the date wheel uses, because
 *              it means the same thing: a discrete step just happened.
 *   open       the rep starts. Longer, single, unmistakably a different event.
 *   close      she has gone. Two short pulses — the only pattern with a gap in
 *              it, so the end of a rep never feels like the start of one.
 *
 * There is deliberately nothing for the thirty-second mark. §05 forbids
 * coaching mid-rep, and a buzz against the leg while somebody is mid-sentence
 * is the most literal interruption available.
 */
export const PATTERNS = {
  countdown: TICK,
  open: 18,
  close: [14, 60, 14],
} as const

export function tap(duration: number | readonly number[] = TICK): void {
  if (typeof window === 'undefined') return

  // Vestibular triggers and haptics travel together, and §02's motion rule is
  // respected everywhere else in the product.
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  } catch {
    // A browser with no `matchMedia` is a browser with no vibration either.
    return
  }

  const vibrate = navigator.vibrate?.bind(navigator)
  if (!vibrate) return

  try {
    vibrate(duration as number | number[])
  } catch {
    // Some browsers throw rather than returning false when the page has not
    // been interacted with yet. A missing tick is not worth an exception.
  }
}
