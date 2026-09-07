import { deflateRawSync, deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  CV_FAILURE_MESSAGE,
  MAX_CV_BYTES,
  MIN_USEFUL_CHARS,
  docxXmlToText,
  extractCvText,
  looksLikeText,
  pdfStreamText,
  readsAsProse,
  readZipEntry,
  tidy,
} from './cv-text'

/** A real zip, built here rather than checked in as a binary nobody can read. */
function zip(name: string, contents: string, { store = false } = {}): Uint8Array {
  const nameBytes = Buffer.from(name, 'utf8')
  const raw = Buffer.from(contents, 'utf8')
  const body = store ? raw : deflateRawSync(raw)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(store ? 0 : 8, 8)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(body.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(nameBytes.length, 26)
  header.writeUInt16LE(0, 28)
  return new Uint8Array(Buffer.concat([header, nameBytes, body]))
}

/** A PDF with one deflated content stream in it. */
function pdf(streamBody: string, { compress = true } = {}): Uint8Array {
  return multiStreamPdf([{ body: streamBody, compress }])
}

/**
 * A PDF with several `stream ... endstream` objects, which is every real one.
 *
 * The single-stream fixture could not see the bug that mattered: `stream` also
 * appears at the end of `endstream`, so the scanner matched inside the closer
 * and skipped the next object. With one stream there is no next object.
 */
function multiStreamPdf(
  parts: { body: string; compress?: boolean; binary?: boolean }[],
): Uint8Array {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.5\n', 'latin1')]
  parts.forEach((part, index) => {
    const raw = Buffer.from(part.body, 'latin1')
    const payload = part.compress === false ? raw : deflateSync(raw)
    chunks.push(Buffer.from(`${index + 1} 0 obj\n<< /Length ${payload.length} >>\nstream\n`, 'latin1'))
    chunks.push(payload)
    chunks.push(Buffer.from('\nendstream\nendobj\n', 'latin1'))
  })
  chunks.push(Buffer.from('%%EOF\n', 'latin1'))
  return new Uint8Array(Buffer.concat(chunks))
}

const LONG = 'Senior product designer with nine years across fintech and logistics. '.repeat(6)

describe('the zip reader', () => {
  it('finds a deflated entry by name', () => {
    expect(readZipEntry(zip('word/document.xml', '<w:p>Hello</w:p>'), 'word/document.xml'))
      .toBe('<w:p>Hello</w:p>')
  })

  it('finds a stored entry too', () => {
    expect(readZipEntry(zip('word/document.xml', 'plain', { store: true }), 'word/document.xml'))
      .toBe('plain')
  })

  it('returns null for an entry that is not there rather than guessing', () => {
    expect(readZipEntry(zip('word/settings.xml', 'x'), 'word/document.xml')).toBeNull()
  })

  it('refuses anything that is not a zip', () => {
    expect(readZipEntry(new Uint8Array([1, 2, 3, 4, 5]), 'word/document.xml')).toBeNull()
  })

  it('refuses an entry that claims more bytes than the file has', () => {
    const bytes = zip('word/document.xml', 'x')
    new DataView(bytes.buffer).setUint32(18, 0xffff, true)
    expect(readZipEntry(bytes, 'word/document.xml')).toBeNull()
  })
})

describe('DOCX', () => {
  it('turns paragraphs into lines rather than one run-on sentence', () => {
    const xml = '<w:p><w:r><w:t>First line</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>Second line</w:t></w:r></w:p>'
    expect(docxXmlToText(xml)).toBe('First line\nSecond line\n')
  })

  it('resolves the entities Word writes', () => {
    expect(docxXmlToText('<w:t>R&amp;D &lt;lead&gt; &quot;interim&quot;</w:t>'))
      .toBe('R&D <lead> "interim"')
  })

  it('round-trips a real document', () => {
    const xml = `<?xml version="1.0"?><w:document><w:body>${
      LONG.split('. ').filter(Boolean).map((line) => `<w:p><w:r><w:t>${line}.</w:t></w:r></w:p>`).join('')
    }</w:body></w:document>`
    const result = extractCvText(zip('word/document.xml', xml), 'ash-perera-cv.docx')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('Senior product designer')
      expect(result.text.split('\n').length).toBeGreaterThan(3)
    }
  })
})

describe('PDF', () => {
  it('reads text out of the operators', () => {
    expect(pdfStreamText('BT /F1 12 Tf 72 720 Td (Hello there) Tj ET').trim())
      .toBe('Hello there')
  })

  it('breaks a line on every cursor move', () => {
    const text = pdfStreamText('BT (One) Tj 0 -14 Td (Two) Tj 0 -14 Td (Three) Tj ET')
    expect(text.split('\n').map((line) => line.trim()).filter(Boolean)).toEqual(['One', 'Two', 'Three'])
  })

  it('resolves PDF’s own escapes, including octal', () => {
    expect(pdfStreamText('BT (A\\(B\\) C\\251) Tj ET').trim()).toBe('A(B) C©')
  })

  it('round-trips a compressed page', () => {
    const body = `BT ${LONG.split('. ').filter(Boolean)
      .map((line) => `(${line}.) Tj 0 -14 Td`).join(' ')} ET`
    const result = extractCvText(pdf(body), 'cv.pdf')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toContain('Senior product designer')
  })

  it('reads an uncompressed page too', () => {
    const body = `BT ${LONG.split('. ').filter(Boolean)
      .map((line) => `(${line}.) Tj 0 -14 Td`).join(' ')} ET`
    const result = extractCvText(pdf(body, { compress: false }), 'cv.pdf')
    expect(result.ok).toBe(true)
  })
})

