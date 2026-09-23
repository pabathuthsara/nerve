/**
 * Re-measure the difficulty ladder — the table in
 * `PERSONA-REALISM-REPORT-2026-09-23.md` §1.2, reproducible.
 *
 *   npm run ladder:sim                      # 12 and 16 turns, 2,000 reps a cell
 *   npm run ladder:sim -- 12 15 18          # any turn counts
 *   npm run ladder:sim -- 12 16 --reps 500 --seed after-L1
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * The report's first ladder conclusion is "latency is the first ladder fix":
 * the rungs were tuned for fifteen turns a rep and production delivers
 * twelve. Its phase 3 is "re-measure the ladder before any trajectory
 * moves". Both need an instrument that lives in the repo and gives the same
 * answer twice, and the numbers in §1.2 came from a scratch file that did not
 * survive the session that produced them.
 *
 * ── WHAT IT RUNS ─────────────────────────────────────────────────────────
 *
 * `lib/simulation/ladder.ts` — the real `WarmthSession` for every dating
 * character in `DATING_PERSONAS`, driven by three synthetic players whose mix
 * is Appendix C's, with a simulated judge on every third turn that was not a
 * dead end. See that file's header for exactly which rules are live and which
 * one is simulated.
 *
 * Free. No network, no database, no model. Deterministic for a seed: change
 * `--seed` to see how much of a difference is noise.
 *
 * ── HOW TO READ IT ───────────────────────────────────────────────────────
 *
 *   armed     peak ≥ 65 on a turn before the last three (the wind-down)
 *   ENGAGED   reached 60 in the same window — the definition §1.2 used,
 *             measured: over the whole rep Nadia's competent player reads
 *             70% at 16 turns, before the wind-down 36%, and §1.2 says 37%
 *   peak      mean of the highest warmth in that window, start included
 *
 * Each of those is also printed over the whole rep, in brackets.
 *
 * It is a model of the ladder, not of a person. It gives the direction and
 * the size of a turn-count or trajectory effect; `rep:audition` and real reps
 * confirm it.
 */

import { DATING_PERSONAS } from '../lib/personas'
import {
  CATEGORIES,
  PLAYER_IDS,
  poolViolations,
  simulateCell,
  type CellResult,
  type TurnCategory,
} from '../lib/simulation/ladder'

const DEFAULT_TURNS = [12, 16]
const DEFAULT_REPS = 2000
const DEFAULT_SEED = 'ladder-sim'

interface Options {
  turns: number[]
  reps: number
  seed: string
}

function parseArgs(argv: readonly string[]): Options {
  const turns: number[] = []
  let reps = DEFAULT_REPS
  let seed = DEFAULT_SEED
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--reps') {
      reps = Number(argv[i += 1])
    } else if (arg === '--seed') {
      seed = String(argv[i += 1] ?? DEFAULT_SEED)
    } else if (arg !== undefined && /^\d+$/.test(arg)) {
      turns.push(Number(arg))
    } else {
      throw new Error(`Did not understand "${arg}". Turn counts, then --reps N and --seed S.`)
    }
  }
  if (!Number.isInteger(reps) || reps < 1) throw new Error('--reps must be a whole number of at least one.')
  if (turns.some((count) => count < 3)) throw new Error('A rep needs at least three turns: the last three are the wind-down.')
  return { turns: turns.length > 0 ? turns : DEFAULT_TURNS, reps, seed }
}

const pct = (value: number) => `${Math.round(value * 100)}%`
const one = (value: number) => value.toFixed(1)

