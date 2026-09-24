/**
 * Which transcriber a pipeline rep opens — one decision, taken off the minted
 * session and nowhere else.
 *
 * The server decides (`PIPELINE_STT_MODEL`, read at mint) and the browser
 * obeys, for the reason the persona is compiled from an id: the client never
 * chooses what it is billed for. A session that names Scribe carries its
 * single-use token in `stt`; one that names nothing is OpenAI's, carrying the
 * ephemeral secret in `clientSecret` exactly as every mint before Scribe did.
 *
 * Both classes emit the same callbacks with the same meanings — finals in
 * spoken order, one `onSettled` per settled commit, a fatal error when the
 * socket goes — so the adapter's turn timing, its reply gate and the
 * normalised `{ speaker, text, t_start, t_end }` turn cannot tell which one
 * heard him (rule 1).
 */

import { RealtimeTranscriber, type TranscriberOptions } from './stt'
import { ScribeTranscriber } from './scribe'
import type { MintedPipelineSession } from './mint'

/** What the adapter may call. `RealtimeTranscriber` and `ScribeTranscriber`
 *  both satisfy it, and the compiler checks the second against the first. */
export type Transcriber = Pick<RealtimeTranscriber, 'connect' | 'pushFrame' | 'commit' | 'clear' | 'close' | 'pendingCount'>

/** Everything but the credential, the model and the rate, which are the minted
 *  session's to say. */
export type TranscriberSetup = Omit<TranscriberOptions, 'clientSecret' | 'model' | 'sampleRate'>

export function transcriberFor(
  minted: Pick<MintedPipelineSession, 'clientSecret' | 'stt' | 'pipeline'>,
  setup: TranscriberSetup,
): Transcriber {
  const sampleRate = minted.pipeline.stt.sampleRate
  if (minted.stt?.vendor === 'elevenlabs') {
    return new ScribeTranscriber({ ...setup, clientSecret: minted.stt.token, model: minted.stt.model, sampleRate })
  }
  return new RealtimeTranscriber({
    ...setup, clientSecret: minted.clientSecret, model: minted.pipeline.stt.model, sampleRate,
  })
}
