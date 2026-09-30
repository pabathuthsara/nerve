'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { visualFor, type PersonaVisual } from '@/lib/personas/visual'
import {
  mountLive,
  releaseLiveSlot,
  renderStill,
  STILL_WARMTH_STEP,
  tryAcquireLiveSlot,
  type LiveHandle,
  type Speaking,
  type StageStatus,
} from './particles'

export type { Speaking, StageStatus }

/**
 * `live` runs the simulation in its own renderer; `still` shows one captured
 * frame, turned and breathed by CSS; `auto` is live for a single large avatar
 * and still for anything small. A grid of several must pass `still`: the live
 * budget is first come first served, and a grid that is half alive reads as a
 * bug.
 */
export type AvatarMotion = 'auto' | 'live' | 'still'

/**
 * The avatar's LAYOUT size, ignoring transforms.
 *
 * `getBoundingClientRect` includes them, and several screens scale the avatar
 * — the reveal's arrival animation starts it at 70%, and the phone brief draws
 * it at 72% — so a 168px avatar measured mid-animation as ~85px, and was
 * mounted as a still with a thumbnail's initial on it. What the avatar IS is
 * its layout box; how it is being drawn this instant is not.
 */
function layoutBox(element: HTMLElement): { width: number; height: number } {
  return { width: element.offsetWidth, height: element.offsetHeight }
}

/** Below this measured size, `auto` is always a still. */
const LIVE_MIN_CSS = 120

type Mode = 'pending' | 'live' | 'still' | 'fallback'

interface FluidPersonaProps {
  name: string
  personaId?: string
  /** 0–100, as the meter reports it. Size, colour and restlessness follow this. */
  warmth?: number
  /** Ignored when `fill` is set. Detail is measured, never taken from here. */
  size?: number
  fill?: boolean
  dimmed?: boolean
  /** Pointer parallax. Off by default: most avatars sit inside a link. */
  interactive?: boolean
  announceWarmth?: boolean
  speaking?: Speaking
  /** His microphone, 0–1. Read continuously, not only while `speaking` is 'user'. */
  userLevel?: number
  /** Her output, 0–1. */
  personaLevel?: number
  /** 'connecting' holds her drawn-in and quiet until the session is actually up. */
  status?: StageStatus
  /** See `AvatarMotion`. */
  motion?: AvatarMotion
  /**
   * A visual to draw instead of the one `visualFor` derives from the name.
   *
   * Additive and off by default — every existing caller resolves exactly as
   * it did. It exists for the one surface that needs the effect without being
   * a character: the landing page's house voice, which speaks AUTHORED words
   * and so must not wear a persona's identity (rule 10).
   *
   * Without it the hash fallback in `visualFor` chose a roster hue by
   * accident, and on `/` it chose Nadia's crimson — Red is semantic in Arena
   * and never branding, so the landing page opened a sheet with what read as
   * an error state in it.
   *
   * Anything passed here is still held to the roster's bounds by
   * `lib/site/house-visual.test.ts`, which runs the same assertions
   * `visual.test.ts` runs over `PERSONA_VISUAL`. The override skips the
   * table, not the rules.
   */
  visual?: PersonaVisual
  className?: string
}

