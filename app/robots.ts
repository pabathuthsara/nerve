import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nerve-henna.vercel.app'

/**
 * Public pages are crawlable; the product is not. `/rep` and `/session` in
 * particular carry a person's own transcripts behind auth, and a crawler that
 * follows a share link should not go wandering from there.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/rep/', '/text/', '/session/', '/progress/', '/profile/', '/onboarding/', '/interview/', '/auth/'],
    },
    sitemap: `${BASE}/sitemap.xml`,
  }
}
