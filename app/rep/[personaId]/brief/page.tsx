import { RepBriefScreen } from '@/components/screens/rep-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'

export default async function RepBriefPage({ params }: { params: Promise<{ personaId: string }> }) {
  const { personaId } = await params
  await enforceFrontendGuard(`/rep/${personaId}/brief`)
  return <RepBriefScreen personaId={personaId} />
}
