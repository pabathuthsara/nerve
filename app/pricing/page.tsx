import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { PricingPage } from '@/components/site/pricing-page'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'One voice rep a day free, three on your first day, no card. Paid plans raise the daily rep count. Field work is unlimited on every plan, forever.',
  alternates: { canonical: '/pricing' },
}

export default function Pricing() {
  return <SitePage><PricingPage /></SitePage>
}