/**
 * The two defects a real CV found on 7 September, and neither was reachable
 * from the fixtures that shipped with the extractor.
 */
describe('the regressions a real PDF found', () => {
  const line = (n: number) => `(Line ${n} of a curriculum vitae with several real words in it.) Tj 0 -14 Td`
  const page = (from: number) => `BT ${Array.from({ length: 12 }, (_, i) => line(from + i)).join(' ')} ET`

  /**
   * `stream` is the tail of `endstream`. The scanner matched inside the closer
   * and advanced only AS FAR AS it, so after the first object every real stream
   * was skipped — 16 of 17 in the CV that found this, leaving nothing but the
   * cross-reference table.
   */
  it('reads every stream, not just the first', () => {
    const result = extractCvText(multiStreamPdf([
      { body: 'BT (Cross reference junk) Tj ET' },
      { body: page(1) },
      { body: page(20) },
      { body: page(40) },
    ]), 'cv.pdf')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('Line 1 of a curriculum vitae')
      expect(result.text).toContain('Line 20 of a curriculum vitae')
      expect(result.text).toContain('Line 40 of a curriculum vitae')
    }
  })

  /**
   * A PDF carries fonts, colour profiles and images in the same `stream`
   * wrapper as its page content. Those bytes were being yielded as latin1 and
   * read for `(...)` literals, which produced 11,946 characters of mojibake
   * that passed every length check and would have gone into a system prompt as
   * "Their CV".
   */
  it('never lets a font or an image become text', () => {
    // Bytes that are not deflate and are not text — an embedded font, in effect.
    const binary = Array.from({ length: 3000 }, (_, i) => String.fromCharCode((i * 37) % 256)).join('')
    const result = extractCvText(multiStreamPdf([
      { body: binary, compress: false },
      { body: page(1) },
    ]), 'cv.pdf')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('Line 1 of a curriculum vitae')
      expect(readsAsProse(result.text)).toBe(true)
    }
  })

  it('refuses outright when the only streams are binary', () => {
    const binary = Array.from({ length: 4000 }, (_, i) => String.fromCharCode((i * 37) % 256)).join('')
    const result = extractCvText(multiStreamPdf([{ body: binary, compress: false }]), 'cv.pdf')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-text')
  })

  it('knows text from bytes', () => {
    expect(looksLikeText('BT (Hello there) Tj ET')).toBe(true)
    expect(looksLikeText(Array.from({ length: 500 }, (_, i) => String.fromCharCode(i % 256)).join(''))).toBe(false)
    expect(looksLikeText('')).toBe(false)
  })

  /** The guard that does not care how the extraction went wrong. */
  it('knows prose from noise, whatever produced it', () => {
    expect(readsAsProse(LONG)).toBe(true)
    expect(readsAsProse('>»‘ûûñ÷? òÄ‹<Ë ·¾L Q„=.d>lèí ó2Âå¯Î ç?ì î}”ŠÒb6o÷ÇÅŒ 0Zôªœ gÕMÛÌ'.repeat(20))).toBe(false)
    // Long enough to pass the length check and still not a document.
    expect(readsAsProse('(((...)))'.repeat(400))).toBe(false)
    expect(readsAsProse('')).toBe(false)
  })
})

describe('what it refuses, and what it says', () => {
  /**
   * C3's acceptance criterion: a scanned image-only PDF fails with a message
   * that says what to DO, rather than silently producing an empty CV.
   */
  it('names a scan rather than returning an empty CV', () => {
    const result = extractCvText(pdf('/Im0 Do'), 'scan.pdf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('no-text')
      expect(result.message).toBe(CV_FAILURE_MESSAGE['no-text'])
      expect(result.message).toContain('carry on without it')
    }
  })

  it('refuses a file type it does not read', () => {
    const result = extractCvText(new Uint8Array(1000), 'cv.pages')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unsupported')
  })

  it('refuses anything past the bucket’s own limit', () => {
    const result = extractCvText(new Uint8Array(MAX_CV_BYTES + 1), 'cv.pdf')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too-large')
  })

  it('says a DOCX it cannot open is unreadable rather than empty', () => {
    const result = extractCvText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'cv.docx')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unreadable')
  })

  it('gives every failure a message that tells somebody what to do', () => {
    for (const [reason, message] of Object.entries(CV_FAILURE_MESSAGE)) {
      expect(message.length, reason).toBeGreaterThan(30)
      expect(message, reason).toMatch(/\.$/)
    }
  })

  it('holds a real bar for "there are words in this"', () => {
    expect(MIN_USEFUL_CHARS).toBeGreaterThan(100)
  })
})

describe('tidy', () => {
  it('collapses layout without collapsing structure', () => {
    expect(tidy('  Lead   engineer \n\n\n\n  Payments  \n')).toBe('Lead engineer\n\nPayments')
  })

  it('strips the invisible characters a CV builder leaves behind', () => {
    expect(tidy('Lead​engineer now')).toBe('Lead engineer now')
  })
})
