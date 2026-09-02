/**
 * The legal documents, as PDFs (§14).
 *
 *   npm run dev            # in another terminal
 *   npm run legal:pdf
 *
 * Whop's onboarding asks for the terms, the privacy policy and the return
 * policy as **uploaded PDF documents**, not as links. So does most of the
 * shortlist in `PAYMENTS-APPROVAL.md` §2, which is why this is a script rather
 * than something done once by hand: these get regenerated every time the pages
 * change, and a policy PDF that has drifted from the published page is worse
 * than no PDF at all — it is two versions of the same promise, and the one a
 * disputing customer quotes is whichever is more generous.
 *
 * **It renders the real pages rather than a copy of them.** The text comes out
 * of the running app, so there is no second source for any of this and no way
 * for the uploaded document to say something the site does not. What it changes
 * is presentation only: Arena is dark, and a black A4 page is unreadable
 * printed and looks broken to a compliance reviewer, so the extracted content
 * is re-wrapped in a light print stylesheet.
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'legal-pdf'

const DOCUMENTS = [
  { path: '/legal/terms', file: 'nerve-terms-of-service', name: 'Terms of Service' },
  { path: '/legal/privacy', file: 'nerve-privacy-policy', name: 'Privacy Policy' },
  { path: '/legal/refunds', file: 'nerve-return-policy', name: 'Return and Refund Policy' },
  { path: '/legal/safety', file: 'nerve-acceptable-use', name: 'Acceptable Use and Safety' },
]

/**
 * The print stylesheet.
 *
 * Deliberately not Arena. This is the one surface in the product that is meant
 * to be printed, read in a PDF viewer and skimmed by somebody deciding whether
 * to let us take money — so it is black on white, serif, generously leaded, and
 * it never uses colour to carry meaning.
 */
const PRINT_CSS = `
  @page { size: A4; margin: 20mm 18mm 22mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #fff; color: #14161a;
    font: 10.5pt/1.6 "Iowan Old Style", Georgia, "Times New Roman", serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc-head { border-bottom: 1.5px solid #14161a; padding-bottom: 14px; margin-bottom: 26px; }
  .doc-head .brand {
    font: 600 8.5pt/1 ui-sans-serif, system-ui, sans-serif;
    letter-spacing: .14em; text-transform: uppercase; color: #5b6068;
  }
  .doc-head h1 { font-size: 21pt; line-height: 1.15; margin: 10px 0 6px; letter-spacing: -.01em; }
  .doc-head .meta { font: 8.5pt/1.5 ui-sans-serif, system-ui, sans-serif; color: #5b6068; margin: 0; }
  .doc-head .summary { margin: 12px 0 0; color: #35393f; font-size: 10pt; }
  .legal__clause { margin: 0 0 20px; break-inside: avoid-page; }
  .legal__clause h2 {
    font: 600 11.5pt/1.35 ui-sans-serif, system-ui, sans-serif;
    margin: 22px 0 8px; color: #14161a;
  }
  .legal__clause h2 .data { color: #5b6068; margin-right: 6px; font-variant-numeric: tabular-nums; }
  p { margin: 0 0 10px; }
  strong { font-weight: 700; }
  a { color: #14161a; text-decoration: underline; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin: 0 0 5px; }
  /* The on-site cross-links are navigation, not policy. They mean nothing in a PDF. */
  .legal__foot, .site-header, .site-footer, nav { display: none !important; }
  .doc-foot {
    margin-top: 30px; padding-top: 12px; border-top: 1px solid #c9ccd1;
    font: 8.5pt/1.5 ui-sans-serif, system-ui, sans-serif; color: #5b6068;
  }
`

function run(command: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args)
    let out = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', () => {})
    child.on('close', (code) => resolve({ code: code ?? 1, out }))
  })
}

/**
 * Pulls the document out of the rendered page.
 *
 * A regex rather than a DOM parser because the shape is known and stable — the
 * page is one `<article class="legal">` — and adding a parser dependency to
 * read one element would be the more fragile choice, not the less.
 */
