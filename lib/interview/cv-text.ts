/**
 * Pulling the words out of a CV (INTERVIEW-PLAN C3).
 *
 * ── WHY THERE IS NO LIBRARY HERE ─────────────────────────────────────────
 *
 * A PDF parser is a large dependency with a large attack surface, and this
 * runs on a file a stranger uploaded. What is actually needed is narrow: the
 * plain text of a one-to-three page document produced by Word, Google Docs,
 * LaTeX or a CV builder. Both formats give that up without a parser —
 * a DOCX is a zip with one XML file in it, and a text PDF is a set of
 * deflate-compressed content streams with the words sitting in string
 * literals. Everything below is bounded, allocates nothing it has not sized,
 * and gives up rather than guessing.
 *
 * ── AND WHY GIVING UP IS A FEATURE ───────────────────────────────────────
 *
 * The one case this cannot do is a scanned image-only PDF, which is a real
 * thing people upload. C3's acceptance criterion is that it "fails with a
 * message that says what to do rather than silently producing an empty CV",
 * and that is exactly what happens: no text, a named reason, and an interview
 * that still runs on the field, the role and the job description (§C4).
 *
 * Extraction runs ONCE, on upload, on the server. Never per turn, and never in
 * the browser — the file lives in a private bucket and the text it produces
 * goes into a system prompt.
 */

import { inflateRawSync, inflateSync } from 'node:zlib'

/** Nothing beyond this is a CV. Bounded before anything is decompressed. */
export const MAX_CV_BYTES = 5 * 1024 * 1024

/** Below this, whatever came out is not a document. */
export const MIN_USEFUL_CHARS = 200

export type CvExtractionFailure =
  | 'unsupported'
  | 'too-large'
  | 'unreadable'
  | 'no-text'

export type CvExtraction =
  | { ok: true; text: string }
  | { ok: false; reason: CvExtractionFailure; message: string }

/**
 * What the screen says when it did not work.
 *
 * Every one of these tells somebody what to DO. "Extraction failed" is not a
 * message, it is a status — and the interview runs perfectly well without a
 * CV, so none of them may read as a wall.
 */
export const CV_FAILURE_MESSAGE: Record<CvExtractionFailure, string> = {
  unsupported: 'That file type is not supported. Upload a PDF or a DOCX.',
  'too-large': 'That file is larger than 5 MB. Export it again at a smaller size.',
  unreadable: 'We could not open that file. Try exporting it again as a PDF.',
  'no-text':
    'That PDF is a scan, so there are no words in it to read. Export it from the '
    + 'original document instead, or carry on without it — the interviewer still has your role.',
}

export function extractCvText(bytes: Uint8Array, fileName: string): CvExtraction {
  if (bytes.byteLength > MAX_CV_BYTES) {
    return { ok: false, reason: 'too-large', message: CV_FAILURE_MESSAGE['too-large'] }
  }
  const lower = fileName.toLowerCase()
  const kind = lower.endsWith('.docx') ? 'docx' : lower.endsWith('.pdf') ? 'pdf' : null
  if (!kind) return { ok: false, reason: 'unsupported', message: CV_FAILURE_MESSAGE.unsupported }

  let text: string
  try {
    text = kind === 'docx' ? extractDocx(bytes) : extractPdf(bytes)
  } catch {
    return { ok: false, reason: 'unreadable', message: CV_FAILURE_MESSAGE.unreadable }
  }

  const cleaned = tidy(text)
  if (cleaned.length < MIN_USEFUL_CHARS) {
    // A scan, or a PDF whose text is drawn as vectors. Named, not swallowed.
    return { ok: false, reason: 'no-text', message: CV_FAILURE_MESSAGE['no-text'] }
  }
  // **A GUARD ON THE RESULT, NOT ON THE ROUTE THAT PRODUCED IT.**
  //
  // The header of this file claims it "gives up rather than guessing", and for
  // a day it did not: a real CV produced 11,946 characters of mojibake that
  // passed the length check because length is not the question. Whatever went
  // wrong upstream, prose that is not prose must not reach a system prompt —
  // and a CV is words, so the test is that it reads like words.
  if (!readsAsProse(cleaned)) {
    return { ok: false, reason: 'no-text', message: CV_FAILURE_MESSAGE['no-text'] }
  }
  return { ok: true, text: cleaned }
}

/* ------------------------------------------------------------------ *
 * DOCX
 * ------------------------------------------------------------------ */

/**
 * A DOCX is a zip, and the whole document is one entry inside it.
 *
 * Only `word/document.xml` is read. Headers, footers, embedded images, the
 * theme and every other entry are ignored — a CV's content is in the body, and
 * reading less of an uploaded archive is strictly better.
 */
export function extractDocx(bytes: Uint8Array): string {
  const xml = readZipEntry(bytes, 'word/document.xml')
  if (!xml) throw new Error('no document.xml')
  return docxXmlToText(xml)
}

