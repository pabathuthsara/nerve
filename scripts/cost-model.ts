/**
 * What a three-minute rep costs, and whether the tiers survive it.
 *
 *   npm run cost:model
 *
 * §04 says to re-measure before launch, and the rep going from two minutes to
 * three is what made that necessary rather than prudent. This is the arithmetic
 * half of that: it takes the reps M0 actually measured, projects the format
 * change onto them, and checks the result against §14's tier caps and §18's
 * unit economics.
 *
 * **This is a projection from measured runs, not a measurement.** Nothing here
 * opens a connection or spends anything. The live re-measurement M0.md asks for
 * — ten reps, five past three minutes, from the Colombo home connection at the
 * hour the user base actually trains — is still owed, and this script exists so
 * that when those numbers arrive there is something to check them against.
 *
 * Every run below is transcribed from `docs/M0.md`; the section is named on
 * each one so a reader can go and disagree with the source rather than with a
 * number that appeared here from nowhere.
 */

import { rateFor } from '@/lib/voice/rates'
import { DATING_DURATION_MS } from '@/lib/data/rep-rules'

interface MeasuredRun {
  /** Which M0 finding this came from. */
  source: string
  seconds: number
  /** Provider-token priced, from `response.done` usage — not rate x time. */
  usdPerMinute: number
}

/**
 * Every priced run in M0, all on `gpt-realtime-mini`.
 *
 * The first is dashboard-reconciled; the rest are token-priced from provider
 * usage. They are kept as a set rather than averaged into one figure because
 * the spread is the finding: cost per minute tracks how dense the conversation
 * is, not how long it ran.
 */
const RUNS: MeasuredRun[] = [
  { source: 'first live finding (dashboard-reconciled)', seconds: 117.8, usdPerMinute: 0.0285 },
  { source: 'second live finding', seconds: 143.6, usdPerMinute: 0.0192 },
  { source: 'fourth live finding', seconds: 211.4, usdPerMinute: 0.0283 },
  { source: 'third live finding (longest run)', seconds: 305.8, usdPerMinute: 0.0293 },
]

const REP_MINUTES = DATING_DURATION_MS / 60_000

/** The rate stamped on the ledger when the provider reports no usage at all. */
const FALLBACK = rateFor('openai', 'gpt-realtime-mini').perMinute

const usd = (value: number) => `$${value.toFixed(4)}`
const usd2 = (value: number) => `$${value.toFixed(2)}`

function main(): void {
  const rates = RUNS.map((run) => run.usdPerMinute)
  const low = Math.min(...rates)
  const high = Math.max(...rates)
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length

  console.log('\nMeasured runs (docs/M0.md, gpt-realtime-mini)\n')
  console.log('  duration   $/min     source')
  for (const run of RUNS) {
    console.log(`  ${`${run.seconds}s`.padStart(8)}   ${usd(run.usdPerMinute)}  ${run.source}`)
  }
  console.log(`\n  band ${usd(low)}–${usd(high)}/min · mean ${usd(mean)}/min`)

  // The fear §04 records is that realtime re-charges prior audio context each
  // turn, so a longer rep costs more than pro rata. These runs do not show it:
  // the longest is the dearest but only by a hair, and the cheapest sits in the
  // middle of the range. Removing blind scheduled reinforcement is what turned
  // the within-session cost curve from +46.5% to -7.4% (M0, third and fourth
  // findings), and that is the change that bought this.
  const longest = RUNS.reduce((a, b) => (a.seconds > b.seconds ? a : b))
  const shortest = RUNS.reduce((a, b) => (a.seconds < b.seconds ? a : b))
  const drift = (longest.usdPerMinute / shortest.usdPerMinute - 1) * 100
  console.log(
    `  ${longest.seconds}s vs ${shortest.seconds}s: ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}%`
    + ' per minute — context growth is not compounding at this length',
  )

  console.log(`\nA ${REP_MINUTES}-minute rep\n`)
  console.log(`  at the cheapest measured rate   ${usd(low * REP_MINUTES)}`)
  console.log(`  at the mean measured rate       ${usd(mean * REP_MINUTES)}`)
  console.log(`  at the dearest measured rate    ${usd(high * REP_MINUTES)}   <- plan against this`)
  console.log(`  at the ledger fallback rate     ${usd(FALLBACK * REP_MINUTES)}   (${(FALLBACK / high).toFixed(1)}x the dearest measured)`)
  console.log('  §18 says                        $0.2100')

  // Worst case, deliberately: the dearest measured rate, and every user
  // burning the whole cap every month. §14 is explicit that almost nobody
  // reaches it, which is exactly why the tier has to survive the ones who do.
  const plan = high

  console.log('\nTiers as §14 specifies them, at the dearest measured rate\n')
  console.log('  tier       price    cap        voice cost   §14 assumed   margin')
  tier('Free', 0, 9, '$0.72', plan)
  tier('Training', 19, 60, '$4.80', plan)
  tier('Serious', 39, 150, '$12.00', plan)

  // What the app actually enforces today. `LAUNCH-GAP.md` D2 records the
  // disagreement with §14; both need costing, because the drift is unresolved
  // and whichever wins has to hold up.
  console.log('\nTiers as the app enforces them today (LAUNCH-GAP D2), at full daily usage\n')
  console.log('  tier       price    cap        voice cost   §14 assumed   margin')
  tier('Free', 0, 1 * REP_MINUTES * 30, '—', plan)
  tier('Pro', 24, 3 * REP_MINUTES * 30, '—', plan)
  tier('Elite', 39, 6 * REP_MINUTES * 30, '—', plan)

  console.log(
    '\nMargins are before the merchant of record, which §18 puts at 4–5% plus a'
    + '\nfixed fee — roughly seven points off each paid line.\n',
  )
}

function tier(name: string, price: number, minutes: number, assumed: string, ratePerMinute: number): void {
  const cost = minutes * ratePerMinute
  const margin = price > 0 ? `${(((price - cost) / price) * 100).toFixed(0)}%` : '—'
  console.log(
    `  ${name.padEnd(9)}  ${(price ? usd2(price) : '$0').padStart(6)}   `
    + `${`${Math.round(minutes)} min`.padEnd(9)}  ${usd2(cost).padStart(10)}   `
    + `${assumed.padStart(11)}   ${margin.padStart(6)}`,
  )
}

main()
