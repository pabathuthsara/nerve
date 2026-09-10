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
  type TurnMark,
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
import { safetyDirectiveFor } from '@/lib/safety/interview-escalation'
import {
  CLOSE_DIRECTIVE,
  type SafetyAction,
} from '@/lib/safety/escalation'
import { StabilityMeter, warrantsReinforcement } from '@/lib/metrics/stability'
import { RepRecorder } from '@/lib/audio/recorder'
import { uploadRepAudio } from '@/lib/db/audio'
import { abandonSession, attachAudio, finishSession, saveScore, startSession } from '@/app/rep/actions'
import { completeRep } from './rep-completion'
import type { Scorecard } from '@/lib/grade/types'
import { gradeEligibility } from '@/lib/grade/eligibility'
import { uiBand, uiWarmth } from './progression'
import { interviewShouldWrapUp, interviewWrapUpMs } from './interview-rules'
import {
  agendaStep,
  captionOrNull,
  dueInterviewBeat,
  isGrounded,
  questionCaption,
} from './interview-agenda'
import { DEFAULT_ROUND, roundType, type RoundTypeId } from './interview-credits'
import { DEFAULT_DIFFICULTY, type DifficultyLevel } from './interview-difficulty'
import { probeLadderEnabled } from './interview-probes'
import { opensOnDesignBrief } from './interview-briefs'
import { DEFAULT_FIELD, type InterviewFieldId } from './interview-fields'
import { INTERVIEW_NEXT_STEPS_DIRECTIVE, INTERVIEW_WRAP_UP_DIRECTIVE } from '@/lib/personas/interview/shared'
import {
  WRAP_UP_MS,
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
  /**
   * Which round this interview is (§5.7). Ignored on the dating arm.
   *
   * It decides the length, the wind-down and the per-turn gain cap, and it is
   * resolved on the SERVER from `interview_setups` before this ever runs — the
   * browser is handed the answer, never asked for it (rule 11).
   */
  round?: RoundTypeId
  /**
   * The candidate's field, and how hard the questions are (§5, §7.2).
   *
   * Both are resolved on the SERVER from `interview_setups` and handed down,
   * for the same reason the round is. The field decides whether there is
   * anything authored to probe with — eleven of the twelve have nothing yet and
   * run exactly as they did before this plan — and the difficulty decides how
   * hard to pitch what there is. **Neither touches warmth** (§5.3).
   *
   * Ignored entirely on the dating arm, which passes neither.
   */
  field?: InterviewFieldId
  difficulty?: DifficultyLevel
  /**
   * SURVIVE A DROP AND A BACKGROUNDED TAB (A3, A4).
   *
   * **Off by default, and the dating rep never sets it.** At three minutes a
   * dropped connection is an annoyance and the retry button is the right
   * answer; at twenty minutes on a $9 item it is a refund, and §7 measured an
   * 11% rate of reps hitting a provider error. Two behaviours ride this one
   * flag, because they are the same promise:
   *
   *   · a fatal transport error reconnects up to three times, adopting the
   *     same voice session and keeping warmth, the transcript and the clock;
   *   · the clock STOPS while the rep is paused, instead of running through it.
   *
   * The second is a real difference from the dating rule and is deliberate.
   * `pause` is a mute there — "the scene keeps running, three minutes is three
   * minutes" — which is correct for a stranger in a shop who does not wait for
   * you. An interviewer whose clock ran down through a thirty-second network
   * outage would be charging somebody for time nobody was in the room.
   */
  reconnect?: boolean
  config?: LiveRepConfig | null
}

/**
 * How many times a dropped interview reconnects before it gives up (A3).
 *
 * Three, and then the rep ends and A2 credits it back. A fourth attempt is not
 * a reconnection strategy, it is a user watching a spinner.
 */
export const RECONNECT_ATTEMPTS = 3

/**
 * How long a drop may last and still be the same interview.
 *
 * Past this the conversation has a hole in it that neither side can see, and
 * resuming would put the interviewer back mid-answer to a question the
 * candidate has forgotten. Ending and crediting is the honest outcome.
 */
