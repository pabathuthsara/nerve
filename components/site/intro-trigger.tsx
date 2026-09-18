'use client'

/**
 * The button that opens `IntroModal`, and the only client component in the
 * hero.
 *
 * Split out so the landing page stays a server component. `Landing` renders
 * a counted `usageProof` read from the database; making the whole thing a
 * client island to get one `useState` would have pushed that read — and
 * three.js, through `FluidPersona` — into the first-load bundle of the page
 * §14's reviewer opens.
 *
 * The modal itself is imported lazily for the same reason: the WebGL orb is
 * ~150kB of renderer that nobody who does not press this should pay for.
 */

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Play } from 'lucide-react'

const IntroModal = dynamic(() => import('./intro-modal').then((m) => m.IntroModal), { ssr: false })

export function IntroTrigger() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="arena-button arena-button--secondary arena-button--lg intro-trigger"
        onClick={() => setOpen(true)}
      >
        <Play size={16} strokeWidth={2} aria-hidden="true" />
        Hear what this is
        <span className="intro-trigger__len" aria-hidden="true">10s</span>
      </button>
      {open ? <IntroModal open onClose={() => setOpen(false)} /> : null}
    </>
  )
}
