/**
 * The deterministic 60% of the Composure Score (§07).
 *
 * Computed locally from the transcript. These carry the majority precisely
 * because they are stable — the same performance scoring 62 on Tuesday and 81
 * on Thursday would destroy the credibility of the entire progression system.
 *
 * Nothing here touches a model or a network. It is the half of the scorecard
 * that cannot drift when a model updates.
 */

import type { TranscriptTurn } from '@/lib/voice/types'
import { fillerCount, isOpenQuestion } from '@/lib/warmth/fast'

export interface DeterministicMetrics {
  /** Share of total speaking time that was his. Target band 40-55%. */
  talkRatio: number | null
  questionsAsked: number
  /** Per three minutes, which is the unit §07 states the target in. */
  questionsPer3Min: number | null
  openQuestions: number
  closedQuestions: number
  /** Target >= 2:1. Null when he asked no closed questions. */
  openClosedRatio: number | null
  /** Per minute of his speaking time. Target < 4. */
  fillerRate: number | null
  /** Seconds. Target < 22 — catches the anxious over-explaining spiral. */
  longestMonologue: number
  /** Seconds between her finishing and him starting. Target < 1.8. */
  meanResponseLatency: number | null
  /** "Coffee Thursday?" beats "we should hang out sometime". */
  specificPlanOffered: boolean
  /** Left warmly without pushing. Only meaningful after a knock-back. */
  cleanExit: boolean
  userTurns: number
  agentTurns: number
  sessionSeconds: number
}

/** A concrete plan names a time, a day, or an occasion. Vagueness does not count. */
const SPECIFIC_PLAN =
  /\b(tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week|at \d|around \d|\d\s?(am|pm)|o'?clock)\b/i
const PLAN_VERB =
  /\b(coffee|drink|dinner|lunch|meet|see you|come along|go for|grab)\b/i

const FAREWELL =
  /\b(nice to meet you|good to meet you|nice talking|enjoy the rest|have a good|take care|see you|all the best|good luck|no worries|fair enough|no problem)\b/i
const PUSHY =
  /\b(come on|just one|why not|are you sure|give me a chance|just give me|please|at least)\b/i

function speakingSeconds(turns: readonly TranscriptTurn[]): number {
  return turns.reduce((sum, turn) => sum + Math.max(0, turn.t_end - turn.t_start), 0)
}

export function computeDeterministicMetrics(
  transcript: readonly TranscriptTurn[],
  sessionSeconds: number,
): DeterministicMetrics {
  const user = transcript.filter((turn) => turn.speaker === 'user')
  const agent = transcript.filter((turn) => turn.speaker === 'agent')

  const userSeconds = speakingSeconds(user)
  const agentSeconds = speakingSeconds(agent)
  const totalSpoken = userSeconds + agentSeconds

  // Questions. §07 tracks open vs closed separately because "yes/no questions
  // are where conversations go to die".
  let openQuestions = 0
  let closedQuestions = 0
  for (const turn of user) {
    if (isOpenQuestion(turn.text)) openQuestions += 1
    else if (turn.text.includes('?')) closedQuestions += 1
  }
  const questionsAsked = openQuestions + closedQuestions

  const fillers = user.reduce((sum, turn) => sum + fillerCount(turn.text), 0)

  // Response latency: her finishing to him starting. Only pairs where she
  // actually spoke before him count.
  const latencies: number[] = []
  for (let i = 0; i < transcript.length - 1; i += 1) {
    const current = transcript[i]
    const next = transcript[i + 1]
    if (current?.speaker === 'agent' && next?.speaker === 'user') {
      const gap = next.t_start - current.t_end
      if (gap >= 0 && gap < 30) latencies.push(gap)
    }
  }

  const lastUser = user[user.length - 1]
  const farewell = lastUser ? FAREWELL.test(lastUser.text) : false
  const pushedAtTheEnd = user.slice(-2).some((turn) => PUSHY.test(turn.text))

  return {
    talkRatio: totalSpoken > 0 ? userSeconds / totalSpoken : null,
    questionsAsked,
    questionsPer3Min: sessionSeconds > 0 ? (questionsAsked / sessionSeconds) * 180 : null,
    openQuestions,
    closedQuestions,
    openClosedRatio: closedQuestions > 0 ? openQuestions / closedQuestions : null,
    fillerRate: userSeconds > 0 ? (fillers / userSeconds) * 60 : null,
    longestMonologue: user.reduce(
      (longest, turn) => Math.max(longest, turn.t_end - turn.t_start),
      0,
    ),
    meanResponseLatency:
      latencies.length > 0
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : null,
    specificPlanOffered: user.some(
      (turn) => SPECIFIC_PLAN.test(turn.text) && PLAN_VERB.test(turn.text),
    ),
    cleanExit: farewell && !pushedAtTheEnd,
    userTurns: user.length,
    agentTurns: agent.length,
    sessionSeconds: Math.round(sessionSeconds * 10) / 10,
  }
}

/** Scores a metric against its §07 target band, 0-100. */
export function bandScore(
  value: number | null,
  target: { min?: number; max?: number },
): number | null {
  if (value === null) return null
  const { min, max } = target
  if (min !== undefined && max !== undefined) {
    if (value >= min && value <= max) return 100
    const distance = value < min ? min - value : value - max
    const span = Math.max(max - min, 1e-6)
    return Math.max(0, Math.round(100 - (distance / span) * 100))
  }
  if (max !== undefined) {
    return value <= max ? 100 : Math.max(0, Math.round(100 - ((value - max) / max) * 100))
  }
  if (min !== undefined) {
    return value >= min ? 100 : Math.max(0, Math.round((value / min) * 100))
  }
  return null
}