/**
 * The body XML, as text.
 *
 * `w:p` is a paragraph and `w:tab`/`w:br` are whitespace, so those become line
 * breaks before the tags are stripped — otherwise every bullet in a CV runs
 * into the next one and the model reads one enormous sentence.
 */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

/**
 * One entry out of a zip, by name.
 *
 * Walks the LOCAL file headers rather than the central directory: it is one
 * pass, it needs no seeking from the end, and a truncated archive stops rather
 * than pointing at an offset that is not there. Stored (0) and deflated (8) are
 * the only methods a DOCX uses.
 */
export function readZipEntry(bytes: Uint8Array, wanted: string): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  let offset = 0

  while (offset + 30 <= bytes.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const method = view.getUint16(offset + 8, true)
    const flags = view.getUint16(offset + 6, true)
    const compressed = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))

    // A streamed entry puts its size in a trailing descriptor rather than in
    // the header. Word does not write those, and guessing where the data ends
    // is how a parser reads past the end of a buffer.
    if ((flags & 0x08) !== 0 || compressed === 0xffffffff) return null
    if (dataStart + compressed > bytes.byteLength) return null

    if (name === wanted) {
      const chunk = bytes.subarray(dataStart, dataStart + compressed)
      const raw = method === 0 ? Buffer.from(chunk) : inflateRawSync(Buffer.from(chunk))
      return decoder.decode(raw)
    }
    offset = dataStart + compressed
  }
  return null
}

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

/**
 * The words in a text PDF.
 *
 * A PDF's page content is a stream of drawing operators, and the text is in
 * string literals handed to `Tj` and `TJ`. Almost all of them are
 * FlateDecode-compressed, so every stream is decompressed if it can be and
 * read raw if it cannot.
 *
 * This does NOT implement font encodings, CID maps or ligature tables, and it
 * is not trying to: a CV exported from Word or Google Docs uses WinAnsi and
 * comes out correctly. Anything exotic produces fewer usable characters, which
 * lands on the `no-text` message rather than on nonsense in a prompt.
 */
export function extractPdf(bytes: Uint8Array): string {
  const pieces: string[] = []
  for (const stream of pdfStreams(bytes)) {
    const text = pdfStreamText(stream)
    if (text.trim()) pieces.push(text)
  }
  return pieces.join('\n')
}

/**
 * Every `stream ... endstream` payload that can be read as text.
 *
 * **A stream that will not decompress is SKIPPED, not yielded raw.** That line
 * was the bug: a PDF carries embedded fonts, ICC profiles and JPEGs in exactly
 * the same `stream` wrapper as its page content, and handing those bytes on as
 * latin1 produces a river of parentheses that `pdfStreamText` happily reads as
 * string literals. A real CV came back as 11,946 characters of mojibake that
 * passed every length check and would have gone into a system prompt as
 * "Their CV".
 *
 * An uncompressed content stream is still legitimate and still read — but only
 * when it actually looks like text (`looksLikeText`), which is the same
 * question rather than a different one.
 */
function* pdfStreams(bytes: Uint8Array): Generator<string> {
  const latin = new TextDecoder('latin1')
  const haystack = latin.decode(bytes)
  // `stream` may be followed by CRLF, LF or (rarely) CR alone — and must NOT be
  // the tail of `endstream`, which is the bug this lookbehind exists for.
  const opener = /(?<!end)stream(?:\r\n|\n|\r)/g
  let match: RegExpExecArray | null

  while ((match = opener.exec(haystack)) !== null) {
    const start = match.index + match[0].length
    const close = haystack.indexOf('endstream', start)
    if (close < 0) break
    // PAST the closer, not to it. Advancing to it put the cursor on the very
    // `endstream` whose own `stream` then matched, which skipped the next real
    // stream entirely — 16 of 17 in a real CV, leaving only the cross-reference
    // table and no page content at all.
    opener.lastIndex = close + 'endstream'.length

    // The dictionary's own `/Length` beats searching for `endstream`, because a
    // compressed stream can contain those nine bytes by chance. It is only
    // usable when it is a direct integer; an indirect reference (`12 0 R`)
    // needs the xref table, which is a parser this is deliberately not.
    const dictionary = haystack.slice(Math.max(0, match.index - 512), match.index)
    const declared = /\/Length\s+(\d+)\s*(?:\/|>>)/.exec(dictionary)?.[1]
    const ends: number[] = []
    if (declared) {
      const length = Number(declared)
      if (length > 0 && start + length <= bytes.byteLength) ends.push(start + length)
    }
    ends.push(close)

    for (const stop of ends) {
      const decoded = inflate(Buffer.from(bytes.subarray(start, stop)), latin)
      if (decoded !== null && looksLikeText(decoded)) { yield decoded; break }
    }
  }
}

