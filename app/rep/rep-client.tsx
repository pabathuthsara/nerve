'use client'

/**
 * The M0 rep harness.
 *
 * One live rep against one persona, wrapped in the two measurements the gate is
 * written in. It talks to `VoiceProvider` and nothing else — no provider SDK,
 * no provider vocabulary. Pointing it at ElevenLabs is an environment variable.
 *
 * Note what is *not* here: no coaching, no hints, no encouragement mid-rep
 * (§05). The readouts below the fold are instrumentation for us, and they come
 * out at M1 when a real user first sees this screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createVoiceProvider } from '@/lib/voice'
import { RepRecorder } from '@/lib/audio/recorder'
import { uploadRepAudio } from '@/lib/db/audio'
import { attachAudio, finishSession, saveScore, startSession } from './actions'
import type { VoiceProvider } from '@/lib/voice/provider'
import {
  SESSION_CAP_SECONDS,
  VoiceError,
  type Calibration,
  type Persona,
  type PipelineTelemetry,
  type ProviderId,
  mayInterrupt,
  type SessionUsage,
  type SessionSummary,
  type TranscriptTurn,
  type TransportStats,
} from '@/lib/voice/types'
import { compileReinforcement } from '@/lib/voice/reinforcement'
import { WarmthSession } from '@/lib/warmth/session'
import { bindVoiceSteering } from '@/lib/warmth/voice-steering'
import { HttpSlowScorer } from '@/lib/warmth/slow'
import dynamic from 'next/dynamic'
import { DEV_TOOLS, TuningStore, activePreset, type TuningPreset } from '@/lib/tuning/store'
import type { DevReadout } from './dev-panel'

/**
 * Instrumentation, loaded only when the flag is on.
 *
 * `next/dynamic` puts the panel in its own chunk, so with the flag off a
 * browser never downloads it — not merely never renders it. The chunk is still
 * emitted to the build output; see the note on `DEV_TOOLS` for why that is as
 * far as this goes.
 */
const DevPanel = DEV_TOOLS
  ? dynamic(() => import('./dev-panel').then((m) => m.DevPanel), { ssr: false })
  : null
import {
  GraduationModal,
  MicOrb,
  TrainingWheels,
  TrainingWheelsToggle,
  recordCompletedSession,
  useTrainingWheels,
} from './warmth-indicator'
import { bandFor, type WarmthBand } from '@/lib/warmth/bands'
import type { WarmthEvent } from '@/lib/warmth/engine'
import type { WarmthTelemetry } from '@/lib/warmth/engine'
import { analyseCacheHealth, type CacheHealth } from '@/lib/metrics/cache'
import type { RoomControls } from '@/lib/audio/types'
import type { Scorecard } from '@/lib/grade/types'
import {
  LATENCY_DEGRADED_MS,
  LATENCY_GATE_MS,
  LatencyMeter,
  latencyVerdict,
  type LatencySample,
  type LatencyStats,
} from '@/lib/metrics/latency'
import {
  STABILITY_GATE_PER_5MIN,
  StabilityMeter,
  stabilityVerdict,
  warrantsReinforcement,
  type CharacterBreak,
  type StabilityStats,
} from '@/lib/metrics/stability'
import { analyseRttDrift, type RttDrift, type RttSample } from '@/lib/metrics/transport'

type Phase = 'idle' | 'connecting' | 'live' | 'ending' | 'ended' | 'failed'

/** The character-model arms the dev panel may switch between. */
const M0_MODELS = ['gpt-realtime-mini', 'gpt-realtime-2.1-mini', 'gpt-realtime'] as const

interface Props {
  persona: Persona
  provider: ProviderId
  calibration: Calibration
  silenceMs: number
  model: string
  /**
   * The signed-in user. Not optional: the storage path for a recording is
   * keyed to it, and RLS matches on that first path segment.
   */
  userId: string
  /**
   * Completed reps for this user, from the database. Null when the count could
   * not be read — the hook then falls back to the local number rather than
   * pretending this is someone's first rep.
   */
  completedSessions: number | null
}

interface CostTrend {
  firstThirdUsd: number | null
  lastThirdUsd: number | null
  changePercent: number | null
}

interface Report {
  persona: string
  provider: ProviderId
  model: string
  silenceMs: number
  startedAt: string
  seconds: number
  reason: SessionSummary['reason']
  latency: LatencyStats & { samples: LatencySample[] }
  stability: StabilityStats & { events: CharacterBreak[] }
  transport: { rttSamples: RttSample[]; medianRttMs: number | null; drift: RttDrift }
  usage: SessionUsage | null
  /**
   * Per-stage latency and per-vendor cost, for an adapter assembled out of
   * separate STT, LLM and TTS calls. Null on a native speech-to-speech arm,
   * which has no stages to report. Provider-neutral: this page still does not
   * know which vendor produced it.
   */
  pipeline: PipelineTelemetry | null
  /**
   * The parameter set that produced this recording.
   *
   * Stamped on every session whether or not anything was saved, because six
   * sessions into a tuning pass nobody remembers which one had decay at 0.5.
   */
  preset: TuningPreset
  costTrend: CostTrend
  technical: {
    overlapResponses: number
    toolSyntaxLeaks: number
    /** She spoke twice with no user turn between, and both reached the ear. */
    audibleDoubleTurns: number
  }
  warmth: (WarmthTelemetry & { steeringItemsSent: number }) | null
  scorecard: Scorecard | null
  cache: CacheHealth
  transcript: TranscriptTurn[]
}

