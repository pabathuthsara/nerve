'use client'

/**
 * Live warmth, in the actual UI.
 *
 * This is a user feature, and it is the one place in the product where getting
 * the feedback wrong does real harm. A falling red number mid-sentence is the
 * worst possible thing to show an anxious person, and a visible bar turns a
 * conversation into a game played against a meter. So the default is not a
 * number at all — it is the colour of the ring around the mic.
 *
 *   CLOSED    cool blue-grey, dim
 *   GUARDED   neutral, low glow
 *   OPEN      warming
 *   ENGAGED   warm
 *   INVESTED  full volt
 *
 * Eased over ~1.5s so it reads as mood rather than as a score ticking. Cooling
 * desaturates and dims; it never alarms and it is never red. Red in this
 * product is a semantic colour, and "she is less interested than she was" is
 * not an error state — it is information the user is here to learn to read.
 *
 * Deltas, reasons and +/- events appear nowhere on this screen. They are
 * scorecard material, after the rep, when there is nothing left to lose by
 * looking at them.
 */

import { useEffect, useRef, useState } from 'react'
import type { WarmthBand } from '@/lib/warmth/bands'
import { trackLabel, type TrackId } from '@/lib/voice/types'

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

/**
 * Volt is the only accent (§03), so the warm end of this scale IS volt and
 * everything below it is the same hue walking down in saturation and
 * brightness. That is what makes cooling read as withdrawal rather than as a
 * warning: nothing new appears, something simply drains out.
 */
const BAND_COLOUR: Record<WarmthBand, string> = {
  HOSTILE: '#5A6670',
  CLOSED: '#657586',
  GUARDED: '#8A9280',
  OPEN: '#A6B655',
  ENGAGED: '#BCDA36',
  INVESTED: '#C4F82A',
}

/**
 * ROUND 12 — the cold end was not visible.
 *
 * The original ramp bottomed out at #333A3E, which against ground #0B0C0A is
 * 1.69:1. WCAG asks 3:1 of a non-text graphical object, and a 2px ring is about
 * as marginal as a graphical object gets. A user in the two coldest bands — the
 * ones a nervous person spends the opening of every rep in — was being shown
 * nothing at all.
 *
 * Every band now clears 3:1 (3.33 / 4.15 / 6.07 / 8.82 / 12.34 / 15.69), and
 * relative luminance climbs monotonically 0.128 -> 0.790. That second property
 * is the one that matters most: it means the ramp still reads as a ramp in
 * greyscale, so the signal does not depend on distinguishing slate from olive.
 * `RING_WIDTH` carries the same information a third time, as geometry.
 */

/**
 * The non-colour channel. Deliberately a WEIGHT and not an arc or a bar — a
 * filling arc is a meter bent into a circle, and §4 exists to keep a meter off
 * this screen. Thickness reads as presence, not as a score you can take a
 * reading off.
 */
const RING_WIDTH: Record<WarmthBand, number> = {
  HOSTILE: 1.5,
  CLOSED: 2,
  GUARDED: 2.5,
  OPEN: 3,
  ENGAGED: 3.5,
  INVESTED: 4,
}

/**
 * What she is giving him, in words, for a user who cannot use the ring.
 *
 * The same information the colour carries and nothing more: no number, no
 * delta, no direction, no advice. A screen-reader user gets what a sighted
 * user gets, which is the whole requirement.
 */
const BAND_DESCRIPTION: Record<WarmthBand, string> = {
  HOSTILE: 'She has had enough of this.',
  CLOSED: 'She is closed off.',
  GUARDED: 'She is guarded.',
  OPEN: 'She is open to this.',
  ENGAGED: 'She is engaged.',
  INVESTED: 'She is invested in this.',
}

/** How far the glow carries. Cold is flat; warm is lit. */
const BAND_GLOW: Record<WarmthBand, number> = {
  HOSTILE: 2,
  CLOSED: 4,
  GUARDED: 8,
  OPEN: 14,
  ENGAGED: 22,
  INVESTED: 30,
}

export function bandColour(band: WarmthBand): string {
  return BAND_COLOUR[band] ?? BAND_COLOUR.GUARDED
}

export function bandDescription(band: WarmthBand): string {
  return BAND_DESCRIPTION[band] ?? BAND_DESCRIPTION.GUARDED
}

/* ------------------------------------------------------------------ *
 * Reduced motion
 * ------------------------------------------------------------------ */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/* ------------------------------------------------------------------ *
 * The orb
 * ------------------------------------------------------------------ */

export interface MicOrbProps {
  band: WarmthBand
  /** Drives the inner fill only — whether the user is currently audible. */
  speaking: boolean
  /** Before the rep starts the ring is inert, whatever the band says. */
  live: boolean
}