function extractArticle(html: string): { body: string; title: string; effective: string } | null {
  const inner = html.match(/<article class="legal"[^>]*>([\s\S]*?)<\/article>/)?.[1]
  if (!inner) return null
  const title = inner.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
  /**
   * The effective date, past React's comment separator.
   *
   * `<span>Effective {EFFECTIVE}</span>` is two text nodes in JSX, and the
   * server renderer writes `Effective <!-- -->27 August 2026` between them. A
   * naive `Effective ([^<]+)<` stops at the comment and yields an empty string,
   * which is how the first run produced a header reading "Effective · Operated
   * by Nerve" with no date on it — on a document whose entire purpose is to be
   * the version that was in force on a given day.
   */
  const effective = inner
    .match(/Effective\s*(?:<!--\s*-->)?\s*([^<]+)/)?.[1]
    ?.trim() ?? ''
  // The header is rebuilt below with print typography, and the footer is
  // navigation that means nothing on paper.
  const body = inner
    .replace(/<header class="legal__head"[\s\S]*?<\/header>/, '')
    .replace(/<footer class="legal__foot"[\s\S]*?<\/footer>/, '')
  return { body, title, effective }
}

async function main(): Promise<void> {
  // `--url` with nothing after it is a plausible typo, and it must fall back
  // rather than crash on an undefined argv slot.
  const flag = process.argv.indexOf('--url')
  const base = (flag === -1 ? undefined : process.argv[flag + 1])?.replace(/\/+$/, '')
    || 'http://localhost:3000'

  await mkdir(OUT, { recursive: true })
  console.log(`\nLegal PDFs — from ${base}\n`)

  let failures = 0

  for (const doc of DOCUMENTS) {
    const url = `${base}${doc.path}`
    const response = await fetch(url).catch(() => null)
    if (!response?.ok) {
      console.log(`  FAIL  ${doc.name} — ${url} did not respond (${response?.status ?? 'unreachable'})`)
      failures += 1
      continue
    }

    const extracted = extractArticle(await response.text())
    if (!extracted) {
      console.log(`  FAIL  ${doc.name} — no <article class="legal"> in the response`)
      failures += 1
      continue
    }

    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">`
      + `<title>${doc.name} — Nerve</title><style>${PRINT_CSS}</style></head><body>`
      + `<div class="doc-head"><div class="brand">Nerve · hellonerve.com</div>`
      + `<h1>${extracted.title || doc.name}</h1>`
      + `<p class="meta">Effective ${extracted.effective} · Operated by Nerve · support@hellonerve.com</p>`
      + `</div>${extracted.body}`
      + `<div class="doc-foot">Nerve — confidence training for conversation. Training, not therapy, `
      + `treatment or clinical care. Published at ${base}${doc.path}</div>`
      + `</body></html>`

    const htmlPath = join(OUT, `${doc.file}.html`)
    const pdfPath = join(OUT, `${doc.file}.pdf`)
    await writeFile(htmlPath, page, 'utf8')

    const { code } = await run(CHROME, [
      '--headless', '--disable-gpu', '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`, `file://${process.cwd()}/${htmlPath}`,
    ])

    const size = await readFile(pdfPath).then((b) => b.length).catch(() => 0)
    if (code !== 0 || size === 0) {
      console.log(`  FAIL  ${doc.name} — Chrome did not produce a PDF`)
      failures += 1
      continue
    }

    await unlink(htmlPath).catch(() => {})
    console.log(`  ok    ${doc.name.padEnd(28)} ${pdfPath}  (${Math.round(size / 1024)} KB)`)
  }

  console.log(`\n${failures} failed.`)
  if (failures > 0) {
    console.log('Is the dev server running? npm run dev\n')
    process.exit(1)
  }
  console.log(`Upload the first three at whop.com/dashboard/<biz_…>/settings → Legal.\n`)
}

void main()
