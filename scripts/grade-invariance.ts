/**
 * The outcome-invariance check (rule 2, PERSONA-REALISM S1).
 *
 *   npm run grade:invariance                  # in-process, no server needed
 *   npm run grade:invariance -- --limit 3     # the first three pairs only
 *   CALIBRATE_URL=https://… npm run grade:invariance   # the deployed route
 *
 * Grades each pair in `lib/grade/calibration/outcome-pairs.ts` twice — one
 * real rep, finished once with her number and once without — and fails if the
 * composite, any one dimension, or the pairs taken together moved with the
 * ending. It spends money: two calls to `GRADE_MODEL` per pair, a little under
 * a cent each on gpt-4.1.
 *
 * ── WHY IN-PROCESS IS THE DEFAULT ────────────────────────────────────────
 *
 * `grade:calibrate` drives the deployed route over HTTP, and says why: a
 * harness that re-implements grading goes green while the real path drifts.
 * This keeps that property without needing a server. It imports the route's
 * own `POST` and hands it a `Request`, so the rubric, the renderer, the
 * parser, the clamp and the composition are all the production code, byte for
 * byte. The machine-caller door (`INTERNAL_API_SECRET`) is how it gets past
 * `requireUser`; when `.env.local` has no secret, one is minted for this
 * process only, which is exactly as far as a request made inside it travels.
 * A machine caller is never billed to a user and never reads band-time, so
 * nothing here touches the database.
 *
 * `grade:calibrate` runs the same pairs against a deployed route.
 */

import { randomUUID } from 'node:crypto'
import { OUTCOME_PAIRS, OUTCOME_TOLERANCE, runInvariance, type GradeOne } from '@/lib/grade/calibration/outcome-pairs'
import { MAX_DRIFT } from '@/lib/grade/calibration/fixtures'
import { clampSubScores } from '@/lib/grade'
import { loadEnvLocal } from './env'

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  await loadEnvLocal()

  if (!process.env['OPENAI_API_KEY']) {
    console.error('OPENAI_API_KEY is not set. The grader cannot run without it.')
    process.exit(1)
  }

  const limitArg = argValue('--limit')
  const limit = limitArg === undefined ? OUTCOME_PAIRS.length : Number(limitArg)
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit wants a whole number of pairs, got ${limitArg}.`)
    process.exit(1)
  }
  const pairs = OUTCOME_PAIRS.slice(0, limit)
  const base = argValue('--url') ?? process.env['CALIBRATE_URL']

  const grade = base ? await overHttp(base) : await inProcess()
  const where = base ?? 'in-process (the route handler, no server)'

  console.log(`\nOutcome invariance · ${where}`)
  console.log(`  model ${process.env['GRADE_MODEL'] ?? 'gpt-4.1'} · ${pairs.length} of ${OUTCOME_PAIRS.length} pair(s) · `
    + `tolerance ±${OUTCOME_TOLERANCE} composite, ±${MAX_DRIFT} per dimension\n`)

  const run = await runInvariance(pairs, grade)
  for (const line of run.lines) console.log(line)
  console.log('')

  if (run.unreadable.length > 0) {
    console.error(`${run.unreadable.length} pair(s) did not grade: ${run.unreadable.join(', ')}\n`)
    process.exit(1)
  }
  if (!run.report.ok) {
    console.error('The grade moved with the ending:\n')
    for (const failure of run.report.failures) console.error(`  ${failure}`)
    console.error('')
    process.exit(1)
  }
  console.log(`All ${pairs.length} pair(s) held: the ending did not move the grade beyond noise.\n`)
}

/** The deployed route, as `grade:calibrate` reaches it. */
async function overHttp(base: string): Promise<GradeOne> {
  const secret = process.env['INTERNAL_API_SECRET']
  if (!secret) {
    console.error('INTERNAL_API_SECRET is not set. A deployed /api/grade answers a machine caller only with it.')
    process.exit(1)
  }
  return (input) => call(() => fetch(`${base}/api/grade`, request(input, secret)))
}

/** The route handler itself, called inside this process. */
async function inProcess(): Promise<GradeOne> {
  const secret = process.env['INTERNAL_API_SECRET'] ?? randomUUID()
  process.env['INTERNAL_API_SECRET'] = secret
  // Imported after the environment is loaded: the route reads `GRADE_MODEL`
  // when the module is evaluated.
  const { POST } = await import('@/app/api/grade/route')
  return (input) => call(() => POST(new Request('http://localhost/api/grade', request(input, secret))))
}

function request(input: Parameters<GradeOne>[0], secret: string): RequestInit {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }
}

async function call(send: () => Promise<Response>): ReturnType<GradeOne> {
  try {
    const response = await send()
    if (!response.ok) {
      console.error(`  /api/grade answered ${response.status}: ${(await response.text()).slice(0, 160)}`)
      return null
    }
    const card = (await response.json()) as { composite?: unknown; subScores?: unknown }
    const subScores = clampSubScores(card.subScores)
    if (typeof card.composite !== 'number' || !subScores) return null
    return { composite: card.composite, subScores }
  } catch (error) {
    console.error(`  /api/grade unreachable: ${error instanceof Error ? error.message : 'error'}`)
    return null
  }
}

void main()
