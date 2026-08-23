import { RepBriefScreen } from '@/components/screens/rep-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'

export default async function InterviewBriefPage({ params }: { params: Promise<{ interviewerId: string }> }) {
  const { interviewerId } = await params
  await enforceFrontendGuard(`/interview/rep/${interviewerId}/brief`)
  return <RepBriefScreen personaId={interviewerId} interview />
}
