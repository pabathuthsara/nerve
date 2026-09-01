import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every class the P1 production layer draws has a rule behind it.
 *
 * The same guard as `progress-chart.test.ts`, for the same reason: a class
 * name in a component and a rule in `globals.css` are joined by a string, and
 * nothing in the toolchain checks that the string matches. `.chart-score` was
 * styled under the wrong ancestor and seven charts rendered black-on-black
 * through a clean typecheck, a clean lint and a full test run.
 *
 * These classes carry the countdown, the mission and the cue rail — three
 * things that are invisible-but-passing in exactly the same way if a rule is
 * missing or a selector is renamed on one side only.
 */
const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function hasRuleFor(selector: string): boolean {
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((part) => part.trim())
    if (selectors.some((one) => one === selector || one.startsWith(`${selector} `) || one.startsWith(`${selector}.`) || one.startsWith(`${selector}[`))) {
      if ((match[2] ?? '').trim().length > 0) return true
    }
  }
  return false
}

describe('the production layer is actually styled', () => {
  it('draws the 3·2·1 overlay', () => {
    // Without a rule this renders as an unpositioned number in the document
    // flow, which is worse than no countdown at all.
    expect(hasRuleFor('.rep-arm')).toBe(true)
    expect(hasRuleFor('.rep-arm__count')).toBe(true)
  })

  it('puts the overlay above the orb', () => {
    // The orb stage is a WebGL canvas. A countdown that loses the stacking
    // fight with it is a countdown nobody sees.
    const block = css.match(/\.rep-arm\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).toMatch(/z-index:\s*\d+/)
    expect(block).toMatch(/position:\s*absolute/)
  })

  it('draws the arming and ended states of the live screen', () => {
    expect(hasRuleFor('.rep-live--arming')).toBe(true)
    expect(hasRuleFor('.rep-live--over')).toBe(true)
  })

  it('draws the mission in all three of its sizes', () => {
    expect(hasRuleFor('.mission-card')).toBe(true)
    expect(hasRuleFor('.mission-note')).toBe(true)
    expect(hasRuleFor('.mission-live')).toBe(true)
  })

  it('draws the cue rail, and gives all three cue states their own look', () => {
    expect(hasRuleFor('.cue-rail')).toBe(true)
    expect(hasRuleFor('.cue-chip')).toBe(true)
    expect(hasRuleFor('.cue-chip--done')).toBe(true)
    // The active one shipped unstyled the first time, which made "exactly one
    // cue is active" true in the markup and invisible on the screen.
    expect(css).toContain(".cue-chip[aria-current='step']")
  })

  it('puts the cue rail in the same column as the composer it sits above', () => {
    // It shipped flush against the left edge of the viewport while the thread
    // and the composer were centred. Both numbers come from `.text-rep__compose`.
    const block = css.match(/\.cue-rail\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).toContain('min(100%, 640px)')
    expect(block).toMatch(/margin:\s*0 auto/)
  })

  it('keeps the mission inside Arena — 2px radius, hairlines, no shadows', () => {
    const block = css.match(/\.mission-card\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).not.toMatch(/box-shadow/)
    expect(block).toMatch(/border-radius:\s*2px/)
  })

  it('spends its one Volt on the mission’s own marker', () => {
    // Arena: "if volt appears twice on a screen, one of them is wrong". The
    // mission card's left rule is the accent; the chips are not.
    expect(css.match(/\.mission-card\s*\{([^}]*)\}/)?.[1] ?? '').toContain('var(--volt)')
    expect(css.match(/\.cue-chip\s*\{([^}]*)\}/)?.[1] ?? '').not.toContain('var(--volt)')
  })
})