export function MicOrb({ band, speaking, live }: MicOrbProps) {
  const reduced = usePrefersReducedMotion()
  const previous = useRef<WarmthBand>(band)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    if (previous.current === band) return
    previous.current = band
    // A band CHANGE is the teaching moment — it is the instant something the
    // user did actually moved her. It gets a stronger cue than the continuous
    // drift does, then settles back.
    setChanged(true)
    const timer = setTimeout(() => setChanged(false), reduced ? 0 : 900)
    return () => clearTimeout(timer)
  }, [band, reduced])

  const colour = live ? bandColour(band) : '#242820'
  const glow = live ? BAND_GLOW[band] : 0
  const width = live ? RING_WIDTH[band] : 2

  return (
    <div style={{ position: 'relative' }}>
      {/*
        ROUND 12. This whole component used to be `aria-hidden`, with colour as
        its only channel — so live warmth was not merely hard to read for a
        colour-blind user, it was entirely absent for a screen-reader one. The
        product's central teaching signal reached nobody who could not see a hue.

        A polite live region carries the band change, and only the change:
        `aria-live="polite"` waits for a pause rather than cutting across the
        user mid-sentence, which is the one thing this screen must never do.
      */}
      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {live ? bandDescription(band) : ''}
      </span>
    <div
      aria-hidden
      style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        border: `${width}px solid ${colour}`,
        display: 'grid',
        placeItems: 'center',
        // Discrete states under reduced motion: the colour still carries the
        // information, it simply arrives without the fade (§4d).
        transition: reduced
          ? 'none'
          : 'border-color 1.5s ease, border-width 1.5s ease, box-shadow 1.5s ease, transform 0.35s ease',
        boxShadow: `0 0 ${glow + (changed && !reduced ? 14 : 0)}px ${colour}`,
        transform: changed && !reduced ? 'scale(1.04)' : 'scale(1)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: speaking ? colour : 'transparent',
          border: `1px solid ${colour}`,
          opacity: speaking ? 0.8 : 0.35,
          transition: reduced ? 'none' : 'opacity 0.2s ease, background 0.2s ease',
        }}
      />
    </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Training wheels
 * ------------------------------------------------------------------ */

const SESSION_COUNT_KEY = 'nerve.sessions.completed'
const WHEELS_PREF_KEY = 'nerve.trainingWheels.enabled'
const GRADUATED_KEY = 'nerve.trainingWheels.graduated'

/** Defaults on for this many sessions, then it is the user's choice. */
export const TRAINING_WHEELS_SESSIONS = 5
/** Above this level the number is gone for good. */
export const TRAINING_WHEELS_MAX_LEVEL = 3

function readNumber(key: string, fallback: number): number {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    const parsed = raw === null || raw === undefined ? Number.NaN : Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function readFlag(key: string): boolean | null {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (raw === null || raw === undefined) return null
    return raw === 'true'
  } catch {
    return null
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, String(value))
  } catch {
    /* Storage refused. The preference simply does not persist. */
  }
}

export interface TrainingWheelsState {
  /** Whether the numeric readout should render at all. */
  visible: boolean
  /** Whether the graduation modal is owed. */
  graduating: boolean
  /** True once the five-session default has expired. For the settings copy. */
  sessionsCompleted: boolean
  setEnabled: (value: boolean) => void
  acknowledgeGraduation: () => void
  enabled: boolean
}

/**
 * Who sees a number, and for how long.
 *
 * On for a user's first five sessions at levels 1-3, toggleable after that, and
 * gone permanently at level 4. The point is to teach the mapping between what
 * someone does and how a stranger responds, and then to take the crutch away
 * once the mapping is learned — a user who still needs the number at level 4
 * has not learned the thing the product exists to teach.
 */
/**
 * @param level      the persona's level; the readout is gone for good above 3.
 * @param serverSessions completed reps counted from the database, or null when
 *   that count is unavailable. See the note inside on why this is not
 *   localStorage alone.
 */
