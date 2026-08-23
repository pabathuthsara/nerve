import Link from 'next/link'
import { MapPinOff } from 'lucide-react'

export default function NotFound() {
  return <main className="error-page"><MapPinOff size={36} strokeWidth={1.5} /><span className="wordmark">NERVE</span><h1 className="display-lg">Nothing here</h1><p>The route moved, or it never existed.</p><Link className="arena-button arena-button--primary" href="/train">Go home</Link></main>
}

