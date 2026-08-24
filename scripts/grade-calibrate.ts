/**
 * The grade calibration harness (§07, §17 — the M2 gate).
 *
 *   npm run grade:calibrate                    # against localhost:3000
 *   CALIBRATE_URL=https://… npm run grade:calibrate
 *
 * §17 does not let M2 close without this, and §19 lists scoring drift as a
 * high risk: models update, scores rot silently, and progression stops meaning
 * anything the moment the number moves underneath it.
 *
 * It drives the **deployed** `/api/grade` over HTTP with `INTERNAL_API_SECRET`,
 * exactly as the warmth calibration suite drives the live scorer. That is the
 * point: a harness that re-implemented the grading path would go green while
 * the thing users actually hit had drifted.
 *
 * Nightly on a schedule. Any dimension off by more than `MAX_DRIFT` fails.
 */

import { GRADE_FIXTURES, MAX_DRIFT, REQUIRED_FIXTURES } from '@/lib/grade/calibration/fixtures'
import { SUB_SCORE_KEYS, type SubScores } from '@/lib/grade/types'
import { loadEnvLocal } from './env'

interface Drift {
  id: string
  dimension: string
  expected: number
  actual: number
  drift: number
}

async function main(): Promise<void> {
  await loadEnvLocal()

  const base = process.env['CALIBRATE_URL'] ?? 'http://localhost:3000'
  const secret = process.env['INTERNAL_API_SECRET']
  if (!secret) {
    console.error(
      'INTERNAL_API_SECRET is not set.\n'
      + 'The harness authenticates to /api/grade as a machine caller; without it every\n'
      + 'request is a 401. Set it on the server being measured and in .env.local.',
    )
    process.exit(1)
  }

  const scored = GRADE_FIXTURES.filter((fixture) => fixture.expected !== null)
  const unscored = GRADE_FIXTURES.length - scored.length

  console.log(`\nGrade calibration · ${base}`)
  console.log(`  ${GRADE_FIXTURES.length} fixture(s), ${scored.length} hand-scored\n`)

  if (GRADE_FIXTURES.length === 0) {
    console.error(
      'No fixtures yet. This suite is the M2 gate (§17) and cannot pass empty.\n\n'
      + '  1. Run reps under the current three-minute format.\n'
      + '  2. `npm run grade:collect` to pull the transcripts into fixtures.ts.\n'
      + '  3. Hand-score all six sub-scores and the composite on each.\n'
      + '  4. Run this again.\n',
    )
    process.exit(1)
  }

  const drifts: Drift[] = []
  let failed = 0

  for (const fixture of scored) {
    const expected = fixture.expected
    if (!expected) continue

    let response: Response
    try {
      response = await fetch(`${base}/api/grade`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript: fixture.transcript,
          sessionSeconds: fixture.sessionSeconds,
          personaName: fixture.personaName,
        }),
      })
    } catch (error) {
      console.log(`  FAIL  ${fixture.id} — unreachable (${error instanceof Error ? error.message : 'error'})`)
      failed += 1
      continue
    }

    if (!response.ok) {
      console.log(`  FAIL  ${fixture.id} — /api/grade returned ${response.status}`)
      failed += 1
      continue
    }

    const card = (await response.json()) as SubScores & { composite: number; subScores?: SubScores }
    const actual = card.subScores ?? card

    const worst = [...SUB_SCORE_KEYS, 'composite' as const].map((key) => {
      const want = key === 'composite' ? expected.composite : expected[key]
      const got = key === 'composite' ? card.composite : actual[key]
      const drift = Math.abs(got - want)
      if (drift > MAX_DRIFT) drifts.push({ id: fixture.id, dimension: key, expected: want, actual: got, drift })
      return drift
    }).reduce((max, value) => Math.max(max, value), 0)

    const ok = worst <= MAX_DRIFT
    if (!ok) failed += 1
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${fixture.id}  worst drift ${worst.toFixed(1)}`)
  }

  if (drifts.length > 0) {
    console.log('\nDrifted beyond the threshold:\n')
    console.log('  fixture              dimension       expected  actual  drift')
    for (const drift of drifts) {
      console.log(
        `  ${drift.id.padEnd(20)} ${drift.dimension.padEnd(15)} `
        + `${String(drift.expected).padStart(8)}  ${String(drift.actual).padStart(6)}  ${drift.drift.toFixed(1).padStart(5)}`,
      )
    }
  }

  console.log('')
  if (unscored > 0) {
    console.log(`  ${unscored} fixture(s) still have no hand-scored expectation and were skipped.`)
  }
  if (scored.length < REQUIRED_FIXTURES) {
    console.error(
      `\n${scored.length} of ${REQUIRED_FIXTURES} hand-scored. §07 asks for twenty; the suite is not green below that.\n`,
    )
    process.exit(1)
  }
  if (failed > 0) {
    console.error(`\n${failed} fixture(s) drifted beyond ${MAX_DRIFT} points.\n`)
    process.exit(1)
  }

  console.log(`All ${scored.length} fixtures within ${MAX_DRIFT} points.\n`)
}

void main()
