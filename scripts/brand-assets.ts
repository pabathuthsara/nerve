/**
 * The store's images, rendered from the design system and uploaded to Whop.
 *
 *   npm run brand:assets              # renders into public/brand, uploads nothing
 *   npm run brand:assets -- --apply   # uploads and attaches them to the account
 *
 * **Why a script and not a design file.** Same argument `shots.ts` makes about
 * screenshots and `legal-pdf.ts` makes about the policy PDFs: an image drawn by
 * hand in another tool drifts from the system the first time a token changes,
 * and then the storefront is advertising a palette the product does not use.
 * Everything here is composed from the Arena tokens in CLAUDE.md and from
 * `app/icon.svg`, which is the mark the product already ships.
 *
 * **There is no new brand here, deliberately.** The logo is the icon the app
 * serves as its favicon — the volt N on Ground, 2px corner — scaled up. A
 * storefront with its own separate identity is the same failure as a hand-drawn
 * screenshot: two things claiming to be the same product while looking
 * different.
 *
 * **No photographs, no illustration, no stock.** `docs/VISUAL-AUDIT.md` §1 is
 * explicit that the obvious answer to a text-heavy surface — pictures of
 * people — is the one thing this product must never ship, and a storefront is
 * not an exception to that. What is left is what Arena says is the hero: the
 * data. The banner is a warmth meter at the arming threshold, which is the
 * single most recognisable thing in the product.
 *
 * It drives system Chrome over the DevTools protocol rather than adding a
 * headless browser, exactly as `shots.ts` does.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadEnvLocal } from './env'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'public/brand'
const PORT = 9334
const PROFILE = '/tmp/nerve-brand-profile'

/** Arena, from CLAUDE.md. Named here so the CSS below reads as the system. */
const GROUND = '#0B0C0A'
const SURFACE = '#131511'
const LINE = '#242820'
const VOLT = '#C4F82A'
const INK = '#EDEFE8'
const INK2 = '#9DA396'
const INK3 = '#6A7062'

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap'
const FONT_CACHE = 'public/brand/.fonts.css'

/**
 * The typefaces, inlined as data URIs rather than linked.
 *
 * A `<link>` to Google Fonts renders correctly on a machine with a warm DNS
 * cache and silently falls back to Helvetica on one without — and the failure
 * is invisible, because `document.fonts.check()` answers true for a family the
 * browser resolved to a fallback. The first render of this banner went out in
 * the wrong face and reported success.
 *
 * So the bytes are fetched once, embedded, and cached next to the output. The
 * render is then deterministic and works offline, which is the same property
 * `legal:pdf` needs for the same reason: an asset that is wrong only sometimes
 * is worse than one that is wrong always.
 */
async function fonts(): Promise<string> {
  const cached = await readFile(FONT_CACHE, 'utf8').catch(() => '')
  if (cached.includes('data:font/woff2')) return cached

  // The UA decides the format Google serves. A modern one gets woff2.
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
  const css = await fetch(FONTS_URL, { headers: { 'user-agent': ua } }).then((r) => r.text())
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)].map((m) => m[1]!))]
  if (!urls.length) throw new Error('no woff2 urls in the Google Fonts stylesheet')

  let inlined = css
  for (const url of urls) {
    const res = await fetch(url)
    const ab: ArrayBuffer = await res.arrayBuffer()
    const bytes = Buffer.from(new Uint8Array(ab))
    inlined = inlined.replaceAll(url, `data:font/woff2;base64,${bytes.toString('base64')}`)
  }
  await writeFile(FONT_CACHE, inlined)
  return inlined
}

/**
 * The mark, lifted from `app/icon.svg` rather than redrawn.
 *
 * Redrawing it would be a second source of truth for the one glyph a user is
 * meant to recognise fastest.
 */
const GLYPH = 'M8 8h5l6 10V8h5v16h-5l-6-10v10H8z'

