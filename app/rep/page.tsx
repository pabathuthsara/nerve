import { nadia } from '@/lib/personas'
import { resolveProviderId } from '@/lib/voice'
import { DEFAULT_CALIBRATION, resolveSilenceMs } from '@/lib/voice/types'
import { RepClient } from './rep-client'

/**
 * Server component. Resolves which adapter this run uses and hands the answer
 * down — the client never reads a provider environment variable, and the token
 * route resolves the same way from the same function.
 */
const M0_MODELS = ['gpt-realtime-mini', 'gpt-realtime-2.1-mini', 'gpt-realtime'] as const

export default async function RepPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>
}) {
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
    />
  )
}
