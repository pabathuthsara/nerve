import { notFound } from 'next/navigation'
import { TextingDebriefScreen } from '@/components/screens/texting-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'
import { textingDebrief } from '@/lib/texting/queries'

/**
 * What happened, after she has gone.
 *
 * A route rather than a sheet, so it is linkable and does not fight the
 * thread's scroll — and so that coming back to it a week later is possible,
 * which is half of why a thread is ended rather than deleted.
 */
export default async function TextingDebriefPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await enforceFrontendGuard(`/texting/${slug}/debrief`)
  const result = await textingDebrief(slug)
  if (!result) notFound()
  return (
    <TextingDebriefScreen
      persona={result.persona}
      debrief={result.debrief}
      open={result.open}
      ending={result.ending}
    />
  )
}
