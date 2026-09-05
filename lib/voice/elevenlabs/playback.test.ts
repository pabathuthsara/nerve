import { afterEach, describe, expect, it, vi } from 'vitest'
import { PcmPlayer } from './player'
import { SpokenTurn } from './truncate'

afterEach(() => vi.useRealTimers())

function audioContext() {
  const starts: number[] = []
  const context = {
    currentTime: 10,
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate, getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => ({ connect() {}, disconnect() {}, stop() {}, start(at: number) { starts.push(at) } }),
  }
  return { context, starts }
}

describe('first audio scheduling', () => {
  it('waits only the remaining personality beat and then schedules contiguous audio', () => {
    vi.useFakeTimers()
    const { context, starts } = audioContext()
    const onFirstAudio = vi.fn()
    const player = new PcmPlayer({
      context: context as unknown as AudioContext, destination: {} as AudioNode,
      sampleRate: 24_000, notBefore: 10.1, onFirstAudio,
    })
    player.enqueue(new Float32Array(2400))
    player.enqueue(new Float32Array(2400))
    expect(starts).toEqual([10.1, 10.2])
    expect(player.playedSeconds).toBe(0)
    player.stopNow()
    vi.runAllTimers()
    expect(onFirstAudio).not.toHaveBeenCalled()
  })

  it('starts at the existing 20ms lead when generation already consumed the pause', () => {
    vi.useFakeTimers()
    const { context, starts } = audioContext()
    const player = new PcmPlayer({
      context: context as unknown as AudioContext, destination: {} as AudioNode,
      sampleRate: 24_000, notBefore: 9.5,
    })
    player.enqueue(new Float32Array(2400))
    expect(starts[0]).toBe(10.02)
    player.stopNow()
  })

  it('does not commit the turn before a delayed first chunk has finished playing', async () => {
    vi.useFakeTimers()
    const { context } = audioContext()
    const player = new PcmPlayer({
      context: context as unknown as AudioContext, destination: {} as AudioNode,
      sampleRate: 24_000, notBefore: 10.2,
    })
    player.enqueue(new Float32Array(2400))
    let drained = false
    const waiting = player.waitForDrain().then(() => { drained = true })
    context.currentTime = 10.13
    await vi.advanceTimersByTimeAsync(130)
    expect(drained).toBe(false)
    context.currentTime = 10.31
    await vi.advanceTimersByTimeAsync(200)
    await waiting
    expect(drained).toBe(true)
    player.stopNow()
  })

  it('releases a pending drain immediately on barge-in', async () => {
    vi.useFakeTimers()
    const { context } = audioContext()
    const player = new PcmPlayer({
      context: context as unknown as AudioContext, destination: {} as AudioNode,
      sampleRate: 24_000, notBefore: 10.2,
    })
    player.enqueue(new Float32Array(24_000))
    const waiting = player.waitForDrain()
    player.stopNow()
    await expect(waiting).resolves.toBeUndefined()
  })
})

function aligned(text: string, seconds: number) {
  return {
    characters: [...text],
    characterStartTimesSeconds: [...text].map((_, i) => seconds * i / text.length),
    characterEndTimesSeconds: [...text].map((_, i) => seconds * (i + 1) / text.length),
  }
}

describe('mixed synthesis transcript ordering', () => {
  it('keeps a raw clip before a later aligned clip', () => {
    const turn = new SpokenTurn()
    turn.appendUnaligned('First sentence.', 1)
    turn.appendAligned(aligned(' Second sentence.', 1))
    expect(turn.fullText).toBe('First sentence. Second sentence.')
    expect(turn.playedText(0.5)).not.toContain('Second')
    expect(turn.playedText(1)).toBe('First sentence.')
    expect(turn.playedText(2)).toBe(turn.fullText)
  })

  it('extends a raw clip with audio-only chunks without remembering its whole text early', () => {
    const turn = new SpokenTurn()
    turn.appendUnaligned('Only half should play.', 1)
    turn.appendUnaligned('', 1)
    expect(turn.fullText).toBe('Only half should play.')
    expect(turn.playedText(1)).toBe('Only half')
  })

  it('uses PCM duration for the next clip even when spoken characters end early', () => {
    const turn = new SpokenTurn()
    turn.appendAligned(aligned('Hello.', 0.5), 1)
    turn.appendAligned(aligned(' Next.', 0.5), 1)
    expect(turn.audioSeconds).toBe(2)
    expect(turn.playedText(0.9)).toBe('Hello.')
    expect(turn.playedText(1)).toBe('Hello.')
    expect(turn.playedText(2)).toBe('Hello. Next.')
  })
})
