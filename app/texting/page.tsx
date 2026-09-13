import { notFound } from 'next/navigation'
import { TextingInbox } from '@/components/screens/texting-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'
import { textingInbox } from '@/lib/texting/queries'

/**
 * The texting section's home.
 *
 * A server component, per the stack rule — RSC for read paths, client
 * components only around the live conversation. Nothing here is interactive
 * beyond a list of links.
 */
export default async function TextingPage() {
  await enforceFrontendGuard('/texting')
  const inbox = await textingInbox()
  if (!inbox) notFound()
  return <TextingInbox rows={inbox.rows} allowance={inbox.allowance} />
}
