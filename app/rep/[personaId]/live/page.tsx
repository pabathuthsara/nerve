import { notFound } from 'next/navigation'
import { RepLiveScreen } from '@/components/screens/rep-screens'
import { enforceFrontendGuard } from '@/lib/data/guards'
import type { LiveRepConfig } from '@/lib/data/rep'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { getPersona } from '@/lib/personas'
import { resolveProviderId } from '@/lib/voice'
import { DEFAULT_CALIBRATION } from '@/lib/voice/types'

/**
 * The live rep, resolved on the server.
 *
 * The browser is told who it is talking to, which adapter to open and how long
 * to wait for a turn. It is never told how any of that was decided: the
 * provider comes from the same `resolveProviderId` the token route uses, and
 * no voice environment variable reaches a client bundle (§04).
 *
 * The turn-taking threshold is per user. `profiles.vad_offset_ms` is the
 * calibration measured for this person, expressed as an offset from the 600ms
 * confident-user default rather than an absolute, so retuning the default does
 * not silently retune everybody.
 */
export default async function RepLivePage({ params }: { params: Promise<{ personaId: string }> }) {
  const { personaId } = await params
  await enforceFrontendGuard(`/rep/${personaId}/live`)

  const persona = getPersona(personaId)
  const user = await currentUser()
  if (!user) notFound()

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('vad_offset_ms, ambience, ambience_volume')
    .eq('id', user.id)
    .maybeSingle()

  // A character on the roster whose engine config has not been authored yet
  // gets a screen that says so, not a session against nobody.
  const live: LiveRepConfig | null = persona
    ? {
        persona,
        provider: resolveProviderId({ envDefault: process.env.VOICE_PROVIDER }),
        model: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-mini',
        calibration: {
          silenceMs: DEFAULT_CALIBRATION.silenceMs,
          patienceOffsetMs: profile?.vad_offset_ms ?? 0,
        },
        userId: user.id,
        ambience: profile?.ambience ?? true,
        ambienceVolume: profile?.ambience_volume ?? 60,
      }
    : null

  return <RepLiveScreen personaId={personaId} live={live} />
}
