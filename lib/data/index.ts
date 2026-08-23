'use client'

/**
 * The seam the frontend reads through.
 *
 * Every hook keeps the shape the screens were built against — `{ data,
 * loading }`, with `loading` driving the skeletons — and now resolves it from
 * Supabase rather than from a timer. The screens did not have to change for
 * this, which was the point of building them against a seam.
 *
 * One thing is still mock, deliberately rather than by omission: the
 * interview track is M4, there are no interviewer characters written yet, and
 * a seeded row would be a character nobody authored.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { assignToday } from '@/app/field/actions'
import { interviewers, interviewSetup } from './mock/interview'
import {
  fetchFieldLog,
  fetchFieldStats,
  fetchLifetimeStats,
  fetchPersona,
  fetchPersonaProgress,
  fetchPersonas,
  fetchScorecard,
  fetchSession,
  fetchSessions,
  fetchTranscript,
  fetchUserState,
} from './queries'
import type {
  FieldAssignment,
  FieldLogEntry,
  FieldStats,
  Interviewer,
  InterviewSetup,
  LifetimeStats,
  Persona,
  PersonaProgress,
  Scorecard,
  SessionSummary,
  TranscriptTurn,
  UserState,
} from './types'

interface Loadable<T> {
  data: T
  loading: boolean
  /**
   * Ask again.
   *
   * A write changes more than the thing that was written — logging an ask
   * moves the counters, the log and possibly the streak — and these hooks
   * fetch from the browser, so `router.refresh()` does not touch them. This is
   * how a mutation reconciles.
   */
  reload: () => void
}

interface AsyncOptions<T> {
  /**
   * Keep trying while this holds.
   *
   * For the two reads that can legitimately arrive after the screen does: a
   * rep is written when it ends and graded a few seconds later, so the result
   * and scorecard screens can open before the row exists. Waiting is honest —
   * "not graded" while the grader is still running is not.
   */
  retryWhile?: (data: T) => boolean
  intervalMs?: number
  attempts?: number
}

/**
 * One fetch per mount, with the result held until it resolves.
 *
 * `loading` starts true and only ever goes false once, so a screen never
 * flashes an empty state on the way to having data — the skeletons match the
 * shape of what is arriving (§02), and an empty state that appears for 200ms
 * reads as "you have nothing", which for a first-time user is a lie.
 */
function useAsync<T>(load: () => Promise<T>, fallback: T, deps: unknown[], options: AsyncOptions<T> = {}): Loadable<T> {
  const [state, setState] = useState<{ data: T; loading: boolean }>({ data: fallback, loading: true })
  const [nonce, setNonce] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)
  const { retryWhile, intervalMs = 2500, attempts = 8 } = options

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const settle = (data: T) => {
      if (cancelled) return
      const again = retryWhile?.(data) === true && attempt < attempts
      if (again) {
        attempt += 1
        timer = setTimeout(attemptLoad, intervalMs)
        return
      }
      setState({ data, loading: false })
    }

    const attemptLoad = () => {
      run()
        .then(settle)
        // A read that fails leaves the fallback in place and stops loading. The
        // screens all have an honest empty state; a spinner that never resolves
        // does not (§02).
        .catch(() => { if (!cancelled) setState({ data: fallback, loading: false }) })
    }

    setState((current) => ({ ...current, loading: true }))
    attemptLoad()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, nonce])

  return { ...state, reload: useCallback(() => setNonce((value) => value + 1), []) }
}

function useMock<T>(value: T, delay = 280): Loadable<T> {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), delay)
    return () => window.clearTimeout(timer)
  }, [delay])
  return { data: value, loading, reload: () => undefined }
}

const NO_PERSONAS: Persona[] = []
const NO_SESSIONS: SessionSummary[] = []
const NO_TURNS: TranscriptTurn[] = []
const NO_PROGRESS: PersonaProgress[] = []
const NO_LOG: FieldLogEntry[] = []

export function usePersonas(): Loadable<Persona[]> {
  return useAsync(fetchPersonas, NO_PERSONAS, [])
}

export function usePersona(id: string): Loadable<Persona | null> {
  return useAsync(() => fetchPersona(id), null, [id])
}

export function useUserState(): Loadable<UserState | null> {
  return useAsync(fetchUserState, null, [])
}

export function useSessionHistory(): Loadable<SessionSummary[]> {
  return useAsync(() => fetchSessions(), NO_SESSIONS, [])
}

export function useSession(sessionId: string): Loadable<SessionSummary | null> {
  // The result screen opens seconds after the rep ends, sometimes before the
  // closing write has landed. A short wait beats "session not found".
  return useAsync(() => fetchSession(sessionId), null, [sessionId], {
    retryWhile: (session) => session === null,
    intervalMs: 1500,
    attempts: 6,
  })
}

export function useScorecard(sessionId: string): Loadable<Scorecard | null> {
  // Grading is one model call on the full transcript and takes a few seconds.
  return useAsync(() => fetchScorecard(sessionId), null, [sessionId], {
    retryWhile: (card) => card === null,
    intervalMs: 2500,
    attempts: 8,
  })
}

export function useTranscript(sessionId: string): Loadable<TranscriptTurn[]> {
  return useAsync(() => fetchTranscript(sessionId), NO_TURNS, [sessionId])
}

export function useLifetimeStats(): Loadable<LifetimeStats | null> {
  return useAsync(fetchLifetimeStats, null, [])
}

export function usePersonaProgress(personaId?: string): Loadable<PersonaProgress[] | PersonaProgress | null> {
  const all = useAsync(fetchPersonaProgress, NO_PROGRESS, [])
  const data = useMemo(
    () => (personaId ? all.data.find((item) => item.personaId === personaId) ?? null : all.data),
    [all.data, personaId],
  )
  return { data, loading: all.loading, reload: all.reload }
}

/**
 * Today's field challenge.
 *
 * A Server Action rather than a query, because the first look of the day
 * creates the assignment. It is idempotent and the pick is deterministic, so
 * calling it from two screens at once is not a problem.
 */
export function useFieldToday(): Loadable<FieldAssignment | null> {
  return useAsync(async () => (await assignToday()).assignment, null, [])
}

export function useFieldLog(): Loadable<FieldLogEntry[]> {
  return useAsync(() => fetchFieldLog(), NO_LOG, [])
}

export function useFieldStats(): Loadable<FieldStats | null> {
  return useAsync(fetchFieldStats, null, [])
}

/* --- still mock, and labelled as such ------------------------------------ */
export function useInterviewers(): Loadable<Interviewer[]> { return useMock(interviewers, 310) }
export function useInterviewSetup(): Loadable<InterviewSetup | null> { return useMock(interviewSetup, 260) }
