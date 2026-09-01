import Link from 'next/link'
import { MapPinOff } from 'lucide-react'

/**
 * `Go home` points at `/`, not at `/train`.
 *
 * `/train` is behind `enforceFrontendGuard`, so the old link handed every
 * signed-out visitor who mistyped a URL or followed a dead share link straight
 * to a password field — `LAUNCH-GAP.md` B1, still alive on the one route most
 * likely to catch a stale address. `/` answers for both audiences without
 * knowing which one is asking: it renders the landing page when signed out and
 * routes on to `/train` when signed in.
 */
export default function NotFound() {
  return <main className="error-page"><MapPinOff size={36} strokeWidth={1.5} /><span className="wordmark">NERVE</span><h1 className="display-lg">Nothing here</h1><p>The route moved, or it never existed.</p><Link className="arena-button arena-button--primary" href="/">Go home</Link></main>
}
