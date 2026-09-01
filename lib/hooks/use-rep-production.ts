'use client'

/**
 * The live rep's production layer (§02, `M3-PLAN.md` Phase D).
 *
 * `docs/site-audit-openai.md` calls the live session "lifeless" and names this
 * the highest-leverage fix. The screen was already correct — timer, orb, band,
 * wrap cue — and correct is not the same as staged. What it had no sense of
 * was **occasion**: a rep began the instant a WebRTC connection happened to
 * open, and ended when a component swapped.
 *
 * Four beats, and this hook owns all four so the screen stays readable:
 *
 *   arm     3·2·1, with a tick and a haptic on each count. The rep starts on
 *           a beat somebody was counted into rather than on a network event.
 *   open    a resolving tone an octave above the ticks. She can hear you now.
 *   mark    thirty seconds out. The quietest sound in the kit and no haptic —
 *           §05 forbids coaching mid-rep, and a buzz against the leg while
 *           somebody is mid-sentence is the most literal interruption there is.
 *   close   a falling tone and a two-pulse haptic. The only downward interval
 *           in the kit, on the only moment that should resolve downward.
 *
 * ── THE COUNTDOWN IS THE POINT, NOT THE DECORATION ───────────────────────
 *
 * `start()` used to fire from an effect the moment loading finished. That is
 * why the entrance felt like nothing: there was no moment, just a state change.
 * The countdown is now what calls it, so the three seconds are real — the
 * connection opens while the user is being counted in, which also means the
 * first thing they hear is not a silent pause with a stranger in it.
 *
 * ── REDUCED MOTION ───────────────────────────────────────────────────────
 *
 * §02 says respected everywhere. A countdown is timing rather than movement,
 * so it still runs at the same pace — what stops is the movement: the
 * numbers do not animate (that is CSS), and `lib/haptics.ts` already refuses to
 * fire under a reduced-motion preference.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SoundKit, type SoundName } from '@/lib/audio/kit'
import { RoomTone, bedFor } from '@/lib/audio/room-tone'
import { PATTERNS, tap } from '@/lib/haptics'

/** Milliseconds per count. Three of them, so the arm takes 2.1 seconds. */
const COUNT_MS = 700

/** Where the kit's mute lives. Per browser, like the other sound-shaped prefs. */
export const SOUND_PREF_KEY = 'nerve:sound'

export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'off'
  } catch {
    // A browser refusing storage is a browser that gets the default.
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'on' : 'off')
  } catch {
    // Nothing to do. The preference lasts the session instead of forever.
  }
}

export interface RepProductionOptions {
  /**
   * Everything that has to be true before a rep may open — loaded, unlocked,
   * online, in credit. The countdown starts on the rising edge of this.
   */
  ready: boolean
  /** Called once, when the count reaches zero. This is what opens the session. */
  onGo: () => void
  /** True once the rep has ended, however it ended. */
  ended: boolean
  /** True during the last thirty seconds (§03's wind-down). */
  wrapping: boolean
  /** The persona's scene, for the bed. Null plays no room. */
  sceneId: string | null
  /** From the profile. The bed is off unless the user wants it. */
  ambience: boolean
  /** 0-100, from the profile. */
  ambienceVolume: number
}

export interface RepProduction {
  /** 3, 2, 1 — then null, for the whole of the rep. */
  count: number | null
  /** True from the first count until the session opens. */
  arming: boolean
  /**
   * Call from the user gesture that got them here.
   *
   * An `AudioContext` built outside a gesture starts suspended, and a suspended
   * context nobody resumes is a rep with no sound in it at all.
   */
  prime: () => void
}

export function useRepProduction(options: RepProductionOptions): RepProduction {
  const { ready, onGo, ended, wrapping, sceneId, ambience, ambienceVolume } = options
  const [count, setCount] = useState<number | null>(null)
  const [arming, setArming] = useState(false)

  const kitRef = useRef<SoundKit | null>(null)
  const toneRef = useRef<RoomTone | null>(null)
  const goRef = useRef(onGo)
  const startedRef = useRef(false)
  const closedRef = useRef(false)
  const markedRef = useRef(false)
  goRef.current = onGo

  const kit = useCallback((): SoundKit => {
    if (!kitRef.current) kitRef.current = new SoundKit(soundEnabled())
    return kitRef.current
  }, [])

  const play = useCallback((name: SoundName) => { kit().play(name) }, [kit])

  const prime = useCallback(() => { kit().prime() }, [kit])

  /**
   * The arm. Runs once, on the rising edge of `ready`.
   *
   * **`onGo` fires at the top of the count, not the bottom.** That ordering is
   * the whole reason the countdown earns its 2.1 seconds: the WebRTC session
   * is opening underneath it, so by the time the last tick clears she can
   * already hear you. The other way round — count first, then connect — spends
   * two seconds on ceremony and then hands the user a silent pause with a
   * stranger in it, which is the exact thing that made the entrance feel
   * lifeless in the first place.
   *
   * The overlay covers the connecting state on purpose, so the 3·2·1 replaces
   * "Connecting · she can't hear you yet" rather than queueing behind it.
   */
  useEffect(() => {
    if (!ready || startedRef.current) return
    startedRef.current = true
    setArming(true)
    setCount(3)
    play('tick')
    tap(PATTERNS.countdown)
    goRef.current()

    let remaining = 3
    const timer = window.setInterval(() => {
      remaining -= 1
      if (remaining > 0) {
        setCount(remaining)
        play('tick')
        tap(PATTERNS.countdown)
        return
      }
      window.clearInterval(timer)
      setCount(null)
      setArming(false)
      play('go')
      tap(PATTERNS.open)
    }, COUNT_MS)
    return () => window.clearInterval(timer)
  }, [play, ready])

  // Thirty seconds out. Once, and quietly.
  useEffect(() => {
    if (!wrapping || markedRef.current || ended) return
    markedRef.current = true
    play('wrap')
  }, [ended, play, wrapping])

  // She has gone.
  useEffect(() => {
    if (!ended || closedRef.current) return
    closedRef.current = true
    play('exit')
    tap(PATTERNS.close)
    toneRef.current?.stop()
  }, [ended, play])

  // The room. Started once the count is done, so the bed does not play under
  // the countdown — three ticks over a room tone is two atmospheres at once.
  useEffect(() => {
    if (arming || ended || !ambience || !sceneId || toneRef.current) return
    const bed = bedFor(sceneId)
    if (!bed) return
    // The kit already owns a context; the bed shares it rather than opening a
    // second one, because two AudioContexts on one page is how a phone runs
    // out of them.
    const instance = kit()
    instance.prime()
    const ctx = instance.context()
    if (!ctx) return
    try {
      const tone = new RoomTone(ctx, bed, { volume: ambienceVolume / 100 })
      tone.start()
      toneRef.current = tone
    } catch {
      // A room that will not build is a dry rep, which is the rep that ships
      // today anyway.
    }
  }, [ambience, ambienceVolume, arming, ended, kit, sceneId])

  useEffect(() => () => {
    toneRef.current?.stop()
    toneRef.current = null
    kitRef.current?.dispose()
    kitRef.current = null
  }, [])

  return { count, arming, prime }
}
