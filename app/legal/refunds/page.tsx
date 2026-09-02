import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { RefundDocument } from '@/components/site/legal-pages'

export const metadata: Metadata = {
  title: 'Refunds and cancellation',
  description: 'How to cancel Nerve, what happens to your access when you do, and how to get a refund. Fourteen days, no reason required.',
  alternates: { canonical: '/legal/refunds' },
}

export default function RefundsPage() {
  return <SitePage className="site--legal"><RefundDocument /></SitePage>
}
