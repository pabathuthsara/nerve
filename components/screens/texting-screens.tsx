'use client'

/**
 * The texting section.
 *
 * What is deliberately NOT here, and why:
 *
 *   no meter      §05 keeps a live conversation clean, and a number on screen
 *                 would hand him the reading the whole section teaches
 *   no score      texting is never graded (§07, `lib/texting/debrief.ts`)
 *   no clock      the three minutes are the voice rep's tension. Borrowing them
 *                 would make the easier section the more stressful one
 *
 * What IS here and has no equivalent anywhere else in the product is the
 * PRESENCE layer: the line under her name, the read receipt, and the delay
 * before either moves. `lib/texting/presence.ts` is the argument; this file is
 * three timers and a receipt.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, RotateCcw, SendHorizontal } from 'lucide-react'
import {
  openThread,
  sendTextingTurn,
  startFresh,
  type ThreadState,
} from '@/app/texting/actions'
import { MAX_MESSAGE_CHARS, type TextingTurn } from '@/lib/texting/thread'
import { presenceLabel, presenceText } from '@/lib/texting/presence'
import { textingRefusal, type TextingAllowance } from '@/lib/texting/allowance'
import { TEXTING_MISSION, railVisible, textingCueRail } from '@/lib/texting/cues'
import type { TextingEnding } from '@/lib/texting/exit'
import type { Debrief } from '@/lib/texting/debrief'
import type { InboxRow, TextingPersonaView } from '@/lib/texting/queries'
import { capture } from '@/components/analytics'
import { Button, Sheet, Skeleton, useToast } from '@/components/ui'
import { FluidPersona } from '@/components/fluid-persona'
import { DistressModal } from '@/components/modals'

/* ------------------------------------------------------------------ *
 * The inbox
 * ------------------------------------------------------------------ */

/** A gap this size or larger gets its own time separator in the thread. */
const SEPARATOR_GAP_MS = 3 * 60_000

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

function relative(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return days === 1 ? '1 day' : `${days} days`
}

function stateLabel(row: InboxRow): string {
  if (row.state === null) return 'Not started'
  if (row.state !== 'open') {
    switch (row.ending) {
      case 'warm': return 'Ended · she left warmly'
      case 'faded': return 'Ended · she stopped replying'
      case 'dismissed': return 'Ended'
      default: return 'Ended'
    }
  }
  if (row.awaitingHer) return 'Open · she is replying'
  if (row.yourTurn) return 'Open · your turn'
  return 'Open'
}

export function TextingInbox({ rows, allowance }: { rows: InboxRow[]; allowance: TextingAllowance }) {
  return (
    <main className="texting-home">
      <header className="texting-home__top">
        <h1 className="display-lg">Texting</h1>
        <p className="muted">
          {allowance.perDay === 1
            ? 'One conversation a day. Nothing here is scored.'
            : 'Nothing here is scored. It is practice, and it keeps no record.'}
        </p>
      </header>

      {!allowance.mayStart ? (
        <div className="texting-gate">
          <span className="label">That’s today’s conversation</span>
          <p>{textingRefusal(allowance)}</p>
          {/* The one volt element on this screen when the allowance is spent.
              The refusal above never sells; the card around it does. */}
          <Link className="arena-button arena-button--primary arena-button--sm" href="/pricing">
            Unlimited texting on Pro
          </Link>
        </div>
      ) : null}

      <ul className="texting-list">
        {rows.map((row) => {
          const openable = row.state === 'open' || allowance.mayStart
          const body = (
            <>
              <FluidPersona name={row.persona.name} personaId={row.persona.slug} warmth={30} size={38} />
              <span className="texting-list__body">
                <span className="texting-list__name">
                  <strong>{row.persona.name}</strong>
                  {row.lastMessage ? (
                    <span className="texting-list__when">{relative(row.lastMessage.at)}</span>
                  ) : null}
                </span>
                <span className="texting-list__preview">
                  {row.lastMessage
                    ? `${row.lastMessage.fromHer ? '' : 'You: '}${row.lastMessage.text}`
                    : row.persona.scene}
                </span>
                <span className={`texting-list__state label${row.yourTurn ? ' texting-list__state--turn' : ''}`}>
                  {openable ? stateLabel(row) : 'Tomorrow'}
                </span>
              </span>
            </>
          )
          return (
            <li key={row.persona.slug}>
              {openable ? (
                <Link className="texting-list__row" href={`/texting/${row.persona.slug}`}>{body}</Link>
              ) : (
                <span className="texting-list__row texting-list__row--shut">{body}</span>
              )}
            </li>
          )
        })}
      </ul>
    </main>
  )
}