/**
 * The mark, cropped to the glyph.
 *
 * `app/icon.svg` draws the N inside 8..24 of a 32 viewBox, because a favicon
 * needs the tile around it. Reusing that viewBox at 1024px renders a 330px
 * letter floating in a square, which reads as a mistake rather than as
 * restraint — so the box is cropped to the glyph and the padding is decided
 * here, by the surface it is going on.
 */
const MARK = (size: number, pad = 1.5) => `
<svg width="${size}" height="${size}" viewBox="${8 - pad} ${8 - pad} ${16 + pad * 2} ${16 + pad * 2}" xmlns="http://www.w3.org/2000/svg">
  <path d="${GLYPH}" fill="${VOLT}"/>
</svg>`

const shell = (body: string, fontCss: string, css = '') => `<!doctype html><html><head>
<style>
  ${fontCss}
</style>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:${GROUND};}
  .display{font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:-.02em;line-height:.92}
  .body{font-family:'IBM Plex Sans',sans-serif}
  .mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
  ${css}
</style></head><body>${body}</body></html>`

interface Asset { name: string; width: number; height: number; html: string }

/**
 * The warmth meter, which is the product's signature reading.
 *
 * 65 is not a decorative number: it is `ARM_THRESHOLD`, the point at which a
 * rep arms silently (rule 3). Drawing the meter anywhere else would be drawing
 * a progress bar.
 */
const meter = (width: number) => `
<div style="width:${width}px">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px">
    <span class="mono" style="font-size:13px;letter-spacing:.14em;color:${INK3};text-transform:uppercase">Warmth</span>
    <span class="mono" style="font-size:34px;color:${VOLT};line-height:1">65</span>
  </div>
  <div style="height:10px;background:${SURFACE};border:1px solid ${LINE};position:relative">
    <div style="position:absolute;inset:0 35% 0 0;background:${VOLT}"></div>
    <div style="position:absolute;left:65%;top:-7px;bottom:-7px;width:1px;background:${INK3}"></div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:10px">
    <span class="mono" style="font-size:12px;color:${INK3}">0</span>
    <span class="mono" style="font-size:12px;color:${INK2}">ARMED</span>
    <span class="mono" style="font-size:12px;color:${INK3}">100</span>
  </div>
</div>`

const buildAssets = (f: string): Asset[] => [
  {
    // Square. Whop crops it to a circle in some places, so the mark is centred
    // with generous margin and nothing lives near a corner.
    name: 'logo',
    width: 1024,
    height: 1024,
    html: shell(
      `<div style="width:1024px;height:1024px;background:${GROUND};display:grid;place-items:center">
         ${MARK(620, 2)}
       </div>`, f,
    ),
  },
  {
    // Wide. Read at a glance and often at a third of this size, so it carries
    // one line of type and one piece of data — never a feature list.
    name: 'banner',
    width: 1600,
    height: 400,
    // The mark is NOT repeated here. Volt appears once per surface (CLAUDE.md),
    // and on a banner the meter is the thing worth spending it on — a wordmark
    // in Ink plus one volt reading beats two volt objects competing.
    html: shell(
      `<div style="width:1600px;height:400px;background:${GROUND};display:grid;
                   grid-template-columns:1fr 480px;gap:96px;align-items:center;padding:0 84px">
         <div>
           <div class="display" style="font-size:92px;color:${INK}">Nerve</div>
           <p class="body" style="color:${INK2};font-size:24px;margin-top:20px;line-height:1.45;text-wrap:balance">
             Three-minute voice reps against characters who can say no.
             Scored on how you handled it — never on whether it worked.
           </p>
         </div>
         ${meter(480)}
       </div>`, f,
    ),
  },
]

let nextId = 1
interface Cdp {
  send: (m: string, p?: Record<string, unknown>, s?: string) => Promise<Record<string, unknown>>
  close: () => void
}

