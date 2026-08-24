/** OpenAI Realtime events -> Nerve domain events. */

import type { VoiceEmitter } from '../emitter'
import { TurnAssembler } from '../transcript'
import { clipToPlayed } from '../truncate'
import { classifyPhantom, classifyEcho, type PhantomReason } from './noise'
import {
  VoiceError,
  type ProviderId,
  type TranscriptTurn,
  type UsageSample,
} from '../types'

const PROVIDER: ProviderId = 'openai'

interface ServerEvent {
  type: string
  [key: string]: unknown
}

interface ResponsePayload {
  id?: unknown
  usage?: unknown
  output?: unknown
  /** completed | cancelled | failed | incomplete */
  status?: unknown
}

export interface OpenAIEventTranslatorCallbacks {
  /** A second response appeared while the first was generating/playing. */
  onOverlap?: (responseId: string | null) => void
  onUsage?: (usage: UsageSample) => void
  /**
   * Server VAD committed a user turn; the client may now create a response.
   *
   * Reports back whether a response was actually created or merely queued
   * behind one already in flight. A turn that later proves to be echo or noise
   * has to be undone, and those two states undo differently — see
   * `OpenAIResponseGate.cancelPending`.
   */
  onUserTurnCommitted?: () => 'created' | 'queued'
  /** The active response has finished generation and playback. */
  onResponseSettled?: () => void
  /** The model called the explicit terminal scene action. */
  onCharacterExit?: (at: number) => void
  /** The model printed tool syntax instead of making a structured call. */
  onToolSyntaxLeak?: (at: number) => void
  /**
   * The transcriber returned words for something that was not speech.
   *
   * A reply to it is already in flight by the time we know — the response is
   * created on `input_audio_buffer.committed`, which fires before transcription
   * completes — so the adapter cancels it if she has not started speaking yet.
   */
  onPhantomTurn?: (at: number, reason: PhantomReason, responseId: string | null) => void
  /**
   * She spoke twice with no user turn between.
   *
   * Reported, not repaired: the audio has already reached the user's ears by
   * the time this is knowable, so the turn is still committed. A second reply
   * that never reached them is a different thing and is dropped — see
   * `onUnheardReply` and `sealAgentTurn`.
   */
  onDoubleTurn?: (at: number) => void
  /** A reply whose audio never opened, dropped rather than committed. */
  onUnheardReply?: (at: number) => void
  /**
   * She was cut off part-way through a line the user could hear.
   *
   * Carries the milliseconds of her audio that actually played, so the adapter
   * can tell the server to cut her own history back to the same point. Without
   * that second half she "remembers" saying a sentence the user received one
   * word of, and every later turn continues from a conversation that did not
   * happen — which is what reads, live, as her switching to another sentence.
   */
  onTruncatedTurn?: (input: {
    at: number
    playedMs: number
    heard: string
    generated: string
  }) => void
  /**
   * A user turn was discarded as her own voice returning through the mic.
   *
   * Reported because the alternative is what shipped: a real turn could vanish
   * with no transcript entry, no warmth event and no reply, and nothing
   * anywhere said so.
   */
  onEchoRejected?: (at: number, overlap: number) => void
}

function readString(event: ServerEvent, key: string): string | null {
  const value = event[key]
  return typeof value === 'string' ? value : null
}

function readResponse(event: ServerEvent): ResponsePayload | null {
  const value = event['response']
  return value && typeof value === 'object' ? value as ResponsePayload : null
}

function responseId(event: ServerEvent): string | null {
  const response = readResponse(event)
  return typeof response?.id === 'string' ? response.id : readString(event, 'response_id')
}

function numberAt(value: unknown, ...path: string[]): number {
  let cursor: unknown = value
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return 0
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : 0
}

function numberAtEither(value: unknown, paths: readonly string[][]): number {
  for (const path of paths) {
    const found = numberAt(value, ...path)
    if (found !== 0) return found
  }
  return 0
}

