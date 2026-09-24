/**
 * One whole rep in a real browser, with a recorded voice for a microphone.
 *
 *   npm run dev                                   # in another terminal
 *   npm run rep:browser -- tess path/to/mic.wav   # a dating rep, ~3 minutes
 *   npm run rep:browser -- tess mic.wav --temp-account
 *
 * `--temp-account` signs in as a throwaway account instead of the dev one:
 * created with the service role, given an age date, a finished onboarding and
 * three Pro reps a day (entitlements are service-role writes, rule 11), and
 * deleted afterwards with everything it wrote — the way the `db:*` scripts
 * clean up. Use it when the dev account's password has drifted: fixing that
 * with `db:user` resets a real person's login, which this never does.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * `rep:audition` drives the server half of a rep with no browser at all, and
 * the suite drives the browser half with no server. Neither ever ran the two
 * together, and the parts `PERSONA-REALISM-REPORT` added live exactly in the
 * seam: Smart Turn is ONNX Runtime in a Web Worker, reading the microphone
 * through the VAD (L4); the particle bank is fetched at connect and spliced
 * ahead of her reply (R4); the first turn is prewarmed and every turn is
 * reserved a turn ahead on a signed ticket (L1, L2). A green suite said
 * nothing about whether any of it survives a real page — the lesson of
 * `INTERVIEW-TECHNICAL-PLAN` §13.3, which this is the instrument for.
 *
 * It drives the system Chrome over the DevTools protocol, the way
 * `scripts/shots.ts` does, and signs in through the same dev door (so it
 * cannot run against production). Chrome's own fake-device flags turn the WAV
 * into the microphone: the file loops for as long as the rep runs, so write it
 * as his lines with long silences between them (six seconds of silence first,
 * for the countdown). `say -o` and `afconvert -d LEI16@48000` make one.
 *
 * **IT SPENDS MONEY**, like any rep: one owned rep on the dev account, graded.
 *
 * What it prints: every paid voice route the page called and what it
 * answered, whether the Smart Turn model and ONNX Runtime were fetched,
 * whether particles loaded, the page's own console errors, and the transcript
 * and pipeline telemetry of the session row it produced.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnvLocal } from './env'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9334
const PROFILE = '/tmp/nerve-rep-browser-profile'
/** Three minutes, the countdown, the wind-down and the scorecard, with room. */
const REP_TIMEOUT_MS = 6 * 60_000

let nextId = 1

type Listener = (message: { method: string; params: Record<string, unknown>; sessionId?: string }) => void

interface Cdp {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<Record<string, unknown>>
  on: (listener: Listener) => void
  close: () => void
}

async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url)
  const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>()
  const listeners: Listener[] = []
  await new Promise<void>((done, fail) => {
    socket.addEventListener('open', () => done(), { once: true })
    socket.addEventListener('error', () => fail(new Error('Could not open a DevTools socket')), { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number; result?: Record<string, unknown>; error?: { message: string }
      method?: string; params?: Record<string, unknown>; sessionId?: string
    }
    if (typeof message.id !== 'number') {
      if (message.method) for (const listener of listeners) listener({ method: message.method, params: message.params ?? {}, ...(message.sessionId ? { sessionId: message.sessionId } : {}) })
      return
    }
    const waiting = pending.get(message.id)
    if (!waiting) return
    pending.delete(message.id)
    if (message.error) waiting.reject(new Error(message.error.message))
    else waiting.resolve(message.result ?? {})
  })
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++
      return new Promise((done, fail) => {
        pending.set(id, { resolve: done, reject: fail })
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        setTimeout(() => {
          if (!pending.has(id)) return
          pending.delete(id)
          fail(new Error(`${method} timed out`))
        }, 15_000)
      })
    },
    on(listener) { listeners.push(listener) },
    close() { socket.close() },
  }
}

async function evaluate<T>(cdp: Cdp, session: string, expression: string): Promise<T | null> {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session)
    .catch(() => null) as { result?: { value?: T } } | null
  return result?.result?.value ?? null
}

