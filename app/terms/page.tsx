import { permanentRedirect } from 'next/navigation'

/**
 * `/terms` predates the §11 route names and is linked from the sign-up screen,
 * from settings, and from anywhere anybody has already pasted it. The document
 * lives at `/legal/terms` now; this keeps the old address working rather than
 * turning it into a 404.
 */
export default function TermsRedirect() {
  permanentRedirect('/legal/terms')
}
