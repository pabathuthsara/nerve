/**
 * What happens after a verdict (§16.3, §16.8).
 *
 * §16 gives the sequence in one sentence — *"a user steering explicit gets an
 * in-frame decline first, then the rep ends"* — and that sentence is the whole
 * of this file. It is a state machine and not a branch inside the hook,
 * because the interesting cases are the ones nobody will reproduce by hand: a
 * second strike arriving from her stream rather than his, a `stop` on a rep
 * that already has a strike against it, a distress signal in the last ten
 * seconds of a rep that was going fine.
 *
 * IN FRAME IS THE POINT. The first strike is not a warning dialog and not a
 * message from the app: she declines, in her own words, as a person who has
 * just been made uncomfortable. That is both the better product and the more
 * honest one — the user finds out the boundary exists the way they would find
 * it out in a bar. An app-voice interruption here would also break §05, which
 * says the only things a live rep may show are the timer, the ring and her.
 *
 * The second strike is not in frame. The rep ends.
 */

import type { SafetySpeaker, SafetyVerdict } from './moderation'

/**
 * What the caller must do about it.
 *
 *   none      carry on
 *   decline   she says no, in character; the rep continues (§16.3)
 *   correct   HER line crossed. She is pulled back, silently, and the user is
 *             told nothing — being shown "the character misbehaved" mid-rep
 *             would be worse than the sentence they already heard
 *   end       the rep ends now
 *   distress  the rep ends AND the training frame is dropped (§16.8)
 */
export type SafetyAction = 'none' | 'decline' | 'correct' | 'end' | 'distress'

/**
 * Strikes so far, by stream.
 *
 * Counted separately because they mean different things. His are a person
 * steering; hers are a model drifting, and a rep should not end on his second
 * turn because she said one odd thing an hour into the scene. Neither counter
 * ever decreases inside a rep: a boundary that expires is a boundary that can
 * be waited out.
 */
export interface SafetyState {
  userStrikes: number
  agentStrikes: number
  /** Set once the rep has been ended by this machine. Nothing follows it. */
  closed: boolean
}

export function emptySafetyState(): SafetyState {
  return { userStrikes: 0, agentStrikes: 0, closed: false }
}

export interface SafetyDecision {
  action: SafetyAction
  state: SafetyState
  /**
   * The `safety_events.kind` this decision is recorded as, or null when there
   * is nothing to record. The kinds are the migration's, not ours to invent.
   */
  kind: 'boundary' | 'ended' | 'distress' | 'moderation' | null
}

/**
 * The transition. Pure, total, and the only place the sequence is written.
 *
 * Takes the state rather than owning it so the server can rebuild it from
 * `safety_events` on every call — the strike count has to survive a page
 * reload, a second tab and a client that decided not to tell us, and a counter
 * held only in a hook survives none of those.
 */
export function nextSafetyAction(
  state: SafetyState,
  input: { verdict: SafetyVerdict; speaker: SafetySpeaker },
): SafetyDecision {
  // A rep this machine has already ended cannot be ended again, and cannot
  // collect a strike on the way out. Turns keep arriving after `end` — she is
  // usually mid-sentence — and each of them would otherwise be a fresh event.
  if (state.closed) return { action: 'none', state, kind: null }

  if (input.verdict === 'ok') return { action: 'none', state, kind: null }

  // No strike, no decline, no second chance, either stream. See STOP_CATEGORIES.
  if (input.verdict === 'stop') {
    return { action: 'end', state: { ...state, closed: true }, kind: 'ended' }
  }

  if (input.verdict === 'distress') {
    // Classification already guarantees this is his stream; asserting it again
    // here would be a second place for the rule to live and disagree.
    return { action: 'distress', state: { ...state, closed: true }, kind: 'distress' }
  }

  if (input.speaker === 'agent') {
    const agentStrikes = state.agentStrikes + 1
    // Her second is an end, like his. A character that has crossed the line
    // twice in three minutes is not going to be steered back by a third note.
    if (agentStrikes >= 2) {
      return { action: 'end', state: { ...state, agentStrikes, closed: true }, kind: 'ended' }
    }
    return { action: 'correct', state: { ...state, agentStrikes }, kind: 'boundary' }
  }

  const userStrikes = state.userStrikes + 1
  if (userStrikes >= 2) {
    return { action: 'end', state: { ...state, userStrikes, closed: true }, kind: 'ended' }
  }
  return { action: 'decline', state: { ...state, userStrikes }, kind: 'boundary' }
}

/**
 * Rebuilds the state from what is already on the record.
 *
 * The database is the memory. `kind` and the speaker stamped in `detail` are
 * everything needed, which is why both are written on every event.
 */
export function stateFromEvents(
  events: readonly { kind: string; speaker: SafetySpeaker | null }[],
): SafetyState {
  const state = emptySafetyState()
  for (const event of events) {
    if (event.kind === 'ended' || event.kind === 'distress') state.closed = true
    if (event.kind !== 'boundary') continue
    if (event.speaker === 'agent') state.agentStrikes += 1
    else state.userStrikes += 1
  }
  return state
}

/**
 * What she is told when he crosses the line.
 *
 * A direction, not a script. Every other reinforcement in this product hands
 * her an intention and lets her find the words (`lib/voice/reinforcement.ts`),
 * and a canned sentence here would be the one line in a three-minute rep that
 * sounds like an app — which is exactly the moment it must not.
 *
 * "Not a lecture" is load-bearing. A character who delivers a paragraph about
 * respect is a product telling its user off, and §16.6 rules out the whole
 * register: we do not moralise at people, we decline and move on.
 */
export const DECLINE_DIRECTIVE = [
  '(He has just said something explicit or aggressive, and you do not want it.',
  'Say so plainly, in your own words — short, cool, one sentence, not a lecture.',
  'Do not repeat what he said. Then either change the subject or let it sit.',
  'Stay completely in character and keep the conversation going.)',
].join(' ')

/**
 * What she is told when SHE crossed it.
 *
 * The user never sees this and never learns it happened, which is the correct
 * outcome: the sentence has already been said and pointing at it a second time
 * would double the damage. Phrased as a note about her, not about a rule,
 * because a model told "you violated a content policy" answers as a policy.
 */
export const CORRECT_DIRECTIVE = [
  '(You just said something you would never say to a stranger you had only',
  'just met in public. Drop it, do not refer to it again, and keep the',
  'conversation where a stranger in public would keep it.)',
].join(' ')

/**
 * The last thing she is told, so the rep ends as a scene rather than a crash.
 *
 * The alternative — cutting the transport dead — is a black screen with no
 * explanation and reads as a bug, which is the reading that gets a safety
 * control switched off by the person it protected.
 */
export const CLOSE_DIRECTIVE = [
  '(This conversation is over. Say one short goodbye — cold, not angry —',
  'and leave. Do not explain, do not ask anything, do not continue.)',
].join(' ')