/* ------------------------------------------------------------------ *
 * The thread
 * ------------------------------------------------------------------ */

interface Pending {
  text: string
  revealAt: number
  seenAt: number
  typingAt: number
}

/**
 * THE PERSONA ARRIVES FROM THE SERVER, ALREADY NARROWED.
 *
 * `Persona` carries `contract` — the authored character prompt, which is the
 * product — and a client component that imported the roster would ship all four
 * of them to the browser. The same rule the token route follows: the contract is
 * compiled server-side from a slug and never travels. `TextingPersonaView` is
 * the four display fields and nothing else.
 */
export function TextingThreadScreen({ persona, slug }: { persona: TextingPersonaView; slug: string }) {
  const toast = useToast()
  const [turns, setTurns] = useState<TextingTurn[]>([])
  const [memory, setMemory] = useState<string | null>(null)
  const [ending, setEnding] = useState<TextingEnding | null>(null)
  const [warmth, setWarmth] = useState(30)
  const [distress, setDistress] = useState(false)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [freshOpen, setFreshOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [allowance, setAllowance] = useState<TextingAllowance | null>(null)

  /** Her withheld message and the three moments that describe it. */
  const [pending, setPending] = useState<Pending | null>(null)
  /** Ticks so the receipt and the indicator re-render as their moments pass. */
  const [, setTick] = useState(0)

  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const absorb = useCallback((state: ThreadState) => {
    if (state.turns !== null) setTurns(state.turns)
    setMemory(state.memory)
    setEnding(state.ending)
    setWarmth(state.warmth)
    if (state.allowance) setAllowance(state.allowance)
    if (state.distress) setDistress(true)

    if (state.pending) {
      const revealAt = Date.parse(state.pending.revealAt)
      const sentAt = state.presence ? revealAt - 0 : revealAt
      // `presence` carries the offsets from HIS message; on a cold reload there
      // are none, so the receipt is simply already shown and only the reveal is
      // still ahead. That is honest: he has been waiting, and he knows it.
      setPending({
        text: state.pending.text,
        revealAt,
        seenAt: state.presence ? Date.now() + state.presence.seenAfterMs : sentAt - 1,
        typingAt: state.presence ? Date.now() + state.presence.typingAfterMs : Date.now(),
      })
    } else {
      setPending(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void openThread(slug)
      .then((state) => { if (!cancelled) { absorb(state); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [absorb, slug])

  /**
   * The three moments.
   *
   * One interval rather than three timeouts, because a timeout per moment is
   * three things to clear on every re-render and the failure mode is a stale
   * indicator that never goes away. 250ms is well inside the shortest schedule
   * (`INVESTED` reads at 400ms) and costs nothing.
   */
  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(() => {
      setTick((n) => n + 1)
      if (Date.now() >= pending.revealAt) {
        setTurns((current) => [
          ...current,
          { speaker: 'persona', text: pending.text, at: new Date(pending.revealAt).toISOString() },
        ])
        setPending(null)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [pending])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: turns.length > 2 ? 'smooth' : 'auto' })
  }, [turns, pending])

  const now = Date.now()
  const typing = pending !== null && now >= pending.typingAt
  const seen = pending === null || now >= pending.seenAt

  const herLastAt = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i]?.speaker === 'persona') return Date.parse(turns[i]!.at)
    }
    return null
  }, [turns])

  const gone = ending !== null
  const label = presenceLabel({
    ended: gone,
    typing,
    warmth,
    sinceHerLastMs: herLastAt === null ? null : now - herLastAt,
  })
  const presence = presenceText(label)

  const send = () => {
    const text = draft.trim()
    if (!text || gone) return
    // Optimistic (§02). His message is on screen before the round trip, and the
    // server's answer replaces the whole thread rather than merging into it —
    // the stored thread is the one she actually replied to.
    const before = turns
    setTurns([...before, { speaker: 'user', text, at: new Date().toISOString() }])
    setDraft('')
    // HE MAY SEND AGAIN WHILE SHE IS QUIET. The pending reply is dropped
    // server-side and everything he said is folded into one answer, which is
    // what a person does. Double-texting into silence is the behaviour being
    // trained, so it is never prevented — it is scored.
    setPending(null)
    const firstMessage = before.length === 0
    void sendTextingTurn({ personaSlug: slug, text })
      .then((state) => {
        if (state.turns === null) { setTurns(before); setDraft(text) }
        absorb(state)
        if (!state.ok && state.message) toast.push(state.message, 'red')

        // B7's funnel, for the section D21 could not see at all. None of these
        // carries a message — `safeProps` refuses anything that is not an id,
        // an enum, a number or a boolean.
        if (state.ok) {
          if (firstMessage) capture('texting_thread_started', { persona_id: slug, level: persona.level })
          const sent = (state.turns ?? []).filter((turn) => turn.speaker === 'user').length
          capture('texting_message_sent', { persona_id: slug, messages: sent })
          if (state.ending) {
            capture('texting_thread_ended', {
              persona_id: slug,
              ending: state.ending,
              exchanges: sent,
            })
          }
        } else if (state.allowance && !state.allowance.mayStart) {
          capture('texting_allowance_reached', { per_day: state.allowance.perDay })
        }
      })
      .catch(() => { setTurns(before); setDraft(text); toast.push('That did not send — you may be offline.', 'red') })
      // NO `sending` FLAG, DELIBERATELY. A disabled compose box while a
      // request is in flight would stop him double-texting, and double-texting
      // into silence is the behaviour this section teaches him to notice. The
      // server folds whatever arrives into one reply.
      .finally(() => { inputRef.current?.focus() })
  }

  const fresh = (forgetMemory: boolean) => {
    setClearing(true)
    void startFresh({ personaSlug: slug, forgetMemory })
      .then((result) => {
        if (!result.ok) { toast.push(result.message ?? 'That did not clear.', 'red'); return }
        setTurns([]); setEnding(null); setPending(null)
        if (forgetMemory) setMemory(null)
        setFreshOpen(false)
        toast.push(forgetMemory ? 'Cleared. She has forgotten it too.' : 'Cleared. She still remembers.', 'volt')
      })
      .catch(() => toast.push('That did not clear — you may be offline.', 'red'))
      .finally(() => setClearing(false))
  }

  if (loading) {
    return (
      <main className="texting-thread">
        <div className="texting-thread__body"><Skeleton height={54} /><Skeleton height={54} /><Skeleton height={54} /></div>
      </main>
    )
  }

  const started = turns.length > 0
  /**
   * Whether ending this one can be followed by starting another today.
   *
   * A LIVE thread has already spent an allowance — the count is over
   * `started_at`, so the open row is one of today's. On free that means
   * restarting is not possible until tomorrow, and the sheet says so rather
   * than offering a button the Server Action will refuse.
   */
  const canRestart = allowance === null || allowance.remaining > 0 || !started
  const lastUserIndex = turns.reduce((found, turn, index) => (turn.speaker === 'user' ? index : found), -1)

  return (
    <main className="texting-thread">
      <header className="texting-thread__top">
        <Link className="rep-back" href="/texting" aria-label="Back"><ChevronLeft size={24} strokeWidth={1.5} /></Link>
        <div className="texting-thread__who">
          <FluidPersona name={persona.name} personaId={persona.slug} warmth={warmth} size={34} />
          <span>
            <strong>{persona.name}</strong>
            {/* THE PRESENCE LINE. Never volt — it is status, not an action —
                and it disappears entirely once she has gone, because a frozen
                "Active 40m ago" on a finished thread reads as a bug. */}
            {presence ? <span className="label texting-thread__presence">{presence}</span> : null}
          </span>
        </div>
        {started ? (
          <button type="button" className="texting-thread__fresh label" onClick={() => setFreshOpen(true)}>
            <RotateCcw size={13} strokeWidth={1.5} /> Start fresh
          </button>
        ) : <span />}
      </header>

      <div className="texting-thread__body">
        {memory ? (
          <div className="memory-line texting-thread__memory">
            <span className="label">She remembers</span>
            <p>{memory}</p>
          </div>
        ) : null}

        {!started ? (
          <div className="texting-thread__opener">
            <p className="texting-thread__scene">{persona.premise}</p>
            <p className="texting-thread__scene muted">{persona.scene}</p>
            {/* No coaching and no examples to copy. Sending the first message
                is the skill being trained; handing over an opening line would
                be training the wrong one. */}
            <p className="muted">Text her. No timer, no score, and this one does not use a rep.</p>
          </div>
        ) : null}

        {turns.map((turn, index) => {
          const previous = turns[index - 1]
          const gap = previous ? Date.parse(turn.at) - Date.parse(previous.at) : 0
          return (
            <div key={`${turn.at}-${index}`} className="texting-turn">
              {gap >= SEPARATOR_GAP_MS ? (
                <p className="texting-thread__when"><span>{clockTime(turn.at)}</span></p>
              ) : null}
              <p className={`text-bubble text-bubble--${turn.speaker}`}>{turn.text}</p>
              {/* THE RECEIPT, under the last of his messages only.
                  `Delivered`  she has not looked at her phone — cooling.
                  `Seen 11:04` then a reply — normal.
                  `Seen 11:04` then nothing, ever — left on read. */}
              {index === lastUserIndex ? (
                <p className="texting-receipt">
                  {gone && ending !== 'warm'
                    ? `Seen ${clockTime(turn.at)}`
                    : seen && (pending !== null || turns.length > index + 1)
                      ? `Seen ${clockTime(turn.at)}`
                      : 'Delivered'}
                </p>
              ) : null}
            </div>
          )
        })}

        {typing ? (
          <p className="text-bubble text-bubble--persona text-bubble--typing" aria-live="polite">
            {persona.name} is typing<i /><i /><i />
          </p>
        ) : null}

        {gone && !distress ? <EndingCard slug={slug} ending={ending} onFresh={() => setFreshOpen(true)} /> : null}

        <div ref={endRef} />
      </div>

      {/* Directions, never lines. The opener above still offers nothing at all,
          because sending the first message is the skill being trained; this
          appears only once a conversation exists. */}
      {railVisible(started, gone) ? (
        <div className="cue-rail" aria-label={`Attention cues for ${TEXTING_MISSION.target}`}>
          <span className="cue-rail__label label">{TEXTING_MISSION.target}</span>
          {textingCueRail(turns.filter((turn) => turn.speaker === 'user').length).map((cue) => (
            <span
              key={cue.text}
              className={`cue-chip${cue.done ? ' cue-chip--done' : ''}`}
              aria-current={cue.active ? 'step' : undefined}
            >
              {cue.text}
            </span>
          ))}
        </div>
      ) : null}

      <form className="texting-compose" onSubmit={(event) => { event.preventDefault(); send() }}>
        <textarea
          ref={inputRef}
          value={draft}
          maxLength={MAX_MESSAGE_CHARS}
          rows={1}
          disabled={gone}
          placeholder={gone ? 'She has gone.' : `Message ${persona.name}`}
          aria-label={`Message ${persona.name}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() }
          }}
        />
        <button type="submit" aria-label="Send" disabled={!draft.trim() || gone}>
          <SendHorizontal size={18} strokeWidth={1.6} />
        </button>
      </form>

      {/* THE SHEET KNOWS WHETHER A NEW ONE CAN ACTUALLY BE STARTED.
          An open thread has already spent today's allowance, so on free the
          honest answer is "this ends it, and the next one is tomorrow" — and a
          button reading "Start a new one" that is then refused by the action is
          the screen making a promise the server will not keep. */}
      <Sheet
        open={freshOpen}
        onClose={() => setFreshOpen(false)}
        title={canRestart ? 'Start fresh' : 'End this conversation'}
      >
        <div className="sheet-stack">
          <p>
            {canRestart
              ? 'This ends the conversation and starts a new one from the top.'
              : 'This ends the conversation. You have used today’s, so the next one opens tomorrow.'}
          </p>
          <p className="muted">
            Your reps, scores, streak and record are not touched — nothing you type here has
            ever reached them.
          </p>
          <Button fullWidth loading={clearing} onClick={() => fresh(false)}>
            {canRestart ? 'Start a new one' : 'End it'}
          </Button>
          <Button variant="secondary" fullWidth disabled={clearing} onClick={() => fresh(true)}>
            {memory ? 'End it and make her forget me' : 'End it and forget everything'}
          </Button>
          <Button variant="ghost" fullWidth disabled={clearing} onClick={() => setFreshOpen(false)}>Keep it</Button>
        </div>
      </Sheet>

      <DistressModal open={distress} onClose={() => { window.location.href = '/texting' }} />
    </main>
  )
}

/**
 * The two endings.
 *
 * An INLINE CARD and never a modal: §05's objection is to interruption, and a
 * popup over a conversation somebody has just had is the most interruptive
 * thing on offer.
 *
 * **Neither one is a verdict.** No "won", no "lost", no red on the cold card —
 * red is semantic and this is not an error. §07 says outcome is worth zero, so
 * what the card reports is what happened, and the debrief behind it reports
 * what he did.
 */
function EndingCard({
  slug, ending, onFresh,
}: { slug: string; ending: TextingEnding | null; onFresh: () => void }) {
  const warm = ending === 'warm'
  return (
    <div className="texting-ending">
      <span className="label">{warm ? 'She’s gone for now' : 'She stopped replying'}</span>
      <p>
        {warm
          ? 'She ended it herself, and left the door open.'
          : 'She read your last message and did not answer it.'}
      </p>
      <div className="texting-ending__actions">
        <Link className="arena-button arena-button--secondary arena-button--sm" href={`/texting/${slug}/debrief`}>
          See what happened
        </Link>
        <Button size="sm" variant="ghost" onClick={onFresh}>Start fresh</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The debrief
 * ------------------------------------------------------------------ */

/**
 * What happened, after she has gone.
 *
 * A DEBRIEF AND NOT A SCORECARD. No composite, no grade, no streak, no rank —
 * `lib/texting/debrief.ts` carries the argument, and the line at the bottom of
 * this screen says so out loud, because a page full of numbers that insists it
 * is not a score is not believed.
 *
 * Her interest line is the one volt element here.
 */
export function TextingDebriefScreen({
  persona, debrief, open, ending,
}: { persona: TextingPersonaView; debrief: Debrief; open: boolean; ending: TextingEnding | null }) {
  useEffect(() => {
    capture('texting_debrief_viewed', { persona_id: persona.slug, ending: ending ?? 'open' })
  }, [ending, persona.slug])

  return (
    <main className="texting-debrief">
      <header className="texting-debrief__top">
        <Link className="rep-back" href={`/texting/${persona.slug}`} aria-label="Back">
          <ChevronLeft size={24} strokeWidth={1.5} />
        </Link>
        <h1 className="display-md">{persona.name}</h1>
      </header>

      {debrief.thin ? (
        <p className="muted texting-debrief__thin">
          {open
            ? 'This one is still going. There will be something here when it finishes.'
            : 'Not enough of a conversation to look back on.'}
        </p>
      ) : (
        <>
          <section className="texting-debrief__block">
            <span className="label">Her interest</span>
            <InterestCurve points={debrief.curve} />
            <p className="texting-debrief__axis">
              <span>opened {debrief.opened}</span>
              <span>peak {debrief.peak}</span>
              <span>{open ? 'now' : 'she left'} {debrief.closed}</span>
            </p>
          </section>

          <section className="texting-debrief__block">
            <span className="label">What moved it</span>
            {debrief.movers.length === 0 ? (
              <p className="muted">Nothing moved her much either way.</p>
            ) : (
              <ul className="texting-movers">
                {debrief.movers.map((mover) => (
                  <li key={`${mover.exchange}-${mover.delta}`}>
                    <span className={`texting-movers__delta${mover.delta < 0 ? ' texting-movers__delta--down' : ''}`}>
                      {mover.delta > 0 ? '+' : ''}{mover.delta.toFixed(1)}
                    </span>
                    <span className="texting-movers__body">
                      <span className="texting-movers__text">{mover.text}</span>
                      <span className="texting-movers__why">{mover.reasons.join(' · ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="texting-debrief__block">
        <span className="label">How it ended</span>
        <p>{debrief.ending}</p>
      </section>

      <p className="texting-debrief__note muted">
        Texting is not scored. Nothing here moves your record, your streak or your rank.
      </p>

      {/* The bridge. Texting practice pointing at spoken practice is what stops
          texting becoming the destination. */}
      <Link className="arena-button arena-button--primary" href="/field">Take one outside</Link>
    </main>
  )
}

/**
 * Her interest across the thread.
 *
 * One series, in volt, which is the single volt element on this screen. A
 * second series would be Cool and there is deliberately not one: what he gave
 * her is already the subject of the list underneath.
 */
function InterestCurve({ points }: { points: Debrief['curve'] }) {
  if (points.length < 2) return null
  const width = 320
  const height = 96
  const max = Math.max(...points.map((p) => p.warmth), 10)
  const min = Math.min(...points.map((p) => p.warmth), 0)
  const span = Math.max(1, max - min)
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      const y = height - ((point.warmth - min) / span) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      className="texting-curve"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Her interest across ${points.length} exchanges, from ${points[0]!.warmth} to ${points.at(-1)!.warmth}`}
    >
      <path d={path} fill="none" stroke="var(--volt)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
