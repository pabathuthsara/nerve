'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { visualFor } from '@/lib/personas/visual'
import { mountAvatar, onContextLost, type Speaking, type StageHandle, type StageStatus } from './stage'

export type { Speaking, StageStatus }

interface FluidPersonaProps {
  name: string
  personaId?: string
  /** 0–100, as the meter reports it. Chroma and openness follow this. */
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
  className = '',
}: FluidPersonaProps) {
  const mountRef = useRef<HTMLSpanElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<StageHandle | null>(null)
  const pushRef = useRef<() => void>(() => {})
  const pointerRef = useRef({ x: 0, y: 0, active: false })
  const retryRef = useRef(0)
  const [failed, setFailed] = useState(false)
  const [generation, setGeneration] = useState(0)

  const visual = useMemo(() => visualFor(name, personaId), [name, personaId])
  const initial = name.trim().charAt(0).toUpperCase()
  const normalizedWarmth = Math.min(100, Math.max(0, warmth))

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

  // A lost context cannot be recovered in place: the shared renderer is torn
  // down and every mounted avatar drops to the CSS fallback. One retry, once
  // the browser has had a moment, then the fallback stands.
  useEffect(() => {
    const unsubscribe = onContextLost(() => {
      handleRef.current = null
      setFailed(true)
      window.clearTimeout(retryRef.current)
      retryRef.current = window.setTimeout(() => {
        setFailed(false)
        setGeneration((value) => value + 1)
      }, 1500)
    })
    return () => { unsubscribe(); window.clearTimeout(retryRef.current) }
  }, [])

  useEffect(() => {
    const mount = mountRef.current
    const canvas = canvasRef.current
    if (!mount || !canvas) return

    let disposed = false
    let handle: StageHandle | null = null
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const measure = () => {
      const bounds = mount.getBoundingClientRect()
      handle?.measure(bounds.width, bounds.height)
    }
    const resizeObserver = new ResizeObserver(measure)
    const intersectionObserver = new IntersectionObserver(([entry]) => { handle?.setVisible(entry?.isIntersecting ?? true) }, { rootMargin: '120px' })
    const onMotionChange = () => handle?.setReducedMotion(motion.matches)

    void mountAvatar({ visual, canvas, reducedMotion: motion.matches })
      .then((mounted) => {
        if (disposed || !mounted) {
          mounted?.dispose()
          if (!disposed && !mounted) setFailed(true)
          return
        }
        handle = mounted
        handleRef.current = mounted
        measure()
        pushRef.current()
        resizeObserver.observe(mount)
        intersectionObserver.observe(mount)
        motion.addEventListener('change', onMotionChange)
      })
      .catch(() => { if (!disposed) setFailed(true) })

    return () => {
      disposed = true
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      motion.removeEventListener('change', onMotionChange)
      handleRef.current = null
      handle?.dispose()
    }
    // `size` is deliberately absent: it changes the element's box, the
    // ResizeObserver sees that, and nothing needs rebuilding.
  }, [generation, visual])

  const pointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
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
    failed ? 'fluid-persona--fallback' : '',
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
      <canvas ref={canvasRef} className="fluid-persona__canvas" aria-hidden="true" />
      <span className="fluid-persona__initial" aria-hidden="true">{initial}</span>
    </span>
  )
}
