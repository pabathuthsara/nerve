/**
 * THROWAWAY. Delete `app/texting/demo/` when the filming is done.
 *
 * The call sheet. Every scripted clip, with his lines, hers, the scorecard the
 * edit needs and the caption — so this screen is the one on the second monitor
 * and the clip page is the one being recorded.
 *
 * Nothing on the site links here.
 */

import Link from 'next/link'
import { DEMO_CLIPS } from './scripts'

export const metadata = { title: 'Demo call sheet' }

export default function DemoIndexPage() {
  return (
    <div className="texting-home">
      <header className="screen-heading">
        <div>
          <h1 className="display-lg">Call sheet</h1>
          <p className="screen-heading__sub">
            {DEMO_CLIPS.length} scripted clips. Nothing here calls a model, a database or a Server Action —
            no spend, and two takes are identical.
          </p>
        </div>
      </header>

      <div
        style={{
          border: '1px solid var(--line)', borderRadius: 2, padding: '14px 16px',
          margin: '0 0 20px', display: 'grid', gap: 8,
          fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-dim)',
        }}
      >
        <p style={{ margin: 0 }}>
          <strong style={{ color: 'var(--text)' }}>Type anything and press enter.</strong> The script advances on the
          send, not on what you typed, so a fluffed line still gets the right reply.
        </p>
        <p style={{ margin: 0 }}>
          <code>?auto=1</code> types his lines and sends them for you · <code>?tp=1</code> puts the next
          line bottom-left, out of a 1080×1920 crop · <code>?name=Cass</code> renames her ·
          <code> r</code> or the header button re-takes.
        </p>
      </div>

      <ul className="texting-list">
        {DEMO_CLIPS.map((clip) => (
          <li key={clip.id}>
            <Link className="texting-list__row" href={`/texting/demo/${clip.id}`} style={{ alignItems: 'start' }}>
              <span className="texting-list__body">
                <span className="texting-list__name">
                  <strong>{clip.id} · {clip.hook}</strong>
                  <span className="texting-list__when">{clip.seconds}s</span>
                </span>
                <span className="texting-list__preview" style={{ whiteSpace: 'normal', display: 'block' }}>
                  {clip.persona.name} · {clip.title}
                </span>
                <span
                  style={{
                    display: 'grid', gap: 3, margin: '8px 0 0',
                    fontFamily: 'var(--font-mono), monospace', fontSize: 11.5, lineHeight: 1.5,
                  }}
                >
                  {clip.lines.map((line, index) => (
                    <span key={index} style={{ color: line.from === 'her' ? 'var(--text-dim)' : 'var(--text-mute)' }}>
                      {line.from === 'her' ? 'her · ' : 'him · '}{line.text}
                    </span>
                  ))}
                </span>
                <span className="texting-list__state label" style={{ marginTop: 8 }}>
                  {clip.scores.join(' · ')} — “{clip.caption}”
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