export function RepClient({
  persona,
  provider,
  calibration,
  silenceMs,
  model,
  userId,
  completedSessions,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notices, setNotices] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [turns, setTurns] = useState<TranscriptTurn[]>([])
  const [partial, setPartial] = useState<{ user: string; agent: string }>({ user: '', agent: '' })
  const [speaking, setSpeaking] = useState<{ user: boolean; agent: boolean }>({ user: false, agent: false })
  const [samples, setSamples] = useState<LatencySample[]>([])
  const [breaks, setBreaks] = useState<CharacterBreak[]>([])
  const [overlapResponses, setOverlapResponses] = useState(0)
  const [toolSyntaxLeaks, setToolSyntaxLeaks] = useState(0)
  const [doubleTurns, setDoubleTurns] = useState(0)
  const [transport, setTransport] = useState<TransportStats>({ rttMs: null, jitterMs: null, packetsLost: null })
  const [report, setReport] = useState<Report | null>(null)
  const [room, setRoom] = useState<RoomControls | null>(null)
  const [ambientDb, setAmbientDb] = useState(-40)
  const [wetMix, setWetMix] = useState(0.1)
  const [oneShotMax, setOneShotMax] = useState(40)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [grading, setGrading] = useState(false)
  // Warmth reaches the UI as a BAND, not a number. The number exists only for
  // the training-wheels readout, which most users never see (§4).
  const [warmth, setWarmth] = useState(0)
  const [band, setBand] = useState<WarmthBand>('CLOSED')
  const [lastEvent, setLastEvent] = useState<WarmthEvent | null>(null)

  // The live parameter set. Created once and mutated in place, because the
  // warmth engine reads it on every turn — a React snapshot captured in a
  // callback is exactly what would stop a mid-session edit from landing.
  const tuningRef = useRef<TuningStore | null>(null)
  if (tuningRef.current === null) {
    tuningRef.current = new TuningStore({ persona, silenceMs, model, voiceId: null })
  }
  const tuning = tuningRef.current

  const providerRef = useRef<VoiceProvider | null>(null)
  /** The row this rep is being written into. Null until the insert lands. */
  const sessionIdRef = useRef<string | null>(null)
  /**
   * The in-flight insert. A rep can end faster than a round trip to Postgres
   * — a failed connect, or a user who changes their mind — and reading the id
   * ref alone would drop that rep's transcript on the floor.
   */
  const sessionOpenRef = useRef<Promise<string | null> | null>(null)
  const recorderRef = useRef<RepRecorder | null>(null)
  const latencyRef = useRef(new LatencyMeter(silenceMs))
  const stabilityRef = useRef(new StabilityMeter({ nonStaff: persona.slug === 'nadia' }))
  const rttSamplesRef = useRef<RttSample[]>([])
  const turnsRef = useRef<TranscriptTurn[]>([])
  const warmthRef = useRef<WarmthSession | null>(null)
  const overlapResponsesRef = useRef(0)
  const toolSyntaxLeaksRef = useRef(0)
  const doubleTurnsRef = useRef(0)
  const startedAtRef = useRef<string>('')
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearInterval)
    timersRef.current = []
  }, [])

  /**
   * Push the engine's state to the view.
   *
   * Called after each turn rather than on a timer: the ring should move when
   * something actually happened, and an interpolating ticker would read as a
   * score counting up, which is the thing §4 exists to prevent.
   */
  const publishWarmth = useCallback(() => {
    const engine = warmthRef.current?.engine
    if (!engine) return
    setWarmth(engine.warmth)
    setBand(engine.band)
    const events = engine.events
    setLastEvent(events[events.length - 1] ?? null)
  }, [])

  const note = useCallback((message: string) => {
    setNotices((prev) => [...prev.slice(-40), message])
  }, [])

  /* ---------------------------------------------------------------- */

  const start = useCallback(async () => {
    if (providerRef.current) return
    setPhase('connecting')
    setError(null)
    setNotices([])
    setElapsed(0)
    setTurns([])
    setSamples([])
    setBreaks([])
    setOverlapResponses(0)
    setToolSyntaxLeaks(0)
    setDoubleTurns(0)
    setReport(null)
    setPartial({ user: '', agent: '' })
    latencyRef.current = new LatencyMeter(silenceMs)
    stabilityRef.current = new StabilityMeter({ nonStaff: persona.slug === 'nadia' })

    // The mechanic. Opens at the level's jittered start and is never shown to
    // the user mid-rep — a visible meter turns a conversation into a game.
    const connectedAt = performance.now()
    warmthRef.current?.dispose()
    warmthRef.current = new WarmthSession({
      // Getters, not values. Everything the dev panel can move is read fresh on
      // each turn, so a slider changes her next reply without a restart (§3).
      persona: () => tuning.persona,
      trajectory: () => tuning.persona.trajectory,
      scorer: new HttpSlowScorer(),
      nowSeconds: () => (performance.now() - connectedAt) / 1000,
    })
    setWarmth(warmthRef.current.engine.warmth)
    setBand(warmthRef.current.engine.band)
    setLastEvent(null)
    rttSamplesRef.current = []
    turnsRef.current = []
    overlapResponsesRef.current = 0
    toolSyntaxLeaksRef.current = 0
    doubleTurnsRef.current = 0
    startedAtRef.current = new Date().toISOString()

    const voice = createVoiceProvider({ envDefault: provider, openai: { model } })
    providerRef.current = voice
    bindVoiceSteering(voice, warmthRef.current)

    voice.on('user.speech.start', ({ at }) => {
      setSpeaking((s) => ({ ...s, user: true }))
      // Dialogue state changes when speech begins, not when transcription
      // eventually finishes. This prevents a late transcript from making the
      // next agent turn look like a false double-turn.
      stabilityRef.current.observeUser()
      // The character cut across the user; that turn is not a round trip.
      latencyRef.current.discardPending()

      void at
    })

    voice.on('user.speech.stop', ({ at }) => {
      setSpeaking((s) => ({ ...s, user: false }))
      latencyRef.current.userSpeechStop(at)
    })

    voice.on('agent.speech.start', ({ at }) => {
      setSpeaking((s) => ({ ...s, agent: true }))
      const sample = latencyRef.current.agentSpeechStart(at)
      if (sample) setSamples((prev) => [...prev, sample])
    })

    voice.on('agent.speech.stop', () => {
      setSpeaking((s) => ({ ...s, agent: false }))
    })

    voice.on('agent.overlap', ({ at }) => {
      overlapResponsesRef.current += 1
      setOverlapResponses(overlapResponsesRef.current)
      note(`overlap guard cancelled a response at ${at.toFixed(1)}s`)
    })

    // Distinct from an overlap: this one was AUDIBLE. The turn stays in the
    // transcript — the user heard it — and only the incident is counted.
    voice.on('agent.double-turn', ({ at }) => {
      doubleTurnsRef.current += 1
      setDoubleTurns(doubleTurnsRef.current)
      note(`she spoke twice with no user turn between, at ${at.toFixed(1)}s`)
    })

    voice.on('agent.tool-leak', ({ at }) => {
      toolSyntaxLeaksRef.current += 1
      setToolSyntaxLeaks(toolSyntaxLeaksRef.current)
      note(`suppressed literal scene-tool syntax at ${at.toFixed(1)}s`)
    })

    voice.on('character.exit', () => {
      note(`${persona.name} ended the encounter`)
      void stop('character')
    })

    voice.on('user.transcript', ({ turn, final }) => {
      if (final) {
        stabilityRef.current.observeUser()
        turnsRef.current.push(turn)
        setTurns((prev) => [...prev, turn])
        setPartial((p) => ({ ...p, user: '' }))
        // Synchronous and local. Every third turn also fires the model scorer,
        // which is deliberately not awaited — see WarmthSession.fireSlow.
        warmthRef.current?.onUserTurn(turn)
        publishWarmth()
      } else {
        setPartial((p) => ({ ...p, user: turn.text }))
      }
    })

    voice.on('agent.transcript', ({ turn, final }) => {
      if (!final) {
        setPartial((p) => ({ ...p, agent: turn.text }))
        return
      }
      turnsRef.current.push(turn)
      setTurns((prev) => [...prev, turn])
      setPartial((p) => ({ ...p, agent: '' }))
      warmthRef.current?.onAgentTurn(turn)
      publishWarmth()

      // Countermeasure 3 (§05): reinforcement is event-driven. Blind timed
      // session updates damaged prompt-cache reuse in the five-minute run.
      const hits = stabilityRef.current.observe(turn.text, turn.t_end)
      if (hits.length > 0) {
        setBreaks((prev) => [...prev, ...hits])
        // Identity breaks only — see `warrantsReinforcement`. A band violation
        // is still detected, counted and shown in the gate; it just does not
        // answer with a paragraph that makes her longer.
        const identity = hits.filter(warrantsReinforcement)
        if (identity.length > 0) {
          voice.reinforce(compileReinforcement(persona, turnsRef.current))
          note(`re-injected after break: ${identity.map((h) => h.rule).join(', ')}`)
        }
      }
    })

    voice.on('error', ({ error: err }) => {
      if (err.fatal) {
        setError(err.message)
        setPhase('failed')
      } else {
        note(`provider error (non-fatal): ${err.message}`)
      }
    })

    try {
      await voice.connect(persona, calibration)
    } catch (cause) {
      const message = cause instanceof VoiceError ? cause.message : String(cause)
      setError(message)
      setPhase('failed')
      providerRef.current = null
      return
    }

    setPhase('live')

    // Persistence is best-effort and deliberately not awaited. A rep is a
    // live conversation; it must not wait on Postgres to begin, and it must
    // never end because a write failed. Failures become notices.
    sessionIdRef.current = null
    sessionOpenRef.current = startSession({
      personaSlug: persona.slug,
      provider: voice.id,
      model: voice.model,
    })
      .then((result) => {
        sessionIdRef.current = result.sessionId
        if (!result.ok && result.message) note(result.message)
        return result.sessionId
      })
      .catch(() => {
        note('Not saved — could not reach the database.')
        return null
      })

    // Taps the analysers the provider already exposes, so the recording is
    // her voice as rendered — room and all — and the mic as the model heard it.
    const recorder = RepRecorder.create(voice.getAnalyser())
    recorderRef.current = recorder
    if (recorder) recorder.start()
    else note('Not recording — this browser cannot capture session audio.')

    // The room only exists once her track has arrived.
    const live = voice.getRoom()
    if (live) {
      setRoom(live)
      setAmbientDb(live.ambientLevelDb)
      setWetMix(live.wetMix)
    }

    // Elapsed clock, and the 8-minute cap surfaced in the UI. The adapter
    // enforces it independently; this only shows it.
    const startedAt = performance.now()
    timersRef.current.push(
      setInterval(() => {
        const seconds = (performance.now() - startedAt) / 1000
        setElapsed(seconds)
        if (seconds >= SESSION_CAP_SECONDS) void stop('cap')
      }, 200),
    )

    // Transport stats isolate network distance from inference time — the thing
    // that says whether a latency failure is fixable by changing region.
    timersRef.current.push(
      setInterval(() => {
        void providerRef.current?.getTransportStats().then((stats) => {
          setTransport(stats)
          if (stats.rttMs !== null) {
            rttSamplesRef.current.push({
              atSeconds: Math.round(((performance.now() - startedAt) / 1000) * 10) / 10,
              rttMs: stats.rttMs,
            })
          }
        })
      }, 2000),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, provider, calibration, silenceMs, model, note])

  const stop = useCallback(
    async (reason: SessionSummary['reason'] = 'user') => {
      const voice = providerRef.current
      if (!voice) return
      providerRef.current = null
      setPhase('ending')
      clearTimers()

      const summary = await voice.end(reason)
      const latency = { ...latencyRef.current.stats(), samples: [...latencyRef.current.samples] }
      const stability = {
        ...stabilityRef.current.stats(summary.seconds),
        events: [...stabilityRef.current.all],
      }
      const rtt = [...rttSamplesRef.current]
      const rttValues = rtt.map((sample) => sample.rttMs).sort((a, b) => a - b)

      // Read the meter before disposing it; an in-flight slow score is dropped
      // rather than awaited, exactly as it would be mid-rep.
      const warmth = warmthRef.current?.telemetry(summary.seconds) ?? null
      warmthRef.current?.dispose()
      warmthRef.current = null

      setTurns(summary.turns)
      setSpeaking({ user: false, agent: false })
      setReport({
        persona: persona.slug,
        provider: summary.provider,
        model: summary.model,
        silenceMs,
        startedAt: startedAtRef.current,
        seconds: summary.seconds,
        reason: summary.reason,
        warmth,
        scorecard: null,
        cache: analyseCacheHealth(summary.usage),
        latency,
        stability,
        transport: {
          rttSamples: rtt,
          medianRttMs: rttValues.length ? (rttValues[Math.floor(rttValues.length / 2)] ?? null) : null,
          drift: analyseRttDrift(rtt),
        },
        usage: summary.usage,
        pipeline: summary.pipeline ?? null,
        preset: activePreset(tuning.get()),
        costTrend: analyseCostTrend(summary.usage),
        technical: {
          overlapResponses: overlapResponsesRef.current,
          toolSyntaxLeaks: toolSyntaxLeaksRef.current,
          audibleDoubleTurns: doubleTurnsRef.current,
        },
        transcript: summary.turns,
      })
      setRoom(null)
      setPhase('ended')
      // Only completed reps count towards the five that training wheels default
      // on for. A connection that failed taught nobody anything.
      if (summary.turns.length > 0) recordCompletedSession()

      // Persist, transcript first. The upload is the slow half on a home
      // connection, so a rep whose audio never lands still has everything
      // scoring and progression read.
      const sessionId = sessionIdRef.current ?? (await sessionOpenRef.current)
      sessionOpenRef.current = null
      const recorder = recorderRef.current
      recorderRef.current = null
      const recording = recorder ? await recorder.stop().catch(() => null) : null

      if (sessionId) {
        const saved = await finishSession({
          sessionId,
          seconds: summary.seconds,
          reason: summary.reason,
          turns: summary.turns,
          usage: summary.usage,
          rate: summary.rate,
          provider: summary.provider,
          model: summary.model,
          // The meter, read before it was disposed above. Without it the
          // session row knows the rep happened and nothing about how it went.
          warmth,
        }).catch(() => ({ ok: false, message: 'Not saved — could not reach the database.' }))
        if (!saved.ok && saved.message) note(saved.message)

        if (recording) {
          const upload = await uploadRepAudio({
            userId,
            sessionId,
            blob: recording.blob,
            mimeType: recording.mimeType,
          }).catch(() => ({ path: null, message: 'Audio not saved — the upload failed.' }))

          if (upload.path) {
            const linked = await attachAudio({ sessionId, path: upload.path })
            if (!linked.ok && linked.message) note(linked.message)
            else note(`audio saved · ${(recording.bytes / 1024).toFixed(0)} KB · deleted after 30 days`)
          } else if (upload.message) {
            note(upload.message)
          }
        }
      } else if (recording) {
        note('Audio discarded — this rep has no saved session to attach it to.')
      }

      // GRADE runs once, after the session, on a separate path from the live
      // scorer (§Part 3). Live-scorer noise never enters a stored grade.
      if (summary.turns.length > 0) {
        setGrading(true)
        void fetch('/api/grade', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            transcript: summary.turns,
            sessionSeconds: summary.seconds,
            personaName: persona.name,
          }),
        })
          .then(async (response) => (response.ok ? ((await response.json()) as Scorecard) : null))
          .then((card) => {
            setScorecard(card)
            // Fold it into the downloadable report so runs stay diffable.
            setReport((prev) => (prev ? { ...prev, scorecard: card } : prev))
            // A grade is written once, under the model that produced it (§13).
            if (card && sessionIdRef.current) {
              void saveScore({
                sessionId: sessionIdRef.current,
                scorecard: card,
                provider: summary.provider,
              })
                .then((result) => {
                  if (!result.ok && result.message) note(result.message)
                })
                .catch(() => note('Score not saved — could not reach the database.'))
            }
          })
          .catch(() => setScorecard(null))
          .finally(() => setGrading(false))
      }
    },
    [clearTimers, note, persona.slug, silenceMs, userId],
  )

  useEffect(() => {
    return () => {
      clearTimers()
      recorderRef.current?.dispose()
      recorderRef.current = null
      warmthRef.current?.dispose()
      warmthRef.current = null
      void providerRef.current?.end('error')
      providerRef.current = null
    }
  }, [clearTimers])

  /* ---------------------------------------------------------------- */

  const liveLatency = useMemo(() => latencyRef.current.stats(), [samples])
  const wheels = useTrainingWheels(persona.level, completedSessions)
  const liveStability = useMemo(
    () => stabilityRef.current.stats(elapsed),
    [breaks, elapsed],
  )

  const markBreak = useCallback(() => {
    const noteText = window.prompt('What did she do? (one line)')
    if (!noteText) return
    const entry = stabilityRef.current.mark(elapsed, noteText)
    setBreaks((prev) => [...prev, entry])
  }, [elapsed])


  return (
    <main style={{ maxWidth: 860 }}>
      <h1 style={{ marginBottom: 4 }}>M0 — {persona.name}, level {persona.level}</h1>
      <p style={{ marginTop: 0, color: '#666' }}>{persona.scene}</p>

      <section style={box}>
        <Row label="provider" value={provider} />
        <Row label="model" value={model} />
        <Row label="silence threshold" value={`${silenceMs}ms`} />
        <Row label="interrupts" value={mayInterrupt(persona) ? 'yes' : 'no (levels 1–4 never do)'} />
        <Row label="cap" value={`${SESSION_CAP_SECONDS / 60} min`} />
        <Row label="overlap responses cancelled" value={String(overlapResponses)} />
        <Row label="tool syntax suppressed" value={String(toolSyntaxLeaks)} />
        <Row label="audible double turns" value={String(doubleTurns)} />
      </section>

      {provider === 'openai' && phase !== 'live' && phase !== 'connecting' && phase !== 'ending' ? (
        <p style={{ ...box, display: 'flex', gap: 12 }}>
          Character A/B:
          <a href="/rep?model=gpt-realtime-mini">legacy mini</a>
          <a href="/rep?model=gpt-realtime-2.1-mini">2.1 mini</a>
          <a href="/rep?model=gpt-realtime">legacy full</a>
          <span style={{ color: '#888' }}>Run the same script and compare breaks per five minutes.</span>
        </p>
      ) : null}

      {provider === 'elevenlabs' && (
        <p style={{ ...box, borderColor: '#c60', background: '#fff8f0' }}>
          VOICE_PROVIDER is set to <strong>elevenlabs</strong>: an assembled pipeline —
          our VAD, streaming transcription, a text model, then ElevenLabs for the voice
          alone. Nothing on this page changed to support it. Per-stage latency and
          per-character cost land in the report below and in the downloaded JSON.
        </p>
      )}

      {/* -------- the rep itself: timer, mission, nothing else --------

          No coaching, no hints, no encouragement (§05). The ring is the only
          thing on this screen that reacts to how it is going, and it does so
          without a number, a delta or a direction. */}
      <section style={{ ...box, background: '#fafafa' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <MicOrb band={band} speaking={speaking.user} live={phase === 'live'} />
          <strong style={{ fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>
            {formatClock(elapsed)}
          </strong>
          <span>{speaking.user ? '● you' : '○ you'}</span>
          <span>{speaking.agent ? `● ${persona.name}` : `○ ${persona.name}`}</span>

          {phase === 'idle' || phase === 'failed' || phase === 'ended' ? (
            <button onClick={() => void start()} style={btn}>Start rep</button>
          ) : null}
          {phase === 'live' ? (
            <>
              <button onClick={() => void stop('user')} style={btn}>End rep</button>
              <button onClick={markBreak} style={btn}>Mark a break</button>
            </>
          ) : null}
          {phase === 'connecting' ? <span>connecting…</span> : null}

          {/* Levels 1-3 only, first five sessions by default. The crutch comes
              off at level 4 and does not come back (§4b). */}
          {wheels.visible && phase === 'live' && (
            <TrainingWheels warmth={warmth} band={band} track={persona.track} />
          )}
          {phase === 'ending' ? <span>closing…</span> : null}
        </div>

        {/* Outside a live rep only. A control on screen mid-conversation is the
            coaching furniture §05 keeps off this page. */}
        {phase !== 'live' && phase !== 'ending' && (
          <div style={{ marginTop: 12 }}>
            <TrainingWheelsToggle wheels={wheels} level={persona.level} />
          </div>
        )}

        <p style={{ marginBottom: 0 }}>
          <strong>Mission.</strong> Start a conversation with her and keep it going. That is all.
        </p>
      </section>

      {error && (
        <p style={{ ...box, borderColor: '#c00', background: '#fff5f5' }}>{error}</p>
      )}

      {/* -------- transcript -------- */}
      <section style={box}>
        <h2 style={h2}>Transcript</h2>
        {turns.length === 0 && !partial.user && !partial.agent ? (
          <p style={{ color: '#888', margin: 0 }}>Nothing said yet.</p>
        ) : null}
        {turns.map((turn, i) => (
          <p key={`${turn.t_start}-${i}`} style={{ margin: '4px 0' }}>
            <span style={{ color: '#999', fontVariantNumeric: 'tabular-nums' }}>
              {turn.t_start.toFixed(1)}–{turn.t_end.toFixed(1)}s{' '}
            </span>
            <strong>{turn.speaker === 'user' ? 'you' : persona.name}:</strong> {turn.text}
          </p>
        ))}
        {partial.user ? <p style={{ margin: '4px 0', color: '#888' }}><strong>you:</strong> {partial.user}</p> : null}
        {partial.agent ? <p style={{ margin: '4px 0', color: '#888' }}><strong>{persona.name}:</strong> {partial.agent}</p> : null}
      </section>

      {/* -------- gate one: latency -------- */}
      <section style={box}>
        <h2 style={h2}>Gate 1 — round trip</h2>
        <Row label="samples" value={String(liveLatency.count)} />
        <Row
          label="median response"
          value={fmtMs(liveLatency.medianMs)}
          highlight={verdictColour(liveLatency.medianMs)}
        />
        <Row label="p90 response" value={fmtMs(liveLatency.p90Ms)} />
        <Row label="min / max" value={`${fmtMs(liveLatency.minMs)} / ${fmtMs(liveLatency.maxMs)}`} />
        <Row label="median perceived (incl. VAD wait)" value={fmtMs(liveLatency.medianPerceivedMs)} />
        <Row label="network rtt" value={fmtMs(transport.rttMs)} />
        <Row label="jitter" value={fmtMs(transport.jitterMs)} />
        <Row label="verdict" value={latencyVerdict(liveLatency)} />
        <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
          Response is from the moment VAD saw you stop to the moment her audio starts playing.
          Gate is a median under {LATENCY_GATE_MS}ms; past {LATENCY_DEGRADED_MS}ms it stops
          feeling like a conversation. Perceived adds the {silenceMs}ms silence window we ask
          for deliberately — if response passes but perceived feels dead, tune the threshold,
          not the architecture.
        </p>
      </section>

      {/* -------- gate two: character stability -------- */}
      <section style={box}>
        <h2 style={h2}>Gate 2 — character stability</h2>
        <Row label="breaks" value={String(liveStability.breaks)} />
        <Row label="drift (advisory)" value={String(liveStability.drifts)} />
        <Row
          label="question turns"
          value={`${liveStability.questionTurns} / ${liveStability.agentTurns}`}
        />
        <Row
          label="question-turn share"
          value={liveStability.questionTurnShare === null
            ? '—'
            : `${(liveStability.questionTurnShare * 100).toFixed(1)}%`}
        />
        <Row
          label="longest question streak"
          value={String(liveStability.longestQuestionStreak)}
        />
        <Row
          label="median agent words"
          value={liveStability.medianAgentWords === null
            ? '—'
            : String(liveStability.medianAgentWords)}
        />
        <Row label="turns over 15 words" value={String(liveStability.over15WordTurns)} />
        <Row
          label="breaks per 5 min"
          value={liveStability.breaksPer5Min === null ? '—' : liveStability.breaksPer5Min.toFixed(2)}
        />
        <Row label="verdict" value={stabilityVerdict(liveStability)} />
        {breaks.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {breaks.map((b, i) => (
              <li key={`${b.at}-${i}`} style={{ color: b.severity === 'break' ? '#c00' : '#c60' }}>
                {b.at.toFixed(1)}s · {b.rule} · “{b.match}”
              </li>
            ))}
          </ul>
        )}
        <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
          Gate is under {STABILITY_GATE_PER_5MIN} breaks per 5-minute session. Phrase rules and
          structural rules run on every agent turn; manual marks remain available for subtler
          warmth drift. Verdicts need a rep of at least 2.5 minutes.
        </p>
      </section>

      {notices.length > 0 && (
        <section style={box}>
          <h2 style={h2}>Session log</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#666', fontSize: 13 }}>
            {notices.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </section>
      )}

      {/* -------- room tuning: live, by ear (§1b) -------- */}
      {room && (
        <section style={box}>
          <h2 style={h2}>Room — {room.sceneId}</h2>
          <label style={slider}>
            <span>ambient bed</span>
            <input
              type="range" min={-60} max={-20} step={1} value={ambientDb}
              onChange={(e) => {
                const db = Number(e.target.value)
                setAmbientDb(db)
                room.setAmbientLevelDb(db)
              }}
            />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ambientDb} dB</span>
          </label>
          <label style={slider}>
            <span>reverb wet</span>
            <input
              type="range" min={0} max={40} step={1} value={Math.round(wetMix * 100)}
              onChange={(e) => {
                const wet = Number(e.target.value) / 100
                setWetMix(wet)
                room.setWetMix(wet)
              }}
            />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(wetMix * 100)}%</span>
          </label>
          <label style={slider}>
            <span>one-shot gap</span>
            <input
              type="range" min={5} max={90} step={1} value={oneShotMax}
              onChange={(e) => {
                const max = Number(e.target.value)
                setOneShotMax(max)
                room.setOneShotInterval([Math.max(3, Math.round(max / 2)), max])
              }}
            />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {Math.max(3, Math.round(oneShotMax / 2))}–{oneShotMax}s
            </span>
          </label>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
            Quiet is not silence — digital silence is the giveaway. Because nothing masks her
            voice in here, a dry voice is more obvious in this scene, not less. Everything
            distinctive is a randomly scheduled one-shot, never part of the loop.
          </p>
        </section>
      )}

      {/* Warmth appears only after the rep. Showing the meter live would turn
          a conversation into a game with a visible score, and the user would
          play the number instead of the person. */}
      {report?.warmth && (
        <section style={box}>
          <h2 style={h2}>Warmth</h2>
          <Row
            label="opened at"
            value={`${report.warmth.start.toFixed(1)} · ${report.warmth.bandsVisited[0] ?? '—'}`}
          />
          <Row label="ended at" value={`${report.warmth.end.toFixed(1)}`} />
          <Row
            label="peak / trough"
            value={`${report.warmth.peak.toFixed(1)} / ${report.warmth.trough.toFixed(1)}`}
          />
          <Row label="bands visited" value={report.warmth.bandsVisited.join(' → ')} />
          <Row
            label="time in band"
            value={Object.entries(report.warmth.timeInBand)
              .filter(([, seconds]) => seconds > 0)
              .map(([band, seconds]) => `${band} ${seconds.toFixed(0)}s`)
              .join('  ') || '—'}
          />
          <Row
            label="async score latency (median / p90)"
            value={`${report.warmth.asyncScoreLatencyMs.median}ms / ${report.warmth.asyncScoreLatencyMs.p90}ms`}
          />
          <Row label="async scores dropped" value={String(report.warmth.asyncScoreLatencyMs.skipped)} />
          <Row
            label="steering items sent"
            value={`${report.warmth.steeringItemsSent} (one per user turn)`}
          />
          {report.warmth.events.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {report.warmth.events.map((event, i) => (
                <li key={`${event.at}-${i}`} style={{ color: event.delta < 0 ? '#c00' : '#070' }}>
                  {event.at.toFixed(1)}s · {event.delta > 0 ? '+' : ''}{event.delta.toFixed(1)}
                  {' → '}{event.warmthAfter.toFixed(1)} {event.band} · {event.reason}
                  {event.intimacy !== null ? ` · intimacy ${event.intimacy}` : ''}
                </li>
              ))}
            </ul>
          )}
          <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
            Async scoring runs off the hot path — the median above is how long the model took,
            not latency added to any response. Compare median response in Gate 1 against the
            previous round to confirm it added nothing.
          </p>
        </section>
      )}

      {(grading || scorecard) && (
        <section style={box}>
          <h2 style={h2}>Scorecard (§07)</h2>
          {grading && !scorecard ? <p style={{ margin: 0 }}>grading…</p> : null}
          {scorecard && (
            <>
              <Row label="composite" value={String(scorecard.composite)} />
              <Row
                label="deterministic / judgement"
                value={`${scorecard.deterministicScore} · 60%  +  judgement · 40%`}
              />
              {Object.entries(scorecard.subScores).map(([key, value]) => (
                <Row key={key} label={key} value={String(value)} />
              ))}
              <Row label="focus next rep" value={scorecard.focus.join(', ')} />
              <Row label="outcome (scores zero)" value={scorecard.outcome} />
              <Row label="graded by" value={scorecard.model} />
              <p style={{ margin: '8px 0 0' }}><strong>Went well.</strong> {scorecard.wentWell}</p>
              <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
                Outcome is recorded and contributes zero points. A clean rep that ends in
                rejection can score 92. Graded once, after the session, by a different and
                stronger model than the one driving warmth live.
              </p>
            </>
          )}
        </section>
      )}

      {report && (
        <section style={box}>
          <h2 style={h2}>Prompt cache</h2>
          <Row
            label="cached share of input text"
            value={report.cache.hitRate === null ? '—' : `${(report.cache.hitRate * 100).toFixed(1)}%`}
            highlight={report.cache.verdict === 'healthy' ? '#070' : '#c00'}
          />
          <Row
            label="first / last third"
            value={report.cache.firstThirdHitRate === null
              ? '—'
              : `${(report.cache.firstThirdHitRate * 100).toFixed(1)}% / ${((report.cache.lastThirdHitRate ?? 0) * 100).toFixed(1)}%`}
          />
          <Row label="busts" value={String(report.cache.busts.length)} />
          <Row label="verdict" value={report.cache.verdict} />
          {report.cache.busts.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#c00' }}>
              {report.cache.busts.map((bust, i) => (
                <li key={`${bust.at}-${i}`}>
                  {bust.at.toFixed(1)}s · hit rate {(bust.hitRate * 100).toFixed(0)}%
                  {bust.costMultiple !== null ? ` · ${bust.costMultiple}x a normal response` : ''}
                </li>
              ))}
            </ul>
          )}
          <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
            The character contract is the cached prefix. Steering is appended as a conversation
            item and never written back into instructions, so this should stay flat across the
            session. A bust here is the 2.9x response from round 5.
          </p>
        </section>
      )}

      {/* Only an assembled adapter fills this in. On a native speech-to-speech
          arm there are no stages to break the round trip into, so the section
          simply is not there. */}
      {report?.pipeline && (
        <section style={box}>
          <h2 style={h2}>Pipeline</h2>
          <Row label="voice model" value={report.pipeline.ttsModel} />
          <Row label="transcription" value={report.pipeline.sttModel} />
          <Row label="character model" value={report.pipeline.llmModel} />
          <div style={{ height: 8 }} />
          {(
            [
              ['vad silence', 'vadSilenceMs'],
              ['transcription', 'sttMs'],
              ['first token', 'llmFirstTokenMs'],
              ['reply complete', 'llmCompleteMs'],
              ['first audio byte', 'ttsFirstByteMs'],
              ['perceived total', 'totalPerceivedMs'],
            ] as const
          ).map(([label, key]) => {
            const stage = report.pipeline?.stages[key]
            return (
              <Row
                key={key}
                label={label}
                value={
                  stage && stage.count > 0
                    ? `${stage.median}ms / ${stage.p90}ms  (n=${stage.count})`
                    : '—'
                }
                {...(key === 'totalPerceivedMs' ? { highlight: '#070' } : {})}
              />
            )
          })}
          <div style={{ height: 8 }} />
          <Row label="barge-ins" value={String(report.pipeline.bargeIns)} />
          <Row label="turns truncated to what played" value={String(report.pipeline.truncatedTurns)} />
          <div style={{ height: 8 }} />
          <Row
            label="voice characters"
            value={`${report.pipeline.usage.elevenlabs.characters} (${report.pipeline.usage.elevenlabs.creditsUsed} credits)`}
          />
          <Row
            label="credits remaining"
            value={
              report.pipeline.usage.elevenlabs.creditsRemaining === null
                ? 'not reported'
                : String(report.pipeline.usage.elevenlabs.creditsRemaining)
            }
          />
          <Row label="voice cost" value={fmtUsd(report.pipeline.usage.elevenlabs.costUsd)} />
          <Row label="text cost" value={fmtUsd(report.pipeline.usage.openai.costUsd)} />
          <Row label="total" value={fmtUsd(report.pipeline.usage.totalCostUsd)} />
          <Row label="cost per minute" value={fmtUsd(report.pipeline.usage.costPerMinuteUsd)} />
          <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
            Median / p90. The p90 matters more than it looks: one two-second turn in ten
            breaks the illusion even when the median is fine. Perceived total is the number
            to put next to gpt-realtime&rsquo;s 1368ms.
          </p>
        </section>
      )}

      {report && (
        <section style={box}>
          <h2 style={h2}>Report</h2>
          <Row label="duration" value={`${report.seconds.toFixed(1)}s`} />
          <Row label="ended by" value={report.reason} />
          <Row label="model" value={report.model} />
          <Row
            label="provider-reported tokens"
            value={report.usage ? String(report.usage.totalTokens) : 'not reported'}
          />
          <Row
            label="token-priced cost"
            value={fmtUsd(report.usage?.pricedCostUsd ?? null)}
          />
          <Row
            label="token-priced cost / min"
            value={fmtUsd(report.usage?.pricedCostPerMinuteUsd ?? null)}
          />
          <Row
            label="response cost, first / last third"
            value={`${fmtUsd(report.costTrend.firstThirdUsd)} / ${fmtUsd(report.costTrend.lastThirdUsd)}`}
          />
          <Row label="median network rtt" value={fmtMs(report.transport.medianRttMs)} />
          <Row
            label="rtt first / middle / last third"
            value={`${fmtMs(report.transport.drift.firstThirdMedianMs)} / ${fmtMs(report.transport.drift.middleThirdMedianMs)} / ${fmtMs(report.transport.drift.lastThirdMedianMs)}`}
          />
          <Row label="rtt drift" value={report.transport.drift.verdict} />
          <Row
            label="overlap responses cancelled"
            value={String(report.technical.overlapResponses)}
          />
          <Row
            label="tool syntax suppressed"
            value={String(report.technical.toolSyntaxLeaks)}
          />
          <Row
            label="audible double turns"
            value={String(report.technical.audibleDoubleTurns)}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={btn} onClick={() => void navigator.clipboard.writeText(JSON.stringify(report, null, 2))}>
              Copy JSON
            </button>
            <button style={btn} onClick={() => downloadReport(report)}>Download JSON</button>
          </div>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 0 }}>
            Cost is calculated from provider-reported response tokens, not minutes × an assumed
            rate. Reconcile it against dashboard billing before changing tier caps. RTT drift needs
            one full eight-minute run; short sessions cannot show whether it plateaus.
          </p>
        </section>
      )}
      {/* The sentence this whole mechanic exists to earn. Shown once, ever. */}
      {wheels.graduating && <GraduationModal onDismiss={wheels.acknowledgeGraduation} />}

      {/* Instrumentation, not a feature. Renders nothing unless
          NEXT_PUBLIC_DEV_TOOLS=true. */}
      {DEV_TOOLS && DevPanel && (
        <DevPanel
          store={tuning}
          room={room}
          models={M0_MODELS}
          voices={[]}
          readout={{
            warmth,
            band,
            lastEvent,
            latency: liveLatency,
            stages: report?.pipeline
              ? Object.entries(report.pipeline.stages).map(([label, stat]) => ({
                  label,
                  median: stat.median,
                  p90: stat.p90,
                }))
              : [],
          }}
        />
      )}
    </main>
  )
}

