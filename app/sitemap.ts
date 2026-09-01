import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site/origin'

/**
 * The public half of §11, and only that. Everything under the app is behind
 * `enforceFrontendGuard` and has nothing to say to a crawler.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: siteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: siteUrl('/how-it-works'), lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: siteUrl('/pricing'), lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: siteUrl('/legal/terms'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: siteUrl('/legal/privacy'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: siteUrl('/legal/safety'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
