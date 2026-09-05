'use client'

/**
 * The live rep, for the Arena screens.
 *
 * This is the real thing: `createVoiceProvider`, the warmth engine, the
 * recorder, the session row, the grade. It replaces the scripted session the
 * frontend was built against, and it keeps that shape exactly — the live
 * screen did not change.
 *
 * It talks to `VoiceProvider` and nothing else (§04). No provider SDK, no
 * provider vocabulary, no environment variable read in the browser: the server
 * component resolves the adapter and hands the answer down as `config`.
 *
 * The rules the screen enforces are enforced here, once:
 *
 *   three minutes    a dating rep is 180 seconds and she leaves when they end
 *   the number       decided at the wind-down, offered by her as she goes, and
 *                    never announced by the app mid-rep
 *   no coaching      the only things the user gets mid-rep are the timer, the
 *                    ring and her voice (§05)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createVoiceProvider } from '@/lib/voice'
import type { VoiceProvider } from '@/lib/voice/provider'
import {
  VoiceError,
  type Analysers,
  type Calibration,
  type Persona as EnginePersona,
  type ProviderId,
  type SessionSummary,
  type TranscriptTurn,
} from '@/lib/voice/types'
import { WarmthSession } from '@/lib/warmth/session'
import { bindVoiceSteering } from '@/lib/warmth/voice-steering'
import { HttpSlowScorer } from '@/lib/warmth/slow'
import {
  countIncidents,
  emptyIncidents,
  incidentsAreAlarming,
  type RepIncidents,
} from '@/lib/voice/incidents'
import { compileReinforcement } from '@/lib/voice/reinforcement'
import { SafetyMonitor } from '@/lib/safety/monitor'
import {
  CLOSE_DIRECTIVE,
  CORRECT_DIRECTIVE,
  DECLINE_DIRECTIVE,
  type SafetyAction,
} from '@/lib/safety/escalation'
import { StabilityMeter } from '@/lib/metrics/stability'
import { RepRecorder } from '@/lib/audio/recorder'
import { uploadRepAudio } from '@/lib/db/audio'
import { abandonSession, attachAudio, finishSession, saveScore, startSession } from '@/app/rep/actions'
import { completeRep } from './rep-completion'
import type { Scorecard } from '@/lib/grade/types'
import { uiBand, uiWarmth } from './progression'
import {
  dueSceneBeat,
  givesNumber,
  inventNumber,
  isClosingOver,
  isTimeUp,
  repDurationMs,
  repThreshold,
  shouldArm,
  shouldWrapUp,
} from './rep-rules'
import type { Band } from './types'

export { DATING_DURATION_MS } from './rep-rules'

export type RepStatus = 'idle' | 'connecting' | 'live' | 'ending' | 'ended'
export type SpeakingState = 'none' | 'user' | 'persona' | 'thinking'

export interface RepOutcome {
  won: boolean
  phoneNumber?: string
  exitLine: string
}

/**
 * Everything the browser needs to open a session, resolved on the server.
 *
 * The persona travels as the compiled engine record rather than a slug so the
 * client never decides who it is talking to, and the provider and model are
 * chosen by the same function the token route uses.
 */
export interface LiveRepConfig {
  persona: EnginePersona
  provider: ProviderId
  model: string
  calibration: Calibration
  userId: string
  /** Room ambience, from the profile. */
  ambience: boolean
  ambienceVolume: number
}

export interface RepSessionOptions {
  durationMs?: number
  fast?: boolean
  trainingWheels?: boolean
  interview?: boolean
  config?: LiveRepConfig | null
}

/**
 * What the safety layer has done to this rep (§16.3, §16.8).
 *
 * Three flags rather than one status, because they are three different
 * screens. `declined` is deliberately not one of them: the first strike is
 * answered in frame, by her, and the interface is told nothing — a banner
 * saying "we intervened" would break §05 and would step on the decline she is
 * in the middle of delivering.
 */
export interface RepSafety {
  /** The rep was ended on a content boundary. Never a win, whatever the meter said. */
  ended: boolean
  /** The training frame has been dropped (§16.8). The screen owes real help. */
  distress: boolean
}

