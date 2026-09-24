import { afterEach, describe, expect, it, vi } from 'vitest'
import { SmartTurnDetector, type WorkerLike } from './detector'
import type { Inference } from './engine'
import { createWorkerHandler, type EngineLike, type WorkerRequest, type WorkerResponse } from './protocol'

/*
 * The detector against the real worker-side handler, with a stand-in engine
 * where ONNX Runtime would be. Messages cross on the microtask queue in both
 * directions, as they cross threads in a browser: never synchronously.
 */

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

/** An engine whose answer is the last sample it was given, unless told otherwise. */
class FakeEngine implements EngineLike {
  loads = 0
  inferred: Float32Array[] = []
  loadResult: Promise<void> = Promise.resolve()
  gate: (() => Promise<void>) | null = null
  failInfer = false

  load(): Promise<void> {
    this.loads += 1
    return this.loadResult
  }

  async infer(samples: Float32Array): Promise<Inference> {
    this.inferred.push(samples)
    if (this.gate) await this.gate()
    if (this.failInfer) throw new Error('kernel exploded')
    return { probability: samples[samples.length - 1] ?? 0, featureMs: 3, inferenceMs: 150 }
  }
}

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessageerror: ((event: unknown) => void) | null = null
  terminated = false
  posted: WorkerRequest[] = []
  transfers: Transferable[][] = []
  private readonly handle: (request: WorkerRequest) => Promise<void>

  constructor(readonly engine: FakeEngine) {
    this.handle = createWorkerHandler(
      () => engine,
      (message) => {
        queueMicrotask(() => {
          if (!this.terminated) this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>)
        })
      },
    )
  }

  postMessage(message: WorkerRequest, transfer: Transferable[] = []): void {
    if (this.terminated) throw new Error('posted to a terminated worker')
    this.posted.push(message)
    this.transfers.push(transfer)
    queueMicrotask(() => void this.handle(message))
  }

  terminate(): void {
    this.terminated = true
  }

  crash(): void {
    this.onerror?.(new Event('error'))
  }
}

function setup(engine = new FakeEngine(), options: { inferenceTimeoutMs?: number } = {}) {
  const workers: FakeWorker[] = []
  const detector = new SmartTurnDetector({
    ...options,
    createWorker: () => {
      const worker = new FakeWorker(engine)
      workers.push(worker)
      return worker
    },
  })
  return { detector, engine, workers }
}

const audio = (last: number) => Float32Array.from([0.1, 0.2, last])

afterEach(() => {
  vi.useRealTimers()
})

describe('SmartTurnDetector — loading', () => {
  it('does nothing until asked: the constructor starts no worker', () => {
    const { detector, workers } = setup()
    expect(detector.status).toBe('idle')
    expect(workers).toHaveLength(0)
  })

  it('warm() loads once, warms up on 8 s of silence, and resolves true', async () => {
    const { detector, engine, workers } = setup()
    const first = detector.warm()
    const second = detector.warm()
    expect(detector.status).toBe('loading')
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(await detector.warm()).toBe(true)
    expect(workers).toHaveLength(1)
    expect(engine.loads).toBe(1)
    expect(engine.inferred).toHaveLength(1)
    expect(engine.inferred[0]!.length).toBe(128_000)
    expect(detector.status).toBe('ready')
    expect(detector.loaded).not.toBeNull()
  })

  it('sends the model as an absolute URL when there is a page to resolve it against', async () => {
    const { detector, workers } = setup()
    await detector.warm()
    expect(workers[0]!.posted[0]).toMatchObject({ type: 'load', modelUrl: '/models/smart-turn-v3.2-cpu.onnx' })
  })

  it('probability() before warm() answers null at once, and starts the load', async () => {
    const { detector, workers } = setup()
    expect(await detector.probability(audio(0.9))).toBeNull()
    expect(workers).toHaveLength(1)
    expect(detector.status).toBe('loading')
  })

  it('probability() while the model is still arriving answers null rather than waiting for it', async () => {
    const engine = new FakeEngine()
    const load = deferred<void>()
    engine.loadResult = load.promise
    const { detector } = setup(engine)
    void detector.warm()
    await flush()
    expect(await detector.probability(audio(0.9))).toBeNull()
    load.resolve()
    await flush()
    expect(detector.status).toBe('ready')
    expect(await detector.probability(audio(0.9))).toBeCloseTo(0.9, 6)
  })
})