function main(): void {
  const options = parseArgs(process.argv.slice(2))

  // A category is a claim about how the scorer reads a line. If any fixture
  // has stopped meaning what its label says, every row below is mislabelled,
  // so the run refuses rather than printing a confident wrong table.
  const problems = poolViolations()
  if (problems.length > 0) {
    console.error('The player fixtures no longer mean what they say:')
    for (const problem of problems) console.error(`  · ${problem}`)
    process.exit(1)
  }

  const personas = Object.values(DATING_PERSONAS).sort((a, b) => a.level - b.level)
  const started = Date.now()
  const cells: CellResult[] = []
  for (const persona of personas) {
    for (const player of PLAYER_IDS) {
      for (const turns of options.turns) {
        cells.push(simulateCell(persona, player, turns, { reps: options.reps, seed: options.seed }))
      }
    }
  }
  const cell = (slug: string, player: string, turns: number) =>
    cells.find((c) => c.slug === slug && c.player === player && c.turns === turns)!

  console.log(`\nLadder simulation — ${options.reps.toLocaleString('en-US')} reps a cell, seed "${options.seed}"`)
  console.log('Real WarmthSession and scoreFast; simulated judge +5 / +3 / +2 every third non-dead-end turn.\n')

  // ── The detailed table ────────────────────────────────────────────────
  //
  // Before the wind-down first, because that is the window `armed` is read
  // in and the one §1.2 reports. The whole rep follows in brackets: warmth
  // gained in the last three turns is real, and changes nothing he can win.
  const head = options.turns.map((turns) => `${turns} turns: armed · ENGAGED · peak (whole rep: ENGAGED · peak)`)
  console.log(`| Rung | Player | ${head.join(' | ')} |`)
  console.log(`|---|---|${options.turns.map(() => '---:').join('|')}|`)
  for (const persona of personas) {
    for (const player of PLAYER_IDS) {
      const values = options.turns.map((turns) => {
        const c = cell(persona.slug, player, turns)
        return `${pct(c.armRate)} · ${pct(c.engagedShare)} · ${one(c.meanPeakBeforeWindDown)}`
          + ` (${pct(c.engagedAnywhereShare)} · ${one(c.meanPeak)})`
      })
      console.log(`| ${persona.level} ${persona.name} | ${player} | ${values.join(' | ')} |`)
    }
  }

  // ── The report's shape, for side-by-side reading against §1.2 ─────────
  console.log('\nIn the shape of the report\'s §1.2 (arm rate strong / competent / nervous, ENGAGED share in brackets):\n')
  console.log(`| Rung (current dials) | ${options.turns.map((turns) => `${turns} turns`).join(' | ')} |`)
  console.log(`|---|${options.turns.map(() => '---:').join('|')}|`)
  for (const persona of personas) {
    const values = options.turns.map((turns) => PLAYER_IDS.map((player) => {
      const c = cell(persona.slug, player, turns)
      return `${pct(c.armRate)} (${pct(c.engagedShare)})`
    }).join(' / '))
    console.log(`| ${persona.name} | ${values.join(' | ')} |`)
  }

  // ── What each move actually paid ──────────────────────────────────────
  //
  // The mean raw fast score per category, before gain, decay and the cap, as
  // the real scorer read it — pooled across players and rep lengths. This is
  // the table to look at when a row above moves unexpectedly: a reprice in
  // `fast.ts` or a temperament change shows up here first.
  console.log('\nMean raw fast score by move (before gain/decay/cap), pooled across players and lengths:\n')
  const label: Record<TurnCategory, string> = {
    open: 'open question',
    callback: 'callback',
    ordinary: 'ordinary',
    short: 'short answer',
    deadEnd: 'dead end',
  }
  console.log(`| Rung | ${CATEGORIES.map((category) => label[category]).join(' | ')} | silent turns / rep |`)
  console.log(`|---|${CATEGORIES.map(() => '---:').join('|')}|---:|`)
  for (const persona of personas) {
    const mine = cells.filter((c) => c.slug === persona.slug)
    const values = CATEGORIES.map((category) => {
      const turns = mine.reduce((sum, c) => sum + c.fastByCategory[category].turns, 0)
      const raw = mine.reduce((sum, c) => sum + c.fastByCategory[category].meanRaw * c.fastByCategory[category].turns, 0)
      return turns > 0 ? (raw / turns >= 0 ? '+' : '') + (raw / turns).toFixed(2) : '—'
    })
    const silent = mine.reduce((sum, c) => sum + c.meanSilentTurns, 0) / mine.length
    console.log(`| ${persona.name} | ${values.join(' | ')} | ${silent.toFixed(2)} |`)
  }

  console.log(`\n${cells.length} cells in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`)
}

main()