export function useTrainingWheels(
  level: number,
  serverSessions: number | null = null,
): TrainingWheelsState {
  // `null` means the user has never expressed a preference, which is different
  // from having turned it off — the default depends on how many reps they have
  // done, and an explicit choice must survive crossing that boundary.
  const [preference, setPreference] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState(0)
  const [graduated, setGraduated] = useState(true)

  useEffect(() => {
    setSessions(readNumber(SESSION_COUNT_KEY, 0))
    setPreference(readFlag(WHEELS_PREF_KEY))
    setGraduated(readFlag(GRADUATED_KEY) ?? false)
  }, [])

  const withinLevel = level <= TRAINING_WHEELS_MAX_LEVEL

  /**
   * ROUND 12. The count is the USER's, not the browser's.
   *
   * It lived in localStorage alone, so the same person got a different product
   * on their laptop and their phone, and clearing site data handed a user on
   * their fortieth rep the beginner's readout again. The database count is
   * authoritative; the local number is kept only so a rep finished in THIS tab
   * counts immediately, without a reload. Whichever is higher wins, because
   * both undercount in different directions and neither ever overcounts.
   */
  const completed = Math.max(sessions, serverSessions ?? 0)
  const withinFirstSessions = completed < TRAINING_WHEELS_SESSIONS
  // On by default for the first five reps; off by default after that. Either
  // way an explicit choice wins, because someone who turned it back on at rep
  // nine meant it.
  const enabled = preference ?? withinFirstSessions

  return {
    visible: withinLevel && enabled,
    // Owed exactly once, the first time someone arrives above level 3.
    graduating: !withinLevel && !graduated,
    sessionsCompleted: !withinFirstSessions,
    enabled,
    setEnabled: (value: boolean) => {
      setPreference(value)
      writeFlag(WHEELS_PREF_KEY, value)
    },
    acknowledgeGraduation: () => {
      setGraduated(true)
      writeFlag(GRADUATED_KEY, true)
    },
  }
}

/** Call once when a rep finishes, so the five-session default expires. */
export function recordCompletedSession(): void {
  try {
    const next = readNumber(SESSION_COUNT_KEY, 0) + 1
    globalThis.localStorage?.setItem(SESSION_COUNT_KEY, String(next))
  } catch {
    /* As above. */
  }
}

export interface TrainingWheelsProps {
  warmth: number
  band: WarmthBand
  track: TrackId
}

/**
 * The number, for the people who still need it.
 *
 * Value and band name, nothing else. No delta, no arrow, no colour change on
 * the digits — a number that moves is information; a number that flashes is a
 * judgement, and this user does not need one mid-sentence (§4c).
 */
/**
 * The control that turns the readout back on.
 *
 * ROUND 12. `setEnabled` shipped on the hook and was called from nowhere, so
 * the default flipped off after five reps and there was no way back — the
 * "toggleable after that" half of §4b did not exist. Rendered outside a live
 * rep only: a control on screen mid-conversation is exactly the coaching
 * furniture §05 keeps off this page.
 */
export function TrainingWheelsToggle({
  wheels,
  level,
}: {
  wheels: TrainingWheelsState
  level: number
}) {
  if (level > TRAINING_WHEELS_MAX_LEVEL) return null
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: '#6A7062',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={wheels.enabled}
        onChange={(event) => wheels.setEnabled(event.target.checked)}
      />
      <span>
        Show how she is responding, during the rep
        {wheels.sessionsCompleted ? ' (off by default after your first five)' : ''}
      </span>
    </label>
  )
}

export function TrainingWheels({ warmth, band, track }: TrainingWheelsProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        fontFamily: 'ui-monospace, monospace',
        color: '#9DA396',
        fontSize: 13,
      }}
    >
      <span style={{ opacity: 0.7 }}>{trackLabel(track).toLowerCase()}</span>
      {/* Floored, not rounded: bands are half-open intervals, so flooring is
          the only display that always agrees with the band beside it. */}
      <strong style={{ fontVariantNumeric: 'tabular-nums', color: bandColour(band) }}>
        {Math.floor(warmth)}
      </strong>
      {/* The band name is the non-colour half of this readout: the digits are
          coloured, so on their own they carry the same problem the orb had. */}
      <span style={{ letterSpacing: '0.08em' }}>{band}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Graduation
 * ------------------------------------------------------------------ */

/**
 * The one-time modal at level 4.
 *
 * Worth building deliberately, because the sentence in it is the product's
 * thesis. Everything up to here has been teaching a mapping; this is the moment
 * the mapping is handed over and the instrument is taken away.
 */
export function GraduationModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Training wheels off"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11, 12, 10, 0.86)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          background: '#131511',
          border: '1px solid #242820',
          borderRadius: 2,
          padding: 28,
          color: '#EDEFE8',
        }}
      >
        <h2
          style={{
            fontFamily: '"Barlow Condensed", system-ui, sans-serif',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            margin: '0 0 12px',
            fontSize: 26,
          }}
        >
          From here you read her, not the meter.
        </h2>
        <p style={{ color: '#9DA396', lineHeight: 1.6, margin: '0 0 20px' }}>
          The number is off from level four onward. You have had five sessions of
          seeing what moved her and what did not; the signal was never the digits,
          it was the pause before she answered and how much she gave you back.
          That is what you are practising now.
        </p>
        <button
          onClick={onDismiss}
          style={{
            background: '#C4F82A',
            color: '#0B0C0A',
            border: 'none',
            borderRadius: 2,
            padding: '10px 18px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Understood
        </button>
      </div>
    </div>
  )
}
