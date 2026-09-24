'use client'

/**
 * THROWAWAY. Delete `app/texting/demo/` when the filming is done.
 *
 * The texting thread, rendered from a hard-coded script instead of from the
 * server. Every class name below is copied from `texting-screens.tsx`, so the
 * CSS in `globals.css` draws it identically — same header, same bubbles, same
 * receipts, same typing indicator, same cue rail, same compose box.
 *
 * What is REAL, not faked:
 *   `scheduleFor`   her read delay, typing lead and typing duration come from
 *                   `lib/texting/presence.ts`, so the pauses on camera are the
 *                   pauses a customer gets
 *   `presenceText`  the line under her name
 *   `textingCueRail`  the rail, advanced off his message count
 *   `FluidPersona`  her avatar, at the warmth the script says she is at
 *
 * What is faked: her words, and only her words.
 *
 * Nothing here imports `app/texting/actions` — no Server Action, no database
 * row, no model call, no spend. A take costs nothing and two takes are
 * identical.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, RotateCcw, SendHorizontal } from 'lucide-react'
import { FluidPersona } from '@/components/fluid-persona'
import { presenceLabel, presenceText, scheduleFor } from '@/lib/texting/presence'
import { TEXTING_MISSION, railVisible, textingCueRail } from '@/lib/texting/cues'
import { MAX_MESSAGE_CHARS, type TextingTurn } from '@/lib/texting/thread'
import type { TextingEnding } from '@/lib/texting/exit'
import type { DemoClip } from './scripts'

/** Copied from `texting-screens.tsx`. */
const SEPARATOR_GAP_MS = 3 * 60_000

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

interface Pending {
  text: string
  warmth: number
  seenAt: number
  typingAt: number
  revealAt: number
}

/** How long after her last line the ending card drops. */
const ENDING_BEAT_MS = 1_400
/** A beat before a clip that she opens, so the take does not start mid-air. */
const HER_OPENER_LEAD_MS = 900
/** Auto mode's typing speed, per character, plus the pause before sending. */
const AUTO_KEYSTROKE_MS = 52
const AUTO_SEND_PAUSE_MS = 420

