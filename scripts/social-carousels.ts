/**
 * The first two Nerve social carousels.
 *
 * Renders deterministic, platform-ready PNGs from the actual design tokens and
 * product screenshots. Nothing is uploaded or posted.
 *
 *   npm run social:first-posts
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9335
const PROFILE = '/tmp/nerve-social-carousel-profile'
const OUT = 'marketing/social/first-posts'

const GROUND = '#0B0C0A'
const SURFACE = '#131511'
const SURFACE_2 = '#191C16'
const LINE = '#282D23'
const LINE_BRIGHT = '#394132'
const INK = '#E8EAE4'
const INK_2 = '#9AA093'
const INK_3 = '#687063'
const VOLT = '#C4F82A'
const COOL = '#5AA9FF'
const OXBLOOD = '#A8384F'

type Platform = 'instagram' | 'tiktok'
interface Size { width: number; height: number }
interface Slide { label: string; headline: string; body?: string; visual: string; footer?: string }

const SIZES: Record<Platform, Size> = {
  instagram: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
}

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
    socket.addEventListener('error', () => reject(new Error('Could not open DevTools socket')), { once: true })
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
        setTimeout(() => {
          if (!pending.has(id)) return
          pending.delete(id)
          reject(new Error(`${method} timed out`))
        }, 15_000)
      })
    },
    close() { socket.close() },
  }
}

async function dataUri(path: string): Promise<string> {
  const bytes = await readFile(path)
  const mime = extname(path) === '.webp' ? 'image/webp' : 'image/png'
  return `data:${mime};base64,${bytes.toString('base64')}`
}

async function shot(name: string): Promise<string> {
  for (const ext of ['webp', 'png']) {
    const path = `public/shots/${name}.${ext}`
    try { return await dataUri(path) } catch {}
  }
  throw new Error(`Missing product screenshot: public/shots/${name}.webp`)
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

const mark = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 8h5l6 10V8h5v16h-5l-6-10v10H8z" fill="currentColor"/></svg>`

function bars(values: Array<[string, number]>, accent = VOLT): string {
  return `<div class="bars">${values.map(([name, value]) => `<div class="bar-row">
    <span>${name}</span><i><b style="width:${value}%;background:${accent}"></b></i><strong>${value}</strong>
  </div>`).join('')}</div>`
}

function orb(color = OXBLOOD, size = 620): string {
  return `<div class="orb" style="--orb:${color};width:${size}px;height:${size}px">
    <span></span><span></span><span></span><span></span><span></span><i>N</i>
  </div>`
}

function screenshot(src: string, position = 'center', className = ''): string {
  return `<div class="screen ${className}"><div class="screen-top"><span></span><span></span><span></span><b>HELLONERVE.COM</b></div><img src="${src}" style="object-position:${position}"/></div>`
}

function slideHtml(slide: Slide, index: number, size: Size, platform: Platform, track: 'dating' | 'interviews'): string {
  const accent = track === 'dating' ? OXBLOOD : COOL
  const isTikTok = platform === 'tiktok'
  const body = slide.body ? `<p class="body-copy">${slide.body}</p>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    __FONT_CSS__
    :root{--ground:${GROUND};--surface:${SURFACE};--surface2:${SURFACE_2};--line:${LINE};--lineBright:${LINE_BRIGHT};--ink:${INK};--ink2:${INK_2};--ink3:${INK_3};--volt:${VOLT};--accent:${accent}}
    *{box-sizing:border-box}html,body{margin:0;background:var(--ground);width:${size.width}px;height:${size.height}px;overflow:hidden}
    body{font-family:'IBM Plex Sans',sans-serif;color:var(--ink)}
    .slide{position:relative;width:100%;height:100%;overflow:hidden;padding:${isTikTok ? '104px 78px 126px' : '74px 72px 82px'};display:flex;flex-direction:column;background:
      radial-gradient(circle at 89% 3%,color-mix(in srgb,var(--accent) 10%,transparent),transparent 32%),
      linear-gradient(135deg,rgba(255,255,255,.018),transparent 42%),var(--ground)}
    .slide:after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.16;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.88' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.07'/%3E%3C/svg%3E")}
    .top,.bottom{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:18px;letter-spacing:.12em;text-transform:uppercase}
    .brand{display:flex;align-items:center;gap:14px;color:var(--volt);font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:28px;letter-spacing:.09em}.brand svg{width:26px;height:26px}
    .kicker{color:var(--ink3)}.bottom{margin-top:auto;padding-top:22px;border-top:1px solid var(--line);color:var(--ink3);font-size:16px}.bottom strong{color:var(--volt);font-weight:500}
    .copy{position:relative;z-index:2;margin-top:${isTikTok ? '118px' : '70px'};max-width:950px}.copy:before{content:'';display:block;width:72px;height:4px;background:var(--volt);margin-bottom:28px}
    h1{margin:0;font-family:'Barlow Condensed',sans-serif;font-size:${isTikTok ? '112px' : '94px'};font-weight:700;line-height:.91;letter-spacing:.012em;text-transform:uppercase;text-wrap:balance}
    .body-copy{max-width:840px;margin:28px 0 0;color:var(--ink2);font-size:${isTikTok ? '31px' : '27px'};line-height:1.42;text-wrap:balance}
    .visual{position:relative;z-index:1;min-height:0;flex:1;display:flex;align-items:center;justify-content:center;margin:${isTikTok ? '70px 0 74px' : '48px 0 46px'};isolation:isolate}
    .screen{width:100%;height:${isTikTok ? '650px' : '500px'};overflow:hidden;border:1px solid var(--lineBright);background:var(--surface);box-shadow:0 28px 80px rgba(0,0,0,.42)}
    .screen-top{height:42px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;padding:0 14px;background:var(--surface2)}.screen-top span{width:7px;height:7px;border:1px solid var(--ink3);border-radius:50%}.screen-top b{margin-left:auto;color:var(--ink3);font:500 11px 'IBM Plex Mono';letter-spacing:.1em}.screen img{width:100%;height:calc(100% - 42px);display:block;object-fit:cover}
    .screen.tall{max-width:660px;height:${isTikTok ? '760px' : '540px'}}
    .orb{position:absolute;right:-160px;bottom:-100px;display:grid;place-items:center;filter:drop-shadow(0 40px 80px rgba(0,0,0,.5));transform:rotate(-10deg)}.orb span{position:absolute;border:44px solid color-mix(in srgb,var(--orb) 76%,#d9ced1);border-radius:43% 57% 59% 41%/48% 41% 59% 52%;inset:9%;box-shadow:inset 10px 8px 22px rgba(255,255,255,.08),inset -18px -14px 28px rgba(0,0,0,.3)}.orb span:nth-child(2){inset:19%;transform:rotate(31deg)}.orb span:nth-child(3){inset:30%;transform:rotate(64deg)}.orb span:nth-child(4){inset:40%;transform:rotate(96deg)}.orb span:nth-child(5){inset:47%;border-width:30px;transform:rotate(135deg)}.orb i{position:relative;z-index:2;font-style:normal;font:400 54px 'IBM Plex Sans';letter-spacing:.12em;color:var(--ink)}
    .statement{width:100%;border-left:4px solid var(--volt);padding:28px 30px;background:linear-gradient(90deg,var(--surface2),transparent);font:700 ${isTikTok ? '56px' : '48px'}/1.02 'Barlow Condensed';text-transform:uppercase}.statement small{display:block;margin-top:16px;color:var(--ink2);font:400 ${isTikTok ? '24px' : '21px'}/1.45 'IBM Plex Sans';text-transform:none}
    .timer{font:500 ${isTikTok ? '190px' : '156px'}/.9 'IBM Plex Mono';letter-spacing:-.08em;color:var(--ink)}.timer em{color:var(--volt);font-style:normal}.wave{display:flex;align-items:flex-end;gap:11px;height:180px;margin-top:34px}.wave i{width:14px;background:var(--accent);opacity:.75}.wave i:nth-child(3n){background:var(--volt)}
    .score-card{width:100%;padding:${isTikTok ? '46px' : '34px'};border:1px solid var(--lineBright);background:var(--surface)}.score-head{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:25px;border-bottom:1px solid var(--line)}.score-head span{font:500 18px 'IBM Plex Mono';letter-spacing:.1em;color:var(--ink3);text-transform:uppercase}.score-head strong{font:500 ${isTikTok ? '92px' : '76px'}/.9 'IBM Plex Mono';color:var(--volt)}
    .bars{width:100%;display:grid;gap:${isTikTok ? '22px' : '16px'};margin-top:28px}.bar-row{display:grid;grid-template-columns:205px 1fr 58px;align-items:center;gap:18px;font:500 ${isTikTok ? '18px' : '16px'} 'IBM Plex Mono';letter-spacing:.05em;text-transform:uppercase}.bar-row span{color:var(--ink2)}.bar-row i{height:8px;border:1px solid var(--lineBright);background:var(--ground)}.bar-row b{display:block;height:100%}.bar-row strong{text-align:right;color:var(--ink);font-weight:500}
    .dimensions,.rounds{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:12px}.dimensions div,.rounds div{min-height:${isTikTok ? '112px' : '82px'};display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid var(--line);padding:18px 22px;background:var(--surface);font:700 ${isTikTok ? '27px' : '23px'} 'Barlow Condensed';letter-spacing:.04em;text-transform:uppercase}.dimensions span,.rounds span{color:var(--ink3);font:500 15px 'IBM Plex Mono'}.dimensions b{width:9px;height:9px;background:var(--volt)}.rounds div:first-child{border-color:var(--volt)}.rounds strong{color:var(--volt);font:500 16px 'IBM Plex Mono'}
    .question{width:100%;padding:${isTikTok ? '48px' : '38px'};border:1px solid var(--lineBright);background:var(--surface)}.question .who{display:flex;align-items:center;gap:18px;color:var(--ink3);font:500 16px 'IBM Plex Mono';letter-spacing:.08em;text-transform:uppercase}.question .dot{width:15px;height:15px;border-radius:50%;background:var(--accent);box-shadow:0 0 28px var(--accent)}.question blockquote{margin:34px 0 0;font:${isTikTok ? '42px' : '35px'}/1.32 'IBM Plex Sans';color:var(--ink)}.question .response{margin-top:36px;border-top:1px solid var(--line);padding-top:22px;color:var(--ink3);font:500 16px 'IBM Plex Mono';letter-spacing:.08em;text-transform:uppercase;display:flex;justify-content:space-between}.question .response b{color:var(--volt)}
    .feedback{width:100%;display:grid;grid-template-columns:210px 1fr;border:1px solid var(--lineBright);background:var(--surface)}.feedback .number{display:grid;place-items:center;border-right:1px solid var(--line);font:500 ${isTikTok ? '112px' : '92px'} 'IBM Plex Mono';color:var(--volt)}.feedback blockquote{margin:0;padding:${isTikTok ? '44px' : '34px'};font:${isTikTok ? '33px' : '28px'}/1.42 'IBM Plex Sans';color:var(--ink2)}.feedback blockquote span{display:block;margin-bottom:16px;color:var(--ink3);font:500 15px 'IBM Plex Mono';letter-spacing:.1em;text-transform:uppercase}
    .cta{width:100%;display:grid;place-items:center;text-align:center}.cta .mark{width:116px;height:116px;color:var(--volt)}.cta .mark svg{width:100%;height:100%}.button{display:inline-flex;align-items:center;justify-content:center;margin-top:34px;min-width:420px;height:82px;padding:0 34px;background:var(--volt);color:var(--ground);font:700 28px 'Barlow Condensed';letter-spacing:.08em;text-transform:uppercase}.fine{margin-top:22px;color:var(--ink3);font:500 17px 'IBM Plex Mono';letter-spacing:.08em;text-transform:uppercase}
  </style></head><body><main class="slide">
    <header class="top"><div class="brand">${mark}<span>NERVE</span></div><span class="kicker">${escapeHtml(slide.label)}</span></header>
    <section class="copy"><h1>${slide.headline}</h1>${body}</section>
    <section class="visual">${slide.visual}</section>
    <footer class="bottom"><span>${slide.footer ?? (track === 'dating' ? 'CONVERSATION TRAINING' : 'INTERVIEW TRAINING')}</span><strong>${String(index + 1).padStart(2, '0')} / 07</strong></footer>
  </main></body></html>`
}

async function buildSlides(): Promise<Record<'dating' | 'interviews', Slide[]>> {
  const train = await shot('train')
  const trainMobile = await shot('train-mobile')
  const scorecard = await shot('scorecard')
  const interviewHome = await shot('interview-home')
  const interviewMobile = await shot('interview-home-mobile')

  const dating: Slide[] = [
    { label: 'DATING · REP 001', headline: `CONFIDENCE ISN’T<br>GETTING A YES.`, visual: `<div style="position:absolute;inset:0">${orb()}</div><div class="statement" style="position:absolute;left:0;bottom:110px;width:430px;font-size:42px">THE OUTCOME ISN’T THE SKILL.<small>The conversation is.</small></div>`, footer: 'SWIPE →' },
    { label: 'THE REFRAME', headline: `IT’S STAYING PRESENT WHEN THE ANSWER MIGHT BE NO.`, body: 'No trick. No perfect opening line. Just a conversation you have to handle.', visual: `<div class="statement">A GOOD REP CAN END IN REJECTION.<small>You are measured on how you handled the room—not on whether it worked.</small></div>` },
    { label: 'THE REP', headline: `3:00. ONE STRANGER.<br>NO SCRIPT.`, body: 'She can lose interest, get distracted or end the conversation.', visual: screenshot(train, '72% 40%') },
    { label: 'UNDER PRESSURE', headline: `YOU HAVE TO SAY IT<br>OUT LOUD.`, body: 'Nerve listens to what you say—and what you do when the conversation wobbles.', visual: `<div style="display:grid;grid-template-columns:1fr .72fr;gap:28px;width:100%;align-items:center"><div><div class="timer"><em>00</em>:47</div><div class="wave">${[40,78,123,66,145,98,164,72,130,92,154,61,111,82].map((height) => `<i style="height:${height}px"></i>`).join('')}</div></div>${screenshot(trainMobile, '50% 35%', 'tall')}</div>`, footer: 'NO SUGGESTED REPLIES · NO SCRIPT' },
    { label: 'THE DIFFERENCE', headline: `THE OUTCOME DOESN’T<br>DECIDE THE SCORE.`, body: 'A clean conversation that ends in rejection can still score 92.', visual: `<div class="score-card"><div class="score-head"><span>NADIA · SHE LEFT<br>COMPOSITE</span><strong>92</strong></div>${bars([['Opening',84],['Listening',91],['Signal reading',93],['Composure',88],['Close',95]], OXBLOOD)}</div>` },
    { label: 'SCORED ON', headline: `HOW YOU HANDLED<br>THE CONVERSATION.`, visual: `<div class="dimensions">${['Opening','Curiosity','Listening','Signal reading','Composure','Close'].map((item, i) => `<div><span>0${i + 1}</span>${item}<b></b></div>`).join('')}</div>`, footer: 'NOT ON WHETHER SHE SAID YES' },
    { label: 'ONE FREE REP', headline: `PRACTISE INSIDE.<br>SPEND IT OUTSIDE.`, body: 'Run your first three-minute voice rep free.', visual: `<div class="cta"><div class="mark">${mark}</div><div class="button">START TRAINING</div><div class="fine">HELLONERVE.COM · NO CARD · 18+</div></div>` },
  ]

  const interviews: Slide[] = [
    { label: 'INTERVIEW · REP 001', headline: `YOUR MOCK INTERVIEWER SHOULD HAVE READ YOUR CV.`, visual: `<div class="question"><div class="who"><span class="dot"></span>PROJECT · PAYMENTS API</div><blockquote>“Why did you choose an event-driven architecture here?”</blockquote><div class="response"><span>FOLLOW-UP 03</span><b>ANSWER OUT LOUD</b></div></div>`, footer: 'SWIPE →' },
    { label: 'THE PROBLEM', headline: `GENERIC QUESTIONS CREATE GENERIC PRACTICE.`, body: 'A real interview does not stop after your prepared answer. It asks the follow-up.', visual: `<div style="width:100%;display:grid;gap:14px"><div class="statement" style="opacity:.42">TELL ME ABOUT YOURSELF.</div><div class="statement" style="opacity:.68">WHAT DID YOU BUILD?</div><div class="statement">WHY DID YOU MAKE THAT TECHNICAL DECISION?</div></div>` },
    { label: 'SET UP ONCE', headline: `ADD THE ROLE, JOB DESCRIPTION AND CV.`, body: 'Nerve builds an AI interview around the job and your actual work.', visual: screenshot(interviewHome, '65% 42%') },
    { label: 'CHOOSE THE ROUND', headline: `PRACTISE THE INTERVIEW YOU’RE ACTUALLY FACING.`, visual: `<div class="rounds"><div><span>05 MIN</span>FREE SCREENER<strong>FREE</strong></div><div><span>10 MIN</span>RECRUITER SCREEN<strong>1 CREDIT</strong></div><div><span>20 MIN</span>TECHNICAL<strong>2 CREDITS</strong></div><div><span>25 MIN</span>DEEP TECHNICAL<strong>2 CREDITS</strong></div><div><span>20 MIN</span>FINAL ROUND<strong>2 CREDITS</strong></div></div>`, footer: 'DIFFERENT ROUNDS · DIFFERENT PRESSURE' },
    { label: 'THE INTERVIEW', headline: `ANSWER OUT LOUD.<br>NO SCRIPT.`, body: 'The interviewer listens, challenges specifics and asks the next question.', visual: `<div style="display:grid;grid-template-columns:.72fr 1fr;gap:28px;width:100%;align-items:center">${screenshot(interviewMobile, '50% 30%', 'tall')}<div class="question"><div class="who"><span class="dot"></span>PRIYA · TECHNICAL</div><blockquote>“What was causing the original bottleneck?”</blockquote><div class="response"><span>18:42 LEFT</span><b>LISTENING</b></div></div></div>` },
    { label: 'THE SCORECARD', headline: `SEE WHERE THE ANSWER<br>BROKE DOWN.`, body: 'Seven scored dimensions, with your own words quoted back to you.', visual: `<div style="width:100%;display:grid;gap:22px"><div class="feedback"><div class="number">67</div><blockquote><span>SPECIFICITY · NEEDS WORK</span>“You described the result clearly, but never explained how you measured it.”</blockquote></div>${bars([['Structure',76],['Specificity',54],['Listening',82],['Composure',71],['Technical accuracy',63]], COOL)}</div>` },
    { label: 'ONE FREE ROUND', headline: `YOUR FIRST FIVE<br>MINUTES ARE FREE.`, body: 'Same interviewer. Same grading. Shorter round.', visual: `<div class="cta"><div class="timer" style="font-size:132px"><em>05</em>:00</div><div class="button">START FREE SCREENER</div><div class="fine">HELLONERVE.COM · NO CARD</div></div>` },
  ]

  return { dating, interviews }
}

const CAPTIONS = `# First posts — captions

## Nerve Dating

Confidence isn’t convincing someone to like you.

It’s starting the conversation, listening properly, reading what is happening and leaving well—even when the answer is no.

Nerve gives you three minutes, one stranger and no script. You speak out loud and receive a scorecard based on how you handled the conversation, never on whether it “worked.”

Your first voice rep is free. No card. 18+.

Link in bio.

#ConversationPractice #SocialConfidence #DatingConfidence #CommunicationSkills #HelloNerve

Pinned comment: A good rep can end in rejection. The outcome contributes zero to the score.

## Nerve Interviews

Interview preparation changes when the interviewer has actually read your CV.

Add the role, job description and your experience. Choose the round you are facing. Then answer out loud while an AI interviewer challenges the details and asks follow-up questions.

Afterward, Nerve grades the round across seven dimensions and quotes your own words back to you.

Every account includes one free five-minute recruiter screen. No card.

Link in bio.

#InterviewPreparation #MockInterview #JobInterview #CareerTips #HelloNerve

Pinned comment: It doesn’t feed you answers during the interview. The point is to become the person who can answer without help.
`

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true })
  const fontCss = await readFile('public/brand/.fonts.css', 'utf8')
  const decks = await buildSlides()

  let chrome: ChildProcess | null = null
  let cdp: Cdp | null = null
  try {
    chrome = spawn(CHROME, [
      '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
      '--disable-gpu', '--hide-scrollbars', '--no-first-run', 'about:blank',
    ], { stdio: 'ignore' })

    let wsUrl = ''
    for (let attempt = 0; attempt < 60 && !wsUrl; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      const info = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null) as { webSocketDebuggerUrl?: string } | null
      wsUrl = info?.webSocketDebuggerUrl ?? ''
    }
    if (!wsUrl) throw new Error('Chrome did not open a DevTools endpoint')
    cdp = await connect(wsUrl)

    for (const [track, slides] of Object.entries(decks) as Array<['dating' | 'interviews', Slide[]]>) {
      for (const platform of Object.keys(SIZES) as Platform[]) {
        const size = SIZES[platform]
        const directory = join(OUT, track, platform)
        await mkdir(directory, { recursive: true })
        for (let index = 0; index < slides.length; index += 1) {
          const target = await cdp.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
          const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }) as { sessionId: string }
          const session = attached.sessionId
          await cdp.send('Page.enable', {}, session)
          await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false }, session)
          const html = slideHtml(slides[index]!, index, size, platform, track).replace('__FONT_CSS__', fontCss)
          await cdp.send('Page.setDocumentContent', { frameId: target.targetId, html }, session)
          await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }, session)
          await new Promise((resolve) => setTimeout(resolve, 120))
          const capture = await cdp.send('Page.captureScreenshot', {
            format: 'png', clip: { x: 0, y: 0, ...size, scale: 1 }, captureBeyondViewport: true,
          }, session) as { data: string }
          const path = join(directory, `${String(index + 1).padStart(2, '0')}.png`)
          await writeFile(path, Buffer.from(capture.data, 'base64'))
          console.log(`ok  ${track.padEnd(10)} ${platform.padEnd(9)} ${index + 1}/7 → ${path}`)
          await cdp.send('Target.closeTarget', { targetId: target.targetId })
        }
      }
    }

    for (const track of ['dating', 'interviews'] as const) {
      const images = await Promise.all(Array.from({ length: 7 }, (_, index) =>
        dataUri(join(OUT, track, 'instagram', `${String(index + 1).padStart(2, '0')}.png`))))
      const size = { width: 1600, height: 1160 }
      const target = await cdp.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
      const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true }) as { sessionId: string }
      const session = attached.sessionId
      await cdp.send('Page.enable', {}, session)
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false }, session)
      const html = `<!doctype html><html><head><style>${fontCss}*{box-sizing:border-box}html,body{margin:0;width:${size.width}px;height:${size.height}px;overflow:hidden;background:${GROUND};color:${INK}}body{padding:52px;font-family:'IBM Plex Sans',sans-serif}header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:34px}h1{margin:0;font:700 58px 'Barlow Condensed';letter-spacing:.04em;text-transform:uppercase}header span{color:${VOLT};font:500 17px 'IBM Plex Mono';letter-spacing:.1em;text-transform:uppercase}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}.card{position:relative;overflow:hidden;border:1px solid ${LINE_BRIGHT};background:${SURFACE};aspect-ratio:4/5}.card img{display:block;width:100%;height:100%;object-fit:cover}.card b{position:absolute;right:10px;bottom:10px;display:grid;place-items:center;width:34px;height:34px;background:${GROUND};border:1px solid ${LINE_BRIGHT};color:${VOLT};font:500 13px 'IBM Plex Mono'}</style></head><body><header><h1>NERVE · ${track === 'dating' ? 'DATING' : 'INTERVIEWS'}</h1><span>FIRST POST · 7 SLIDES · 4:5</span></header><div class="grid">${images.map((src, index) => `<div class="card"><img src="${src}"><b>${index + 1}</b></div>`).join('')}</div></body></html>`
      await cdp.send('Page.setDocumentContent', { frameId: target.targetId, html }, session)
      await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }, session)
      const capture = await cdp.send('Page.captureScreenshot', {
        format: 'png', clip: { x: 0, y: 0, ...size, scale: 1 }, captureBeyondViewport: true,
      }, session) as { data: string }
      const path = join(OUT, `${track}-contact-sheet.png`)
      await writeFile(path, Buffer.from(capture.data, 'base64'))
      console.log(`ok  ${track.padEnd(10)} contact sheet → ${path}`)
      await cdp.send('Target.closeTarget', { targetId: target.targetId })
    }
  } finally {
    cdp?.close()
    chrome?.kill()
  }

  await writeFile(join(OUT, 'captions.md'), CAPTIONS)
  await writeFile(join(OUT, 'README.md'), `# Nerve first social posts\n\n- \`dating/instagram\`: 1080×1350\n- \`dating/tiktok\`: 1080×1920\n- \`interviews/instagram\`: 1080×1350\n- \`interviews/tiktok\`: 1080×1920\n- \`captions.md\`: captions, hashtags and pinned comments\n\nThe layouts use the production Nerve palette and type system. Product panels are sourced from the real local app screenshots in \`public/shots\`.\n`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
