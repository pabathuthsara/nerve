import type { MetadataRoute } from 'next'

/**
 * The installable app (30 September 2026).
 *
 * Opens on Train, full screen, in the product's own ground colour so the splash
 * and the first screen are one surface. Icons come from `scripts/pwa-icons.mjs`
 * and are drawn from the same mark as `app/icon.svg`.
 *
 * No service worker, deliberately: every screen that matters here is live — a
 * voice rep, a meter, a credit balance — and a cache that serves yesterday's
 * build or balance to an installed app is worse than a network request.
 * Current Chrome and Safari install without one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NERVE — Conversation training',
    short_name: 'NERVE',
    description: 'Timed voice reps for conversations that matter.',
    id: '/train',
    start_url: '/train',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0C0A',
    theme_color: '#0B0C0A',
    categories: ['education', 'lifestyle'],
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
