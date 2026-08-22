/** OpenAI Realtime events -> Nerve domain events. */

import type { VoiceEmitter } from '../emitter'
import { TurnAssembler } from '../transcript'
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
}

export interface OpenAIEventTranslatorCallbacks {
  /** A second response appeared while the first was generating/playing. */
  onOverlap?: (responseId: string | null) => void
  onUsage?: (usage: UsageSample) => void
  /** Server VAD committed a user turn; the client may now create a response. */
  onUserTurnCommitted?: () => void
  /** The active response has finished generation and playback. */
  onResponseSettled?: () => void
  /** The model called the explicit terminal scene action. */
  onCharacterExit?: (at: number) => void
  /** The model printed tool syntax instead of making a structured call. */
  onToolSyntaxLeak?: (at: number) => void
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

  constructor(
    private readonly emitter: VoiceEmitter,
    private readonly now: () => number,
    private readonly onTurn: (turn: TranscriptTurn) => void,
    private readonly callbacks: OpenAIEventTranslatorCallbacks = {},
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
        this.activeResponseId = eventResponseId ?? this.activeResponseId ?? 'unknown'
        this.responseGenerationDone = false
        this.playbackFinishedForResponse = false
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
        if (!this.speaking && this.playbackEndAt === null) this.clearActiveResponse()
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
        this.userTurns.openAt(at)
        this.emitter.emit('user.speech.start', { at })
        break
      }

      case 'input_audio_buffer.speech_stopped': {
        this.userTurns.closeAt(at)
        this.emitter.emit('user.speech.stop', { at })
        break
      }

      case 'input_audio_buffer.committed': {
        this.callbacks.onUserTurnCommitted?.()
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
        if (turn) this.commitTurn(turn, 'user')
        break
      }

      // This is the client playback boundary. response.done and transcript.done
      // only mean generation/transcription completed and must never set t_end.
      case 'output_audio_buffer.started': {
        this.markSpeaking(at)
        break
      }

      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared': {
        this.playbackEndAt = at
        this.playbackFinishedForResponse = true
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
        // Compatibility fallback only; WebRTC normally supplies the real
        // playback-start event above.
        this.markSpeaking(at)
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

  private markSpeaking(at: number): void {
    if (this.speaking) return
    this.speaking = true
    this.playbackEndAt = null
    this.agentTurns.openAt(at)
    this.emitter.emit('agent.speech.start', { at })
  }

  private sealAgentTurn(): void {
    if (this.playbackEndAt === null || this.finalAgentTranscript === null) return
    const turn = this.agentTurns.commit(this.finalAgentTranscript, this.playbackEndAt)
    this.finalAgentTranscript = null
    this.playbackEndAt = null
    if (!turn) return

    // Local backstop: even if a provider ignores cancellation, never expose two
    // agent turns without user speech between them.
    if (this.committedAgentTurn && !this.userSinceAgent) {
      this.callbacks.onOverlap?.(this.activeResponseId)
      return
    }
    this.committedAgentTurn = true
    this.userSinceAgent = false
    this.commitTurn(turn, 'agent')
  }

  private commitTurn(turn: TranscriptTurn, speaker: 'user' | 'agent'): void {
    this.onTurn(turn)
    if (speaker === 'user') this.emitter.emit('user.transcript', { turn, final: true })
    else this.emitter.emit('agent.transcript', { turn, final: true })
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
