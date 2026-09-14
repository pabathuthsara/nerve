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
import { ChevronLeft, ChevronRight, RotateCcw, SendHorizontal } from 'lucide-react'
import {
  loadDebrief,
  loadInbox,
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
import { readableReasons, type Debrief } from '@/lib/texting/debrief'
import type { InboxRow, TextingPersonaView, ThreadDebrief } from '@/lib/texting/queries'
import { capture } from '@/components/analytics'
import { Button, EmptyState, Sheet, Skeleton, useToast } from '@/components/ui'
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

/**
 * THE CHROME IS NOT DRAWN HERE, and that is not a detail.
 *
 * The section shipped as three standalone files under `app/texting/`, which
 * put it outside the catch-all and outside the shell entirely: switching into
 * texting took the sidebar rail, the bottom tabs and the track switcher off the
 * screen — the product's whole navigation, on the one section a free account
 * can actually use, with no way back but the browser's own button.
 *
 * These screens are rendered by `RouteView` now, like every other section, and
 * the chrome is mounted once by the root layout (`ShellFrame`). The old
 * `/text/[personaId]` got away with having no shell because it was reached from
 * a dating screen and returned to one. A section HOME cannot: it is the place
 * the rail is pointing at.
 */
export function TextingInbox() {
  const [inbox, setInbox] = useState<{ rows: InboxRow[]; allowance: TextingAllowance } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void loadInbox()
      .then((result) => { if (!cancelled) { setInbox(result); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading || !inbox) {
    return (
      <div className="texting-home">
        <header className="screen-heading"><div><Skeleton width={200} height={38} /></div></header>
        <div className="texting-list-skeleton">
          {[0, 1, 2, 3].map((n) => <Skeleton key={n} height={78} />)}
        </div>
      </div>
    )
  }
  return <TextingInboxContent rows={inbox.rows} allowance={inbox.allowance} />
}

function TextingInboxContent({ rows, allowance }: { rows: InboxRow[]; allowance: TextingAllowance }) {
  const open = rows.filter((row) => row.state === 'open').length
  return (
    <div className="texting-home">
      <header className="screen-heading">
        <div>
          <h1 className="display-lg">Texting</h1>
          <p className="screen-heading__sub">
            {allowance.perDay === 1
              ? 'One conversation a day. Nothing here is scored.'
              : 'As many as you want. Nothing here is scored.'}
          </p>
        </div>
        <span className="texting-home__count label">
          {open > 0 ? `${open} open` : `${allowance.remaining} left today`}
        </span>
      </header>

      {!allowance.mayStart && open === 0 ? (
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
              <span className="texting-list__avatar">
                <FluidPersona name={row.persona.name} personaId={row.persona.slug} warmth={34} size={44} />
              </span>
              <span className="texting-list__body">
                <span className="texting-list__name">
                  <strong>{row.persona.name}</strong>
                  <span className="texting-list__when">
                    {row.lastMessage ? relative(row.lastMessage.at) : `Rung ${row.persona.level}`}
                  </span>
                </span>
                <span className="texting-list__preview">
                  {row.lastMessage
                    ? `${row.lastMessage.fromHer ? '' : 'You: '}${row.lastMessage.text}`
                    : row.persona.scene}
                </span>
                <span className={`texting-list__state label${row.yourTurn ? ' texting-list__state--turn' : ''}`}>
                  {openable ? stateLabel(row) : 'Opens tomorrow'}
                </span>
              </span>
              {openable ? <ChevronRight className="texting-list__chevron" size={16} strokeWidth={1.5} /> : null}
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
    </div>
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
export function TextingThreadScreen({ slug }: { slug: string }) {
  const toast = useToast()
  const [persona, setPersona] = useState<TextingPersonaView | null>(null)
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

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`
  }, [draft])

  const absorb = useCallback((state: ThreadState) => {
    if (state.turns !== null) setTurns(state.turns)
    setMemory(state.memory)
    setEnding(state.ending)
    setWarmth(state.warmth)
    if (state.allowance) setAllowance(state.allowance)
    if (state.persona) setPersona(state.persona)
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
          if (firstMessage) capture('texting_thread_started', { persona_id: slug, level: state.persona?.level ?? 0 })
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

  if (loading || !persona) {
    return (
      <div className="texting-thread">
        <div className="texting-thread__body">
          {/* Skeletons shaped like the arriving content, never a spinner (§02).
              Alternating sides, because that is what a thread looks like. */}
          <Skeleton height={44} width="62%" />
          <Skeleton height={44} width="48%" style={{ justifySelf: 'end' }} />
          <Skeleton height={44} width="70%" />
        </div>
      </div>
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
    <div className="texting-thread">
      <header className="texting-thread__top">
        <Link className="texting-thread__back" href="/texting" aria-label="Back to texting">
          <ChevronLeft size={20} strokeWidth={1.6} />
        </Link>
        <div className="texting-thread__who">
          <FluidPersona name={persona.name} personaId={persona.slug} warmth={warmth} size={36} />
          <span className="texting-thread__ident">
            <strong>{persona.name}</strong>
            {/* THE PRESENCE LINE. Never volt — it is status, not an action —
                and it disappears entirely once she has gone, because a frozen
                "Active 40m ago" on a finished thread reads as a bug. */}
            <span className={`texting-thread__presence label${typing ? ' texting-thread__presence--typing' : ''}`}>
              {presence ?? '\u00a0'}
            </span>
          </span>
        </div>
        {started ? (
          <button
            type="button"
            className="texting-thread__fresh"
            onClick={() => setFreshOpen(true)}
            aria-label={canRestart ? 'Start fresh' : 'End this conversation'}
          >
            <RotateCcw size={15} strokeWidth={1.6} />
          </button>
        ) : <span />}
      </header>

      {/* BOTTOM-ANCHORED ONCE THERE IS A CONVERSATION, CENTRED BEFORE THERE IS.
          `align-content: end` is right for a thread and wrong for an opener —
          it pushed the scene card onto the floor with an empty evening above
          it, which reads as a page that failed to load. */}
      <div className={`texting-thread__body${started ? '' : ' texting-thread__body--empty'}`}>
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
            {/* It DOES spend something now — one of the day's conversations —
                and the old line said the opposite. A screen that undersells the
                cost is the screen the refusal contradicts two taps later. */}
            <p className="muted">
              No timer and no score. Sending the first message opens one of today’s conversations.
            </p>
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
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
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
    </div>
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
export function TextingDebriefScreen({ slug }: { slug: string }) {
  const [result, setResult] = useState<ThreadDebrief | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void loadDebrief(slug)
      .then((found) => { if (!cancelled) { setResult(found); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return <div className="texting-debrief"><Skeleton height={38} width={220} /><Skeleton height={210} /><Skeleton height={260} /></div>
  }
  if (!result) {
    return (
      <div className="texting-debrief">
        <EmptyState
          mark="state-session"
          title="Nothing to look back on"
          description="You have not texted her yet, so there is no conversation to read."
          action={<Link className="arena-button arena-button--primary" href="/texting">Back to texting</Link>}
        />
      </div>
    )
  }
  return (
    <TextingDebriefContent
      persona={result.persona}
      debrief={result.debrief}
      open={result.open}
      ending={result.ending}
    />
  )
}

function TextingDebriefContent({
  persona, debrief, open, ending,
}: { persona: TextingPersonaView; debrief: Debrief; open: boolean; ending: TextingEnding | null }) {
  useEffect(() => {
    capture('texting_debrief_viewed', { persona_id: persona.slug, ending: ending ?? 'open' })
  }, [ending, persona.slug])

  return (
    <div className="texting-debrief">
      <header className="screen-heading">
        <div>
          <Link className="texting-debrief__back label" href={`/texting/${persona.slug}`}>
            <ChevronLeft size={14} strokeWidth={1.8} /> Back to the thread
          </Link>
          <h1 className="display-lg">{persona.name}</h1>
          <p className="screen-heading__sub">{debrief.ending}</p>
        </div>
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
            <dl className="texting-debrief__axis">
              <div><dt>Opened</dt><dd>{debrief.opened}</dd></div>
              <div><dt>Peak</dt><dd>{debrief.peak}</dd></div>
              <div><dt>{open ? 'Now' : 'At the end'}</dt><dd>{debrief.closed}</dd></div>
            </dl>
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
                      <span className="texting-movers__why">{readableReasons(mover.reasons)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="texting-debrief__foot">
        <p className="texting-debrief__note">
          Texting is not scored. Nothing here moves your record, your streak or your rank.
        </p>
        {/* The bridge. Texting practice pointing at spoken practice is what
            stops texting becoming the destination. */}
        <Link className="arena-button arena-button--primary" href="/field">Take one outside</Link>
      </div>
    </div>
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
  /**
   * SCALED TO THE DATA, NOT TO ZERO.
   *
   * It was `Math.min(..., 0)`, so a thread that ran between 43 and 50 was drawn
   * against a 0-50 axis: a flat line pinned to the top of an empty box, with
   * the shape — which is the entire point of the chart — invisible.
   *
   * A floor of ten points keeps a genuinely flat thread from being rendered as
   * dramatic noise, and the 12% padding stops the line touching either edge.
   */
  const values = points.map((point) => point.warmth)
  const high = Math.max(...values)
  const low = Math.min(...values)
  const range = high - low
  const span = Math.max(10, range)
  const pad = span * 0.12
  // CENTRED WHEN THE RANGE IS SMALLER THAN THE FLOOR. Without this the extra
  // headroom the floor adds all lands underneath, and a seven-point thread is
  // drawn in the top two thirds of the box with dead space below it.
  const slack = (span - range) / 2
  const top = high + slack + pad
  const scale = span + pad * 2
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      const y = ((top - point.warmth) / scale) * height
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
