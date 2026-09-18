'use client'

/**
 * *What this is*, spoken — the landing page's ten seconds of voice.
 *
 * ── WHOSE VOICE THIS IS, AND WHY IT IS NOT A CHARACTER'S ─────────────────
 *
 * Rule 10 is the constraint that shaped this whole component: a persona's
 * words must be **captured from the real persona and never hand-written**,
 * because what she says IS the product and a written version of it would be
 * advertising our own prose. So the line here is authored, and therefore it
 * is read by a **house voice that is not on the roster** — not Maya, Nadia,
 * Robin or Cass. Nobody is pretending a character said this.
 *
 * That is also why the orb carries no `personaId`. `visualFor` would pick a
 * cast character's hue from its table and re-attach the sentence to a person,
 * which is the thing the paragraph above exists to prevent. It seeds off the
 * product's own name instead, so it reads as the product speaking.
 *
 * ── AND WHY IT SAYS WHAT IT SAYS ─────────────────────────────────────────
 *
 * `PAYMENTS-APPROVAL.md` §3: *"A human opens the site during onboarding. If
 * the landing page leads with getting her number, we are declined by every
 * provider on this list."* Creem already declined this account once, as a
 * category call, and Whop has no pre-approval gate — no rejection at the
 * door and no assurance either.
 *
 * So the line sells with **stakes and recognition**, never with intimacy.
 * There is no "talk to me", no invitation to a relationship with a character,
 * and nothing flirtatious. It borrows the page's own headline and lands the
 * scoring law, which is the one claim no competitor makes. Recorded as
 * `LAUNCH-GAP.md` D27.
 *
 * ── THE ORB MOVES ON THE REAL SIGNAL ─────────────────────────────────────
 *
 * `personaLevel` is driven from an `AnalyserNode` over the actual audio
 * rather than from a timer, for the same reason the rep's own avatar is: a
 * mouth that moves on a schedule reads as a loading animation, and one that
 * moves on amplitude reads as something speaking. It is the identical
 * component the live rep draws, so this is the product's own surface rather
 * than a picture of it.
 */

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { Sheet } from '@/components/ui'
import { FluidPersona } from '@/components/fluid-persona'
import { HOUSE_VISUAL } from '@/lib/site/house-visual'
import { capture } from '@/components/analytics'

/**
 * What he says, and it is authored here rather than in the audio alone.
 *
 * The caption has to match the recording word for word — a page whose
 * subtitle disagrees with its voice is the drift this repo keeps catching in
 * other places. Re-record and this string changes with it.
 */
export const INTRO_LINE
  = 'You know the conversation you keep not having. Have it here first. '
  + 'Three minutes, out loud, scored on how you handled it — never on whether it worked.'

const INTRO_AUDIO = '/hero/intro.mp3'

export function IntroModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [playing, setPlaying] = useState(false)
  const [level, setLevel] = useState(0)
  const [failed, setFailed] = useState(false)

  /**
   * The analyser is built on the first press, never on mount.
   *
   * An `AudioContext` created before a gesture starts suspended in every
   * browser that matters, and one created per render leaks them. This makes
   * exactly one, lazily, and only because somebody asked for sound.
   */
  const attach = useCallback(() => {
    const element = audioRef.current
    if (!element || contextRef.current) return
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const context = new Ctor()
      const source = context.createMediaElementSource(element)
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyser.connect(context.destination)
      contextRef.current = context
      analyserRef.current = analyser
    } catch {
      // No analyser is a still orb, never a broken player. The audio element
      // is untouched by this failing.
    }
  }, [])

  // Read amplitude while it plays. Stopped the moment it does not.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      setLevel(0)
      return
    }
    const buffer = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 128)
    const tick = () => {
      const analyser = analyserRef.current
      if (analyser) {
        analyser.getByteTimeDomainData(buffer)
        let peak = 0
        for (const sample of buffer) peak = Math.max(peak, Math.abs(sample - 128) / 128)
        setLevel(Math.min(1, peak * 1.8))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing])

  // Leaving the sheet stops the voice. A modal that keeps talking after it is
  // dismissed is the worst thing on this list.
  useEffect(() => {
    if (open) return
    const element = audioRef.current
    if (element) { element.pause(); element.currentTime = 0 }
    setPlaying(false)
  }, [open])

  useEffect(() => () => { void contextRef.current?.close() }, [])

  const toggle = useCallback(() => {
    const element = audioRef.current
    if (!element) return
    if (playing) { element.pause(); return }
    attach()
    void contextRef.current?.resume()
    element.play().then(
      () => capture('intro_played', {}),
      () => setFailed(true),
    )
  }, [attach, playing])

  return (
    <Sheet open={open} onClose={onClose} title="What this is">
      <div className="intro-modal">
        {/*
          The orb is the play control. That keeps Arena's one-volt rule intact
          — the CTA below is the screen's single accent — and it makes the
          thing you press the thing that reacts.
        */}
        <button
          type="button"
          className={`intro-modal__orb${playing ? ' is-playing' : ''}`}
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play the introduction'}
        >
          <FluidPersona
            name="Nerve"
            visual={HOUSE_VISUAL}
            warmth={playing ? 62 : 34}
            size={132}
            interactive
            speaking={playing ? 'persona' : 'none'}
            personaLevel={level}
          />
          <span className="intro-modal__badge" aria-hidden="true">
            {playing ? <Pause size={18} strokeWidth={1.75} /> : <Play size={18} strokeWidth={1.75} />}
          </span>
        </button>

        {/* The caption is not a nicety: it is how this works with the sound
            off, which is how most of a feed watches anything. */}
        <p className="intro-modal__line">{INTRO_LINE}</p>

        {failed ? <p className="auth-fine" role="alert">That would not play here. The words are above.</p> : null}

        <audio
          ref={audioRef}
          src={INTRO_AUDIO}
          preload="none"
          crossOrigin="anonymous"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
        />

        <Link
          href="/start"
          className="arena-button arena-button--primary arena-button--lg arena-button--full"
          onClick={() => capture('intro_cta', {})}
        >
          Start training free
        </Link>
        <p className="start-foot">Free · no card · your first rep is included</p>
      </div>
    </Sheet>
  )
}
