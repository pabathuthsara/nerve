import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { PrivacyDocument } from '@/components/site/legal-pages'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Nerve records, who processes it, how long session audio is kept, and how to have any of it deleted.',
  alternates: { canonical: '/legal/privacy' },
}

export default function PrivacyPage() {
  return <SitePage className="site--legal"><PrivacyDocument /></SitePage>
}
