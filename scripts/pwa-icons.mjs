/**
 * The installable app's icons, rendered from the same mark as `app/icon.svg`.
 *
 *   node scripts/pwa-icons.mjs
 *
 * Writes into `public/pwa/`. Committed output, so this runs only when the mark
 * changes. The maskable icon keeps the glyph inside the central 60% so no
 * launcher's mask (circle, squircle, teardrop) can clip it.
 */
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const GROUND = '#0B0C0A'
const VOLT = '#C4F82A'
// The glyph from app/icon.svg, on a 32-unit grid.
const GLYPH = 'M8 8h5l6 10V8h5v16h-5l-6-10v10H8z'

function svg({ size, glyphScale, radius }) {
  const g = (32 * glyphScale)
  const offset = (32 - g) / 2
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="${GROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${glyphScale})"><path d="${GLYPH}" fill="${VOLT}"/></g>
</svg>`)
}

const out = new URL('../public/pwa/', import.meta.url)
await mkdir(out, { recursive: true })
const jobs = [
  // Standard icons keep the favicon's proportions.
  ['icon-192.png', { size: 192, glyphScale: 1, radius: 0 }],
  ['icon-512.png', { size: 512, glyphScale: 1, radius: 0 }],
  // Maskable: glyph shrunk into the safe zone, full-bleed ground.
  ['maskable-512.png', { size: 512, glyphScale: 0.62, radius: 0 }],
  // iOS rounds its own corners and ignores transparency.
  ['apple-touch-icon.png', { size: 180, glyphScale: 0.82, radius: 0 }],
]
for (const [name, spec] of jobs) {
  await sharp(svg(spec)).png().toFile(new URL(name, out).pathname)
  console.log('wrote', name)
}