async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url)
  const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>()
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('no DevTools socket')), { once: true })
  })
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } }
    if (typeof m.id !== 'number') return
    const w = pending.get(m.id)
    if (!w) return
    pending.delete(m.id)
    if (m.error) w.reject(new Error(m.error.message)); else w.resolve(m.result ?? {})
  })
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
        setTimeout(() => {
          if (!pending.has(id)) return
          pending.delete(id); reject(new Error(`${method} timed out`))
        }, 15_000)
      })
    },
    close() { socket.close() },
  }
}

async function main(): Promise<void> {
  await loadEnvLocal()
  const apply = process.argv.includes('--apply')
  await mkdir(OUT, { recursive: true })
  const fontCss = await fonts()
  const ASSETS = buildAssets(fontCss)

  console.log(`\nBrand assets — Arena tokens, the mark from app/icon.svg`)
  console.log(apply ? 'APPLYING. This uploads to the live Whop account.\n' : 'Render only. Nothing is uploaded. Add --apply to attach them.\n')

  let chrome: ChildProcess | null = null
  let cdp: Cdp | null = null
  const rendered: Record<string, string> = {}

  try {
    chrome = spawn(CHROME, [
      '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
      '--disable-gpu', '--hide-scrollbars', '--no-first-run', 'about:blank',
    ], { stdio: 'ignore' })

    let wsUrl = ''
    for (let i = 0; i < 60 && !wsUrl; i++) {
      await new Promise((r) => setTimeout(r, 250))
      const v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null) as { webSocketDebuggerUrl?: string } | null
      wsUrl = v?.webSocketDebuggerUrl ?? ''
    }
    if (!wsUrl) throw new Error('Chrome never opened a DevTools port')
    cdp = await connect(wsUrl)

    for (const asset of ASSETS) {
      const target = await cdp.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
      const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }) as { sessionId: string }
      const s = attached.sessionId
      await cdp.send('Page.enable', {}, s)
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: asset.width, height: asset.height, deviceScaleFactor: 1, mobile: false,
      }, s)
      await cdp.send('Page.setDocumentContent', {
        frameId: target.targetId,
        html: asset.html,
      }, s)
      // The faces are embedded, so this only has to wait for decode. It is
      // verified by MEASURING rather than by asking `document.fonts.check()`,
      // which answers true for a family the browser quietly resolved to a
      // fallback — that is how the first render shipped in the wrong face and
      // still reported success. Barlow Condensed is dramatically narrower than
      // any system sans, so a width comparison cannot be fooled.
      const probe = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
          // Request it explicitly. An asset with no type on it — the logo —
          // never triggers a font load on its own, and measuring then reports
          // a fallback for a face that is embedded and perfectly fine.
          await document.fonts.load("700 200px 'Barlow Condensed'")
          await document.fonts.ready
          const measure = (family) => {
            const el = document.createElement('span')
            el.textContent = 'NERVE'
            el.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-weight:700;font-size:200px;font-family:' + family
            document.body.appendChild(el)
            const w = el.getBoundingClientRect().width
            el.remove()
            return w
          }
          return { condensed: measure("'Barlow Condensed'"), fallback: measure('sans-serif') }
        })()`,
        awaitPromise: true, returnByValue: true,
      }, s).catch(() => null) as { result?: { value?: { condensed: number; fallback: number } } } | null
      const m = probe?.result?.value
      if (!m || m.condensed >= m.fallback * 0.9) {
        console.log(`  WARN  ${asset.name} — Barlow Condensed is NOT rendering (${m ? `${Math.round(m.condensed)}px vs ${Math.round(m.fallback)}px fallback` : 'no measurement'})`)
      }
      await new Promise((x) => setTimeout(x, 250))
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: asset.width, height: asset.height, scale: 1 },
        captureBeyondViewport: true,
      }, s) as { data: string }
      const file = `${OUT}/${asset.name}.png`
      await writeFile(file, Buffer.from(shot.data, 'base64'))
      rendered[asset.name] = file
      console.log(`  ok    ${asset.name.padEnd(10)} ${asset.width}×${asset.height}  →  ${file}`)
      await cdp.send('Target.closeTarget', { targetId: target.targetId })
    }
  } finally {
    cdp?.close()
    chrome?.kill()
  }

  // The OG image already exists and is the one the site itself serves. A second
  // one made here would be a second answer to "what does a shared link look
  // like", and they would diverge.
  rendered['og'] = 'public/og.png'
  console.log(`  ok    ${'og'.padEnd(10)} reused public/og.png — the site's own`)

  if (!apply) {
    console.log('\n  Would upload logo, banner and og, then set them on the account and product.')
    console.log('  Re-run with --apply.\n')
    return
  }

  // ── upload ────────────────────────────────────────────────────────────────
  const key = process.env['WHOP_API_KEY']
  const base = process.env['WHOP_API_BASE'] || 'https://api.whop.com/api/v1'
  const version = process.env['WHOP_API_VERSION_DATE']
  const accountId = process.env['WHOP_ACCOUNT_ID']
  if (!key || !accountId) { console.log('\n  WHOP_API_KEY or WHOP_ACCOUNT_ID missing.\n'); process.exitCode = 1; return }

  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        ...(version ? { 'api-version-date': version } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const t = await r.text()
    let d: Record<string, unknown> = {}
    try { d = t ? JSON.parse(t) as Record<string, unknown> : {} } catch { d = { raw: t.slice(0, 300) } }
    return { ok: r.ok, status: r.status, data: d }
  }

  console.log('\nuploading')
  const ids: Record<string, string> = {}
  for (const [name, path] of Object.entries(rendered)) {
    const bytes = await readFile(path)
    const created = await call('POST', '/files', {
      filename: `nerve-${name}.png`,
      visibility: 'public',
      byte_size: bytes.byteLength,
    })
    if (!created.ok) {
      console.log(`  FAIL  ${name} — create ${created.status} ${JSON.stringify(created.data).slice(0, 220)}`)
      continue
    }
    const id = created.data['id'] as string
    const uploadUrl = created.data['upload_url'] as string | undefined
    if (!uploadUrl) {
      console.log(`  FAIL  ${name} — no upload_url. shape: ${Object.keys(created.data).join(', ')}`)
      continue
    }
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array(bytes),
    })
    if (!put.ok) { console.log(`  FAIL  ${name} — PUT ${put.status}`); continue }
    ids[name] = id
    console.log(`  ok    ${name.padEnd(10)} ${(bytes.byteLength / 1024).toFixed(0)}KB  →  ${id}`)
  }

  // ── attach ────────────────────────────────────────────────────────────────
  console.log('\nattaching')
  const accountPatch: Record<string, unknown> = {}
  if (ids['logo']) accountPatch['logo'] = { id: ids['logo'] }
  if (ids['banner']) accountPatch['banner_image'] = { id: ids['banner'] }
  if (ids['og']) accountPatch['opengraph_image'] = { id: ids['og'] }
  accountPatch['use_logo_as_opengraph_image_fallback'] = true

  if (Object.keys(accountPatch).length > 1) {
    const r = await call('PATCH', `/accounts/${encodeURIComponent(accountId)}`, accountPatch)
    if (r.ok) console.log(`  ok    account — ${Object.keys(accountPatch).join(', ')}`)
    else console.log(`  FAIL  account ${r.status} ${JSON.stringify(r.data).slice(0, 260)}`)
  }

  if (ids['banner']) {
    const r = await call('PATCH', '/products/prod_DlhZq3oMd4QHd', { banner_image: { id: ids['banner'] } })
    if (r.ok) console.log('  ok    product banner')
    else console.log(`  FAIL  product banner ${r.status} ${JSON.stringify(r.data).slice(0, 260)}`)
  }

  console.log('\nDone. Re-read with npm run whop:setup to confirm.\n')
}

await main()