export function DemoThread({
  clip,
  auto,
  teleprompter,
  nameOverride,
}: {
  clip: DemoClip
  auto: boolean
  teleprompter: boolean
  nameOverride: string | null
}) {
  /** Bumped by the reset button. Re-arms every effect for a fresh take. */
  const [take, setTake] = useState(0)

  const [turns, setTurns] = useState<TextingTurn[]>([])
  const [cursor, setCursor] = useState(0)
  const [pending, setPending] = useState<Pending | null>(null)
  const [warmth, setWarmth] = useState(clip.warmth)
  const [ending, setEnding] = useState<TextingEnding | null>(null)
  const [draft, setDraft] = useState('')
  const [, setTick] = useState(0)

  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  /** Guards against an effect scheduling the same line twice. */
  const armedRef = useRef<string>('')

  const persona = useMemo(
    () => ({ ...clip.persona, name: nameOverride?.trim() || clip.persona.name }),
    [clip.persona, nameOverride],
  )

  const reset = useCallback(() => {
    armedRef.current = ''
    setTurns([])
    setCursor(0)
    setPending(null)
    setWarmth(clip.warmth)
    setEnding(null)
    setDraft('')
    setTake((n) => n + 1)
  }, [clip.warmth])

  /* -------------------------------------------------------------- *
   * Her turn: schedule it, using the product's own presence timing.
   * -------------------------------------------------------------- */
  useEffect(() => {
    if (ending) return
    const key = `${take}:${cursor}`
    if (armedRef.current === key) return

    const line = clip.lines[cursor]

    // Script spent. Drop the ending card after a beat, if this clip has one.
    if (!line) {
      if (!clip.ending || turns.length === 0) return
      armedRef.current = key
      const id = window.setTimeout(() => setEnding(clip.ending), ENDING_BEAT_MS)
      return () => window.clearTimeout(id)
    }

    // His turn. The compose box waits for him (or for auto mode, below).
    if (line.from === 'him') return

    armedRef.current = key
    const schedule = scheduleFor({
      warmth,
      replyText: line.text,
      seed: `${clip.id}:${cursor}:${take}`,
    })
    const now = Date.now()

    /**
     * A CLIP SHE OPENS DROPS THE READ DELAY, and keeps everything else.
     *
     * `scheduleFor` spends its first stretch on how long she takes to LOOK at
     * her phone, which is measured from his message — and on these clips there
     * is no message of his to measure from. Left in, clip 11 opened on fifteen
     * seconds of an empty thread, which is most of a fourteen-second cut.
     *
     * Her typing duration is untouched, so the line still takes as long to
     * write as the real one would.
     */
    if (cursor === 0) {
      const typingMs = schedule.revealAfterMs - schedule.typingAfterMs
      setPending({
        text: line.text,
        warmth: line.warmth ?? warmth,
        seenAt: now,
        typingAt: now + HER_OPENER_LEAD_MS,
        revealAt: now + HER_OPENER_LEAD_MS + typingMs,
      })
      return
    }

    setPending({
      text: line.text,
      warmth: line.warmth ?? warmth,
      seenAt: now + schedule.seenAfterMs,
      typingAt: now + schedule.typingAfterMs,
      revealAt: now + schedule.revealAfterMs,
    })
  }, [clip, cursor, ending, take, turns.length, warmth])

  /* -------------------------------------------------------------- *
   * The three moments. One interval, exactly as the real screen does it.
   * -------------------------------------------------------------- */
  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(() => {
      setTick((n) => n + 1)
      if (Date.now() >= pending.revealAt) {
        setTurns((current) => [
          ...current,
          { speaker: 'persona', text: pending.text, at: new Date(pending.revealAt).toISOString() },
        ])
        setWarmth(pending.warmth)
        setPending(null)
        setCursor((n) => n + 1)
      }
    }, 120)
    return () => window.clearInterval(id)
  }, [pending])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: turns.length > 2 ? 'smooth' : 'auto' })
  }, [turns, pending, ending])

  /**
   * THE AUTO-GROW, PLUS THE ONE LINE THAT KILLS THE SCROLLBAR.
   *
   * The real screen does `height = min(scrollHeight, 180)` and nothing else.
   * The textarea is `box-sizing: border-box` with a 1px border, so a height of
   * `scrollHeight` leaves a CONTENT box two pixels shorter than the content it
   * was measured from: an empty single line needs 41.75px and gets 40px, so
   * `scrollHeight` (42) stays above `clientHeight` (40) and the box overflows
   * from the moment it renders. On macOS's overlay scrollbars that is
   * invisible; with "Show scroll bars: Always" it is a permanent grey bar
   * beside the placeholder, and it would be in frame.
   *
   * GROWING THE BOX BY THE BORDER WAS THE WRONG FIX — it makes the textarea
   * 44px against a 42px send button, and the two stop lining up. Nothing is
   * actually clipped at 40px (the glyphs are ~15px inside a 21.75px line box),
   * so the honest answer is that there is nothing to scroll to: `hidden` until
   * the content genuinely passes the 140px `max-height`, `auto` after that.
   * Geometry identical to the real screen, minus the bar.
   *
   * The unfixed two lines are still live in `texting-screens.tsx`.
   */
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    const wanted = input.scrollHeight
    input.style.height = `${Math.min(wanted, 140)}px`
    input.style.overflowY = wanted > 140 ? 'auto' : 'hidden'
  }, [draft])

  /**
   * NOTHING IN HERE MAY READ `draft`, and the reason is the whole of why auto
   * mode did not work the first time.
   *
   * With `draft` in the dependency list this callback got a new identity on
   * every keystroke, which re-ran the auto-typing effect, which cleaned up its
   * own interval and started again from character one. It typed "h", forever.
   * The text is always passed in.
   */
  const send = useCallback((raw: string) => {
    const text = raw.trim()
    if (!text || ending) return
    setTurns((current) => [...current, { speaker: 'user', text, at: new Date().toISOString() }])
    setDraft('')
    // The script advances on the SEND, never on what was typed. A fluffed line
    // still gets the right reply, which is what keeps a take usable.
    setCursor((n) => (clip.lines[n]?.from === 'him' ? n + 1 : n))
  }, [clip.lines, ending])

  /**
   * `r` re-takes, so a fluffed take is restarted without reaching for the
   * mouse and putting a cursor through the frame. Ignored while the compose
   * box has focus, for the obvious reason.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'r' && event.key !== 'R') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target === inputRef.current) return
      event.preventDefault()
      reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reset])

  /* -------------------------------------------------------------- *
   * Auto mode: types his line out and sends it. Hands off the keyboard.
   * -------------------------------------------------------------- */
  useEffect(() => {
    if (!auto || ending || pending) return
    const line = clip.lines[cursor]
    if (!line || line.from !== 'him') return

    let index = 0
    let sendId = 0
    const typeId = window.setInterval(() => {
      index += 1
      setDraft(line.text.slice(0, index))
      if (index >= line.text.length) {
        window.clearInterval(typeId)
        sendId = window.setTimeout(() => send(line.text), AUTO_SEND_PAUSE_MS)
      }
    }, AUTO_KEYSTROKE_MS)

    return () => { window.clearInterval(typeId); window.clearTimeout(sendId) }
  }, [auto, clip.lines, cursor, ending, pending, send])

  const now = Date.now()
  const typing = pending !== null && now >= pending.typingAt
  const seen = pending === null || now >= pending.seenAt
  const gone = ending !== null

  const herLastAt = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i]?.speaker === 'persona') return Date.parse(turns[i]!.at)
    }
    return null
  }, [turns])

  const presence = presenceText(presenceLabel({
    ended: gone,
    typing,
    warmth,
    sinceHerLastMs: herLastAt === null ? null : now - herLastAt,
  }))

  const started = turns.length > 0
  const lastUserIndex = turns.reduce((found, turn, index) => (turn.speaker === 'user' ? index : found), -1)
  const nextHisLine = clip.lines[cursor]?.from === 'him' ? clip.lines[cursor]!.text : null

  return (
    <>
      {teleprompter ? (
        <p
          style={{
            position: 'fixed', left: 12, bottom: 10, zIndex: 60, margin: 0,
            maxWidth: 'min(92vw, 560px)', padding: '5px 9px', pointerEvents: 'none',
            fontFamily: 'var(--font-mono), monospace', fontSize: 11, lineHeight: 1.45,
            color: '#6A7062', background: 'rgba(11,12,10,.88)', border: '1px solid #242820',
          }}
        >
          {nextHisLine ? `NEXT › ${nextHisLine}` : gone ? 'DONE · press R to re-take' : 'HER TURN'}
        </p>
      ) : null}

      <div className="texting-thread">
        <header className="texting-thread__top">
          <Link className="texting-thread__back" href="/texting/demo" aria-label="Back to the demo index">
            <ChevronLeft size={20} strokeWidth={1.6} />
          </Link>
          <div className="texting-thread__who">
            <FluidPersona name={persona.name} personaId={persona.slug} warmth={warmth} size={36} />
            <span className="texting-thread__ident">
              <strong>{persona.name}</strong>
              <span className={`texting-thread__presence label${typing ? ' texting-thread__presence--typing' : ''}`}>
                {presence ?? ' '}
              </span>
            </span>
          </div>
          {started ? (
            <button
              type="button"
              className="texting-thread__fresh"
              onClick={reset}
              aria-label="Re-take"
            >
              <RotateCcw size={15} strokeWidth={1.6} />
            </button>
          ) : <span />}
        </header>

        <div className={`texting-thread__body${started ? '' : ' texting-thread__body--empty'}`}>
          {!started && !pending ? (
            <div className="texting-thread__opener">
              <p className="texting-thread__scene">{clip.premise}</p>
              <p className="texting-thread__scene muted">{clip.scene}</p>
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

          {gone ? <DemoEndingCard ending={ending} onFresh={reset} /> : null}

          <div ref={endRef} />
        </div>

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

        <form className="texting-compose" onSubmit={(event) => { event.preventDefault(); send(draft) }}>
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
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send(draft)
              }
            }}
          />
          <button type="submit" aria-label="Send" disabled={!draft.trim() || gone}>
            <SendHorizontal size={18} strokeWidth={1.6} />
          </button>
        </form>
      </div>
    </>
  )
}

/** Copied from `texting-screens.tsx`, with the debrief link dropped. */
function DemoEndingCard({ ending, onFresh }: { ending: TextingEnding | null; onFresh: () => void }) {
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
        <button type="button" className="arena-button arena-button--secondary arena-button--sm" onClick={onFresh}>
          Re-take
        </button>
      </div>
    </div>
  )
}
