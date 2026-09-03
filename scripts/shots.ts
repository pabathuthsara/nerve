/**
 * Product screenshots, captured from the running app (V6, `docs/VISUAL-AUDIT.md`).
 *
 *   npm run dev            # in another terminal
 *   npm run shots
 *
 * **Why this is a script and not a design file.** The audit's second systemic
 * finding is that the product is never shown anywhere — no screenshot on `/`,
 * `/how-it-works` or `/pricing` — and the existing half-measure is
 * `ScorecardArtifact` on the landing page, a scorecard hand-built in markup
 * because the page needed a picture. A hand-drawn replica drifts from the real
 * screen the first time that screen changes, and then the marketing site is
 * advertising an interface that does not exist. So these come out of the real
 * app, through the real routes, signed in as a real account — the same
 * argument `hero:audio` makes about her half of the hero rep, and the same one
 * `legal:pdf` makes about the policy documents.
 *
 * **What it deliberately does NOT capture: the live rep.** `/rep/[id]/live`
 * opens a WebRTC session against the voice provider, which spends money the
 * moment it connects (§14, `lib/db/spend.ts`). A build artefact that bills the
 * account is the wrong kind of automation, so the brief — same character, same
 * rules block, no microphone and no session — stands in for it. If a still of
 * a live rep is ever wanted, it is taken by hand, the way `hero:audio` is run
 * by hand.
 *
 * **No new dependency.** It drives the system Chrome over the DevTools
 * protocol, the way `legal-pdf.ts` spawns the same binary to print. Node 22
 * has a global `WebSocket`, so CDP needs nothing installed; adding Playwright
 * and a second browser download to take nine screenshots would be the heavier
 * and more fragile choice.
 */

import { spawn, type ChildProcess } from 'node:child_process'

/** Spawn and wait. Same shape as `legal-pdf.ts`, for the same reason. */
function run(command: string, args: string[]): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args)
    child.on('error', () => resolve({ code: 1 }))
    child.on('close', (code) => resolve({ code: code ?? 1 }))
  })
}
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'public/shots'
const PORT = 9333
const PROFILE = '/tmp/nerve-shots-profile'

/**
 * What gets captured, and at what size.
 *
 * `desktop` is what the landing page frames; `mobile` is what a phone visitor
 * sees and what the roster and field screens were actually designed against.
 * Every one of these is a read-only route — nothing here starts a session,
 * accepts a challenge or touches the ledger.
 */
interface Shot {
  /** File stem under `public/shots/`. */
  name: string
  path: string
  /** Waited for before the shutter, so a skeleton is never what lands. */
  ready: string
  width: number
  height: number
  /** Extra settle time for a canvas or a staged reveal, in ms. */
  settle?: number
  /**
   * A screen with no stable URL, reached by clicking from one that has.
   *
   * The scorecard is the case this exists for: its route carries a session id,
   * so there is no path that names "my most recent graded rep". Landing on the
   * history list and opening the top row is how a person reaches it, and it is
   * the only way to capture it without hard-coding somebody's session into the
   * repo.
   */
  reach?: { from: string; click: string }
}

const SHOTS: Shot[] = [
  { name: 'train', path: '/train', ready: '.field-card__head', width: 1280, height: 900, settle: 2200 },
  { name: 'train-mobile', path: '/train', ready: '.field-card__head', width: 420, height: 860, settle: 2200 },
  { name: 'scorecard', path: '', ready: '.composite-card', width: 1280, height: 1100, settle: 1800, reach: { from: '/profile/history', click: '.session-row' } },
  { name: 'history', path: '/profile/history', ready: '.session-row', width: 1280, height: 900, settle: 600 },
  { name: 'roster', path: '/roster', ready: '.persona-card', width: 1280, height: 900, settle: 1400 },
  { name: 'field', path: '/field', ready: '.today-field', width: 1280, height: 900, settle: 1200 },
  { name: 'field-mobile', path: '/field', ready: '.today-field', width: 420, height: 860, settle: 1200 },
  { name: 'progress', path: '/progress', ready: '.progress-stack', width: 1280, height: 900, settle: 600 },
  { name: 'library', path: '/library', ready: '.library-grid', width: 1280, height: 900, settle: 400 },
]

/* ------------------------------------------------------------------ CDP -- */

let nextId = 1

interface Cdp {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<Record<string, unknown>>
  close: () => void
}

