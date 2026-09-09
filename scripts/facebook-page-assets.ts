/**
 * Facebook page identity assets for Nerve's two audience tracks.
 *
 * Renders locally from the product's existing mark, palette, and embedded
 * brand fonts. Nothing is uploaded and no image model is involved.
 *
 *   npm run social:facebook-assets
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'marketing/social/facebook-pages'
const FONT_CACHE = 'public/brand/.fonts.css'
const SOURCE_LOGO = 'public/brand/logo.png'
const PORT = 9337
const PROFILE = '/tmp/nerve-facebook-assets-profile'

const GROUND = '#0B0C0A'
const SURFACE = '#131511'
const SURFACE_2 = '#191C16'
const LINE = '#282D23'
const VOLT = '#C4F82A'
const COOL = '#5AA9FF'
const OXBLOOD = '#A8384F'
const INK = '#E8EAE4'
const INK_2 = '#9AA093'
const INK_3 = '#687063'

// Exact glyph geometry from app/icon.svg.
const GLYPH = 'M8 8h5l6 10V8h5v16h-5l-6-10v10H8z'

const mark = (size: number) => `
  <svg width="${size}" height="${size}" viewBox="5.5 5.5 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="${GLYPH}" fill="${VOLT}"/>
  </svg>`

const shell = (body: string, fontCss: string, css = '') => `<!doctype html>
<html><head><meta charset="utf-8"><style>${fontCss}</style><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:${GROUND};overflow:hidden}
  .display{font-family:'Barlow Condensed',sans-serif;font-weight:700;text-transform:uppercase;line-height:.9}
  .body{font-family:'IBM Plex Sans',sans-serif}
  .mono{font-family:'IBM Plex Mono',monospace;text-transform:uppercase;font-variant-numeric:tabular-nums}
  ${css}
</style></head><body>${body}</body></html>`

interface Asset {
  name: string
  width: number
  height: number
  html: string
}

const frame = (accent: string, label: string, headline: string, subline: string, visual: string) => `
  <main class="cover">
    <div class="wash" style="--accent:${accent}"></div>
    <div class="grid"></div>
    <section class="copy">
      <div class="eyebrow mono"><span class="pip" style="background:${accent}"></span>${label}</div>
      <h1 class="display">${headline}</h1>
      <p class="mono subline">${subline}</p>
    </section>
    <section class="visual">${visual}</section>
    <div class="url mono">HELLONERVE.COM</div>
    <div class="edge edge-top"></div><div class="edge edge-bottom"></div>
  </main>`

const socialVisual = `
  <div class="radar social-radar">
    <div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>
    <div class="sweep"></div>
    <div class="avatar a1"></div><div class="avatar a2"></div><div class="avatar a3"></div>
    <div class="radar-mark">${mark(116)}</div>
  </div>
  <div class="status mono"><span></span>LIVE PRACTICE</div>`

const interviewVisual = `
  <div class="score-card">
    <div class="score-top mono"><span>ROUND 01</span><span style="color:${COOL}">READY</span></div>
    <div class="question body">Tell me about yourself.</div>
    <div class="bars">
      <div><span class="mono">CLARITY</span><i style="width:82%"></i><b>82</b></div>
      <div><span class="mono">STRUCTURE</span><i style="width:74%"></i><b>74</b></div>
      <div><span class="mono">SPECIFICITY</span><i style="width:68%"></i><b>68</b></div>
    </div>
  </div>
  <div class="score-orbit"><span></span></div>`

const coverCss = `
  .cover{width:1640px;height:624px;position:relative;background:${GROUND};color:${INK};overflow:hidden}
  .wash{position:absolute;inset:0;background:radial-gradient(circle at 83% 45%,color-mix(in srgb,var(--accent) 22%,transparent) 0,transparent 34%)}
  .grid{position:absolute;inset:0;opacity:.35;background-image:linear-gradient(${LINE} 1px,transparent 1px),linear-gradient(90deg,${LINE} 1px,transparent 1px);background-size:52px 52px;mask-image:linear-gradient(90deg,transparent 2%,#000 32%,#000 100%)}
  .copy{position:absolute;left:286px;top:98px;width:760px;z-index:3}
  .eyebrow{display:flex;align-items:center;gap:13px;color:${INK_2};font-size:18px;letter-spacing:.14em}
  .pip{width:9px;height:9px;display:inline-block;border-radius:1px;box-shadow:0 0 18px currentColor}
  h1{font-size:94px;letter-spacing:-.025em;max-width:760px;margin-top:35px;text-wrap:balance}
  .subline{color:${INK_2};font-size:17px;letter-spacing:.105em;margin-top:37px;white-space:nowrap}
  .url{position:absolute;right:78px;bottom:41px;color:${INK_3};font-size:14px;letter-spacing:.16em;z-index:4}
  .edge{position:absolute;left:0;right:0;height:2px;background:${LINE}}
  .edge-top{top:0}.edge-bottom{bottom:0}
  .visual{position:absolute;right:92px;top:74px;width:440px;height:440px;z-index:2}
  .radar{width:440px;height:440px;position:relative;border:1px solid ${LINE};border-radius:50%;background:rgba(11,12,10,.76)}
  .ring{position:absolute;border:1px solid ${LINE};border-radius:50%;inset:48px}.r2{inset:102px}.r3{inset:156px}
  .radar:before,.radar:after{content:'';position:absolute;background:${LINE}}
  .radar:before{left:50%;top:0;bottom:0;width:1px}.radar:after{top:50%;left:0;right:0;height:1px}
  .sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from -28deg,transparent 0 72%,rgba(168,56,79,.32) 89%,transparent 89.5%);mask-image:radial-gradient(circle,#000 0 72%,transparent 73%)}
  .radar-mark{position:absolute;inset:0;display:grid;place-items:center;filter:drop-shadow(0 0 20px rgba(196,248,42,.12))}
  .avatar{position:absolute;width:13px;height:13px;border-radius:50%;background:${OXBLOOD};box-shadow:0 0 0 5px rgba(168,56,79,.16),0 0 24px rgba(168,56,79,.68)}
  .a1{left:86px;top:135px}.a2{right:91px;top:104px}.a3{right:78px;bottom:104px}
  .status{position:absolute;left:135px;bottom:-29px;display:flex;gap:10px;align-items:center;color:${INK_2};font-size:13px;letter-spacing:.14em;background:${SURFACE};border:1px solid ${LINE};padding:12px 17px}
  .status span{width:7px;height:7px;background:${OXBLOOD};border-radius:50%;box-shadow:0 0 12px ${OXBLOOD}}
  .score-card{position:absolute;left:12px;top:26px;width:410px;background:${SURFACE};border:1px solid ${LINE};padding:28px 30px 32px;box-shadow:18px 18px 0 rgba(90,169,255,.07)}
  .score-top{display:flex;justify-content:space-between;color:${INK_3};font-size:13px;letter-spacing:.13em;border-bottom:1px solid ${LINE};padding-bottom:19px}
  .question{font-size:25px;color:${INK};margin:29px 0 34px}
  .bars{display:grid;gap:22px}.bars div{display:grid;grid-template-columns:105px 1fr 30px;align-items:center;gap:14px;color:${INK_3}}
  .bars span{font-size:11px;letter-spacing:.09em}.bars i{height:7px;background:linear-gradient(90deg,${COOL},${VOLT});position:relative}.bars i:after{content:'';position:absolute;top:0;bottom:0;left:100%;right:-36px;background:${SURFACE_2};border-right:1px solid ${LINE}}
  .bars b{font-family:'IBM Plex Mono',monospace;font-size:13px;color:${INK_2};font-weight:400;text-align:right}
  .score-orbit{position:absolute;right:-45px;bottom:-13px;width:155px;height:155px;border:1px solid rgba(90,169,255,.38);border-radius:50%}.score-orbit:before{content:'';position:absolute;inset:24px;border:1px solid rgba(90,169,255,.2);border-radius:50%}.score-orbit span{position:absolute;width:9px;height:9px;border-radius:50%;background:${COOL};top:19px;left:18px;box-shadow:0 0 18px ${COOL}}
`

const buildAssets = (fontCss: string): Asset[] => [
  {
    name: 'nerve-social-confidence-cover-1640x624', width: 1640, height: 624,
    html: shell(frame(OXBLOOD, 'NERVE · SOCIAL CONFIDENCE', 'PRACTISE THE CONVERSATIONS YOU AVOID.', '3-MINUTE VOICE REPS · ONE STRANGER · NO SCRIPT', socialVisual), fontCss, coverCss),
  },
  {
    name: 'nerve-interview-practice-cover-1640x624', width: 1640, height: 624,
    html: shell(frame(COOL, 'NERVE · INTERVIEW PRACTICE', 'WALK IN READY.', 'YOUR CV · THE JOB · A GRADED PRACTICE ROUND', interviewVisual), fontCss, coverCss),
  },
]

let nextId = 1
interface Cdp {
  send: (method: string, params?: Record<string, unknown>, sessionId?: string) => Promise<Record<string, unknown>>
  close: () => void
}

async function connect(url: string): Promise<Cdp> {
  const socket = new WebSocket(url)
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>()
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('no DevTools socket')), { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } }
    if (typeof message.id !== 'number') return
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message))
    else waiter.resolve(message.result ?? {})
  })
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      })
    },
    close() { socket.close() },
  }
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true })
  const fontCss = await readFile(FONT_CACHE, 'utf8')
  if (!fontCss.includes('data:font/woff2')) throw new Error(`embedded font cache missing: ${FONT_CACHE}`)
  const assets = buildAssets(fontCss)

  // Keep the shipped 1024px logo byte-for-byte identical.
  const logo = await readFile(SOURCE_LOGO)
  await writeFile(`${OUT}/nerve-logo-1024.png`, logo)
  console.log(`ok    logo       1024×1024 → ${OUT}/nerve-logo-1024.png`)

  let chrome: ChildProcess | null = null
  let cdp: Cdp | null = null
  try {
    chrome = spawn(CHROME, [
      '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
      '--disable-gpu', '--hide-scrollbars', '--no-first-run', 'about:blank',
    ], { stdio: 'ignore' })

    let wsUrl = ''
    for (let i = 0; i < 60 && !wsUrl; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((response) => response.json()).catch(() => null) as { webSocketDebuggerUrl?: string } | null
      wsUrl = version?.webSocketDebuggerUrl ?? ''
    }
    if (!wsUrl) throw new Error('Chrome never opened a DevTools port')
    cdp = await connect(wsUrl)

    for (const asset of assets) {
      const target = await cdp.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
      const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }) as { sessionId: string }
      const session = attached.sessionId
      await cdp.send('Page.enable', {}, session)
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: asset.width, height: asset.height, deviceScaleFactor: 1, mobile: false }, session)
      await cdp.send('Page.setDocumentContent', { frameId: target.targetId, html: asset.html }, session)
      await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }, session)
      await new Promise((resolve) => setTimeout(resolve, 200))
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: asset.width, height: asset.height, scale: 1 },
        captureBeyondViewport: true,
      }, session) as { data: string }
      const file = `${OUT}/${asset.name}.png`
      await writeFile(file, Buffer.from(shot.data, 'base64'))
      console.log(`ok    cover      ${asset.width}×${asset.height} → ${file}`)
      await cdp.send('Target.closeTarget', { targetId: target.targetId })
    }
  } finally {
    cdp?.close()
    chrome?.kill()
  }
}

await main()