export function FluidPersona({
  name,
  personaId,
  warmth = 18,
  size = 96,
  fill = false,
  dimmed = false,
  interactive = false,
  announceWarmth = false,
  speaking = 'none',
  userLevel = 0,
  personaLevel = 0,
  status = 'idle',
  motion = 'auto',
  visual: override,
  className = '',
}: FluidPersonaProps) {
  const mountRef = useRef<HTMLSpanElement | null>(null)
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const stillCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<LiveHandle | null>(null)
  const pushRef = useRef<() => void>(() => {})
  const pointerRef = useRef({ x: 0, y: 0, active: false })
  const [mode, setMode] = useState<Mode>('pending')
  const [ready, setReady] = useState(false)
  const [stillSize, setStillSize] = useState(0)
  // Her initial is for thumbnails. On a large avatar it sat in the densest
  // part of the smoke, and every large avatar already has her name beside it
  // in display type. The ring orb had a hollow centre for it; the swarm does not.
  const [large, setLarge] = useState(!fill && size >= LIVE_MIN_CSS)

  const visual = useMemo(() => override ?? visualFor(name, personaId), [override, name, personaId])
  const initial = name.trim().charAt(0).toUpperCase()
  const normalizedWarmth = Math.min(100, Math.max(0, warmth))
  const stillWarmth = Math.round(normalizedWarmth / STILL_WARMTH_STEP) * STILL_WARMTH_STEP

  const push = useCallback(() => {
    handleRef.current?.push({
      warmth: normalizedWarmth,
      speaking,
      userLevel,
      personaLevel,
      status,
      pointerX: pointerRef.current.x,
      pointerY: pointerRef.current.y,
      pointerActive: interactive && pointerRef.current.active,
    })
  }, [interactive, normalizedWarmth, personaLevel, speaking, status, userLevel])

  pushRef.current = push
  useEffect(push, [push])

  // Decide live or still, and mount the live one. Re-run only when she is a
  // different character or the caller changes the rule.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false
    let acquired = false
    let handle: LiveHandle | null = null
    setReady(false)
    setMode('pending')

    const bounds = layoutBox(mount)
    const wantsLive = motion === 'live' || (motion === 'auto' && Math.min(bounds.width, bounds.height) >= LIVE_MIN_CSS)
    const canvas = liveCanvasRef.current
    if (!wantsLive || !canvas || !tryAcquireLiveSlot()) {
      setMode('still')
      return
    }
    acquired = true

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const measure = () => {
      const box = layoutBox(mount)
      handle?.measure(box.width, box.height)
    }
    const resizeObserver = new ResizeObserver(measure)
    const intersectionObserver = new IntersectionObserver(([entry]) => { handle?.setVisible(entry?.isIntersecting ?? true) }, { rootMargin: '120px' })
    const onMotionChange = () => handle?.setReducedMotion(reducedMotion.matches)
    const toStill = () => {
      if (disposed) return
      handleRef.current = null
      handle?.dispose()
      handle = null
      if (acquired) releaseLiveSlot()
      acquired = false
      setReady(false)
      setMode('still')
    }

    void mountLive({
      canvas,
      visual,
      reducedMotion: reducedMotion.matches,
      onFirstFrame: () => { if (!disposed) setReady(true) },
      onLost: toStill,
    })
      .then((mounted) => {
        if (disposed) {
          mounted?.dispose()
          return
        }
        if (!mounted) {
          toStill()
          return
        }
        handle = mounted
        handleRef.current = mounted
        setMode('live')
        measure()
        pushRef.current()
        resizeObserver.observe(mount)
        intersectionObserver.observe(mount)
        reducedMotion.addEventListener('change', onMotionChange)
      })
      .catch(toStill)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      reducedMotion.removeEventListener('change', onMotionChange)
      handleRef.current = null
      handle?.dispose()
      if (acquired) releaseLiveSlot()
    }
  }, [motion, visual])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const measure = () => {
      const box = layoutBox(mount)
      setLarge(Math.min(box.width, box.height) >= LIVE_MIN_CSS)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(mount)
    return () => observer.disconnect()
  }, [])

  // A still follows its box: measured, rounded, so layout drift does not
  // re-render it. It is a SQUARE on the box's shorter side, centred — a
  // desktop roster portrait is a wide strip, and stretching a square frame
  // across it (then turning it) smeared her into a diagonal streak.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || mode !== 'still') return
    const measure = () => {
      const box = layoutBox(mount)
      setStillSize(Math.round(Math.min(box.width, box.height) / 8) * 8)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(mount)
    return () => observer.disconnect()
  }, [mode])

  // Render the still for this character, warmth bucket and size.
  useEffect(() => {
    if (mode !== 'still' || stillSize < 8) return
    let cancelled = false
    void renderStill(visual, stillWarmth, stillSize).then((frame) => {
      const canvas = stillCanvasRef.current
      if (cancelled) return
      if (!frame || !canvas) {
        setMode('fallback')
        return
      }
      canvas.width = frame.width
      canvas.height = frame.height
      const context = canvas.getContext('2d')
      context?.clearRect(0, 0, canvas.width, canvas.height)
      context?.drawImage(frame, 0, 0)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [mode, stillSize, stillWarmth, visual])

  const pointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerRef.current = {
      x: ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2,
      y: ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2,
      active: true,
    }
    pushRef.current()
  }

  const pointerLeave = () => {
    pointerRef.current = { x: 0, y: 0, active: false }
    pushRef.current()
  }

  const style = {
    width: fill ? '100%' : size,
    height: fill ? '100%' : size,
    opacity: dimmed ? 0.55 : 1,
    '--persona-deep': visual.deep,
    '--persona-core': visual.core,
    '--persona-sheen': visual.sheen,
  } as CSSProperties

  const classes = [
    'fluid-persona',
    `fluid-persona--mode-${visual.mode}`,
    fill ? 'fluid-persona--fill' : '',
    mode === 'still' ? 'fluid-persona--still' : '',
    mode === 'fallback' || !ready ? 'fluid-persona--fallback' : '',
    ready ? 'fluid-persona--ready' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span
      ref={mountRef}
      className={classes}
      style={style}
      role="img"
      aria-label={announceWarmth ? `${name}, warmth ${Math.round(normalizedWarmth)} out of 100` : `${name} avatar`}
      onPointerMove={interactive ? pointerMove : undefined}
      onPointerLeave={interactive ? pointerLeave : undefined}
    >
      {/* Two canvases because a canvas that has held a WebGL context can never
          become a 2D one, and a still is drawn with 2D. The live one is always
          in the tree, hidden when unused, so a still that becomes a different
          character can still go live. */}
      <canvas ref={liveCanvasRef} className="fluid-persona__canvas" aria-hidden="true" hidden={mode === 'still' || mode === 'fallback'} />
      {mode === 'still'
        ? <canvas ref={stillCanvasRef} className="fluid-persona__canvas fluid-persona__still" aria-hidden="true" style={{ width: stillSize, height: stillSize }} />
        : null}
      {large ? null : <span className="fluid-persona__initial" aria-hidden="true">{initial}</span>}
    </span>
  )
}