export const RECONNECT_GRACE_MS = 15_000

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
   * How many turns the user has actually spoken, with words in them.
   *
   * The guided rep reads this and never the total: a character who replies
   * twice to one thing must not move somebody's step for them. Same rule and
   * same reason as `lib/text/cues.ts`. Counted off the same test `heardUser`
   * uses, so an empty transcript from a dead microphone cannot walk the script
   * forward with nobody speaking. Paired with `agentTurns`, because on its own
   * it cannot tell whether she ever answered.
   */
  userTurns: number
  /**
   * How many replies of hers actually landed.
   *
   * The guided rail advances on exchanges rather than on his turns alone, and
   * an exchange needs both halves — see `guidedStepFor`. Counted off committed
   * transcript turns, which is the only definition that excludes a reply that
   * was generated and never heard: those emit `agent.unheard` and never reach
   * `agent.transcript`, so a rep where the pipeline is failing holds the
   * script still instead of marching a user through a monologue.
   */
  agentTurns: number
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
  /**
   * What went wrong, and whether the user can do anything about it.
   *
   * `refused` is the server saying no ON PURPOSE — no credits, quota spent, the
   * spend ceiling reached — and it is deliberately not `connection`. A refusal
   * cannot be retried, and rendering one as a lost connection gave a user a
   * Retry button that failed three times in a row and an End button that did
   * nothing (7 September, a screener credit against a recruiter round).
   */
  error: 'mic' | 'connection' | 'refused' | null
  /** The refusal's own sentence, written by the route. Null unless refused. */
  refusal: string | null
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

/**
 * The transcript, with the probe marks applied (§8.1).
 *
 * A new array of new objects rather than a mutation, so nothing that already
 * holds a turn sees it change underneath. Turns with no mark are returned as
 * they are — object identity included — which is what makes this a no-op on
 * every dating rep and on every interview round that never probed.
 */
export function markTurns(
  turns: readonly TranscriptTurn[],
  marks: ReadonlyMap<TranscriptTurn, TurnMark>,
): TranscriptTurn[] {
  if (marks.size === 0) return [...turns]
  return turns.map((turn) => {
    const mark = marks.get(turn)
    return mark ? { ...turn, kind: mark } : turn
  })
}

