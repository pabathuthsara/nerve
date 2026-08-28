import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { HowItWorks } from '@/components/site/how-it-works'

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'What happens in a three-minute rep, what the score is made of, why the ending is worth nothing, and what the real-world half asks of you.',
  alternates: { canonical: '/how-it-works' },
}

export default function HowItWorksPage() {
  return <SitePage><HowItWorks /></SitePage>
}
