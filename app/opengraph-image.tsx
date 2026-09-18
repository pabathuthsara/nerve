/**
 * The link preview, built from the product rather than stored beside it
 * (SIGNUP-FIXES §4.9).
 *
 * ── WHY IT IS A ROUTE AND NOT A FILE ─────────────────────────────────────
 *
 * `public/og.png` was the wordmark on black, 1.18MB, and in a feed it was a
 * logo for a brand nobody has heard of — an image that answers "who" to
 * somebody asking "what". It was also a static asset, which means it could
 * drift from the product indefinitely and nothing would notice.
 *
 * This renders the scorecard: the one artefact that says what Nerve is in the
 * two seconds a feed gets. **`MAYA · TIER 3 · SHE LEFT` beside `87` is the
 * whole product in one image** — the rep ended in rejection and scored 87
 * anyway, which is §07 stated as a picture rather than as a claim.
 *
 * ── IT IS AUTHORED HERE, AND THAT IS DELIBERATE ──────────────────────────
 *
 * The numbers match `ScorecardArtifact` on the landing page and are authored
 * in both places rather than read from a real session. Rule 10's asymmetry is
 * the reason: a real user's scorecard on a public OG image is a published
 * artefact about a person, which is what `assertPublishable` exists to
 * refuse. A composed example is advertising our own design, which is what an
 * OG image is for.
 *
 * Arena, held to the same rules as the app: dark ground, Barlow's register in
 * the figure, **one** volt accent (the composite), hairlines and not shadows.
 */

import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const alt = 'A Nerve scorecard: composite 87, on a rep that ended in rejection.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const GROUND = '#0b0c0a'
const SURFACE = '#131511'
const LINE = '#282d23'
const INK = '#e8eae4'
const INK_2 = '#9aa093'
const INK_3 = '#6a7062'
const VOLT = '#c4f82a'

/** The same six the landing page's `ScorecardArtifact` draws. */
const SUBS = [
  { label: 'Opening', value: 84 },
  { label: 'Curiosity', value: 79 },
  { label: 'Listening', value: 91 },
  { label: 'Signal reading', value: 93 },
  { label: 'Composure', value: 82 },
  { label: 'Close', value: 95 },
]

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: GROUND,
          padding: 56,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', color: INK_3, fontSize: 21, letterSpacing: 4, textTransform: 'uppercase' }}>
              NERVE
            </div>
            {/* The three words that answer "what is this" in a feed. */}
            <div style={{ display: 'flex', color: INK, fontSize: 60, lineHeight: 1.05, letterSpacing: -1 }}>
              Scored on how you talked.
            </div>
            <div style={{ display: 'flex', color: INK_2, fontSize: 24, letterSpacing: 2, textTransform: 'uppercase' }}>
              Maya · Tier 3 · She left
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ display: 'flex', color: INK_3, fontSize: 18, letterSpacing: 3, textTransform: 'uppercase' }}>
              Composite
            </div>
            {/* The screen's one volt. Nothing else in this image takes it. */}
            <div style={{ display: 'flex', color: VOLT, fontSize: 132, lineHeight: 1, letterSpacing: -4 }}>87</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 10 }}>
          {SUBS.map((sub) => (
            <div key={sub.label} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 22, height: 30 }}>
              {/*
                `flexShrink: 0` on both end columns, and `nowrap` on the label.
                Without them satori lets the label column collapse under its
                own text: the bars started at six different x positions and
                "Signal reading" wrapped onto a second line, striking through
                the row below it. A fixed gutter is what makes six bars read
                as one chart.
              */}
              <div style={{ display: 'flex', width: 250, flexShrink: 0, whiteSpace: 'nowrap', color: INK_2, fontSize: 19, letterSpacing: 2, textTransform: 'uppercase' }}>
                {sub.label}
              </div>
              {/*
                A FIXED track width, not `flexGrow`. 1200 minus 112 of padding
                is 1088; 250 + 22 + 728 + 22 + 56 is 1088. Satori's flex
                growth was pushing the value column past the right edge and
                the scores rendered off-frame — invisible in a build that
                passed. Arithmetic beats layout inference in a renderer with
                no viewport to reflow against.
              */}
              <div style={{ display: 'flex', width: 728, flexShrink: 0, height: 10, background: SURFACE, border: `1px solid ${LINE}` }}>
                <div style={{ width: `${sub.value}%`, height: '100%', background: INK_2 }} />
              </div>
              <div style={{ display: 'flex', width: 56, flexShrink: 0, justifyContent: 'flex-end', color: INK, fontSize: 22 }}>{sub.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: INK_3, fontSize: 20, letterSpacing: 2 }}>
          <div style={{ display: 'flex' }}>Outcome is worth zero.</div>
          <div style={{ display: 'flex' }}>hellonerve.com</div>
        </div>
      </div>
    ),
    size,
  )
}
