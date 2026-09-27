/**
 * The rep the first screen shows, read from the captured recording.
 *
 * Rule 10's asymmetry, applied to text: his half may be authored, HERS must be
 * captured from the real persona and never hand-written, because what she
 * says is the product. `public/hero/manifest.json` is written by
 * `scripts/hero-audio.ts` from a real `gpt-realtime` rep with Nadia and says
 * so (`her.scripted: false`); this module only picks the opening exchange out
 * of it. Editing a line here is not possible — there are no lines here — and
 * re-recording changes the screen with it. `captured-rep.test.ts` holds that.
 */

import manifest from '@/public/hero/manifest.json'
import { PRESENTATION } from '@/lib/personas/presentation'

export interface CapturedLine { who: 'you' | 'her'; text: string }

/** How many turns of the opening the hook shows. Four: two each. */
export const EXCERPT_TURNS = 4

export const CAPTURED_REP = {
  personaId: manifest.persona,
  name: PRESENTATION[manifest.persona]?.name ?? manifest.persona,
  setting: PRESENTATION[manifest.persona]?.settingShort ?? '',
  herScripted: manifest.her.scripted,
  lines: manifest.turns.slice(0, EXCERPT_TURNS).map((turn) => ({ who: turn.who as 'you' | 'her', text: turn.text })),
}
