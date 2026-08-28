import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { SafetyDocument } from '@/components/site/legal-pages'

export const metadata: Metadata = {
  title: 'Safety & scope',
  description: 'Training, not clinical care. The PG-13 bound, the rule every real-world exercise is written against, and what to do if a session stops being an exercise.',
  alternates: { canonical: '/legal/safety' },
}

export default function SafetyPage() {
  return <SitePage className="site--legal"><SafetyDocument /></SitePage>
}
