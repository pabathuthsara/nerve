'use client'

import { MotionConfig } from 'framer-motion'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Track } from '@/lib/data/types'

interface ProductContextValue {
  track: Track
  setTrack: (track: Track) => void
  /**
   * The interviewer picked in THIS session, or null when none has been.
   *
   * ── WHY NULL AND NOT A DEFAULT SLUG ──────────────────────────────────
   *
   * It was `useState('aisha-rahman')`, and every consumer reads
   * `selectedInterviewerId ?? setup?.interviewerId` — a `??` that could never
   * reach its right-hand side, because the left was never null. So the stored
   * choice was unreachable: picking Marcus, saving him to `interview_setups`
   * and reloading put Aisha back, silently.
   *
   * That was cosmetic while the picker was a screen you visited once. Since A1
   * made it the first step of every run it is the run losing the one decision
   * it just took, so the fallback has to actually work. Null is "this session
   * has not chosen"; the stored setup answers for it.
   */
  selectedInterviewerId: string | null
  setSelectedInterviewerId: (id: string) => void
  /**
   * The track this account was last on, offered by whoever learns it first.
   *
   * ── E2: THE PRODUCT FORGOT WHICH HALF YOU USE ────────────────────────
   *
   * `track` was `useState('dating')` — hardcoded, never seeded from
   * `profiles.active_track`, never persisted — and `AppShell`'s pathname effect
   * only corrects it on `/interview`, `/train` and `/field`. So every SHARED
   * route inherited the default: an interview account that refreshed, opened a
   * bookmark, followed a link from an email or simply came back tomorrow landed
   * on `/roster` and got the dating roster, the dating nav with Field back in
   * it, and a "reps left" pill in place of its credits. The one question
   * onboarding asks about intent was written to a column the chrome never read.
   *
   * This is `adopt` rather than `set` because the two answers arrive in the
   * wrong order. The pathname is known during the first render; the profile
   * arrives a fetch later, and it must never overrule a track the URL has
   * already settled — landing on `/interview` and being dragged back to dating
   * a moment later is a worse bug than the one being fixed. So the FIRST answer
   * wins and every later one is ignored, which is what `settled` records.
   */
  adoptTrack: (track: Track) => void
}

const ProductContext = createContext<ProductContextValue | null>(null)

export function ProductProvider({ children }: { children: ReactNode }) {
  const [track, setTrackState] = useState<Track>('dating')
  const [selectedInterviewerId, setSelectedInterviewerId] = useState<string | null>(null)

  /**
   * Whether anything has answered "which track" yet, this page load.
   *
   * A ref rather than state: it is read inside the setters and never rendered,
   * so making it state would re-render the whole app to record a fact no screen
   * draws. `dating` remains the value before anybody answers, which is what a
   * signed-out visitor and the public site see.
   */
  const settled = useRef(false)

  const setTrack = useCallback((next: Track) => {
    settled.current = true
    setTrackState(next)
  }, [])

  const adoptTrack = useCallback((next: Track) => {
    if (settled.current) return
    settled.current = true
    setTrackState(next)
  }, [])

  const value = useMemo(
    () => ({ track, setTrack, adoptTrack, selectedInterviewerId, setSelectedInterviewerId }),
    [adoptTrack, selectedInterviewerId, setTrack, track],
  )
  return <ProductContext.Provider value={value}><MotionConfig reducedMotion="user">{children}</MotionConfig></ProductContext.Provider>
}

export function useProduct() {
  const value = useContext(ProductContext)
  if (!value) throw new Error('useProduct must be used inside ProductProvider')
  return value
}
