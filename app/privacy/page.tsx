import { permanentRedirect } from 'next/navigation'

/** See the note in `app/terms/page.tsx`. */
export default function PrivacyRedirect() {
  permanentRedirect('/legal/privacy')
}