function parseUsage(event: ServerEvent, at: number): UsageSample | null {
  const response = readResponse(event)
  const usage = response?.usage
  if (!usage || typeof usage !== 'object') return null
  return {
    at,
    responseId: responseId(event),
    inputTextTokens: numberAtEither(usage, [
      ['input_token_details', 'text_tokens'],
      ['input_tokens_details', 'text_tokens'],
    ]),
    cachedInputTextTokens: numberAtEither(usage, [
      ['input_token_details', 'cached_tokens_details', 'text_tokens'],
      ['input_tokens_details', 'cached_tokens_details', 'text_tokens'],
    ]),
    inputAudioTokens: numberAtEither(usage, [
      ['input_token_details', 'audio_tokens'],
      ['input_tokens_details', 'audio_tokens'],
    ]),
    cachedInputAudioTokens: numberAtEither(usage, [
      ['input_token_details', 'cached_tokens_details', 'audio_tokens'],
      ['input_tokens_details', 'cached_tokens_details', 'audio_tokens'],
    ]),
    outputTextTokens: numberAtEither(usage, [
      ['output_token_details', 'text_tokens'],
      ['output_tokens_details', 'text_tokens'],
    ]),
    outputAudioTokens: numberAtEither(usage, [
      ['output_token_details', 'audio_tokens'],
      ['output_tokens_details', 'audio_tokens'],
    ]),
    totalTokens: numberAt(usage, 'total_tokens'),
    pricedCostUsd: null,
  }
}

function requestsSceneExit(event: ServerEvent): boolean {
  const output = readResponse(event)?.output
  if (!Array.isArray(output)) return false
  return output.some((item) => {
    if (!item || typeof item !== 'object') return false
    const call = item as Record<string, unknown>
    return call['type'] === 'function_call' && call['name'] === 'end_scene'
  })
}

function itemRequestsSceneExit(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return item['type'] === 'function_call' && item['name'] === 'end_scene'
}

const END_SCENE_LITERAL = /(?:^|\s)(?:functions?\.)?end_scene\s*\(\s*(?:\{\s*\})?\s*\)\s*$/i

function stripEndSceneLiteral(text: string): { text: string; leaked: boolean } {
  if (!END_SCENE_LITERAL.test(text)) return { text, leaked: false }
  return { text: text.replace(END_SCENE_LITERAL, '').trim(), leaked: true }
}

function hasAudioOutput(event: ServerEvent): boolean {
  const output = readResponse(event)?.output
  if (!Array.isArray(output)) return false
  return output.some((item) => {
    if (!item || typeof item !== 'object') return false
    const content = (item as Record<string, unknown>)['content']
    return Array.isArray(content) && content.some((part) => {
      if (!part || typeof part !== 'object') return false
      const type = (part as Record<string, unknown>)['type']
      return type === 'audio' || type === 'output_audio'
    })
  })
}

/**
 * `completed` | `cancelled` | `failed` | `incomplete`, or null if absent.
 * A response that did not complete may never reach the speakers at all.
 */
function responseStatus(event: ServerEvent): string | null {
  const status = readResponse(event)?.status
  return typeof status === 'string' ? status : null
}

export class OpenAIEventTranslator {
  private readonly userTurns = new TurnAssembler('user')
  private readonly agentTurns = new TurnAssembler('agent')
  private speaking = false
  private finalAgentTranscript: string | null = null
  private playbackEndAt: number | null = null
  private activeResponseId: string | null = null
  private responseGenerationDone = false
  private readonly ignoredResponseIds = new Set<string>()
  private committedAgentTurn = false
  private userSinceAgent = false
  private characterExitRequested = false
  private characterExitSignalled = false
  private playbackFinishedForResponse = false
  /** Did any audio for the CURRENT response reach the speakers? */
  private playbackStartedForResponse = false
  /** When her audio actually opened. The left edge of what the user heard. */
  private playbackStartedAt: number | null = null
  /**
   * Her audio was CLEARED rather than allowed to finish.
   *
   * `stopped` means she reached the end of the line. `cleared` means somebody —
   * server VAD honouring a barge-in, or our own phantom cancel — threw away the
   * rest of it. Only the second one means the transcript is longer than what
   * the user heard.
   */
  private playbackCleared = false
  /** The conversation item her current audio belongs to, for `item.truncate`. */
  private audioItemId: string | null = null
  /** When the current user utterance began, for the phantom-turn duration rule. */
  private userSpeechStartedAt: number | null = null
  private lastUserSpeechSeconds: number | null = null
  /** Did the whole current user segment fall inside her playback? */
  private userSpeechDuringAgent = false
  private lastUserSpeechDuringAgent = false
  /** The last thing she actually said, for echo comparison. */
  private lastAgentText: string | null = null
  /** The response THIS user turn created, or null if it was queued instead. */
  private userTurnResponseId: string | null = null
  /** A response is on its way for this user turn but its id has not arrived. */
  private userTurnAwaitingResponse = false
  /** A phantom verdict that landed before the id it needs. Deferred, not lost. */
  private deferredPhantom: { at: number; reason: PhantomReason } | null = null

