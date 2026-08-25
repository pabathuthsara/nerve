import { TextRepScreen } from '@/components/screens/text-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'

/**
 * Text mode (P1). Signed-in and past onboarding, like every other training
 * surface — but with no quota gate and no microphone in front of it, which is
 * the entire point.
 */
export default async function TextRepPage({ params }: { params: Promise<{ personaId: string }> }) {
  const { personaId } = await params
  await enforceFrontendGuard(`/text/${personaId}`)
  return <TextRepScreen personaId={personaId} />
}
