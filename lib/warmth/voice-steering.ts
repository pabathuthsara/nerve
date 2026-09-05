/** Shared by the customer rep and the admin audition bench. */
import type { VoiceProvider } from '@/lib/voice/provider'
import type { WarmthSession } from './session'

export function bindVoiceSteering(voice: VoiceProvider, session: WarmthSession): void {
  if (voice.setReplyState) {
    // Stateless generation reads the latest score and live tuning just before
    // every reply. This is synchronous; it adds no network call or wait.
    voice.setReplyState(() => ({ steering: session.directive(), warmth: session.engine.warmth }))
  } else {
    // Realtime retains conversation instructions and creates its own replies.
    voice.on('user.speech.start', () => {
      const direction = session.directiveIfChanged()
      if (direction) voice.reinforce(direction)
    })
  }
}