export interface RepSessionState {
  status: RepStatus
  warmth: number
  band: Band
  trainingWheels: boolean
  userLevel: number
  personaLevel: number
  speaking: SpeakingState
  msRemaining: number
  outcome: RepOutcome | null
  threshold: number
  lastDelta: number
  paused: boolean
  retryAttempt: number
  /**
   * Whether this rep has ever heard a word from the user (F-10).
   *
   * Not "is there a user turn" — a character talking into silence produces
   * plenty of those, which is exactly how a rep with a dead microphone used to
   * reach the result screen and be reported as a rejection. This is a user
   * turn that carried text, which is the same test `finishSession` uses to
   * decide whether the rep is refunded.
   *
   * The screen raises a nudge off it. Once it is true it stays true, so a
   * deliberate silence later in a rep — which the format explicitly allows —
   * can never be mistaken for a microphone that stopped working.
   */
  heardUser: boolean
  /**
   * Why this rep ended, once it has. Null while it is still running.
   *
   * The adapter has always reported this and `finishSession` has always
   * written it down; it is surfaced here because the screen could otherwise
   * only guess, and B7's `rep_completed` is a reliability measure — "she left"
   * and "the transport died" are the two cases it exists to tell apart, and
   * `outcome.won` cannot separate them.
   */
  endReason: 'user' | 'character' | 'cap' | 'error' | null
  error: 'mic' | 'connection' | null
  /** What moderation has done to this rep, if anything. See `RepSafety`. */
  safety: RepSafety
  /** The database row, once it exists. The result screen is keyed to it. */
  sessionId: string
  questionIndex: number
  questionTotal: number
  question: string | null
  start: () => void
  end: () => void
  pause: () => void
  resume: () => void
  retry: () => void
}

/**
 * The two shapes the ending can take, sent thirty seconds out.
 *
 * One directive, one moment. The wind-down and the offer used to be separate
 * instructions that could arrive seconds apart and argue; now the decision is
 * made once and she is told exactly one thing.
 *
 * She offers in her own words and never speaks digits: the number the user
 * sees comes from us, and a character improvising a different one on top of
 * the card would be a rep that ends in a contradiction.
 */
const NUMBER_DIRECTIVE = [
  '(You have enjoyed this and you would like to hear from him again.',
  'You have about half a minute left before you have to go.',
  'Wind the conversation down naturally, and before you leave, offer him your number',
  'in your own words. Warm, a little flirty, brief.',
  'Do not say any digits out loud, just make the offer.',
  'Then say goodbye and end the conversation.)',
].join(' ')

/** The other shape. She is leaving, and that is all. */
const WRAP_UP_DIRECTIVE = [
  '(You need to leave in about half a minute.',
  'Start winding the conversation down naturally. Do not announce a time.)',
].join(' ')

/** RMS of an analyser, 0-1, for the orb. */
function levelOf(node: AnalyserNode | null, buffer: Uint8Array<ArrayBuffer>): number {
  if (!node) return 0
  node.getByteTimeDomainData(buffer)
  let sum = 0
  for (const value of buffer) {
    const centred = (value - 128) / 128
    sum += centred * centred
  }
  return Math.min(1, Math.sqrt(sum / buffer.length) * 4.5)
}

