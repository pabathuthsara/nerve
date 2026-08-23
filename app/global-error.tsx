'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return <html lang="en"><body><main className="error-page"><h1 className="display-lg">Something broke</h1><button className="arena-button arena-button--primary" onClick={reset}>Try again</button></main></body></html>
}
