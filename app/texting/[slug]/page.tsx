import { notFound } from 'next/navigation'
import { TextingThreadScreen } from '@/components/screens/texting-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'
import { getTextingPersona } from '@/lib/personas/texting'
import { personaView } from '@/lib/texting/queries'

/**
 * One thread.
 *
 * The persona is resolved HERE and narrowed to `TextingPersonaView` before it
 * crosses to the client. `Persona.contract` is the authored character prompt
 * and it never leaves the server — the same rule the token route follows, for
 * the same reason.
 */
export default async function TextingThreadPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  await enforceFrontendGuard(`/texting/${slug}`)
  const persona = getTextingPersona(slug)
  if (!persona) notFound()
  return <TextingThreadScreen persona={personaView(persona)} slug={slug} />
}
