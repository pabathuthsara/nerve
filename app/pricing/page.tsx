import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { PricingPage } from '@/components/site/pricing-page'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'One voice rep when you sign up, no card. Pro is $19 for three voice reps a day after a seven-day free trial. Field challenges, text mode and your streak are unlimited on every plan, forever.',
  alternates: { canonical: '/pricing' },
}

export default function Pricing() {
  return <SitePage><PricingPage /></SitePage>
}
