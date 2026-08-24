/**
 * The public share card (§18).
 *
 * A route handler rather than a page, and an image rather than markup: the
 * point of a card is that it previews on social and survives being
 * screenshotted, which HTML does neither of.
 *
 * Resolved by token with the service role, so `share_cards` needs no anonymous
 * policy and RLS stays strict. An unknown or revoked token renders nothing —
 * a 404, not a card explaining that a card used to be here.
 *
 * Arena styling, held to the same rules as the app: dark ground, Barlow
 * Condensed for the figure, one volt accent and no second one, 2px radius,
 * hairlines rather than shadows.
 */

import { ImageResponse } from 'next/og'
import { resolveShareCard } from '@/lib/db/share'
import { PRODUCT_LINE } from '@/lib/share/cards'

export const runtime = 'nodejs'

const GROUND = '#0b0c0a'
const LINE = '#282d23'
const INK = '#e8eae4'
const INK_2 = '#9aa093'
const VOLT = '#c4f82a'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const stored = await resolveShareCard(token)

  // Unknown, or revoked. Nothing to see, and nothing that admits there was.
  if (!stored) return new Response('Not found', { status: 404 })

  const { card } = stored

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
          padding: 64,
          border: `1px solid ${LINE}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: INK_2, fontSize: 22, letterSpacing: 3, textTransform: 'uppercase' }}>
            {card.label}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* The only volt on the card. If it appeared twice, one of them
              would be wrong — the figure is the hero and nothing competes. */}
          <div style={{ color: VOLT, fontSize: 176, lineHeight: 1, letterSpacing: -2 }}>
            {card.headline}
          </div>
          <div style={{ color: INK, fontSize: 34, lineHeight: 1.35, maxWidth: 860 }}>
            {card.line}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `1px solid ${LINE}`,
            paddingTop: 24,
          }}
        >
          {/* Rides on every card, so the artefact says what the product is
              even when it is screenshotted out of context (§14). */}
          <div style={{ color: INK_2, fontSize: 22, letterSpacing: 2, textTransform: 'uppercase' }}>
            {PRODUCT_LINE}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Immutable: the payload is a frozen snapshot and the token is the
        // capability, so a resolved card never changes underneath a cache.
        'cache-control': 'public, max-age=3600, s-maxage=86400',
      },
    },
  )
}