/* ------------------------------------------------------------------ */

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: highlight ?? 'inherit' }}>{value}</span>
    </div>
  )
}

function fmtMs(value: number | null): string {
  return value === null ? '—' : `${value}ms`
}

function fmtUsd(value: number | null): string {
  return value === null ? 'not available' : `$${value.toFixed(4)}`
}

function analyseCostTrend(usage: SessionUsage | null): CostTrend {
  const samples = usage?.samples.filter((sample) => sample.pricedCostUsd !== null) ?? []
  if (samples.length < 3) return { firstThirdUsd: null, lastThirdUsd: null, changePercent: null }
  const third = Math.max(1, Math.floor(samples.length / 3))
  const average = (values: typeof samples) =>
    values.reduce((sum, sample) => sum + (sample.pricedCostUsd ?? 0), 0) / values.length
  const first = average(samples.slice(0, third))
  const last = average(samples.slice(-third))
  return {
    firstThirdUsd: first,
    lastThirdUsd: last,
    changePercent: first > 0 ? ((last - first) / first) * 100 : null,
  }
}

function verdictColour(medianMs: number | null): string | undefined {
  if (medianMs === null) return undefined
  if (medianMs < LATENCY_GATE_MS) return '#070'
  if (medianMs < LATENCY_DEGRADED_MS) return '#c60'
  return '#c00'
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function downloadReport(report: Report): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nerve-m0-${report.persona}-${report.startedAt.replace(/[:.]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const box: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: 12,
  margin: '12px 0',
}

const h2: React.CSSProperties = { fontSize: 14, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }

const slider: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '140px 1fr 90px',
  gap: 12,
  alignItems: 'center',
  padding: '3px 0',
}

const btn: React.CSSProperties = {
  font: 'inherit',
  padding: '6px 12px',
  border: '1px solid #333',
  background: '#fff',
  cursor: 'pointer',
}
