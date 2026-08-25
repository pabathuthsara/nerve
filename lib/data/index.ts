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
import { useRouter } from 'next/navigation'
import { sessionStatus } from './session'
import { assignToday } from '@/app/field/actions'
import type { Milestone } from '@/lib/field/milestones'
import { interviewers, interviewSetup } from './mock/interview'
import {
  fetchBaseline,
  fetchFieldLog,
  fetchFieldStats,
  fetchLifetimeStats,
  fetchPendingMilestone,
  fetchPlanWaitlist,
  fetchPendingUnlock,
  fetchPersona,
  fetchPersonaMemory,
  fetchPersonaProgress,
  fetchLatestFocus,
  fetchLibrary,
  fetchLibraryCard,
  fetchLibraryReads,
  fetchPersonas,
  fetchScorecard,
  fetchSession,
  fetchSessions,
  fetchTranscript,
  fetchUserState,
  fetchProgress,
  fetchWeeklyReview,
  fetchWeeklyReviews,
} from './queries'
import type {
  LibraryCard,
  ProgressPoint,
  BaselineState,
  FieldAssignment,
  FieldLogEntry,
  FieldStats,
  Interviewer,
  InterviewSetup,
  LifetimeStats,
  PendingUnlock,
  Persona,
  PersonaMemory,
  PersonaProgress,
  Scorecard,
  SessionSummary,
  TranscriptTurn,
  UserState,
  WeeklyReview,
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
/** Stable empty arrays: a fresh literal each render restarts every effect. */
const NO_CARDS: LibraryCard[] = []
const NO_READS: string[] = []
const NO_FOCUS: string[] = []
const NO_POINTS: ProgressPoint[] = []
const NO_REVIEWS: WeeklyReview[] = []
const NO_SESSIONS: SessionSummary[] = []
const NO_TURNS: TranscriptTurn[] = []
const NO_PROGRESS: PersonaProgress[] = []
const NO_WAITLIST: string[] = []
const NO_LOG: FieldLogEntry[] = []

export function usePersonas(): Loadable<Persona[]> {
  return useAsync(fetchPersonas, NO_PERSONAS, [])
}

/**
 * What the last graded rep said to work on — the technique of the session.
 *
 * Empty until there is a graded rep to draw it from.
 */
export function useLatestFocus(): Loadable<string[]> {
  return useAsync(fetchLatestFocus, NO_FOCUS, [])
}

/** The library (§10 D). Content, so it never changes inside a session. */
export function useLibrary(): Loadable<LibraryCard[]> {
  return useAsync(fetchLibrary, NO_CARDS, [])
}

export function useLibraryCard(slug: string): Loadable<LibraryCard | null> {
  return useAsync(() => fetchLibraryCard(slug), null, [slug])
}

/** Slugs this person has read (§10 D). Empty is the ordinary first answer. */
export function useLibraryReads(): Loadable<string[]> {
  return useAsync(fetchLibraryReads, NO_READS, [])
}

export function usePersona(id: string): Loadable<Persona | null> {
  return useAsync(() => fetchPersona(id), null, [id])
}

/**
 * The signed-in user, and the one hook that notices when there is not one.
 *
 * Every protected screen reads this, and most of them draw skeletons while
 * `user` is null — which was fine for "still loading" and wrong for "there is
 * no session". The route guard only runs on the server, so a client whose
 * session has gone (expired, revoked, signed out in another tab, cookies
 * cleared) kept rendering a page the server had already decided it was allowed
 * to see, with every read returning nothing. The result was a screen of
 * skeletons that never resolved, and no way out of it but a manual reload.
 *
 * Now it sends them to log in — but only on `signed-out`, which is the auth
 * server actually answering. A read that could not reach it at all is left
 * alone, because bouncing somebody to a login screen over a dropped connection
 * is a worse bug than the one being fixed.
 */
export function useUserState(): Loadable<UserState | null> {
  const state = useAsync(fetchUserState, null, [])
  const router = useRouter()
  const { data, loading } = state

  useEffect(() => {
    if (loading || data) return
    if (sessionStatus() !== 'signed-out') return
    // `replace`, not `push`: a page they were not signed in for does not belong
    // in their history. No `next` — `/` is already the one place that decides
    // where a signed-in person lands, including part-way through onboarding,
    // and a redirect target read off the URL is an open redirect waiting to be
    // found.
    router.replace('/login')
  }, [data, loading, router])

  return state
}

/**
 * What this character still has in mind, if anything (§08).
 *
 * Null is the ordinary answer: most reps produce nothing worth carrying, and
 * the filter drops anything that fails, so the brief screen shows a memory
 * line only when there genuinely is one.
 */
export function usePersonaMemory(personaId: string): Loadable<PersonaMemory | null> {
  return useAsync(() => fetchPersonaMemory(personaId), null, [personaId])
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

/** Paid plans this user has already asked to be told about. */
export function usePlanWaitlist(): Loadable<string[]> {
  return useAsync(fetchPlanWaitlist, NO_WAITLIST, [])
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

/**
 * A level or field tier earned and not yet celebrated (§12).
 *
 * The scorecard is where it fires, because that is the screen the user is on
 * when the grade that earned it lands.
 */
export function usePendingUnlock(): Loadable<PendingUnlock | null> {
  return useAsync(fetchPendingUnlock, null, [])
}

/**
 * The baseline, and whether the week-four re-test is on offer (§08).
 *
 * Null until the first rep has been graded, which is also when the hook is
 * planted — there is nothing to say about a measurement nobody has taken.
 */
export function useBaseline(): Loadable<BaselineState | null> {
  return useAsync(fetchBaseline, null, [])
}

/** The most recent Sunday letter, or nothing yet (§09). */
export function useWeeklyReview(): Loadable<WeeklyReview | null> {
  return useAsync(fetchWeeklyReview, null, [])
}

/** Every stored Sunday letter (§11). Newest first. */
export function useWeeklyReviews(): Loadable<WeeklyReview[]> {
  return useAsync(fetchWeeklyReviews, NO_REVIEWS, [])
}

/** The graded reps behind every line on `/progress` (§10 E). */
export function useProgress(): Loadable<ProgressPoint[]> {
  return useAsync(fetchProgress, NO_POINTS, [])
}

export function useFieldStats(): Loadable<FieldStats | null> {
  return useAsync(fetchFieldStats, null, [])
}

/**
 * A milestone earned and not yet shown (§09).
 *
 * Read on mount as well as returned by the write, so the tenth rejection still
 * gets its moment if the tab was closed before the sheet rendered.
 */
export function usePendingMilestone(): Loadable<Milestone | null> {
  return useAsync(fetchPendingMilestone, null, [])
}

/* --- still mock, and labelled as such ------------------------------------ */
export function useInterviewers(): Loadable<Interviewer[]> { return useMock(interviewers, 310) }
export function useInterviewSetup(): Loadable<InterviewSetup | null> { return useMock(interviewSetup, 260) }
