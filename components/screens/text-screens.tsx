'use client'

/**
 * Text mode (P1).
 *
 * The screen a nervous person opens instead of their microphone, and the one
 * thing left to do when the day's voice reps are gone.
 *
 * What is deliberately NOT here, and why:
 *
 *   no meter      §05 keeps a live rep clean, and a number on a mode with no
 *                 scoring behind it would be a number that means nothing
 *   no clock      the three minutes are the voice rep's tension. Borrowing
 *                 them here would make the easier mode the more stressful one
 *   no score      it is a warm-up. The scorecard belongs to the graded rep
 *   no quota      nothing on this screen touches the counter
 *
 * What IS here, because the user asked for it: she remembers. The same one
 * line she carries into a voice rep (§08) is shown at the top, and Start fresh
 * clears the conversation with an explicit choice about whether it clears her
 * memory too.
 */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, RotateCcw, SendHorizontal } from 'lucide-react'
import { openThread, sendTextTurn, startFresh, type ThreadState } from '@/app/text/actions'
import { MAX_MESSAGE_CHARS, type TextTurn } from '@/lib/text/thread'
import { usePersona, useUserState } from '@/lib/data'
import { Button, Sheet, Skeleton, useToast } from '@/components/ui'
import { FluidPersona } from '@/components/fluid-persona'