export function useRepSession(personaId: string, options: RepSessionOptions = {}): RepSessionState {
  const config = options.config ?? null
  const interview = options.interview ?? false
  const durationMs = options.durationMs ?? repDurationMs(interview)
  const threshold = repThreshold(interview)

  const [status, setStatus] = useState<RepStatus>('idle')
  const [warmth, setWarmth] = useState(0)
  const [band, setBand] = useState<Band>('CLOSED')
  const [speaking, setSpeaking] = useState<SpeakingState>('none')
  const [heardUser, setHeardUser] = useState(false)
  const [endReason, setEndReason] = useState<SessionSummary['reason'] | null>(null)
  const [levels, setLevels] = useState({ user: 0, persona: 0 })
  const [msRemaining, setMsRemaining] = useState(durationMs)
  const [outcome, setOutcome] = useState<RepOutcome | null>(null)
  const [lastDelta, setLastDelta] = useState(0)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<'mic' | 'connection' | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [sessionId, setSessionId] = useState('')
  const [safety, setSafety] = useState<RepSafety>({ ended: false, distress: false })

  const providerRef = useRef<VoiceProvider | null>(null)
  const warmthRef = useRef<WarmthSession | null>(null)
  const recorderRef = useRef<RepRecorder | null>(null)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const sessionIdRef = useRef<string | null>(null)
  const sessionOpenRef = useRef<Promise<string | null> | null>(null)
  const startedRef = useRef(false)
  const finishedRef = useRef(false)
  /**
   * Armed: warmth reached 65 at some point. Silent, and it never un-arms —
   * see KEEP_THRESHOLD for what can still take the number away.
   */
  const armedRef = useRef(false)
  const wrappedRef = useRef(false)
  /** How many authored scene beats have fired this rep. */
  const beatsFiredRef = useRef(0)
  /** §05 countermeasure 3. Detects a character break so it can be repaired. */
  const stabilityRef = useRef(new StabilityMeter({ nonStaff: personaId === 'nadia' }))
  const numberRef = useRef<string>('')
  /**
   * What she was told at the wind-down, and therefore what she has already
   * committed to out loud. Null when the rep ended before it fired.
   *
   * Once she has offered, the answer cannot change: a card that failed to
   * appear after she said "give me your phone" is worse than any rule.
   */
  const closingDecisionRef = useRef<'number' | 'leave' | null>(null)
  /**
   * The warmth the ending was decided on, kept because it is not `final_warmth`.
   *
   * The decision is made once, at the wind-down, and cannot change afterwards
   * — so the meter can keep climbing for the last thirty seconds and finish
   * well above the threshold on a rep she had already been told to leave. That
   * is correct, and it is unreadable unless the screen shows the number the
   * decision actually turned on. A real rep finished 71 / 65 and said "She
   * left": at the wind-down it had been 63.68.
   */
  const decisionWarmthRef = useRef<number | null>(null)
  /** When the clock hit zero. Null while the rep is still running. */
  const timeUpAtRef = useRef<number | null>(null)
  /**
   * Moderation on both streams (§16.3). Null outside a live rep.
   */
  const safetyRef = useRef<SafetyMonitor | null>(null)
  /**
   * When the safety layer told her to close, or null.
   *
   * She gets the same bounded moment to finish a sentence that the clock
   * running out gives her — `isClosingOver`, the same function, deliberately.
   * Cutting the transport dead on the word "end" produces a black screen with
   * no explanation, which reads as a crash and is the reading that gets a
   * safety control blamed for a bug.
   */
  const safetyCloseAtRef = useRef<number | null>(null)
  /**
   * A rep ended on a boundary cannot be a win.
   *
   * The meter is not consulted and the wind-down decision, if it already
   * fired, does not stand. Somebody who was at warmth 80 and then said
   * something explicit does not get her number for the first eighty seconds.
   */
  const safetyEndedRef = useRef(false)
  const incidentsRef = useRef<RepIncidents>(emptyIncidents())
  const incidentsStopRef = useRef<(() => void) | null>(null)
  const agentSpeakingRef = useRef(false)
  const startedAtRef = useRef(0)
  const pausedRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPromiseRef = useRef<Promise<void> | null>(null)
  const stopRef = useRef<((reason: SessionSummary['reason']) => Promise<void>) | null>(null)

  const clearLoops = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    if (tickRef.current) clearInterval(tickRef.current)
    frameRef.current = null
    tickRef.current = null
  }, [])

  /**
   * Ends the rep and writes it down.
   *
   * Persistence is best-effort by rule: a rep is a live conversation and it
   * must never end because Postgres was slow, so every write here is allowed
   * to fail quietly and the conversation is what survives.
   */
  const stop = useCallback(
    async (reason: SessionSummary['reason'] = 'user') => {
      const voice = providerRef.current
      if (!voice || finishedRef.current) return
      setEndReason(reason)
      finishedRef.current = true
      providerRef.current = null
      clearLoops()
      setStatus('ending')
      setSpeaking('none')
      setLevels({ user: 0, persona: 0 })

      // Flush the recorder before the provider closes its AudioContext. Also
      // detach the ref now so unmount cleanup cannot discard its final chunk.
      const recorder = recorderRef.current
      recorderRef.current = null
      const recordingReady = recorder ? recorder.stop().catch(() => null) : Promise.resolve(null)
      const summary = await voice.end(reason)
      const telemetry = warmthRef.current?.telemetry(summary.seconds) ?? null
      warmthRef.current?.dispose()
      warmthRef.current = null

      safetyRef.current?.stop()
      safetyRef.current = null

      incidentsStopRef.current?.()
      incidentsStopRef.current = null
      const incidents = incidentsRef.current
      const agentTurns = summary.turns.filter((turn) => turn.speaker === 'agent').length

      // A rep whose transport misbehaved this badly produced a transcript that
      // is not what the user heard, and §07 is about to grade it. Recorded on
      // the row rather than hidden, so a bad grade can be explained instead of
      // being quietly attributed to the user.
      if (incidentsAreAlarming(incidents, agentTurns)) {
        console.warn('[nerve] rep pipeline incidents', { ...incidents, agentTurns })
      }

      // The decision, once. If the wind-down already fired she has committed
      // out loud and that stands; a rep cut short before it is judged here on
      // the same rule — armed, and still warm enough to mean it.
      // A rep that ended before the wind-down is judged here, so this is the
      // moment its decision was made and the warmth to remember.
      if (closingDecisionRef.current === null) {
        decisionWarmthRef.current = telemetry?.end ?? 0
      }

      // A rep the safety layer ended is a loss, full stop — see
      // `safetyEndedRef`. It is checked before the decision rather than folded
      // into it so that no path through `givesNumber` can reach a number card
      // on a rep that ended because of what was said in it.
      const won = !safetyEndedRef.current
        && (closingDecisionRef.current === 'number'
          || (closingDecisionRef.current === null
            && givesNumber({
              armed: armedRef.current,
              warmth: telemetry?.end ?? 0,
              interview,
            })))

      if (won && !numberRef.current) numberRef.current = inventNumber()

      setOutcome({
        won,
        ...(won ? { phoneNumber: numberRef.current } : {}),
        exitLine: won
          ? 'Message me. I have to get on.'
          // She left because of what was said, and the line says so without
          // the app stepping in to explain it. Still her voice, still in
          // frame: §16.6's register rules out a lecture here as much as
          // anywhere else.
          : safetyEndedRef.current
            ? "I'm done. Don't."
            : reason === 'character'
              ? 'I should get back to it. Take care.'
              : 'Anyway — I should get going. Take care.',
      })
      setStatus('ended')

      const id = sessionIdRef.current ?? voice.getSessionId?.() ?? (await sessionOpenRef.current)
      sessionOpenRef.current = null

      if (!id) return

      await completeRep({
        save: () => finishSession({
          sessionId: id,
          seconds: summary.seconds,
          reason: summary.reason,
          turns: summary.turns,
          usage: summary.usage,
          rate: summary.rate,
          provider: summary.provider,
          model: summary.model,
          pipeline: summary.pipeline,
          warmth: telemetry,
          won,
          incidents,
          ...(decisionWarmthRef.current === null ? {} : { decisionWarmth: decisionWarmthRef.current }),
        }),

        upload: async () => {
          const recording = await recordingReady
          if (recording && config) {
            const upload = await uploadRepAudio({
              userId: config.userId,
              sessionId: id,
              blob: recording.blob,
              mimeType: recording.mimeType,
            }).catch(() => ({ path: null, message: null }))
            if (upload.path) await attachAudio({ sessionId: id, path: upload.path }).catch(() => undefined)
          }
        },

        grade: async () => {
          // Graded once, after the rep, on a separate path from the live scorer
          // (§07). The scorecard screen waits for this row rather than inventing
          // a number while it is in flight.
          if (summary.turns.some((turn) => turn.speaker === 'user' && turn.text.trim().length > 0)) {
            const card = await fetch('/api/grade', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                transcript: summary.turns,
                sessionSeconds: summary.seconds,
                personaName: config?.persona.name ?? personaId,
                ...(voice.getSessionId?.() ? { sessionId: id } : {}),
              }),
            })
              .then(async (response) => (response.ok ? ((await response.json()) as Scorecard) : null))
              .catch(() => null)

            if (card) await saveScore({ sessionId: id, scorecard: card, provider: summary.provider, ...(config ? { personaLevel: config.persona.level } : {}) }).catch(() => undefined)
          }
        },
      })
    },
    [clearLoops, config, interview, personaId],
  )

  stopRef.current = (reason) => {
    if (stopPromiseRef.current) return stopPromiseRef.current
    const finishing = stop(reason)
    stopPromiseRef.current = finishing
    void finishing.finally(() => {
      if (stopPromiseRef.current === finishing) stopPromiseRef.current = null
    }).catch(() => undefined)
    return finishing
  }

  /**
   * The meter, after a turn.
   *
   * Arming happens here and nothing else does. The number is decided at the
   * wind-down, in the tick, because that is the moment she is told about it.
   */
  const publish = useCallback(
    (voice: VoiceProvider) => {
      const engine = warmthRef.current?.engine
      if (!engine) return
      setWarmth(uiWarmth(engine.warmth))
      setBand(uiBand(engine.band))
      const events = engine.events
      const latest = events[events.length - 1]
      if (latest) setLastDelta(Math.round(latest.delta))

      // Arming is SILENT and has no effect on the rep. Nothing ends, nothing
      // is announced, nothing changes on screen. All it does is decide what
      // she will be told thirty seconds from the end.
      if (shouldArm({ warmth: engine.warmth, armed: armedRef.current, interview })) {
        armedRef.current = true
      }

      // The two consequences of interest that live below the application: how
      // long she sits on a reply, and whether she takes the turn when he talks
      // over her. She is still never told a number (§H6).
      voice.setWarmth(engine.warmth)
      if (pausedRef.current) voice.setInterruptible(false)
    },
    [interview],
  )

  const start = useCallback(() => {
    if (startedRef.current || stopPromiseRef.current || !config) return
    startedRef.current = true
    finishedRef.current = false
    armedRef.current = false
    wrappedRef.current = false
    beatsFiredRef.current = 0
    stabilityRef.current = new StabilityMeter({ nonStaff: personaId === 'nadia' })
    closingDecisionRef.current = null
    decisionWarmthRef.current = null
    timeUpAtRef.current = null
    agentSpeakingRef.current = false
    numberRef.current = ''
    turnsRef.current = []
    sessionIdRef.current = null
    sessionOpenRef.current = null
    startedAtRef.current = 0
    pausedRef.current = false
    setPaused(false)
    setSessionId('')
    setOutcome(null)
    setSpeaking('none')
    setLevels({ user: 0, persona: 0 })
    setEndReason(null)
    safetyCloseAtRef.current = null
    safetyEndedRef.current = false
    setSafety({ ended: false, distress: false })
    // A retry is a fresh attempt at being heard, so the nudge gets to fire
    // again — the microphone that was not working may be the thing they just
    // went and fixed.
    setHeardUser(false)
    setError(null)
    setStatus('connecting')

    void (async () => {
      warmthRef.current?.dispose()
      warmthRef.current = new WarmthSession({
        persona: config.persona,
        trajectory: config.persona.trajectory,
        scorer: new HttpSlowScorer(undefined, undefined, () => {
          const id = providerRef.current?.getSessionId?.()
          return id ? { sessionId: id } : {}
        }),
        nowSeconds: () => startedAtRef.current > 0 ? (performance.now() - startedAtRef.current) / 1000 : 0,
      })
      setWarmth(uiWarmth(warmthRef.current.engine.warmth))
      setBand(uiBand(warmthRef.current.engine.band))

      const voice = createVoiceProvider({ envDefault: config.provider, openai: { model: config.model } })
      providerRef.current = voice
      bindVoiceSteering(voice, warmthRef.current)
      // Media can connect before the owned-session activation finishes. Keep
      // microphone ingress closed until the live screen is ready.
      voice.setMuted?.(true)
      let activated = false
      let setupFailed = false
      const stillCurrent = () => providerRef.current === voice && !finishedRef.current
      const abandonAttempt = async () => {
        await voice.end('error').catch(() => undefined)
        const id = voice.getSessionId?.()
        const operationId = voice.getStartupAttemptId?.()
        if (id && operationId) await abandonSession({ sessionId: id, operationId }).catch(() => undefined)
      }
      const disposeAttempt = () => {
        if (providerRef.current !== voice) return
        providerRef.current = null
        startedRef.current = false
        warmthRef.current?.dispose()
        warmthRef.current = null
        safetyRef.current?.stop()
        safetyRef.current = null
        incidentsStopRef.current?.()
        incidentsStopRef.current = null
      }

      /**
       * The five things moderation can ask for, and what each one costs.
       *
       * `decline` and `correct` are directions to her and nothing else — the
       * screen is not told, because §05 allows the timer, the ring and her
       * voice on a live rep and a safety banner is none of the three.
       */
      function applySafetyAction(action: SafetyAction): void {
        const live = providerRef.current
        if (!live || finishedRef.current) return

        if (action === 'decline') { live.reinforce(DECLINE_DIRECTIVE); return }
        if (action === 'correct') { live.reinforce(CORRECT_DIRECTIVE); return }

        if (action === 'distress') {
          // The frame is dropped, not wound down (§16.8). She does not get a
          // goodbye and the scene does not get an ending: continuing to play a
          // character at somebody who has just said something real is the
          // failure this branch exists to prevent.
          safetyEndedRef.current = true
          setSafety({ ended: true, distress: true })
          void stopRef.current?.('user')
          return
        }

        if (action === 'end') {
          if (safetyCloseAtRef.current !== null) return
          safetyEndedRef.current = true
          safetyCloseAtRef.current = performance.now()
          setSafety({ ended: true, distress: false })
          // She closes the scene herself, bounded — see `safetyCloseAtRef`.
          live.reinforce(CLOSE_DIRECTIVE)
        }
      }

      // §16.3. Both streams, every committed turn, decided on the server.
      // Nothing here awaits it: the action arrives a beat after the turn and
      // the rep never waits on a classifier (`lib/safety/monitor.ts`).
      safetyRef.current?.stop()
      safetyRef.current = new SafetyMonitor({ onAction: applySafetyAction })

      voice.on('user.speech.start', () => {
        setSpeaking('user')

      })
      voice.on('user.speech.stop', () => setSpeaking('thinking'))
      voice.on('agent.speech.start', () => {
        agentSpeakingRef.current = true
        setSpeaking('persona')
      })
      voice.on('agent.speech.stop', () => {
        agentSpeakingRef.current = false
        setSpeaking('none')
        // The clock has already run out and she has just finished her closing
        // line. That is the scene — anything after it is dead air.
        if (timeUpAtRef.current !== null && !finishedRef.current) {
          void stopRef.current?.('cap')
        }
        // Same rule for a rep the safety layer closed: she has just finished
        // the goodbye it asked her for, and there is nothing after it.
        if (safetyCloseAtRef.current !== null && !finishedRef.current) {
          void stopRef.current?.('character')
        }
      })
      voice.on('character.exit', () => { void stopRef.current?.('character') })

      voice.on('user.transcript', ({ turn, final }) => {
        if (!final) return
        turnsRef.current.push(turn)
        safetyRef.current?.observe('user', turn.text)
        // The first word we actually heard. See `heardUser`.
        if (turn.text.trim().length > 0) setHeardUser(true)
        warmthRef.current?.onUserTurn(turn)
        publish(voice)
      })

      voice.on('agent.transcript', ({ turn, final }) => {
        if (!final) return
        turnsRef.current.push(turn)
        // Her stream too (§16.3). A character who wanders is the failure a
        // merchant-of-record reviewer is actually asking about: nobody is
        // reassured that the *user* was well behaved.
        safetyRef.current?.observe('agent', turn.text)
        warmthRef.current?.onAgentTurn(turn)
        publish(voice)

        // §05 countermeasure 3, which until now ran only in the M0 harness.
        // A character break in production was never detected and never
        // repaired — she drifted into assistant register and stayed there for
        // the rest of the rep. Event-driven rather than timed, because blind
        // periodic session updates damaged prompt-cache reuse.
        const hits = stabilityRef.current.observe(turn.text, turn.t_end)
        if (hits.some((hit) => hit.severity === 'break')) {
          voice.reinforce(compileReinforcement(config.persona, turnsRef.current))
        }
      })

      // Every non-fatal incident the pipeline can report, counted. Until this
      // existed the product path listened for fatal errors and nothing else, so
      // truncated replies, deleted user turns and unheard responses were all
      // invisible in production — see lib/voice/incidents.ts.
      const counter = countIncidents(voice, (next) => {
        incidentsRef.current = next
      })
      incidentsStopRef.current = counter.stop
      incidentsRef.current = counter.incidents

      voice.on('error', ({ error: err }) => {
        if (!err.fatal || !stillCurrent()) return
        setError('connection')
        if (activated) {
          void stopRef.current?.('error')
        } else {
          // A socket error during setup must close the provider, even when its
          // connect promise has not rejected yet. The catch below owns refund.
          setupFailed = true
          void voice.end('error').catch(() => undefined)
          setStatus('idle')
        }
      })

      try {
        await voice.connect(config.persona, config.calibration)
      } catch (cause) {
        await abandonAttempt()
        if (!stillCurrent()) return
        disposeAttempt()
        // A refused microphone has a different remedy from a network failure.
        const message = cause instanceof VoiceError ? cause.message : String(cause)
        setError(/microphone|permission|NotAllowed/i.test(message) ? 'mic' : 'connection')
        setStatus('idle')
        return
      }
      if (!stillCurrent()) { await abandonAttempt(); return }
      if (setupFailed) {
        await abandonAttempt()
        disposeAttempt()
        setError('connection')
        setStatus('idle')
        return
      }

      const ownedSessionId = voice.getSessionId?.() ?? null
      if (ownedSessionId) {
        sessionIdRef.current = ownedSessionId
        const result = await startSession({
          personaSlug: config.persona.slug, provider: voice.id, model: voice.model,
          existingSessionId: ownedSessionId,
        }).catch(() => null)
        if (!stillCurrent()) { await abandonAttempt(); return }
        if (!result?.ok) {
          await abandonAttempt()
          disposeAttempt()
          setError('connection')
          setStatus('idle')
          return
        }
        if (setupFailed) {
          // The activation succeeded while the transport failed. Finish that
          // owned rep so the empty-session refund follows its normal path.
          await stopRef.current?.('error')
          return
        }
      }
      activated = true
      voice.setMuted?.(pausedRef.current)
      voice.setWarmth(warmthRef.current?.engine.warmth ?? 0)

      setStatus('live')
      startedAtRef.current = performance.now()
      setMsRemaining(durationMs)

      // The row is opened when the transport connects, so a rep that crashes
      // still leaves evidence it happened — and this is where the daily quota
      // is spent.
      sessionIdRef.current = null
      sessionOpenRef.current = (ownedSessionId
        ? Promise.resolve({ sessionId: ownedSessionId })
        : startSession({
          personaSlug: config.persona.slug,
          provider: voice.id,
          model: voice.model,
        }))
        .then((result) => {
          sessionIdRef.current = result.sessionId
          if (result.sessionId) {
            setSessionId(result.sessionId)
            // The first turns were classified before this landed and were
            // counted against the user instead. See `setSessionId`.
            safetyRef.current?.setSessionId(result.sessionId)
          }
          return result.sessionId
        })
        .catch(() => null)

      try {
        const recorder = RepRecorder.create(voice.getAnalyser())
        recorderRef.current = recorder
        recorder?.start()
      } catch {
        // Archiving is optional. A browser recorder failure must not end the
        // conversation or leave its microphone disconnected from the model.
        recorderRef.current?.dispose()
        recorderRef.current = null
      }

      const room = voice.getRoom()
      if (room) {
        if (!config.ambience) room.setAmbientLevelDb(-90)
        else if (config.ambienceVolume !== 100) {
          // A percentage the user set, as a trim on the bed's own level.
          room.setAmbientLevelDb(room.ambientLevelDb - (100 - config.ambienceVolume) * 0.3)
        }
      }

      const analysers: Analysers = voice.getAnalyser()
      const buffer = new Uint8Array(2048)
      const draw = () => {
        setLevels({ user: levelOf(analysers.user, buffer), persona: levelOf(analysers.agent, buffer) })
        frameRef.current = requestAnimationFrame(draw)
      }
      frameRef.current = requestAnimationFrame(draw)

      // Three minutes, and she leaves when they run out (§05). The clock is
      // wall-clock rather than a tick count so a throttled background tab
      // cannot buy anybody extra time.
      tickRef.current = setInterval(() => {
        const elapsed = performance.now() - startedAtRef.current
        const remaining = Math.max(0, durationMs - elapsed)
        setMsRemaining(remaining)

        // The safety ending, on the same bound the clock's ending uses — and
        // FIRST, ahead of everything else the tick does. A rep closed on a
        // boundary must not also reach the wind-down: being told to leave and
        // to offer him her number in the same five seconds is the one way this
        // could end with a number card on a rep that ended over what was said.
        if (safetyCloseAtRef.current !== null) {
          const msSinceClose = performance.now() - safetyCloseAtRef.current
          if (isClosingOver({ msSinceTimeUp: msSinceClose, agentSpeaking: agentSpeakingRef.current })) {
            void stopRef.current?.('character')
          }
          return
        }

        // THE DECISION POINT. Thirty seconds out, once, she is told exactly
        // one thing — and which one is settled here, on the meter as it stands
        // at this instant. She then says it in her own time; the answer does
        // not change underneath her.
        if (shouldWrapUp({ msRemaining: remaining, alreadyWrapped: wrappedRef.current })) {
          wrappedRef.current = true
          const engine = warmthRef.current?.engine
          const offering = givesNumber({
            armed: armedRef.current,
            warmth: engine?.warmth ?? 0,
            interview,
          })
          decisionWarmthRef.current = engine?.warmth ?? 0
          closingDecisionRef.current = offering ? 'number' : 'leave'
          if (offering) numberRef.current = inventNumber()
          // One thing, once. The standing directive stands down for this turn
          // so the decision arrives on its own rather than behind a line that
          // still says she would rather be somewhere else.
          warmthRef.current?.handOverToClosing()
          providerRef.current?.reinforce(offering ? NUMBER_DIRECTIVE : WRAP_UP_DIRECTIVE)
        }

        // The scene, on its own clock. Fired before the wind-down check so a
        // beat can never land on top of the closing direction, and never after
        // the wrap-up has been sent.
        if (!wrappedRef.current) {
          const beat = dueSceneBeat({
            beats: config.persona.sceneBeats,
            elapsedFraction: 1 - remaining / durationMs,
            fired: beatsFiredRef.current,
          })
          if (beat) {
            beatsFiredRef.current += 1
            providerRef.current?.reinforce(beat.direction)
          }
        }

        if (isTimeUp(remaining)) {
          // The conversation is over; her sentence may not be. She gets to
          // finish, bounded on both sides — see isClosingOver.
          if (timeUpAtRef.current === null) timeUpAtRef.current = performance.now()
          const msSinceTimeUp = performance.now() - timeUpAtRef.current
          if (isClosingOver({ msSinceTimeUp, agentSpeaking: agentSpeakingRef.current })) {
            void stopRef.current?.('cap')
          }
        }
      }, 200)
    })()
  }, [config, durationMs, interview, personaId, publish])

  const end = useCallback(() => { void stopRef.current?.('user') }, [])

  /**
   * Pause is a mute, not a suspension.
   *
   * The scene keeps running — she is a person in a room, not a video — but
   * nothing the user says while the tab is hidden or the mic is gone should
   * reach her. The clock keeps running too: three minutes is three minutes.
   */
  const pause = useCallback(() => {
    if (pausedRef.current) return
    pausedRef.current = true
    setPaused(true)
    // She stops cutting across him while he is away. Restored on resume from
    // the level rule rather than from a remembered flag, because the level is
    // what the answer actually depends on (§05).
    providerRef.current?.setMuted?.(true)
    providerRef.current?.setInterruptible(false)
    setSpeaking(agentSpeakingRef.current ? 'persona' : 'none')
  }, [])

  const resume = useCallback(() => {
    if (!pausedRef.current) return
    pausedRef.current = false
    setPaused(false)
    // Restored through the meter rather than from the level alone. The level is
    // still the ceiling (§05), but whether she actually takes the turn depends
    // on how the rep is going — and going back to the raw level rule here would
    // let a bored character cut across him for the one turn before the next
    // `publish` corrected it.
    providerRef.current?.setMuted?.(false)
    providerRef.current?.setWarmth(warmthRef.current?.engine.warmth ?? 0)
  }, [])

  const retry = useCallback(() => {
    void (async () => {
      // Retire the preceding provider and writes before opening a new one.
      // A retry cannot leave the old microphone or paid request running.
      await (stopPromiseRef.current ?? stopRef.current?.('error'))?.catch(() => undefined)
      setRetryAttempt((value) => Math.min(3, value + 1))
      startedRef.current = false
      setError(null)
      start()
    })()
  }, [start])

  /**
   * Leaving the screen ends the rep properly.
   *
   * Not just closing the transport: a user who navigates away mid-rep has
   * still had the rep, and dropping the connection without writing it would
   * leave an open row, no transcript and a spent quota with nothing to show
   * for it. `stop` is idempotent, so the normal path is unaffected.
   */
  useEffect(() => () => {
    clearLoops()
    if (providerRef.current) void stopRef.current?.('user')
    // Belt and braces: `stop` disposes the monitor, but it returns early when
    // there is no provider to end, and a queue still posting turns from a
    // screen nobody is on is exactly the standing invoice `maySpend` exists
    // to stop.
    safetyRef.current?.stop()
    safetyRef.current = null
    warmthRef.current?.dispose()
    recorderRef.current?.dispose()
  }, [clearLoops])

  return {
    status,
    warmth,
    band,
    trainingWheels: options.trainingWheels ?? true,
    userLevel: levels.user,
    personaLevel: levels.persona,
    speaking,
    msRemaining,
    outcome,
    threshold,
    lastDelta,
    paused,
    retryAttempt,
    heardUser,
    endReason,
    error,
    safety,
    sessionId,
    // Interview reps are M4. The fields stay so the screen keeps one shape.
    questionIndex: 0,
    questionTotal: 0,
    question: null,
    start,
    end,
    pause,
    resume,
    retry,
  }
}