  constructor(
    private readonly emitter: VoiceEmitter,
    private readonly now: () => number,
    private readonly onTurn: (turn: TranscriptTurn) => void,
    private readonly callbacks: OpenAIEventTranslatorCallbacks = {},
    /**
     * Her speaking rate, read lazily — the persona is not known when the
     * translator is built, only when `connect` runs.
     */
    private readonly options: { paceOf?: () => number } = {},
  ) {}

  get agentSpeaking(): boolean {
    return this.speaking
  }

  ingest(raw: string): void {
    let event: ServerEvent
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      event = parsed as ServerEvent
    } catch {
      return
    }
    if (typeof event.type !== 'string') return

    const at = this.now()
    const eventResponseId = responseId(event)
    if (eventResponseId && this.ignoredResponseIds.has(eventResponseId)) {
      if (event.type === 'response.done') this.ignoredResponseIds.delete(eventResponseId)
      return
    }

    switch (event.type) {
      case 'response.created': {
        if (this.activeResponseId && eventResponseId !== this.activeResponseId) {
          if (eventResponseId) this.ignoredResponseIds.add(eventResponseId)
          this.callbacks.onOverlap?.(eventResponseId)
          break
        }
        // A previous response whose playback ended and which was never sealed
        // has left its open boundary and its accumulated text in the assembler.
        // `openAt` only assigns when the slot is null, so THIS response would
        // inherit the previous one's start time, and its own final transcript
        // would silently overwrite text she really did say. Cleared here, at
        // the one place that is unambiguously a new turn.
        this.discardStaleAgentTurn()
        this.activeResponseId = eventResponseId ?? this.activeResponseId ?? 'unknown'
        this.responseGenerationDone = false
        this.playbackFinishedForResponse = false
        this.playbackStartedForResponse = false
        this.playbackStartedAt = null
        this.playbackCleared = false
        this.audioItemId = null

        // Bind this response to the user turn that caused it. Cancelling a
        // phantom means cancelling THIS id and no other; the round-12 fault
        // was cancelling `activeResponseId`, which after a coalesced commit is
        // the reply to a REAL turn that is currently playing.
        if (this.userTurnAwaitingResponse) {
          this.userTurnAwaitingResponse = false
          this.userTurnResponseId = this.activeResponseId
          // A phantom verdict that arrived before this id can now be acted on.
          const deferred = this.deferredPhantom
          if (deferred) {
            this.deferredPhantom = null
            this.callbacks.onPhantomTurn?.(deferred.at, deferred.reason, this.userTurnResponseId)
          }
        }
        break
      }

      case 'response.done': {
        const usage = parseUsage(event, at)
        if (usage) this.callbacks.onUsage?.(usage)
        const exitRequested = requestsSceneExit(event)
        if (exitRequested) this.characterExitRequested = true
        this.responseGenerationDone = true
        if (
          this.characterExitRequested &&
          (this.playbackFinishedForResponse || !hasAudioOutput(event))
        ) {
          this.signalCharacterExit(at)
        }
        // THE ROUND-10 RACE. This used to settle whenever she was not currently
        // audible, which cannot tell "the audio has not started yet" apart from
        // "the audio already finished". `response.done` routinely arrives
        // BEFORE `output_audio_buffer.started`, so a reply that was about to
        // speak released the response gate, a second response.create landed on
        // top of it, and the overlap guard then cancelled one of the two.
        //
        // That single fault produced all three symptoms in round 10: she began
        // a sentence and switched to another one, she spoke when nobody had
        // said anything, and a user turn got no answer at all because the
        // cancelled response WAS the answer.
        //
        // A response with audio now settles only once playback has actually
        // ended. One without audio — a bare function call — settles here,
        // because nothing else will ever settle it.
        //
        // THE ROUND-11 DEADLOCK, which is the mirror of the race above. Waiting
        // for playback is right for a response that will play. It is fatal for
        // one that never will: cancel a reply before its first audio frame
        // reaches the speakers — a barge-in during the opening greeting does
        // exactly this — and the server sends `response.done` with audio in the
        // output but no `output_audio_buffer.started`, and therefore no
        // `stopped` either. Nothing was ever going to settle it.
        //
        // The gate then stays in-flight forever. Every later user turn is
        // coalesced into `pending` that never fires, so she goes permanently
        // silent while VAD, warmth and steering all carry on as normal. The
        // session looks alive and answers nothing.
        //
        // A response that ended in any state other than `completed`, without
        // ever having reached the speakers, settles here.
        const status = responseStatus(event)
        const endedBeforePlayback =
          status !== null && status !== 'completed' && !this.playbackStartedForResponse

        if (!hasAudioOutput(event) || this.playbackFinishedForResponse || endedBeforePlayback) {
          this.clearActiveResponse()
        }
        break
      }

      case 'response.output_item.done': {
        if (itemRequestsSceneExit(event['item'])) this.characterExitRequested = true
        if (this.characterExitRequested && this.playbackFinishedForResponse) {
          this.signalCharacterExit(at)
        }
        break
      }

      case 'response.function_call_arguments.done': {
        if (readString(event, 'name') === 'end_scene') this.characterExitRequested = true
        if (this.characterExitRequested && this.playbackFinishedForResponse) {
          this.signalCharacterExit(at)
        }
        break
      }

      case 'input_audio_buffer.speech_started': {
        this.userSinceAgent = true
        this.userSpeechStartedAt = at
        // Speech that begins while she is audible is the first half of the
        // echo test. It is not proof on its own — at levels 5+ a real barge-in
        // looks identical — so it only lowers the similarity bar.
        this.userSpeechDuringAgent = this.speaking
        this.userTurns.openAt(at)
        this.emitter.emit('user.speech.start', { at })
        break
      }

      case 'input_audio_buffer.speech_stopped': {
        this.lastUserSpeechSeconds =
          this.userSpeechStartedAt === null ? null : Math.max(0, at - this.userSpeechStartedAt)
        this.userSpeechStartedAt = null
        // Only a segment enclosed at BOTH ends by her playback counts. One that
        // starts inside her turn and runs past the end of it is someone talking
        // over her, which is a real turn and must survive.
        this.lastUserSpeechDuringAgent = this.userSpeechDuringAgent && this.speaking
        this.userSpeechDuringAgent = false
        this.userTurns.closeAt(at)
        this.emitter.emit('user.speech.stop', { at })
        break
      }

      case 'input_audio_buffer.committed': {
        this.userTurnResponseId = null
        this.deferredPhantom = null
        const outcome = this.callbacks.onUserTurnCommitted?.() ?? 'queued'
        // 'queued' means the gate coalesced this commit behind a reply already
        // in flight, so NOTHING of ours is generating for it. If this turn
        // later proves to be echo, the undo is to drop the queue entry — never
        // to cancel the response the user is currently listening to.
        this.userTurnAwaitingResponse = outcome === 'created'
        break
      }

      case 'conversation.item.input_audio_transcription.delta': {
        const delta = readString(event, 'delta')
        if (!delta) break
        this.userTurns.append(delta)
        const partial = this.userTurns.peek(at)
        if (partial) this.emitter.emit('user.transcript', { turn: partial, final: false })
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const turn = this.userTurns.commit(readString(event, 'transcript'), at)
        const speechSeconds = this.lastUserSpeechSeconds
        const duringAgent = this.lastUserSpeechDuringAgent
        this.lastUserSpeechSeconds = null
        this.lastUserSpeechDuringAgent = false
        if (!turn) break

        // Noise the transcriber turned into words. Suppressed here rather than
        // downstream so it never reaches the transcript, the warmth engine or
        // the scorecard — see ./noise.ts for why all three matter.
        const verdict = classifyPhantom({ text: turn.text, speechSeconds })

        // Her own voice, back through the microphone. A separate test, because
        // an echo of a real sentence passes every phantom rule there is: it is
        // long enough, Latin enough and wordy enough. Compared against what she
        // is saying RIGHT NOW as well as her last sealed turn, since the echo
        // arrives while she is still mid-utterance.
        const echo = verdict.phantom
          ? null
          : classifyEcho({
              text: turn.text,
              agentText: this.recentAgentSpeech(at),
              duringAgentSpeech: duringAgent,
            })

        const reason: PhantomReason | null =
          verdict.reason ?? (echo?.echo ? 'agent-echo' : null)
        if (reason) {
          this.userSinceAgent = false
          if (echo?.echo) this.callbacks.onEchoRejected?.(at, echo.overlap)
          this.rejectUserTurn(at, reason)
          break
        }

        this.commitTurn(turn, 'user')
        break
      }

      // This is the client playback boundary. response.done and transcript.done
      // only mean generation/transcription completed and must never set t_end.
      case 'output_audio_buffer.started': {
        // ONLY here. This flag means "the audio buffer opened", which is the
        // one condition under which a matching `stopped` or `cleared` is
        // guaranteed to follow. `markSpeaking` is also reached from transcript
        // deltas, and a response can emit transcript and then be cancelled
        // without its buffer ever opening — setting the flag there made the
        // round-11 fix miss exactly that case and deadlock again.
        this.playbackStartedForResponse = true
        this.playbackStartedAt = at
        this.audioItemId = readString(event, 'item_id') ?? this.audioItemId
        this.markSpeaking(at)
        break
      }

      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared': {
        this.playbackEndAt = at
        this.playbackFinishedForResponse = true
        // `stopped` means she finished the line. `cleared` means the rest of it
        // was thrown away — a barge-in, or our own phantom cancel — and the
        // words she generated after this instant never reached anybody.
        if (event.type === 'output_audio_buffer.cleared') this.playbackCleared = true
        this.agentTurns.closeAt(at)
        if (this.speaking) {
          this.speaking = false
          this.emitter.emit('agent.speech.stop', { at })
        }
        this.sealAgentTurn()
        if (this.characterExitRequested) this.signalCharacterExit(at)
        if (this.responseGenerationDone || event.type === 'output_audio_buffer.cleared') {
          this.clearActiveResponse()
        }
        break
      }

      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        const delta = readString(event, 'delta')
        if (!delta) break
        // The item her audio belongs to. Needed to cut her own history back to
        // what played; these deltas are the earliest event that carries it.
        this.audioItemId = readString(event, 'item_id') ?? this.audioItemId
        // **Text is not audibility.** This used to call `markSpeaking`, which
        // opens the turn boundary and emits `agent.speech.start`. Transcript
        // deltas arrive over the data channel well before the audio has
        // traversed the media path, so the turn started earlier than she did —
        // and, worse, a response cancelled before it ever reached the speakers
        // still opened a turn, accumulated its full text and was sealed as
        // something she said. That is how "Catching my breath between sets
        // right now." came to be recorded as seven words in 0.22 seconds.
        //
        // The boundary now comes from `output_audio_buffer.started` alone. Text
        // still accumulates here, and the partial still drives live display.
        this.agentTurns.append(delta)
        const partial = this.agentTurns.peek(at)
        if (partial) this.emitter.emit('agent.transcript', { turn: partial, final: false })
        break
      }

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        const transcript = readString(event, 'transcript')
        if (transcript === null) break
        const cleaned = stripEndSceneLiteral(transcript)
        this.finalAgentTranscript = cleaned.text
        if (cleaned.leaked) {
          this.characterExitRequested = true
          this.callbacks.onToolSyntaxLeak?.(at)
        }
        // Playback can stop before the transcript-final control event arrives.
        if (!this.speaking && this.playbackEndAt !== null) this.sealAgentTurn()
        if (this.characterExitRequested && this.playbackFinishedForResponse) {
          this.signalCharacterExit(at)
        }
        break
      }

      case 'error': {
        const payload = event['error']
        const message =
          payload && typeof payload === 'object' && 'message' in payload
            ? String((payload as { message: unknown }).message)
            : 'The provider reported an error.'
        this.emitter.emit('error', {
          error: new VoiceError('provider_error', PROVIDER, message, { fatal: false }),
        })
        break
      }

      default:
        break
    }
  }

  /**
   * What she is saying, or has just said.
   *
   * Prefers live material over history: the echo of a sentence reaches the
   * microphone while she is still speaking it, so the sealed previous turn is
   * the wrong thing to compare against and would miss every case.
   */
  private recentAgentSpeech(at: number): string | null {
    return this.finalAgentTranscript ?? this.agentTurns.peek(at)?.text ?? this.lastAgentText
  }

  /**
   * Discard a user turn that was not the user.
   *
   * The undo has to match what the commit actually did. A turn whose commit
   * CREATED a response cancels that response by id. A turn that was queued
   * behind an in-flight reply has no response of its own, and the correct undo
   * is to drop it from the queue — cancelling by `activeResponseId` there is
   * how a noise artefact came to truncate a real reply mid-word.
   */
  private rejectUserTurn(at: number, reason: PhantomReason): void {
    if (this.userTurnAwaitingResponse) {
      // The response exists but its id has not arrived. Act on `response.created`.
      this.deferredPhantom = { at, reason }
      return
    }
    const ownedResponse = this.userTurnResponseId
    this.userTurnResponseId = null
    this.callbacks.onPhantomTurn?.(at, reason, ownedResponse)
  }

  private markSpeaking(at: number): void {
    if (this.speaking) return
    this.speaking = true
    this.playbackEndAt = null
    this.agentTurns.openAt(at)
    this.emitter.emit('agent.speech.start', { at })
  }

  private sealAgentTurn(): void {
    if (this.playbackEndAt === null || this.finalAgentTranscript === null) return

    // **A response that never reached the speakers is not a turn.** She may
    // have generated the words, but the user did not hear them, and a line in
    // the transcript the user never heard is worse than a gap: the scorer
    // reads these turns, so a phantom reply distorts talk ratio and response
    // latency, and the user reads them too and finds a conversation they were
    // not part of. Dropped rather than committed short.
    if (!this.playbackStartedForResponse) {
      const at = this.playbackEndAt
      this.agentTurns.reset()
      this.finalAgentTranscript = null
      this.playbackEndAt = null
      this.callbacks.onUnheardReply?.(at)
      return
    }

    // THE BARGE-IN LIE, and it was the loudest defect in the pipeline.
    //
    // Reaching here means her audio buffer opened, which used to be the whole
    // test — so a reply the user heard two hundred milliseconds of was
    // committed IN FULL. The debrief showed sentences nobody had heard, and
    // §07 graded a conversation that did not happen. At level 5+ server VAD
    // honours a barge-in, and the threshold is deliberately low for a nervous
    // speaker, so a breath was enough to trigger it.
    //
    // The Realtime arm has no alignment to ask, so the cut is proportional
    // against an estimate of how long the whole line would have taken, and
    // `snapToWordBoundary` guarantees it never lands mid-word.
    const generated = this.finalAgentTranscript
    let text = generated
    if (this.playbackCleared && generated !== null && this.playbackStartedAt !== null) {
      const played = Math.max(0, this.playbackEndAt - this.playbackStartedAt)
      const clip = clipToPlayed(generated, played, this.options.paceOf?.() ?? 1)
      if (clip.truncated) {
        text = clip.text
        this.callbacks.onTruncatedTurn?.({
          at: this.playbackEndAt,
          playedMs: clip.playedMs,
          heard: clip.text,
          generated,
        })
        this.emitter.emit('agent.truncated', { at: this.playbackEndAt })
      }
    }

    const turn = this.agentTurns.commit(text, this.playbackEndAt)
    this.finalAgentTranscript = null
    this.playbackEndAt = null
    this.playbackCleared = false
    this.playbackStartedAt = null
    if (!turn) return

    // ROUND 12. This used to DELETE the turn — and deleting it was the bug.
    //
    // Sealing happens on `output_audio_buffer.stopped`, which is by definition
    // after the audio has played. The user has already heard her say it. All
    // dropping the turn achieved was to hide it from the transcript, the warmth
    // engine and the scorecard, so the grader read a conversation the user did
    // not have. One 160s rep lost 7.9 seconds of her speech this way, across
    // four turns, while `agentTurns` and `userTurns` both read 19 and looked
    // perfectly balanced.
    //
    // It was also redundant: `StabilityMeter` already carries a `double-turn`
    // structural rule over the same committed turns. So this reports the
    // incident and commits the turn, because a transcript's only job is to say
    // what was said.
    if (this.committedAgentTurn && !this.userSinceAgent) {
      this.callbacks.onDoubleTurn?.(turn.t_start)
    }
    this.lastAgentText = turn.text
    this.committedAgentTurn = true
    this.userSinceAgent = false
    this.commitTurn(turn, 'agent')
  }

  private commitTurn(turn: TranscriptTurn, speaker: 'user' | 'agent'): void {
    this.onTurn(turn)
    if (speaker === 'user') this.emitter.emit('user.transcript', { turn, final: true })
    else this.emitter.emit('agent.transcript', { turn, final: true })
  }

  /**
   * Abandon the active response without waiting for events that are not
   * coming. Called by the turn gate's stall watchdog.
   *
   * The gate releasing itself is not enough on its own: this translator would
   * still be holding an `activeResponseId`, so the recovery `response.create`
   * would arrive as an id it does not recognise, be reported as an overlap and
   * be cancelled immediately. The rep would stay silent while looking, from
   * the gate's side, perfectly healthy.
   */
  abandonActiveResponse(): void {
    this.activeResponseId = null
    this.responseGenerationDone = false
    this.playbackStartedForResponse = false
    this.playbackFinishedForResponse = false
    this.playbackStartedAt = null
    this.playbackCleared = false
    this.audioItemId = null
    this.userTurnResponseId = null
    this.userTurnAwaitingResponse = false
    this.deferredPhantom = null
  }

  /** The conversation item her current audio belongs to, or null. */
  get currentAudioItemId(): string | null {
    return this.audioItemId
  }

  /**
   * Throw away a turn whose playback ended and which was never sealed.
   *
   * `sealAgentTurn` bails out when the final transcript never arrived — a
   * response cancelled between its last audio frame and its transcript-done
   * event does exactly that — and it used to bail without clearing the
   * assembler. `TurnAssembler.openAt` only assigns when the start is null, so
   * the next response inherited the abandoned start time, and its own final
   * transcript then overwrote the abandoned text. Timestamps drifted and a
   * partially played line disappeared into the following one.
   */
  private discardStaleAgentTurn(): void {
    if (this.playbackEndAt === null) return
    this.agentTurns.reset()
    this.finalAgentTranscript = null
    this.playbackEndAt = null
    this.playbackCleared = false
    this.playbackStartedAt = null
  }

  private clearActiveResponse(): void {
    this.activeResponseId = null
    this.responseGenerationDone = false
    this.callbacks.onResponseSettled?.()
  }

  private signalCharacterExit(at: number): void {
    if (this.characterExitSignalled) return
    this.characterExitSignalled = true
    this.callbacks.onCharacterExit?.(at)
  }

  /** Seals anything still open, so a rep ending mid-sentence still scores. */
  flush(at: number): TranscriptTurn[] {
    const sealed: TranscriptTurn[] = []
    const user = this.userTurns.commit(null, at)
    if (user) sealed.push(user)
    this.agentTurns.closeAt(at)
    const agent = this.agentTurns.commit(this.finalAgentTranscript, at)
    if (agent) sealed.push(agent)
    this.finalAgentTranscript = null
    return sealed
  }
}
