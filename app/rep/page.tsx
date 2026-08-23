import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { nadia } from '@/lib/personas'
import { resolveProviderId } from '@/lib/voice'
import { DEFAULT_CALIBRATION, resolveSilenceMs } from '@/lib/voice/types'
import { RepClient } from './rep-client'

/**
 * Server component. Resolves which adapter this run uses and hands the answer
 * down — the client never reads a provider environment variable, and the token
 * route resolves the same way from the same function.
 *
 * Signed-in only from M1 onward. A rep writes a session row, a transcript, a
 * grade and a ledger line, all keyed to auth.uid(); there is no anonymous
 * shape of that record worth storing.
 */
const M0_MODELS = ['gpt-realtime-mini', 'gpt-realtime-2.1-mini', 'gpt-realtime'] as const

export default async function RepPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>
}) {
  const user = await currentUser()
  // /login is the door now; /auth is still there and still works, but sending
  // someone to the unstyled one from inside the app is a seam they can see.
  if (!user) redirect('/login')

  // How many reps this PERSON has finished, not this browser. The readout that
  // teaches the warmth mapping used to default off after five reps counted in
  // localStorage, so it reset on a new device and on cleared site data (§4b).
  // RLS scopes this to the caller; the `eq` is belt and braces.
  const supabase = await supabaseServer()
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('ended_at', 'is', null)

  const provider = resolveProviderId({ envDefault: process.env.VOICE_PROVIDER })
  const requested = (await searchParams).model
  const fallbackModel = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-mini'
  const model = (M0_MODELS as readonly string[]).includes(requested ?? '')
    ? requested!
    : fallbackModel

  return (
    <RepClient
      persona={nadia}
      provider={provider}
      calibration={DEFAULT_CALIBRATION}
      silenceMs={resolveSilenceMs(DEFAULT_CALIBRATION)}
      model={model}
      userId={user.id}
      completedSessions={count ?? null}
    />
  )
}
