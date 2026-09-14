/**
 * Refuse to start a SECOND dev server against the same `.next`.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * `next dev` does not fail when its port is taken. It prints
 *
 *     Port 3000 is in use by process NNNNN, using available port 3001 instead.
 *
 * and carries on — so two dev servers end up running against the SAME `.next`,
 * writing the same `.next/cache/webpack` pack files at the same time. Gzip
 * packs do not survive interleaved writes, and the result is a wall of
 *
 *     [webpack.cache.PackFileCacheStrategy] Restoring failed for … from pack:
 *     Error: incorrect header check
 *
 * which reads as a broken install rather than as two processes fighting over a
 * directory. The compile still succeeds, so nothing fails loudly; the cache is
 * simply useless from then on and every start is slow.
 *
 * `next.config.ts` already documents the neighbouring hazard — a `next build`
 * run while `next dev` is up leaves the dev server serving a manifest that no
 * longer matches what is on disk. Same directory, same class of problem, and
 * that one at least surfaces as a `ChunkLoadError` somebody can chase. This one
 * only whispers.
 *
 * ── IT FAILS OPEN ────────────────────────────────────────────────────────
 *
 * If `lsof` is missing, or returns something unexpected, or the platform is not
 * one this understands, the guard allows the start. A developer blocked from
 * running their own dev server by a port check that guessed wrong is a worse
 * outcome than the cache warnings this prevents.
 */

import { execFileSync } from 'node:child_process'

const port = process.env.PORT || '3000'

/** PIDs listening on the port, or null when we genuinely cannot tell. */
function listeners() {
  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').map((line) => line.trim()).filter(Boolean)
  } catch (error) {
    // `lsof` exits 1 when nothing matches, which is the ordinary free-port
    // case and not a failure. Anything else — missing binary, no permission —
    // means we cannot tell, and we let the start through.
    if (error && typeof error === 'object' && 'status' in error && error.status === 1) return []
    return null
  }
}

const pids = listeners()
if (pids === null || pids.length === 0) process.exit(0)

console.error(`
  Port ${port} is already serving something (pid ${pids.join(', ')}).

  Next would quietly start on ${Number(port) + 1} instead — and both servers
  would then write the same .next/cache/webpack, which corrupts the gzip packs
  and fills the log with "incorrect header check". The compile still succeeds,
  so it looks like a broken install rather than two processes sharing a folder.

  Stop the other one, or start this one somewhere else:

      kill ${pids.join(' ')}
      PORT=3100 npm run dev

  If the cache is already full of those warnings, clear it once:

      rm -rf .next/cache/webpack
`)
process.exit(1)