describe('SmartTurnDetector — answering', () => {
  it('returns the model’s probability and records how long it took', async () => {
    const { detector } = setup()
    await detector.warm()
    expect(await detector.probability(audio(0.83))).toBeCloseTo(0.83, 6)
    expect(detector.lastTiming).toMatchObject({ featureMs: 3, inferenceMs: 150 })
    expect(detector.lastTiming!.roundTripMs).toBeGreaterThanOrEqual(0)
  })

  it('copies the audio rather than transferring the caller’s array out from under it', async () => {
    const { detector, workers } = setup()
    await detector.warm()
    const mine = audio(0.5)
    await detector.probability(mine)
    expect(mine.length).toBe(3)
    expect(mine.buffer.byteLength).toBeGreaterThan(0)
    // …while still transferring its own copy, so the page pays one copy, not two.
    expect(workers[0]!.transfers.at(-1)).toHaveLength(1)
  })

  it('reads an out-of-range answer as no answer', async () => {
    const { detector } = setup()
    await detector.warm()
    expect(await detector.probability(audio(1.7))).toBeNull()
    expect(detector.status).toBe('ready')
  })

  it('keeps one request in the worker: a newer pause replaces an older waiter, which gets null', async () => {
    const engine = new FakeEngine()
    const { detector, workers } = setup(engine)
    await detector.warm()
    const release = deferred<void>()
    engine.gate = () => release.promise
    const first = detector.probability(audio(0.1))
    const second = detector.probability(audio(0.2))
    const third = detector.probability(audio(0.3))
    expect(await second).toBeNull()
    engine.gate = null
    release.resolve()
    expect(await first).toBeCloseTo(0.1, 6)
    expect(await third).toBeCloseTo(0.3, 6)
    const infers = workers[0]!.posted.filter((m) => m.type === 'infer')
    expect(infers).toHaveLength(2)
  })
})

describe('SmartTurnDetector — failing soft, and for good', () => {
  it('a model that will not load: warm() resolves false, every answer is null, the worker is stopped', async () => {
    const engine = new FakeEngine()
    engine.loadResult = Promise.reject(new Error('404'))
    const { detector, workers } = setup(engine)
    expect(await detector.warm()).toBe(false)
    expect(detector.status).toBe('failed')
    expect(detector.failure).toMatch(/404/)
    expect(workers[0]!.terminated).toBe(true)
    expect(await detector.probability(audio(0.9))).toBeNull()
    expect(await detector.warm()).toBe(false)
    expect(workers).toHaveLength(1) // no retry
  })

  it('an inference that throws: that answer is null, and so is every one after it', async () => {
    const engine = new FakeEngine()
    const { detector, workers } = setup(engine)
    await detector.warm()
    engine.failInfer = true
    expect(await detector.probability(audio(0.9))).toBeNull()
    expect(detector.status).toBe('failed')
    expect(detector.failure).toMatch(/kernel exploded/)
    engine.failInfer = false
    expect(await detector.probability(audio(0.9))).toBeNull()
    expect(workers[0]!.terminated).toBe(true)
  })

  it('a worker that crashes mid-answer: the pending answer is null', async () => {
    const engine = new FakeEngine()
    const { detector, workers } = setup(engine)
    await detector.warm()
    engine.gate = () => new Promise(() => undefined) // never answers
    const pending = detector.probability(audio(0.9))
    await flush()
    workers[0]!.crash()
    expect(await pending).toBeNull()
    expect(detector.status).toBe('failed')
  })

  it('an answer that never comes: null after the timeout, and off for good', async () => {
    vi.useFakeTimers()
    const engine = new FakeEngine()
    const { detector } = setup(engine, { inferenceTimeoutMs: 2_000 })
    const warm = detector.warm()
    await vi.advanceTimersByTimeAsync(0)
    expect(await warm).toBe(true)
    engine.gate = () => new Promise(() => undefined)
    const pending = detector.probability(audio(0.9))
    await vi.advanceTimersByTimeAsync(1_999)
    expect(detector.status).toBe('ready')
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toBeNull()
    expect(detector.status).toBe('failed')
    expect(detector.failure).toMatch(/2000 ms/)
  })

  it('a browser with no Worker: warm() resolves false and nothing throws', async () => {
    const detector = new SmartTurnDetector({
      createWorker: () => {
        throw new Error('no Web Worker support')
      },
    })
    expect(await detector.warm()).toBe(false)
    expect(detector.failure).toBe('no Web Worker support')
    expect(await detector.probability(audio(0.9))).toBeNull()
  })

  it('the default worker in a runtime without one (Node) fails soft the same way', async () => {
    const detector = new SmartTurnDetector()
    expect(await detector.warm()).toBe(false)
    expect(await detector.probability(audio(0.9))).toBeNull()
  })

  it('dispose(): outstanding answers are null, the worker stops, and it stays off', async () => {
    const engine = new FakeEngine()
    const { detector, workers } = setup(engine)
    await detector.warm()
    engine.gate = () => new Promise(() => undefined)
    const pending = detector.probability(audio(0.9))
    await flush()
    detector.dispose()
    expect(await pending).toBeNull()
    expect(workers[0]!.terminated).toBe(true)
    expect(await detector.warm()).toBe(false)
  })

  it('dispose() during the load: warm() resolves false, and a late "ready" changes nothing', async () => {
    const engine = new FakeEngine()
    const load = deferred<void>()
    engine.loadResult = load.promise
    const { detector } = setup(engine)
    const warm = detector.warm()
    await flush()
    detector.dispose()
    load.resolve()
    await flush()
    expect(await warm).toBe(false)
    expect(detector.status).toBe('failed')
  })
})