export function useRepSession(personaId: string, options: RepSessionOptions = {}): RepSessionState {
  const config = options.config ?? null
  const interview = options.interview ?? false
  /** A3/A4. Off everywhere except the interview live screen. */
  const resumable = options.reconnect ?? false
  const round: RoundTypeId = options.round ?? DEFAULT_ROUND
  const field: InterviewFieldId = options.field ?? DEFAULT_FIELD
  const difficulty: DifficultyLevel = options.difficulty ?? DEFAULT_DIFFICULTY
  /**
   * Does the probe ladder run at all this rep (§7.2)?
   *
   * Three things decide it and all three are facts about the setup rather than
   * about the moment: the round has to probe, and the field has to have the
   * material the ladder climbs. False is the ordinary case today — eleven of
   * the twelve fields have no probe domains authored — and false means the rep
   * is exactly the interview it was before this plan.
   */
  const probes = interview && probeLadderEnabled({ round, field })
  /** She poses an authored design problem on her first turn (§4.3, §6.7). */
  const posesBrief = probes && opensOnDesignBrief({ round, field })
  const durationMs = options.durationMs ?? repDurationMs(interview)
  const threshold = repThreshold(interview)

  const [status, setStatus] = useState<RepStatus>('idle')
  const [warmth, setWarmth] = useState(0)
  const [band, setBand] = useState<Band>('CLOSED')
  const [speaking, setSpeaking] = useState<SpeakingState>('none')
  const [heardUser, setHeardUser] = useState(false)
  const [userTurns, setUserTurns] = useState(0)
  const [agentTurns, setAgentTurns] = useState(0)
  const [endReason, setEndReason] = useState<SessionSummary['reason'] | null>(null)
  const [levels, setLevels] = useState({ user: 0, persona: 0 })
  const [msRemaining, setMsRemaining] = useState(durationMs)
  const [outcome, setOutcome] = useState<RepOutcome | null>(null)
  const [lastDelta, setLastDelta] = useState(0)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<'mic' | 'connection' | 'refused' | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
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
  /**
   * How many AGENDA beats have fired — the ones that move an interviewer off a
   * thread she has been on too long. Counted separately from scene beats
   * because they are different clocks answering different questions: a scene
   * beat is a fact about the room, and this is a fact about the interview
   * running out of time. See `dueAgendaBeat`.
   */
  const agendaBeatsRef = useRef(0)
  /**
   * How many PROBE beats have fired — the ones that take her down rather than
   * sideways (INTERVIEW-TECHNICAL-PLAN §6.4). A third clock, counted
   * separately for the same reason the second one is.
   */
  const probeBeatsRef = useRef(0)
  /**
   * When the last direction of any kind reached her.
   *
   * The agenda beat says *leave this thread* and the probe beat says *go deeper
   * on what they just named*, and arriving together they are flatly
   * contradictory. Two evenly-spaced schedules collide by construction, so the
   * spacing is enforced in time — see `dueInterviewBeat`. Zero means "long
   * enough ago", which is correct at the start of a rep.
   */
  const lastInterviewBeatAtRef = useRef(0)
  /**
   * What her NEXT committed turn is, when it is more than a reply (§8.1).
   *
   * Set when the beat that asked for it fires, applied to the turn that comes
   * back, and cleared. The mark rides the transcript through to the grade,
   * which is the only thing that knows which questions had a right answer.
   */
  const pendingTurnMarkRef = useRef<TurnMark | null>(null)
  /** The marks, by the turn object the adapter committed. See `markTurns`. */
  const turnMarksRef = useRef(new Map<TranscriptTurn, TurnMark>())
  /** §05 countermeasure 3. Detects a character break so it can be repaired. */
  const stabilityRef = useRef(new StabilityMeter({
    nonStaff: personaId === 'nadia',
    // An interviewer asks something on nearly every turn, because that is what
    // an interview is. `question-every-turn` is a dating rule and reports her
    // doing her job as a frame break — see `StabilityMeterOptions`.
    questionsAreTheJob: interview,
    verbosityMedian: options.config?.persona.verbosityMedian ?? undefined,
  }))
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
  /**
   * A3/A4 state, and it is inert unless `options.reconnect` is set.
   *
   * `resuming` says the next `start()` is a continuation rather than a new rep,
   * so it must not wipe warmth, the transcript, the clock or the session row.
   * `pausedAt` is when the clock stopped — a drop and a backgrounded tab both
   * set it, because they are the same fact about the room being empty.
   */
  const resumingRef = useRef(false)
  const reconnectsRef = useRef(0)
  const pausedAtRef = useRef<number | null>(null)
  const startRef = useRef<() => void>(() => undefined)
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
      if (finishedRef.current) return
      /**
       * **NO PROVIDER IS NOT "NOTHING TO DO".**
       *
       * This used to be `if (!voice || finishedRef.current) return`, and the
       * `!voice` half made the End button dead on exactly the screens that need
       * it most. A mint that fails — a refusal, a vendor outage — runs
       * `disposeAttempt()`, which nulls `providerRef`, and THEN raises the error
       * modal. Every button on that modal called `stop()`, which saw no
       * provider and returned without touching a single piece of state: no
       * status change, no end reason, nothing. Measured on 7 September, three
       * times in a row.
       *
       * There is genuinely nothing to persist here — no transport, no session
       * row, no transcript, and no credit was ever held — so this is a LOCAL
       * teardown rather than the full path below. What matters is that it
       * happens at all, so the screen can see the rep is over and leave.
       */
      if (!voice) {
        finishedRef.current = true
        clearLoops()
        setEndReason(reason)
        setStatus('ended')
        setSpeaking('none')
        return
      }
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
      // THE TERMINAL EXCHANGE IS THE ONE WORTH JUDGING, AND IT WAS BEING
      // DROPPED.
      //
      // `dispose()` clears the awaiting turn and aborts the score in flight,
      // which is right for a teardown and meant the last turn of every rep went
      // unscored — the turn where the goodbye, the number and the boundary all
      // live. In the 9 September hostility rep, "Go away." has no stored slow
      // event for exactly this reason.
      //
      // Started BEFORE `voice.end`, so the judgement runs against the socket
      // close rather than after it: that close already costs a few hundred
      // milliseconds and the user is looking at the ending screen either way.
      // Bounded, because a rep must never be held open by a vendor that has
      // stopped answering, and `telemetry` is read after it so the flushed
      // score is actually in the numbers.
      const judged = warmthRef.current?.finalise() ?? Promise.resolve()
      const summary = await voice.end(reason)
      await judged
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
          characterBreaks: stabilityRef.current.all,
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
          // THE SAME DECISION THE ROUTE MAKES, so the client does not spend a
          // request finding out. `gradeEligibility` refuses a rep under twenty
          // seconds, a rep with fewer than two user turns, and a rep in which
          // she never spoke — the last of which used to be graded as the user's
          // conversational performance. See `lib/grade/eligibility.ts`.
          if (gradeEligibility({ sessionSeconds: summary.seconds, transcript: summary.turns }).ok) {
            const card = await fetch('/api/grade', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                // The probe marks ride the transcript to the grade, which is
                // the only place that can ask whether an answer was RIGHT.
                // An unmarked transcript grades exactly as it did before this
                // plan, which is every dating rep and every behavioural round.
                transcript: markTurns(summary.turns, turnMarksRef.current),
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
      //
      // The shape travels with it — the posture the three axes are in, and
      // what kind of turn she is answering. Timing is the fifth layer and it
      // reads all three (`lib/warmth/timing.ts`).
      voice.setWarmth(engine.warmth, warmthRef.current?.replyShape)
      if (pausedRef.current) voice.setInterruptible(false)
    },
    [interview],
  )

  /**
   * A3. Rebuild the transport under a rep that is still running.
   *
   * The provider is torn down and the session is NOT finished — that is the
   * whole point, and it is why this cannot be `retry`, which writes the rep and
   * starts a new one. Warmth, the transcript, the session row and the clock all
   * stay where they are; the clock stops until the new transport is live.
   *
   * Unreachable unless `options.reconnect` is set, so a dating rep cannot enter
   * it by any path.
   */
  const reconnect = useCallback((dead: VoiceProvider) => {
    reconnectsRef.current += 1
    setRetryAttempt(reconnectsRef.current)
    resumingRef.current = true
    if (pausedAtRef.current === null) pausedAtRef.current = performance.now()
    setStatus('connecting')
    void (async () => {
      await dead.end('error').catch(() => undefined)
      if (providerRef.current === dead) providerRef.current = null
      safetyRef.current?.stop()
      safetyRef.current = null
      incidentsStopRef.current?.()
      incidentsStopRef.current = null
      startedRef.current = false
      // Past the window the conversation has a hole in it neither side can
      // see, and putting the interviewer back mid-answer is worse than ending.
      const away = performance.now() - (pausedAtRef.current ?? performance.now())
      if (away > RECONNECT_GRACE_MS) {
        resumingRef.current = false
        void stopRef.current?.('error')
        return
      }
      startRef.current()
    })()
  }, [])

  /**
   * A resume attempt that did not come back up.
   *
   * Three in total, bounded by the window, and then the rep ends as an error —
   * which is exactly the case A2 credits back. A fourth attempt is a spinner.
   */
  const retryResume = useCallback((): boolean => {
    if (!resumingRef.current) return false
    resumingRef.current = false
    const away = performance.now() - (pausedAtRef.current ?? performance.now())
    if (reconnectsRef.current < RECONNECT_ATTEMPTS && away <= RECONNECT_GRACE_MS) {
      reconnectsRef.current += 1
      setRetryAttempt(reconnectsRef.current)
      resumingRef.current = true
      startedRef.current = false
      window.setTimeout(() => startRef.current(), 800)
      return true
    }
    void stopRef.current?.('error')
    return true
  }, [])

  const start = useCallback(() => {
    if (startedRef.current || stopPromiseRef.current || !config) return
    startedRef.current = true
    finishedRef.current = false

    /**
     * A3. **A resume is not a new rep**, and this is the whole difference.
     *
     * Everything below wipes the rep: warmth back to its rolled start, the
     * transcript emptied, the clock back to zero, a new session row. That is
     * exactly right for the retry button, which is somebody starting again. It
     * is exactly wrong for a reconnection, where the interviewer is mid-question
     * and the candidate has been talking for eleven minutes.
     *
     * So on a resume none of it runs, and the transport is the only thing that
     * is rebuilt. `resumingRef` is only ever set by `reconnect`, which is only
     * reachable with `options.reconnect` on — so the dating rep reaches the
     * identical block it reached yesterday.
     */
    const resuming = resumingRef.current
    if (!resuming) {
      armedRef.current = false
      wrappedRef.current = false
      beatsFiredRef.current = 0
      agendaBeatsRef.current = 0
      probeBeatsRef.current = 0
      lastInterviewBeatAtRef.current = 0
      turnMarksRef.current = new Map()
      // The first turn of a system design round is the authored problem, and
      // she has not taken it yet. Set here rather than in the tick because it
      // is not on a clock — it is what her opening turn IS (§4.3).
      pendingTurnMarkRef.current = posesBrief ? 'brief' : null
      stabilityRef.current = new StabilityMeter({
        nonStaff: personaId === 'nadia',
        questionsAreTheJob: interview,
        // Hers, not the roster's. A character with her own band table is
        // allowed a longer median and must not be scored as broken for it.
        verbosityMedian: config.persona.verbosityMedian ?? undefined,
      })
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
      reconnectsRef.current = 0
      pausedAtRef.current = null
      setPaused(false)
      setSessionId('')
      setOutcome(null)
      setSpeaking('none')
      setLevels({ user: 0, persona: 0 })
      setAgentTurns(0)
      setEndReason(null)
      safetyCloseAtRef.current = null
      safetyEndedRef.current = false
      setSafety({ ended: false, distress: false })
      // A retry is a fresh attempt at being heard, so the nudge gets to fire
      // again — the microphone that was not working may be the thing they just
      // went and fixed.
      setHeardUser(false)
    }
    setError(null)
    setStatus('connecting')

    void (async () => {
      // The meter survives a reconnection. Disposing and rebuilding it would
      // put an eleven-minute interview back at its opening impression, which
      // is a worse outcome than the drop.
      if (!resuming || !warmthRef.current) {
        warmthRef.current?.dispose()
        warmthRef.current = new WarmthSession({
          persona: config.persona,
          trajectory: config.persona.trajectory,
          // §6.7. Her first turn poses a forty-to-seventy word problem, and
          // every interview band tops out at thirty-four. Absent on every
          // dating rep and on four of the five interview rounds, and read on
          // the first agent turn only.
          ...(posesBrief ? { openingTurnKind: 'brief' as const } : {}),
          scorer: new HttpSlowScorer(undefined, undefined, () => {
            const id = providerRef.current?.getSessionId?.()
            return id ? { sessionId: id } : {}
          }),
          nowSeconds: () => startedAtRef.current > 0 ? (performance.now() - startedAtRef.current) / 1000 : 0,
        })
      }
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
        // The meter is the one thing a reconnection has to carry across. On
        // an ordinary failed attempt it goes with everything else.
        if (!resumingRef.current) {
          warmthRef.current?.dispose()
          warmthRef.current = null
        }
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
        if (!live || finishedRef.current || !config) return
        const track = config.persona.track

        // B9. The SEQUENCE is track-blind and stays that way — the verdict
        // mapping, the strike counters, the age arithmetic and the distress
        // path are the same functions on both arms. What is not track-blind is
        // the VOICE: "I do not want that" from somebody conducting an
        // interview reads as a different genre of refusal entirely.
        if (action === 'decline' || action === 'correct') {
          const line = safetyDirectiveFor(action, track)
          if (line) live.reinforce(line)
          return
        }

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
          live.reinforce(safetyDirectiveFor('end', track) ?? CLOSE_DIRECTIVE)
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
        // The meter needs both sides of the dialogue or `double-turn` — "two
        // agent turns without a user turn" — fires on every reply she gives
        // after her first. The admin bench has always called this; the customer
        // rep never has, so in production every turn was recorded as a
        // character break AND answered with the identity reminder. That is the
        // feedback loop PERSONA-AUDIT §12 fixed for verbosity, arriving through
        // a different rule. Found the moment breaks started being stored.
        stabilityRef.current.observeUser()
        // The first word we actually heard. See `heardUser`.
        if (turn.text.trim().length > 0) {
          setHeardUser(true)
          setUserTurns((count) => count + 1)
        }
        warmthRef.current?.onUserTurn(turn)
        publish(voice)
      })

      voice.on('agent.transcript', ({ turn, final }) => {
        if (!final) return
        turnsRef.current.push(turn)
        // THE MARK, APPLIED TO THE TURN THE BEAT ASKED FOR (§8.1).
        //
        // Recorded against the turn OBJECT rather than mutated onto it: both
        // adapters push the turn into their own array and then emit that same
        // reference, so this map keys the very turns `SessionSummary` will
        // carry. If that ever stops being true the marks simply do not match
        // and the accuracy pass is skipped, which is the right way for this to
        // fail — a missing mark costs a dimension, a wrong one costs a verdict.
        const mark = pendingTurnMarkRef.current
        if (mark) {
          turnMarksRef.current.set(turn, mark)
          pendingTurnMarkRef.current = null
        }
        // One half of an exchange. Only committed turns get here, so a reply
        // that was generated and never reached the ear does not advance the
        // guided script. See `agentTurns`.
        setAgentTurns((count) => count + 1)
        // Her stream too (§16.3). A character who wanders is the failure a
        // merchant-of-record reviewer is actually asking about: nobody is
        // reassured that the *user* was well behaved.
        safetyRef.current?.observe('agent', turn.text)
        warmthRef.current?.onAgentTurn(turn)
        publish(voice)

        // SHE HAS SAID HER LAST LINE AND SHE IS GOING.
        //
        // The second route out, beside the model's own `[[END_SCENE]]` sentinel
        // (which arrives as `character.exit` and lands on the same stop). This
        // one is the warmth layer's committed state, for the two conditions that
        // are lexical facts rather than judgements: he told her to go, or he
        // said goodbye. Both used to reach nothing at all — after "Just fuck
        // off" she said "Enjoy your Sunday" and then answered two more turns,
        // and Nadia said goodbye and then asked a fresh question.
        //
        // Read HERE rather than in the adapter, and after her turn has been
        // committed, for two reasons: the transcript has landed so the exit
        // state is up to date, her audio has already drained so she is heard
        // before the rep ends — and `ReplyState` must not be read a second time
        // in a turn, because reading it is what records the silence decision.
        if (warmthRef.current?.shouldEndScene) {
          void stopRef.current?.('character')
          return
        }

        // §05 countermeasure 3, which until now ran only in the M0 harness.
        // A character break in production was never detected and never
        // repaired — she drifted into assistant register and stayed there for
        // the rest of the rep. Event-driven rather than timed, because blind
        // periodic session updates damaged prompt-cache reuse.
        const hits = stabilityRef.current.observe(turn.text, turn.t_end)
        // Only an IDENTITY break may answer with the identity reminder. A
        // verbosity or question-rate break is a band violation, the band owns
        // both, and the reminder never mentions either — measured, it made her
        // longer, so the length alarm was firing the thing that lengthened her.
        // See `warrantsReinforcement`.
        if (hits.some(warrantsReinforcement)) {
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
          // A3. Three attempts, and only on the arm that asked for them. Every
          // other rep ends here exactly as it did before.
          if (resumable && reconnectsRef.current < RECONNECT_ATTEMPTS) {
            reconnect(voice)
            return
          }
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
        // Three different remedies, and they must not share a screen. A refused
        // microphone is fixed in the browser; a lost connection is worth
        // retrying; a REFUSAL is a decision the user has to act on somewhere
        // else entirely, and retrying it can never work.
        const message = cause instanceof VoiceError ? cause.message : String(cause)
        if (cause instanceof VoiceError && cause.code === 'refused') {
          setRefusal(message)
          setError('refused')
          // Not `retryResume()`. A reconnection loop against a refusal is three
          // more identical refusals and thirty seconds of a spinner.
          setStatus('idle')
          return
        }
        setError(/microphone|permission|NotAllowed/i.test(message) ? 'mic' : 'connection')
        if (retryResume()) return
        setStatus('idle')
        return
      }
      if (!stillCurrent()) { await abandonAttempt(); return }
      if (setupFailed) {
        await abandonAttempt()
        disposeAttempt()
        setError('connection')
        if (retryResume()) return
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
      voice.setWarmth(warmthRef.current?.engine.warmth ?? 0, warmthRef.current?.replyShape)

      setStatus('live')
      if (resuming) {
        // The clock was stopped when the transport dropped. Move its origin
        // forward by however long the room was empty, so the outage costs the
        // candidate nothing and the remaining time is what it was.
        if (pausedAtRef.current !== null) {
          startedAtRef.current += performance.now() - pausedAtRef.current
          pausedAtRef.current = null
        }
        resumingRef.current = false
      } else {
        startedAtRef.current = performance.now()
        setMsRemaining(durationMs)
      }

      // The row is opened when the transport connects, so a rep that crashes
      // still leaves evidence it happened — and this is where the daily quota
      // is spent.
      // A resume keeps the row it already has. `startSession` would adopt the
      // same one anyway — it resumes an open row for ten minutes — but going
      // back through it would re-run the safety wiring against a session id
      // that has not changed.
      if (!resuming) sessionIdRef.current = null
      sessionOpenRef.current = (resuming && sessionIdRef.current
        ? Promise.resolve({ sessionId: sessionIdRef.current })
        : ownedSessionId
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
        // A4. While the room is empty the clock does not move, and neither does
        // anything it drives — no wind-down, no scene beat, no ending. Off for
        // dating, where a pause is a mute and the scene keeps running.
        if (resumable && pausedRef.current) return
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
        // B7. THE INTERVIEW'S CLOSING BEAT IS A QUESTION, AND THIRTY SECONDS
        // IS NOT ENOUGH TIME TO ANSWER IT.
        //
        // The dating rule is untouched: `shouldWrapUp` still carries
        // `WRAP_UP_MS`, `givesNumber` still decides the number, and a dating
        // rep reaches the identical branch. The interview arm fires on its own
        // proportional constant — fifteen percent of the round — and hands her
        // "do you have any questions for me?", which is a beat candidates
        // really do lose offers on and which needs room to land.
        const wrapDue = interview
          ? interviewShouldWrapUp({ msRemaining: remaining, alreadyWrapped: wrappedRef.current, round })
          : shouldWrapUp({ msRemaining: remaining, alreadyWrapped: wrappedRef.current })
        if (wrapDue) {
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
          providerRef.current?.reinforce(
            interview
              ? (roundType(round).nextSteps ? INTERVIEW_NEXT_STEPS_DIRECTIVE : INTERVIEW_WRAP_UP_DIRECTIVE)
              : offering ? NUMBER_DIRECTIVE : WRAP_UP_DIRECTIVE,
          )
        }

        // The scene, on its own clock. Fired before the wind-down check so a
        // beat can never land on top of the closing direction, and never after
        // the wrap-up has been sent.
        if (!wrappedRef.current) {
          const elapsedFraction = 1 - remaining / durationMs
          const beat = dueSceneBeat({
            beats: config.persona.sceneBeats,
            elapsedFraction,
            fired: beatsFiredRef.current,
          })
          if (beat) {
            beatsFiredRef.current += 1
            providerRef.current?.reinforce(beat.direction)
          }

          // THE AGENDA AND THE PROBE, ON THE SAME CLOCK AND THE SAME CHANNEL.
          //
          // An interviewer with permission to follow a thread and nothing
          // telling her to leave it follows one thread for the whole rep —
          // measured, fifteen of seventeen turns on the opening question. The
          // agenda beat is the only thing in the build that pushes her back to
          // her list, and it says the thread is finished rather than what to
          // ask next.
          //
          // The probe beat is its sibling and pushes DOWN rather than sideways:
          // stop asking what they did, take one technical thing they just
          // named, and ask how it actually works. Four reps on a real
          // microphone asked that question zero times.
          //
          // `dueInterviewBeat` owns both clocks and returns at most one, so
          // they can never arrive in the same turn — two directions at once is
          // the argument this file already settles with `LAST_BEAT_FRACTION`.
          // `else if`, so a scene beat cannot land on top of either.
          else if (interview) {
            const due = dueInterviewBeat({
              elapsedFraction,
              round,
              difficulty,
              agendaFired: agendaBeatsRef.current,
              probeFired: probeBeatsRef.current,
              // A probe fired at somebody who has described nothing is the
              // interrogation in rep `e9c74f80`. Suppressed outright — and the
              // whole ladder is off for a round or a field with nothing
              // authored, which is most of them today.
              ladder: probes,
              grounded: isGrounded(turnsRef.current),
              msSinceLastBeat: lastInterviewBeatAtRef.current === 0
                ? Number.POSITIVE_INFINITY
                : performance.now() - lastInterviewBeatAtRef.current,
            })
            if (due) {
              lastInterviewBeatAtRef.current = performance.now()
              if (due.kind === 'agenda') {
                agendaBeatsRef.current += 1
              } else {
                probeBeatsRef.current += 1
                // The turn she is about to take is the probe. Marked here
                // because this is the only moment anything knows (§8.1) — and
                // only for the rungs that have a right answer: `requirements`
                // and `shape` are structural moves, and asking a grader whether
                // "how would you lay this out" was CORRECT is asking it to
                // invent a verdict.
                if (due.beat.rung !== 'requirements' && due.beat.rung !== 'shape') {
                  pendingTurnMarkRef.current = 'probe'
                }
              }
              providerRef.current?.reinforce(due.beat.direction)
            }
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
    // `difficulty`, `probes` and `posesBrief` join `round` here: all four are
    // server-resolved facts about the setup that cannot change while a rep is
    // running, and all four are read inside the tick.
  }, [config, difficulty, durationMs, interview, personaId, posesBrief, probes, publish, resumable, retryResume, reconnect, round])

  // `reconnect` and `retryResume` re-enter `start`, and a callback cannot name
  // itself. The ref is assigned on every render so it is never a stale closure.
  startRef.current = start

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
    // A4, and ONLY on the arm that asked for it. A dating rep's clock runs
    // through a pause on purpose — "three minutes is three minutes", and a
    // stranger in a shop does not wait for you. A twenty-minute interview that
    // burned its clock through a backgrounded tab would be charging somebody
    // for time nobody was in the room.
    if (resumable && pausedAtRef.current === null) pausedAtRef.current = performance.now()
    // She stops cutting across him while he is away. Restored on resume from
    // the level rule rather than from a remembered flag, because the level is
    // what the answer actually depends on (§05).
    providerRef.current?.setMuted?.(true)
    providerRef.current?.setInterruptible(false)
    setSpeaking(agentSpeakingRef.current ? 'persona' : 'none')
  }, [resumable])

  const resume = useCallback(() => {
    if (!pausedRef.current) return
    pausedRef.current = false
    setPaused(false)
    // The clock's origin moves forward by however long they were away, so the
    // remaining time is exactly what it was when they left.
    if (resumable && pausedAtRef.current !== null && startedAtRef.current > 0) {
      startedAtRef.current += performance.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
    // Restored through the meter rather than from the level alone. The level is
    // still the ceiling (§05), but whether she actually takes the turn depends
    // on how the rep is going — and going back to the raw level rule here would
    // let a bored character cut across him for the one turn before the next
    // `publish` corrected it.
    providerRef.current?.setMuted?.(false)
    providerRef.current?.setWarmth(warmthRef.current?.engine.warmth ?? 0, warmthRef.current?.replyShape)
  }, [resumable])

  const retry = useCallback(() => {
    void (async () => {
      // Retire the preceding provider and writes before opening a new one.
      // A retry cannot leave the old microphone or paid request running.
      await (stopPromiseRef.current ?? stopRef.current?.('error'))?.catch(() => undefined)
      setRetryAttempt((value) => Math.min(3, value + 1))
      startedRef.current = false
      setError(null)
      setRefusal(null)
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

  // The rail's own reading of where he is. Recomputed on every render rather
  // than held in state: it is two counters and a transcript scan, and a second
  // copy in state is a second thing that can disagree with the transcript.
  const agenda = agendaStep({
    userTurns,
    agentTurns,
    wrapping: !outcome && status === 'live' && msRemaining <= (interview
      ? interviewWrapUpMs(round)
      : WRAP_UP_MS),
    round,
  })

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
    userTurns,
    agentTurns,
    endReason,
    error,
    refusal,
    safety,
    sessionId,
    // C6. The rail, wired at last. `questionIndex` advances on COMPLETED
    // exchanges — his turn AND her reply — because a rail that counts his turns
    // alone points at an answer that never arrived (D13), and the wind-down owns
    // the last step outright.
    //
    // `question` is her own most recent question, taken verbatim out of the
    // transcript and refused by `captionOrNull` if it is not. It is a caption
    // and never a prompt: §11 forbids it ever carrying a hint, a structure
    // reminder or an example answer, and that is enforced in code.
    //
    // Zeroed on the dating arm, which never renders any of the three.
    questionIndex: interview ? agenda.index : 0,
    questionTotal: interview ? agenda.total : 0,
    question: interview ? captionOrNull(questionCaption(turnsRef.current), turnsRef.current) : null,
    start,
    end,
    pause,
    resume,
    retry,
  }
}
