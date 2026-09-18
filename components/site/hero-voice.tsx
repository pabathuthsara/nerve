'use client'

/**
 * The hero's right-hand column: the avatar, and ten seconds of voice on a loop.
 *
 * ── WHOSE VOICE, AND WHY THE ORB IS NOBODY ───────────────────────────────
 *
 * Rule 10: a persona's words are **captured from the real persona and never
 * hand-written**, because what she says IS the product. The line here is
 * authored, so it is read by a house voice that is not on the roster — and
 * the orb carries no `personaId` for the same reason. `visualFor` would hash
 * the name onto a cast character's hue and re-attach an authored sentence to
 * a person; `HOUSE_VISUAL` is the product's own colour instead.
 *
 * ── AND WHY IT DOES NOT PROPOSITION ANYBODY ──────────────────────────────
 *
 * `PAYMENTS-APPROVAL.md` §3: a human opens this page during onboarding, and
 * Creem already declined this account once as an AI-companion product. So the
 * line sells with recognition and stakes rather than intimacy, and the figure
 * on the page is a shape rather than a person. `LAUNCH-GAP.md` D27.
 *
 * ── THE RULES OF THE CONTROL ─────────────────────────────────────────────
 *
 * **Nothing is drawn on top of the orb.** It is the only moving thing on the
 * landing page and the one asset that proves the software runs, so the
 * controls sit beneath it rather than over it — an overlaid play triangle
 * would hide the middle of the thing it is advertising.
 *
 * **It plays once, and it starts silent.** Browsers refuse audible autoplay
 * without a gesture, and a page that talks at somebody unprompted is worse
 * than one that does not. The orb animates from the moment it mounts, so the
 * page is alive before anything is pressed; the press adds sound.
 *
 * It used to loop. Ten seconds on repeat is a page that will not stop talking
 * to somebody who has moved on to reading, and the second and third passes
 * are heard by nobody who wanted them. It ends, and offers itself again.
 *
 * **The caption is not decoration.** It is how this works muted, which is how
 * most of a feed watches anything, and it is the screen-reader path — the orb
 * is `aria-hidden` because a WebGL canvas has nothing to announce.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { FluidPersona } from '@/components/fluid-persona'
import { HOUSE_VISUAL } from '@/lib/site/house-visual'
import { capture } from '@/components/analytics'

/**
 * What he says, authored here rather than only in the recording.
 *
 * The caption has to match the audio word for word — a page whose subtitle
 * disagrees with its own voice is the drift this repo keeps finding
 * elsewhere. Re-record and this string changes with it.
 */
export const INTRO_LINE
  = 'You know the conversation you keep not having. Have it here first. '
  + 'Three minutes, out loud, scored on how you handled it — never on whether it worked.'

const INTRO_AUDIO = '/hero/intro.mp3'

export function HeroVoice() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const startedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  /** It has run to the end at least once, so the control offers a repeat. */
  const [heard, setHeard] = useState(false)
  const [muted, setMuted] = useState(false)
  const [level, setLevel] = useState(0)
  const [failed, setFailed] = useState(false)

  /**
   * Built on the first press, never on mount: an `AudioContext` created
   * before a gesture starts suspended in every browser that matters, and one
   * per render leaks them.
   */
  const attach = useCallback(() => {
    const element = audioRef.current
    if (!element || contextRef.current) return
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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
      // No analyser is a calmer orb, never a broken player.
    }
  }, [])

  // Drive the orb from the real signal while it plays. A mouth that moves on a
  // timer reads as a loading animation; one that moves on amplitude reads as
  // something speaking.
  useEffect(() => {
    if (!playing || muted) {
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
  }, [playing, muted])

  useEffect(() => () => { void contextRef.current?.close() }, [])

  const toggle = useCallback(() => {
    const element = audioRef.current
    if (!element) return
    if (playing) { element.pause(); return }
    attach()
    void contextRef.current?.resume()
    element.muted = false
    setMuted(false)
    // A repeat starts from the top rather than from wherever it stopped.
    if (heard) element.currentTime = 0
    element.play().then(
      () => {
        if (startedRef.current) return
        startedRef.current = true
        capture('intro_played', {})
      },
      () => setFailed(true),
    )
  }, [attach, heard, playing])

  const toggleMute = useCallback(() => {
    const element = audioRef.current
    if (!element) return
    element.muted = !element.muted
    setMuted(element.muted)
  }, [])

  return (
    <div className="hero-voice">
      {/* Nothing is layered over this. */}
      <div className="hero-voice__orb" aria-hidden="true">
        {/* `fill` rather than a fixed `size`: the column is fluid between
            1024px and 1440px, and the renderer measures its own box for level
            of detail, so letting CSS own the size keeps it sharp at both ends
            instead of upscaling one number. */}
        <FluidPersona
          name="Nerve"
          visual={HOUSE_VISUAL}
          warmth={playing && !muted ? 62 : 34}
          fill
          interactive
          speaking={playing && !muted ? 'persona' : 'none'}
          personaLevel={level}
        />
      </div>

      <div className="hero-voice__controls">
        <button type="button" className="hero-voice__play" onClick={toggle}>
          {playing
            ? <Pause size={16} strokeWidth={2} aria-hidden="true" />
            : heard
              ? <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
              : <Play size={16} strokeWidth={2} aria-hidden="true" />}
          {playing ? 'Pause' : heard ? 'Play again' : 'Hear what this is'}
          {/* The length is an argument for pressing it, so it is offered once
              and then gets out of the way — nobody mid-listen needs telling. */}
          {playing || heard ? null : <span className="hero-voice__len" aria-hidden="true">10s</span>}
        </button>
        {playing ? (
          <button
            type="button"
            className="hero-voice__mute"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={16} strokeWidth={1.75} /> : <Volume2 size={16} strokeWidth={1.75} />}
          </button>
        ) : null}
      </div>

      <p className="hero-voice__line">{INTRO_LINE}</p>
      {failed ? <p className="hero-voice__fine" role="alert">That would not play here. The words are above.</p> : null}

      {/* No `loop`. `preload="none"` so the landing page fetches no audio
          until somebody asks for it. */}
      <audio
        ref={audioRef}
        src={INTRO_AUDIO}
        preload="none"
        crossOrigin="anonymous"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setHeard(true) }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