async function waitFor(cdp: Cdp, session: string, expression: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate<boolean>(cdp, session, expression) === true) return true
    await new Promise((done) => setTimeout(done, 250))
  }
  return false
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function main(): Promise<void> {
  await loadEnvLocal()
  const [slug = 'tess', wav] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  const flag = process.argv.indexOf('--url')
  const base = (flag === -1 ? undefined : process.argv[flag + 1])?.replace(/\/+$/, '') || 'http://localhost:3000'
  if (!wav) {
    console.log('\n  Usage: npm run rep:browser -- <slug> <mic.wav> [--url http://localhost:3000]\n')
    process.exitCode = 1
    return
  }
  const alive = await fetch(base).then((r) => r.status < 500).catch(() => false)
  if (!alive) {
    console.log(`\n  ${base} is not answering. Start the dev server first:\n\n    npm run dev\n`)
    process.exitCode = 1
    return
  }
  const temporary = process.argv.includes('--temp-account')
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SECRET_KEY']
  if (!url || !key) {
    console.log('\n  Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.\n')
    process.exitCode = 1
    return
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = temporary ? `rep-browser-${Date.now()}@nerve.test` : process.env['DEV_LOGIN_EMAIL']
  const password = temporary ? `rb-${crypto.randomUUID()}` : null
  if (!email) {
    console.log('\n  DEV_LOGIN_EMAIL is not set, so there is no account to sign in as. Pass --temp-account.\n')
    process.exitCode = 1
    return
  }
  let tempUserId: string | null = null
  if (temporary && password) {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw new Error(`could not create the temporary account: ${error?.message}`)
    tempUserId = data.user.id
    const now = new Date().toISOString()
    const profile = await db.from('profiles').update({
      onboarding_complete: true, age_confirmed_at: now, active_track: 'dating', display_name: 'Sam',
    }).eq('id', tempUserId)
    const plan = await db.from('entitlements').update({ plan: 'pro', reps_per_day: 3 }).eq('user_id', tempUserId)
    if (profile.error || plan.error) throw new Error(`could not prepare the temporary account: ${(profile.error ?? plan.error)?.message}`)
  }

  await rm(PROFILE, { recursive: true, force: true })
  console.log(`\nA rep against ${slug} in Chrome, from ${base}, signed in as ${temporary ? 'a temporary account' : 'the dev account'}\n`)

  let chrome: ChildProcess | null = null
  let cdp: Cdp | null = null
  const startedAt = new Date().toISOString()
  const requests = new Map<string, { url: string; method: string; at: number }>()
  const voice: string[] = []
  const assets = { model: false, ort: false, particles: 0, worker: false }
  const consoleLines: string[] = []

  try {
    chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      // On macOS the audio service runs sandboxed and cannot open the file:
      // without this the "microphone" is exact digital silence, the rep hears
      // nothing, and the page correctly says so and refunds it.
      '--disable-features=AudioServiceSandbox',
      `--use-file-for-fake-audio-capture=${resolve(wav)}`,
      'about:blank',
    ], { stdio: 'ignore' })

    let wsUrl = ''
    for (let attempt = 0; attempt < 40 && !wsUrl; attempt += 1) {
      await sleep(250)
      wsUrl = await fetch(`http://127.0.0.1:${PORT}/json/version`)
        .then((r) => r.json())
        .then((v: { webSocketDebuggerUrl?: string }) => v.webSocketDebuggerUrl ?? '')
        .catch(() => '')
    }
    if (!wsUrl) throw new Error('Chrome did not open a DevTools endpoint')

    cdp = await connect(wsUrl)
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string }
    // Workers are separate targets; attach to them too so the model fetch is seen.
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId)
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Browser.grantPermissions', { permissions: ['audioCapture'], origin: new URL(base).origin }).catch(() => undefined)

    const t0 = Date.now()
    cdp.on(({ method, params, sessionId: from }) => {
      if (method === 'Target.attachedToTarget') {
        const info = params['targetInfo'] as { type?: string; url?: string } | undefined
        const child = params['sessionId'] as string | undefined
        if (info?.type === 'worker') assets.worker = true
        if (child) {
          void cdp?.send('Network.enable', {}, child).catch(() => undefined)
          void cdp?.send('Runtime.enable', {}, child).catch(() => undefined)
          void cdp?.send('Runtime.runIfWaitingForDebugger', {}, child).catch(() => undefined)
        }
        return
      }
      if (method === 'Network.requestWillBeSent') {
        const request = params['request'] as { url: string; method: string }
        const id = `${from ?? ''}:${params['requestId'] as string}`
        requests.set(id, { url: request.url, method: request.method, at: Date.now() - t0 })
        if (request.url.includes('smart-turn-v3.2')) assets.model = true
        if (/ort-wasm.*\.wasm/.test(request.url)) assets.ort = true
        return
      }
      if (method === 'Network.responseReceived') {
        const id = `${from ?? ''}:${params['requestId'] as string}`
        const request = requests.get(id)
        const response = params['response'] as { status: number; url: string }
        if (response.url.includes('/particles/') && response.url.endsWith('.pcm') && response.status === 200) assets.particles += 1
        if (request && /\/api\/(voice|grade|warmth|safety)\//.test(request.url)) {
          voice.push(`${String((request.at / 1000).toFixed(1)).padStart(6)}s  ${response.status}  ${request.method} ${new URL(request.url).pathname}`)
        }
        return
      }
      if (method === 'Runtime.consoleAPICalled') {
        const type = params['type'] as string
        if (type !== 'error' && type !== 'warning') return
        const args = (params['args'] as { value?: unknown; description?: string }[]) ?? []
        consoleLines.push(`${type}: ${args.map((arg) => String(arg.value ?? arg.description ?? '')).join(' ').slice(0, 300)}`)
        return
      }
      if (method === 'Runtime.exceptionThrown') {
        const detail = params['exceptionDetails'] as { text?: string; exception?: { description?: string } }
        consoleLines.push(`exception: ${(detail.exception?.description ?? detail.text ?? '').slice(0, 300)}`)
      }
    })

    /* ---- Sign in: the dev door as `shots.ts` does, or the real form. ---- */
    let signedIn = false
    for (let attempt = 0; attempt < 2 && !signedIn; attempt += 1) {
      await cdp.send('Page.navigate', { url: `${base}/login` }, sessionId)
      const button = password ? `.auth-form button[type="submit"]` : `.auth-dev button`
      await waitFor(cdp, sessionId, `!!document.querySelector('${button}')`, 30_000)
      await waitFor(cdp, sessionId, `!!Object.keys(document.querySelector('${button}') ?? {}).some((k) => k.startsWith('__react'))`, 30_000)
      await sleep(1500)
      if (password) {
        await evaluate(cdp, sessionId, `(() => {
          document.querySelector('.auth-form input[name="email"]').value = ${JSON.stringify(email)}
          document.querySelector('.auth-form input[name="password"]').value = ${JSON.stringify(password)}
          return true
        })()`)
      }
      await evaluate(cdp, sessionId, `document.querySelector('${button}')?.click()`)
      signedIn = await waitFor(cdp, sessionId, `!location.pathname.startsWith('/login')`, 30_000)
    }
    if (!signedIn) {
      const said = await evaluate<string>(cdp, sessionId, `(document.querySelector('.auth-dev .auth-fine') || document.querySelector('.form-error'))?.textContent ?? ''`)
      throw new Error(said?.trim() ? `Sign-in refused — ${said.trim()}` : 'Sign-in did not move off /login')
    }
    await evaluate(cdp, sessionId, `(() => { try {
      localStorage.setItem('nerve.scorecard.explained', '1')
      localStorage.setItem('nerve:first-win-seen', '1')
      localStorage.setItem('nerve:first-loss-seen', '1')
      localStorage.setItem('nerve.mic.primed', '1')
    } catch {} return true })()`)
    console.log('  signed in')

    /* ---- The brief, then Start. ---- */
    await cdp.send('Page.navigate', { url: `${base}/rep/${slug}/brief` }, sessionId)
    const briefReady = await waitFor(cdp, sessionId,
      `[...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Start' && !b.disabled)
        && Object.keys([...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start') ?? {}).some((k) => k.startsWith('__react'))`, 60_000)
    if (!briefReady) {
      const where = await evaluate<string>(cdp, sessionId, 'location.pathname + " · " + document.body.innerText.slice(0, 300)')
      throw new Error(`No Start button on the brief (${where})`)
    }
    await sleep(800)
    await evaluate(cdp, sessionId, `[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start')?.click()`)
    const live = await waitFor(cdp, sessionId, `location.pathname.endsWith('/live')`, 30_000)
    if (!live) throw new Error('Start did not reach the live screen')
    console.log('  live screen open; the rep runs about three minutes\n')

    /* ---- Wait the rep out, reporting the screen every twenty seconds. ---- */
    const deadline = Date.now() + REP_TIMEOUT_MS
    let lastReport = 0
    while (Date.now() < deadline) {
      const path = await evaluate<string>(cdp, sessionId, 'location.pathname')
      if (path && !path.endsWith('/live')) break
      if (Date.now() - lastReport > 20_000) {
        lastReport = Date.now()
        const text = await evaluate<string>(cdp, sessionId, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 160)`)
        console.log(`  ${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  ${text ?? ''}`)
      }
      await sleep(1000)
    }
    const landed = await evaluate<string>(cdp, sessionId, 'location.pathname')
    console.log(`\n  left the live screen for ${landed}`)
    await sleep(8000)
    const card = await evaluate<string>(cdp, sessionId, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600)`)
    console.log(`  ${card ?? ''}\n`)
  } catch (error) {
    if (tempUserId) await db.auth.admin.deleteUser(tempUserId).catch(() => undefined)
    throw error
  } finally {
    cdp?.close()
    chrome?.kill('SIGTERM')
  }

  console.log('Paid routes the page called:')
  for (const line of voice) console.log(`  ${line}`)
  console.log(`\nSmart Turn: worker ${assets.worker ? 'started' : 'NOT started'}, model ${assets.model ? 'fetched' : 'NOT fetched'}, ONNX Runtime wasm ${assets.ort ? 'fetched' : 'NOT fetched'}`)
  console.log(`Particles fetched: ${assets.particles}`)
  console.log(`Console errors and warnings: ${consoleLines.length}`)
  for (const line of consoleLines.slice(0, 25)) console.log(`  ${line}`)

  /* ---- What the rep wrote down. ---- */
  try {
    await readBack(db, slug, startedAt)
  } finally {
    if (tempUserId) {
      const { error } = await db.auth.admin.deleteUser(tempUserId)
      console.log(error ? `\nCould not delete the temporary account: ${error.message}` : '\nTemporary account deleted, with everything it wrote.')
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readBack(db: SupabaseClient<any, any, any>, slug: string, startedAt: string): Promise<void> {
  // The rep this run started: this character, since this run began. The dev
  // account is the only thing driving reps on a local server.
  const { data: rows, error } = await db.from('sessions')
    .select('id, started_at, pipeline_telemetry, peak_warmth, won')
    .eq('persona_slug', slug).gte('started_at', startedAt)
    .order('started_at', { ascending: false }).limit(1)
  if (error || !rows?.[0]) {
    console.log(`\nNo session row found since ${startedAt}${error ? ` (${error.message})` : ''}.`)
    return
  }
  const row = rows[0] as { id: string; pipeline_telemetry: Record<string, unknown> | null; peak_warmth: number | null; won: boolean | null }
  const { data: transcript } = await db.from('transcripts').select('turns').eq('session_id', row.id).maybeSingle()
  const turns = ((transcript as { turns?: unknown } | null)?.turns ?? []) as { speaker: string; text: string; t_start: number }[]
  console.log(`\nSession ${row.id} · peak warmth ${row.peak_warmth ?? '—'} · ${row.won ? 'she gave her number' : 'no number'}`)
  for (const turn of turns) console.log(`  ${turn.t_start.toFixed(1).padStart(6)}s ${turn.speaker === 'user' ? 'HIM' : 'HER'}  ${turn.text}`)
  const pipeline = row.pipeline_telemetry
  const stages = (pipeline as { stages?: Record<string, { median: number; p90: number; count: number }> } | null)?.stages
  if (stages) {
    console.log('\nPipeline stages (median / p90 / n):')
    for (const [name, stat] of Object.entries(stages)) console.log(`  ${name.padEnd(18)} ${Math.round(stat.median)} / ${Math.round(stat.p90)} / ${stat.count}`)
  }
  const eot = (pipeline as { endOfTurn?: Record<string, unknown> } | null)?.endOfTurn
  console.log(eot ? `\nSmart Turn in this rep: ${JSON.stringify(eot)}` : '\nSmart Turn in this rep: not asked')
  // The voice ledger hangs off `voice_sessions`, which points at the rep row.
  const { data: voiceSession } = await db.from('voice_sessions').select('id, spent_usd').eq('session_id', row.id).maybeSingle()
  const voiceId = (voiceSession as { id?: string } | null)?.id
  if (!voiceId) {
    console.log('No voice session row is linked to this rep.')
    return
  }
  const { data: operations } = await db.from('voice_operations').select('operation_id, kind, state, metadata').eq('session_id', voiceId).order('created_at')
  const ops = (operations ?? []) as { operation_id: string; kind: string; state: string; metadata: Record<string, unknown> | null }[]
  const count = (test: (op: typeof ops[number]) => boolean) => ops.filter(test).length
  const kinds = new Map<string, number>()
  for (const op of ops) kinds.set(`${op.kind}/${op.state}`, (kinds.get(`${op.kind}/${op.state}`) ?? 0) + 1)
  console.log(`\nVoice operations: ${[...kinds].map(([kind, n]) => `${kind} ${n}`).join(', ')}`)
  console.log(`  turns claimed on a ticket (L2): ${count((op) => op.kind === 'turn' && op.metadata?.['ticketed'] === true)}`)
  console.log(`  prewarm (L1): ${count((op) => op.operation_id.startsWith('prewarm'))}`)
  console.log(`  a particle led the reply (R4): ${count((op) => typeof op.metadata?.['particle'] === 'string')}`)
  console.log(`  a laugh was allowed / judged funny (R3): ${count((op) => op.metadata?.['laughAllowed'] === true)} / ${count((op) => op.metadata?.['funny'] === true)}`)
  console.log(`  a dead end got a micro-reply (R7): ${count((op) => op.metadata?.['microReply'] === true)}`)
  console.log(`  spent: $${Number((voiceSession as { spent_usd?: number }).spent_usd ?? 0).toFixed(4)}`)
}

main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
