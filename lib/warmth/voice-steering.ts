/** Shared by the customer rep and the admin audition bench. */
import type { ReplyState, VoiceProvider } from '@/lib/voice/provider'
import type { WarmthSession } from './session'

export function bindVoiceSteering(voice: VoiceProvider, session: WarmthSession): void {
  if (voice.setReplyState) {
    // Stateless generation reads the latest score and live tuning just before
    // every reply. This is synchronous; it adds no network call or wait.
    //
    // `statelessDirective` and not `directive`: nothing carries between these
    // requests, so the band has to ship every turn, but her agenda does not —
    // see the method, and the retreat rate that made it necessary.
    voice.setReplyState((): ReplyState => {
      // Decided and recorded here, because reading the reply state IS the turn:
      // `staysSilent` refuses two in a row and so has to know this one
      // happened. The adapter honours it by making no request at all.
      const silent = session.staysSilent
      session.noteSilence(silent)
      return {
        steering: session.statelessDirective(),
        warmth: session.engine.warmth,
        // Timing is the fifth layer and it is read at the same instant as the
        // directive, off the same turn. See `WarmthSession.replyShape`.
        shape: session.replyShape,
        // Reciprocity: her ceiling mirrored against his last turn, and whether
        // this is a turn she has nothing to say on. `lib/warmth/reciprocity.ts`.
        wordCap: session.replyWordCap,
        silent,
      }
    })
  } else {
    // Realtime retains conversation instructions and creates its own replies.
    voice.on('user.speech.start', () => {
      const direction = session.directiveIfChanged()
      if (direction) voice.reinforce(direction)
    })
  }
}