export function TextRepScreen({ personaId }: { personaId: string }) {
  const { data: persona, loading: personaLoading } = usePersona(personaId)
  const { data: user } = useUserState()
  const toast = useToast()

  const [turns, setTurns] = useState<TextTurn[]>([])
  const [memory, setMemory] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [freshOpen, setFreshOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // `turns: null` means the server refused before it read the thread — a
  // message over the cap, the spend ceiling, a lost session. Replacing a live
  // conversation with an empty array on those paths would wipe the screen for
  // typing one character too many.
  const absorb = useCallback((state: ThreadState) => {
    if (state.turns !== null) setTurns(state.turns)
    setMemory(state.memory)
    setEnded(state.ended)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void openThread(personaId)
      .then((state) => { if (!cancelled) { absorb(state); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [absorb, personaId])

  // Follow the conversation down. `auto` rather than `smooth` on the first
  // paint of a long thread — animating twenty messages past somebody is a
  // page that looks broken before it looks finished.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: turns.length > 2 ? 'smooth' : 'auto' })
  }, [turns, sending])

  const send = () => {
    const text = draft.trim()
    if (!text || sending) return
    // Optimistic (§02 rule 8). His message is on screen before the round trip,
    // and the server's answer replaces the whole thread rather than merging
    // into it — the stored thread is the one she actually replied to.
    const before = turns
    setTurns([...before, { speaker: 'user', text, at: new Date().toISOString() }])
    setDraft('')
    setSending(true)
    void sendTextTurn({ personaSlug: personaId, text })
      .then((state) => {
        // A refusal the server took before reading the thread never saw this
        // message either, so the optimistic turn goes back — along with the
        // draft, because a message somebody has to retype is a message lost.
        if (state.turns === null) { setTurns(before); setDraft(text) }
        absorb(state)
        if (!state.ok && state.message) toast.push(state.message, 'red')
      })
      .catch(() => { setTurns(before); setDraft(text); toast.push('That did not send — you may be offline.', 'red') })
      .finally(() => { setSending(false); inputRef.current?.focus() })
  }

  const fresh = (forgetMemory: boolean) => {
    setClearing(true)
    void startFresh({ personaSlug: personaId, forgetMemory })
      .then((result) => {
        if (!result.ok) { toast.push(result.message ?? 'That did not clear.', 'red'); return }
        setTurns([])
        setEnded(false)
        if (forgetMemory) setMemory(null)
        setFreshOpen(false)
        toast.push(forgetMemory ? 'Cleared. She has forgotten it too.' : 'Cleared. She still remembers the last rep.', 'volt')
      })
      .catch(() => toast.push('That did not clear — you may be offline.', 'red'))
      .finally(() => setClearing(false))
  }

  if (personaLoading) {
    return <main className="text-rep"><div className="text-rep__thread"><Skeleton height={64} /><Skeleton height={120} /></div></main>
  }

  if (!persona) {
    return <main className="text-rep"><div className="text-rep__empty"><h1 className="display-lg">No such character</h1><p>That training partner is not available.</p><Link className="arena-button arena-button--primary" href="/roster">Back to the roster</Link></div></main>
  }

  const started = turns.length > 0

  return (
    <main className="text-rep">
      <header className="text-rep__top">
        <Link className="rep-back" href={`/roster/${personaId}`} aria-label="Back"><ChevronLeft size={24} strokeWidth={1.5} /></Link>
        <div className="text-rep__who">
          <FluidPersona name={persona.name} personaId={persona.id} warmth={22} size={34} />
          {/* The scene, and "typing" only while she actually is. A permanent
              status line that says typing is the same lie the live rep's
              "listening" dot used to tell (F-10). */}
          <span><strong>{persona.name}</strong><span className="label">{sending ? 'typing…' : persona.settingShort}</span></span>
        </div>
        {started ? <button type="button" className="text-rep__fresh label" onClick={() => setFreshOpen(true)}><RotateCcw size={13} strokeWidth={1.5} /> Start fresh</button> : <span />}
      </header>

      <div className="text-rep__thread">
        {memory ? (
          <div className="memory-line text-rep__memory">
            <span className="label">She remembers</span>
            <p>{memory}</p>
          </div>
        ) : null}

        {loading ? <><Skeleton height={54} /><Skeleton height={54} /></> : null}

        {!loading && !started ? (
          <div className="text-rep__opener">
            <p className="text-rep__scene">{persona.hook}</p>
            {/* No coaching, and no examples to copy. Saying the first thing is
                the skill being trained — handing over an opening line would be
                training the wrong one. */}
            <p className="muted">Say something. No timer, no score, and this one does not use a rep.</p>
          </div>
        ) : null}

        {turns.map((turn, index) => (
          <p key={`${turn.at}-${index}`} className={`text-bubble text-bubble--${turn.speaker}`}>{turn.text}</p>
        ))}

        {sending ? <p className="text-bubble text-bubble--persona text-bubble--typing" aria-live="polite">{persona.name} is typing<i /><i /><i /></p> : null}

        {ended ? (
          <div className="text-rep__ended">
            <span className="label">She has gone</span>
            <p>That is the scene over. Start fresh to run it again, or take it into a real rep.</p>
            <div className="text-rep__ended-actions">
              <Button size="sm" onClick={() => setFreshOpen(true)}>Start fresh</Button>
              {(user?.repsRemainingToday ?? 0) > 0
                ? <Link className="arena-button arena-button--ghost arena-button--sm" href={`/rep/${personaId}/brief`}>Run the voice rep</Link>
                : <Link className="arena-button arena-button--ghost arena-button--sm" href="/train">Back to training</Link>}
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        className="text-rep__compose"
        onSubmit={(event) => { event.preventDefault(); send() }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          maxLength={MAX_MESSAGE_CHARS}
          rows={1}
          disabled={ended}
          placeholder={ended ? 'She has gone.' : `Say something to ${persona.name}`}
          aria-label={`Message ${persona.name}`}
          onChange={(event) => setDraft(event.target.value)}
          // Enter sends, shift-enter breaks the line. This is a conversation,
          // not a document, and a send button somebody has to reach for is a
          // pause in the middle of the thing being practised.
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() }
          }}
        />
        <button type="submit" aria-label="Send" disabled={!draft.trim() || sending || ended}>
          <SendHorizontal size={18} strokeWidth={1.6} />
        </button>
      </form>

      <Sheet open={freshOpen} onClose={() => setFreshOpen(false)} title="Start fresh">
        <div className="sheet-stack">
          <p>This clears the conversation and starts the scene again from the top.</p>
          <p className="muted">
            Your reps, scores, streak and record are not touched — nothing you type here
            has ever reached them.
          </p>
          <Button fullWidth loading={clearing} onClick={() => fresh(false)}>
            Clear the conversation
          </Button>
          {/* The second, separate promise (§08). Offered here rather than
              assumed, because restarting a chat that went badly is not the
              same as asking her to forget the last rep. */}
          <Button variant="secondary" fullWidth disabled={clearing} onClick={() => fresh(true)}>
            {memory ? 'Clear it and make her forget me' : 'Clear it and forget everything'}
          </Button>
          <Button variant="ghost" fullWidth disabled={clearing} onClick={() => setFreshOpen(false)}>Keep it</Button>
        </div>
      </Sheet>
    </main>
  )
}
