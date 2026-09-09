import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { InterviewsPage } from '@/components/site/interviews-page'

export const metadata: Metadata = {
  title: 'Practice job interviews',
  description:
    'A graded practice interview, out loud, against an interviewer who has read your CV and the job description. Five round types from a five-minute screen to a twenty-five-minute system design. One free round with every account, no card.',
  alternates: { canonical: '/interviews' },
}

export default function Interviews() {
  return <SitePage><InterviewsPage /></SitePage>
}
