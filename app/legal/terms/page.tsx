import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { TermsDocument } from '@/components/site/legal-pages'

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The agreement for using Nerve — eligibility, acceptable use, content standards, billing and cancellation.',
  alternates: { canonical: '/legal/terms' },
}

export default function TermsPage() {
  return <SitePage className="site--legal"><TermsDocument /></SitePage>
}
