import { RepLiveScreen } from '@/components/screens/rep-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'

/**
 * The interview track is M4. The screen exists and the transport is the same
 * one the dating rep uses; what is missing is interviewers — a character
 * nobody has written is not something to open a session against, so `live`
 * stays null and the screen says so.
 */
export default async function InterviewLivePage({ params }: { params: Promise<{ interviewerId: string }> }) {
  const { interviewerId } = await params
  await enforceFrontendGuard(`/interview/rep/${interviewerId}/live`)
  return <RepLiveScreen personaId={interviewerId} live={null} interview />
}
