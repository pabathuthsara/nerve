import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Progress trend lines, guarded at the level they actually broke.
 *
 * `components/screens/progress-screens.tsx` draws seven `<polyline
 * className="chart-score">` inside `.trend` — one composite line and six
 * sub-score sparklines. `.chart-score` was styled only under `.warmth-chart`,
 * which is a different screen, so inside `.trend` the polylines fell back to
 * the SVG defaults: `stroke: none` and `fill: black`. Black shapes on the
 * `#0B0C0A` ground. Every chart on the one screen whose whole job is showing
 * the number going up was invisible, and it typechecked, linted and passed
 * every test.
 *
 * A CSS assertion is unusual here and it is deliberate. The defect is not that
 * a value was wrong — it is that a rule was reachable from one ancestor and not
 * from another, which no unit test of a component can see and no reviewer
 * reliably catches. So the thing asserted is the reachability.
 */
/** Comments stripped first — they carry commas, and selectors are comma-split. */
const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Every declaration block whose selector list contains `selector`. */
function blocksFor(selector: string): string[] {
  const out: string[] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((part) => part.trim())
    if (selectors.includes(selector)) out.push(match[2] ?? '')
  }
  return out
}

describe('the Progress trend lines are actually drawn', () => {
  it('kills the default black fill on the polylines', () => {
    // This alone is what made them invisible rather than merely uncoloured: an
    // unstyled polyline is filled, not stroked.
    const declarations = blocksFor('.trend polyline').join(';')
    expect(declarations.replace(/\s/g, '')).toContain('fill:none')
  })

  it('gives the composite line a stroke reachable from .trend', () => {
    // Not `.warmth-chart .chart-score`, which is a different screen and is
    // where this rule used to live alone.
    const declarations = blocksFor('.trend .chart-score').join(';')
    expect(declarations).toMatch(/stroke:\s*var\(--volt\)/)
  })

  it('gives the six sub-score sparklines the second-series colour', () => {
    // Arena: Volt is the composite score, Cool is the second data series. Six
    // Volt sparklines beside a Volt composite line would be the "if volt
    // appears twice on a screen, one of them is wrong" rule broken six times.
    const declarations = blocksFor('.trend--compact .chart-score').join(';')
    expect(declarations).toMatch(/stroke:\s*var\(--cool\)/)
  })

  it('orders the compact rule after the composite one, since they tie on specificity', () => {
    // Both are (0,2,0). A compact trend carries both classes, so the sub-score
    // colour only wins because it is written second — swap them and all seven
    // lines turn Volt with no error anywhere.
    expect(css.indexOf('.trend--compact .chart-score')).toBeGreaterThan(css.indexOf('.trend .chart-score'))
  })

  it('still styles the profile warmth chart, which shares the class name', () => {
    // The two screens share `.chart-score` and mean different things by it.
    // Fixing one must not have moved the other.
    expect(blocksFor('.warmth-chart .chart-score').join(';')).toMatch(/stroke:\s*var\(--cool\)/)
  })
})
