/**
 * THROWAWAY. Delete `app/texting/demo/` when the filming is done.
 *
 * The recording surface: one scripted clip, drawn by the real texting CSS.
 *
 * A REAL ROUTE RATHER THAN THE CATCH-ALL, deliberately. `app/[...slug]` runs
 * `enforceFrontendGuard`, which would want an account, an age stamp and an
 * allowance; this page wants none of them and spends nothing. Being a real
 * segment also keeps it out of the guard's route table entirely.
 *
 * It DOES still wear the app chrome: `isShelledRoute` matches on the `/texting`
 * prefix, so the rail, the tab bar and the track switcher are around it exactly
 * as they are around a real thread. Sign in on the recording machine and the
 * frame is the product's frame.
 */

import { notFound } from 'next/navigation'
import { demoClip } from '../scripts'
import { DemoThread } from '../demo-thread'

export const metadata = { title: 'Demo' }

export default async function DemoClipPage({
  params,
  searchParams,
}: {
  params: Promise<{ clip: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { clip: id } = await params
  const clip = demoClip(id)
  if (!clip) notFound()

  const query = await searchParams
  const flag = (key: string) => {
    const value = query[key]
    const found = Array.isArray(value) ? value[0] : value
    return found === '' || found === '1' || found === 'true'
  }
  const nameRaw = query.name
  const name = (Array.isArray(nameRaw) ? nameRaw[0] : nameRaw) ?? null

  return (
    <DemoThread
      clip={clip}
      auto={flag('auto')}
      teleprompter={flag('tp')}
      nameOverride={name}
    />
  )
}
