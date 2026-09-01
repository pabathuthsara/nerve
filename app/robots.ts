import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/site/origin'

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
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