async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url)
  const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>()

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('Could not open a DevTools socket')), { once: true })
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } }
    if (typeof message.id !== 'number') return
    const waiting = pending.get(message.id)
    if (!waiting) return
    pending.delete(message.id)
    if (message.error) waiting.reject(new Error(message.error.message))
    else waiting.resolve(message.result ?? {})
  })

  return {
    send(method, params = {}, sessionId) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        // A command that never answers would hang the whole run. Ten seconds
        // is far past any of these; the failure is reported and the run goes on.
        setTimeout(() => {
          if (!pending.has(id)) return
          pending.delete(id)
          reject(new Error(`${method} timed out`))
        }, 10_000)
      })
    },
    close() { socket.close() },
  }
}

/** Poll a boolean expression in the page until it holds, or give up. */
async function waitFor(cdp: Cdp, session: string, expression: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, session)
      .catch(() => null) as { result?: { value?: unknown } } | null
    if (result?.result?.value === true) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function main(): Promise<void> {
  const flag = process.argv.indexOf('--url')
  const base = (flag === -1 ? undefined : process.argv[flag + 1])?.replace(/\/+$/, '')
    || 'http://127.0.0.1:3000'

  const alive = await fetch(base).then((r) => r.ok).catch(() => false)
  if (!alive) {
    console.log(`\n  ${base} is not answering. Start the dev server first:\n\n    npm run dev\n`)
    process.exitCode = 1
    return
  }

  const email = process.env.DEV_LOGIN_EMAIL
  if (!email) {
    console.log('\n  DEV_LOGIN_EMAIL is not set, so there is no account to sign in as.')
    console.log('  Run `npm run db:user -- you@example.com` and put it in .env.local.\n')
    process.exitCode = 1
    return
  }

  await mkdir(OUT, { recursive: true })
  // A fresh profile every run. A stale one carries a session for an account
  // that may since have been reseeded, which produces screenshots of somebody
  // else's progress without saying so.
  await rm(PROFILE, { recursive: true, force: true })

  console.log(`\nScreenshots — from ${base}, signed in as ${email}\n`)

  let chrome: ChildProcess | null = null
  let cdp: Cdp | null = null
  let failures = 0
  let warnedAboutWebp = false

  try {
    chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--force-device-scale-factor=2',
      // The avatars are WebGL and the whole point of the roster shot.
      '--enable-unsafe-swiftshader',
      'about:blank',
    ], { stdio: 'ignore' })

    // Chrome writes the port file before it accepts sockets; poll the endpoint.
    let wsUrl = ''
    for (let attempt = 0; attempt < 40 && !wsUrl; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      wsUrl = await fetch(`http://127.0.0.1:${PORT}/json/version`)
        .then((r) => r.json())
        .then((v: { webSocketDebuggerUrl?: string }) => v.webSocketDebuggerUrl ?? '')
        .catch(() => '')
    }
    if (!wsUrl) throw new Error('Chrome did not open a DevTools endpoint')

    cdp = await connect(wsUrl)
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string }
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)

    /* ---- Sign in through the real door. ---------------------------------- *
     * The dev button posts to `devSignIn`, which is gated on NODE_ENV and on
     * the two env vars — so this cannot work against production even by
     * accident, which is the point of using it rather than minting a cookie.  */
    await cdp.send('Page.navigate', { url: `${base}/login` }, sessionId)
    const doorReady = await waitFor(cdp, sessionId, `!!document.querySelector('.auth-dev button')`)
    if (!doorReady) throw new Error('No dev sign-in button on /login — is NEXT_PUBLIC_DEV_TOOLS on and DEV_LOGIN_EMAIL set?')
    // The button exists in the server HTML long before React is listening, and
    // a click landing on an unhydrated form does nothing at all — which is
    // exactly what "signed in but still on /login" looked like the first time
    // this ran. Wait for the handler, not for the markup.
    await waitFor(cdp, sessionId, `!!document.querySelector('.auth-dev form')?.onsubmit
      || !!Object.keys(document.querySelector('.auth-dev button') ?? {}).some((k) => k.startsWith('__react'))`, 20_000)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.auth-dev button').click()` }, sessionId)

    let signedIn = await waitFor(cdp, sessionId, `!location.pathname.startsWith('/login')`, 25_000)

    /**
     * One retry, because the first attempt can fail for a reason that has
     * nothing to do with the credentials.
     *
     * In development the server recompiles between the page load and the
     * click, and the Server Action id baked into the delivered HTML stops
     * existing — Next answers the POST with "Failed to find Server Action"
     * and a 404, and the form silently stays put. A fresh load has a fresh
     * id. It is not worth handling more cleverly than reloading once.
     */
    if (!signedIn) {
      await cdp.send('Page.navigate', { url: `${base}/login` }, sessionId)
      await waitFor(cdp, sessionId, `!!document.querySelector('.auth-dev button')`)
      await new Promise((resolve) => setTimeout(resolve, 1800))
      await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.auth-dev button')?.click()` }, sessionId)
      signedIn = await waitFor(cdp, sessionId, `!location.pathname.startsWith('/login')`, 25_000)
    }

    if (!signedIn) {
      const said = await cdp.send('Runtime.evaluate', {
        expression: `(document.querySelector('.auth-dev .auth-fine') || document.querySelector('.form-error'))?.textContent ?? ''`,
        returnByValue: true,
      }, sessionId) as { result?: { value?: string } }
      const message = said.result?.value?.trim()
      throw new Error(message ? `Sign-in refused — ${message}` : 'Sign-in did not move off /login')
    }
    /**
     * The once-ever teaching overlays, marked as already seen.
     *
     * The scorecard explainer, the first-win and first-rejection sheets and the
     * microphone primer each fire once per browser off `localStorage` — and every run here uses
     * a fresh profile, so every run is somebody's first time and the scorecard
     * capture came back as a modal over a blurred page. These are onboarding
     * moments rather than parts of the screen being documented, so they are
     * stamped seen rather than dismissed after the fact.
     *
     * The keys are the ones the components actually read; if one is renamed
     * this silently stops working, which is why the capture is looked at
     * rather than trusted.
     */
    await cdp.send('Runtime.evaluate', {
      expression: `try {
        localStorage.setItem('nerve.scorecard.explained', '1')
        localStorage.setItem('nerve:first-win-seen', '1')
        localStorage.setItem('nerve:first-loss-seen', '1')
        localStorage.setItem('nerve.mic.primed', '1')
      } catch {}`,
    }, sessionId)

    console.log('  signed in\n')

    for (const shot of SHOTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: 2,
        mobile: shot.width < 700,
      }, sessionId)

      if (shot.reach) {
        await cdp.send('Page.navigate', { url: `${base}${shot.reach.from}` }, sessionId)
        const linkReady = await waitFor(cdp, sessionId, `!!document.querySelector(${JSON.stringify(shot.reach.click)})`)
        if (!linkReady) {
          console.log(`  FAIL  ${shot.name} — nothing matching ${shot.reach.click} on ${shot.reach.from}`)
          failures += 1
          continue
        }
        // Past hydration, or the click lands on markup with no router behind it.
        await new Promise((resolve) => setTimeout(resolve, 900))
        await cdp.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(shot.reach.click)}).click()` }, sessionId)
      } else {
        await cdp.send('Page.navigate', { url: `${base}${shot.path}` }, sessionId)
      }
      const ready = await waitFor(cdp, sessionId, `!!document.querySelector(${JSON.stringify(shot.ready)})`)
      if (!ready) {
        console.log(`  FAIL  ${shot.name} — ${shot.ready} never appeared on ${shot.path}`)
        failures += 1
        continue
      }
      // Past the skeleton, and past the staged reveal on anything that has one.
      await new Promise((resolve) => setTimeout(resolve, shot.settle ?? 500))

      const capture = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        optimizeForSpeed: false,
      }, sessionId) as { data: string }

      const png = join(OUT, `${shot.name}.png`)
      await writeFile(png, Buffer.from(capture.data, 'base64'))

      /**
       * WebP is what gets committed, and it is not a nicety.
       *
       * These are captured at 2x so they stay crisp on a retina display, which
       * puts the PNG set at about 4 MB — for eight images that exist to make a
       * marketing page load fast. `cwebp` at q82 takes that under 400 KB with
       * no visible loss on flat UI, and `next/image` serves it directly.
       *
       * If `cwebp` is not installed the PNG stands and the run says so rather
       * than failing: a missing encoder should not stop somebody refreshing
       * the screenshots, but it must not silently leave the pages pointing at
       * a file that is not there either.
       */
      const converted = await run('cwebp', ['-quiet', '-q', '82', png, '-o', join(OUT, `${shot.name}.webp`)])
      if (converted.code === 0) await rm(png, { force: true })
      else if (!warnedAboutWebp) {
        warnedAboutWebp = true
        console.log('  note  cwebp is not installed — leaving PNGs. `brew install webp`, then re-run.')
      }

      console.log(`  ok    ${shot.name.padEnd(16)} ${shot.width}×${shot.height}  →  ${OUT}/${shot.name}.${converted.code === 0 ? 'webp' : 'png'}`)
    }
  } catch (error) {
    console.log(`\n  FAILED — ${error instanceof Error ? error.message : String(error)}`)
    failures += 1
  } finally {
    cdp?.close()
    chrome?.kill()
  }

  console.log(failures === 0
    ? `\n  ${SHOTS.length} captured into ${OUT}/\n`
    : `\n  ${failures} failed.\n`)
  if (failures > 0) process.exitCode = 1
}

void main()
