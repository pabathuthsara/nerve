import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ maxWidth: 640 }}>
      <h1>Nerve — M0</h1>
      <p>
        The spike. One persona, no database, no design system. It exists to answer two
        questions before anything else gets built: does conversational latency hold from
        a Colombo home connection, and can a character stay cold for five minutes.
      </p>
      <p>
        <Link href="/rep">Run a rep against Nadia →</Link>
      </p>
    </main>
  )
}