/**
 * Zlib, then raw deflate, then the bytes themselves.
 *
 * **A stream that will not decompress is never yielded as text.** That was the
 * other half of the same defect: a PDF carries embedded fonts, ICC profiles and
 * images in exactly the same `stream` wrapper as its page content, and handing
 * those bytes on as latin1 produces a river of parentheses that
 * `pdfStreamText` reads as string literals. A real CV came back as 11,946
 * characters of mojibake that passed every length check.
 *
 * An uncompressed content stream is legitimate and is still read — but only
 * when it looks like text, which is the same question rather than a new one.
 */
function inflate(slice: Buffer, latin: TextDecoder): string | null {
  try { return latin.decode(inflateSync(slice)) } catch { /* not zlib */ }
  try { return latin.decode(inflateRawSync(slice)) } catch { /* not raw deflate */ }
  const raw = latin.decode(slice)
  return looksLikeText(raw) ? raw : null
}

/**
 * Is this a stream of characters, or a stream of bytes?
 *
 * A page's content stream is operators and string literals — overwhelmingly
 * printable ASCII. A font, an image or a colour profile is not. The threshold
 * is deliberately generous, because a content stream legitimately contains
 * binary-looking inline data and a CV legitimately contains accented names;
 * what it excludes is the case where most of the buffer is unprintable, which
 * is every one of the failures this guards against.
 */
export function looksLikeText(value: string): boolean {
  if (value.length === 0) return false
  const sample = value.length > 4000 ? value.slice(0, 4000) : value
  let printable = 0
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index)
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) printable += 1
  }
  return printable / sample.length >= 0.85
}

/**
 * The text operators inside one content stream.
 *
 * `Td`, `TD`, `T*` and `ET` all move the cursor, so each becomes a line break
 * — without that a CV comes out as one line and every date range fuses onto the
 * job title above it.
 */
export function pdfStreamText(stream: string): string {
  const out: string[] = []
  let index = 0
  while (index < stream.length) {
    const char = stream[index]!
    if (char === '(') {
      const { text, next } = readPdfString(stream, index)
      out.push(text)
      index = next
      continue
    }
    if (char === 'T' && /^T[dD*]/.test(stream.slice(index, index + 2))) {
      out.push('\n')
      index += 2
      continue
    }
    if (stream.startsWith('ET', index)) {
      out.push('\n')
      index += 2
      continue
    }
    index += 1
  }
  return out.join('')
}

/** One `( … )` literal, with PDF's own escapes resolved. */
function readPdfString(stream: string, open: number): { text: string; next: number } {
  let depth = 1
  let index = open + 1
  let text = ''
  while (index < stream.length && depth > 0) {
    const char = stream[index]!
    if (char === '\\') {
      const escaped = stream[index + 1]
      const OCTAL = /^[0-7]{1,3}/.exec(stream.slice(index + 1, index + 4))
      if (OCTAL) {
        text += String.fromCharCode(parseInt(OCTAL[0], 8))
        index += 1 + OCTAL[0].length
        continue
      }
      text += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped === 'r' ? '\n' : escaped ?? ''
      index += 2
      continue
    }
    if (char === '(') { depth += 1; text += char; index += 1; continue }
    if (char === ')') { depth -= 1; if (depth > 0) text += char; index += 1; continue }
    text += char
    index += 1
  }
  return { text, next: index }
}

/* ------------------------------------------------------------------ *
 * Tidying
 * ------------------------------------------------------------------ */

/**
 * What reaches the prompt.
 *
 * Control characters out, runs of whitespace collapsed, blank lines limited to
 * one. A CV carries a lot of layout and none of it means anything once the
 * words are in a system prompt — and every character of it would be paid for
 * on every cached read.
 */
export function tidy(text: string): string {
  return text
    // Control characters, non-breaking spaces and the zero-width joiners a CV
    // builder leaves behind. All of them are layout and none survives as
    // meaning inside a prompt.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u00A0\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Does this read as a document somebody wrote?
 *
 * Two cheap properties that every CV has and no decompression failure does:
 * most of it is letters and spaces, and it contains real words. A buffer of
 * font tables passes a length check and fails both.
 *
 * Deliberately not a language or dictionary test. A CV can be in any language,
 * can be mostly nouns, and can be half bullet points — what it cannot be is
 * 40% punctuation with no run of letters longer than three.
 */
export function readsAsProse(text: string): boolean {
  const sample = text.length > 4000 ? text.slice(0, 4000) : text
  if (sample.length === 0) return false

  let letters = 0
  let spaces = 0
  for (const character of sample) {
    if (/\p{L}/u.test(character)) letters += 1
    else if (character === ' ' || character === '\n') spaces += 1
  }
  // Letters and whitespace are the bulk of any document. Mojibake is mostly
  // neither.
  if ((letters + spaces) / sample.length < 0.7) return false
  if (letters / sample.length < 0.5) return false

  // And it has to contain actual words. Four letters is short enough that a CV
  // in any language clears it easily, and long enough that random high bytes
  // do not.
  const words = sample.match(/\p{L}{4,}/gu) ?? []
  return words.length >= 20
}
