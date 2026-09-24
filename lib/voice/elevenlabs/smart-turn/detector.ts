/**
 * Smart Turn, as the live rep sees it: a probability, or null.
 *
 * ── THE ONE PROMISE ─────────────────────────────────────────────────────
 *
 * Nothing in here can hurt a rep. `warm()` and `probability()` never reject,
 * never throw, and never wait on the model download; the constructor touches
 * nothing. Every failure — no Worker support, the model or ONNX Runtime not
 * loading, an inference erroring, one taking longer than `inferenceTimeoutMs`
 * — turns the detector off for the life of the page, and from then on every
 * answer is null. Null is today's product exactly: `EndOfTurnGate` with no
 * answer concedes at the user's calibrated silence, frame for frame
 * (`gate.test.ts`). A rep on a phone that cannot run the model is the rep that
 * phone already has.
 *
 * Off FOREVER, rather than retried, because a model that failed once in a
 * rep will fail again in the next pause, and a retry costs a download or a
 * stall exactly when he is waiting for her. A timeout is treated the same:
 * an answer that takes two seconds arrives after the longest the rule would
 * ever wait (`EXTENSION_CEILING_MS`), so a device that slow gets nothing from
 * the model except a warm battery.
 *
 * ── WHEN TO CALL WHAT ───────────────────────────────────────────────────
 *
 * `warm()` as early as there is a rep to warm for — the 3·2·1 countdown, or
 * the brief. It downloads the model (8.7 MB, then the HTTP cache) and ONNX
 * Runtime's WebAssembly (14 MB, ~3.5 MB compressed, then the cache), compiles
 * it, and runs one throwaway inference so the first real answer is not the
 * slow one. `probability()` before that finishes returns null at once rather
 * than queueing behind a download: a pause that happens while the model is
 * still arriving is simply decided the way it is decided today.
 *
 * One request is in the worker at a time. If a second pause is probed while
 * the first is still being answered, the newer one waits and any older waiter
 * is answered null: only the latest pause can still be conceded, and a queue
 * of stale answers on a slow phone would only delay the one that matters.
 *
 * The detector is per PAGE, not per rep (`sharedSmartTurnDetector`): the
 * compiled module and the session survive from one rep to the next, and the
 * second rep in a sitting starts with the model already warm.
 */

import type { WorkerRequest, WorkerResponse } from './protocol'
import { usableProbability } from './policy'

export const DEFAULT_MODEL_URL = '/models/smart-turn-v3.2-cpu.onnx'

/**
 * Longest one answer may take before the detector gives up for good.
 *
 * ~305 ms on an M4 in Chrome; a slow phone might take four times that. Two seconds is
 * far past anything useful — the rule's own ceiling is 1.2 s of silence — and
 * only ever reached by something that is broken, not merely slow.
 */
export const INFERENCE_TIMEOUT_MS = 2_000

export type SmartTurnStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface SmartTurnTiming {
  /** Log-mel extraction, in the worker. */
  featureMs: number
  /** ONNX Runtime, in the worker. */
  inferenceMs: number
  /** Page → worker → page, everything included. */
  roundTripMs: number
}

/** The part of `Worker` the detector uses, so tests can stand one in. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null
  onerror: ((event: unknown) => void) | null
  onmessageerror?: ((event: unknown) => void) | null
}

export interface SmartTurnDetectorOptions {
  /** Same-origin path to the model. */
  modelUrl?: string
  /** Override where ONNX Runtime fetches its `.wasm`; unset, the bundled asset. */
  wasmPaths?: string
  inferenceTimeoutMs?: number
  /** Stand-in for the real worker, for tests. */
  createWorker?: () => WorkerLike
}

interface Pending {
  id: number
  resolve: (probability: number | null) => void
  timer: ReturnType<typeof setTimeout>
  sentAt: number
}

interface Waiting {
  samples: Float32Array
  resolve: (probability: number | null) => void
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/**
 * The real worker.
 *
 * The `typeof window` test is load-bearing for the SERVER, not the browser.
 * Every client component is also compiled for server rendering, and webpack
 * follows `new Worker(new URL(...))` wherever it can see one: the first build
 * with this file in a page traced the worker, ONNX Runtime and its 14 MB
 * `.wasm` into EVERY serverless function — `/api/grade` included — where none
 * of it can ever run. Next's SWC pass rewrites `typeof window` to the literal
 * `'undefined'` in the server compilation, so this condition is a constant
 * `false` there, webpack never walks the branch, and the server build does not
 * know the worker exists. In the browser it is `'object'` and the branch is
 * compiled as written.
 *
 * The `new Worker(new URL(...), ...)` is written out in full, in one
 * expression, because that is the shape webpack looks for to emit the worker
 * as its own chunk.
 */
function createDefaultWorker(): WorkerLike {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'smart-turn' }) as unknown as WorkerLike
  }
  throw new Error('no Web Worker support')
}

function absolute(url: string): string {
  try {
    return typeof location !== 'undefined' ? new URL(url, location.href).href : url
  } catch {
    return url
  }
}

export class SmartTurnDetector {
  private readonly modelUrl: string
  private readonly wasmPaths: string | undefined
  private readonly timeoutMs: number
  private readonly createWorker: () => WorkerLike

  private state: SmartTurnStatus = 'idle'
  private reason: string | null = null
  private worker: WorkerLike | null = null
  private warming: Promise<boolean> | null = null
  private settleWarm: ((ready: boolean) => void) | null = null
  private nextId = 0
  private inFlight: Pending | null = null
  private waiting: Waiting | null = null
  private timing: SmartTurnTiming | null = null
  private loadTiming: { loadMs: number; warmupMs: number } | null = null

  constructor(options: SmartTurnDetectorOptions = {}) {
    this.modelUrl = options.modelUrl ?? DEFAULT_MODEL_URL
    this.wasmPaths = options.wasmPaths
    this.timeoutMs = options.inferenceTimeoutMs ?? INFERENCE_TIMEOUT_MS
    this.createWorker = options.createWorker ?? createDefaultWorker
  }

  get status(): SmartTurnStatus {
    return this.state
  }

  /** Why the detector turned itself off, for telemetry. Null while it has not. */
  get failure(): string | null {
    return this.reason
  }

  /** The most recent answer's timings, for telemetry. */
  get lastTiming(): SmartTurnTiming | null {
    return this.timing
  }

  /** How long the load and the warm-up inference took, once ready. */
  get loaded(): { loadMs: number; warmupMs: number } | null {
    return this.loadTiming
  }

  /**
   * Start loading, if nothing has. Resolves true once an answer can be had,
   * false if it never will. Idempotent; safe to call from anywhere; never
   * rejects. Nothing needs to await it.
   */
  warm(): Promise<boolean> {
    if (this.state === 'ready') return Promise.resolve(true)
    if (this.state === 'failed') return Promise.resolve(false)
    if (this.warming) return this.warming

    this.state = 'loading'
    this.warming = new Promise<boolean>((resolve) => {
      this.settleWarm = resolve
    })
    try {
      const worker = this.createWorker()
      this.worker = worker
      worker.onmessage = (event) => this.onMessage(event.data)
      worker.onerror = () => this.fail('the worker failed')
      worker.onmessageerror = () => this.fail('a worker message could not be read')
      const request: WorkerRequest = { type: 'load', modelUrl: absolute(this.modelUrl) }
      if (this.wasmPaths) request.wasmPaths = this.wasmPaths
      worker.postMessage(request)
    } catch (cause) {
      this.fail(cause instanceof Error ? cause.message : 'the worker could not start')
    }
    return this.warming
  }

  /**
   * P(his turn is complete) for 16 kHz mono audio of his turn (the last 8 s
   * are read), or null. Never rejects. Returns null at once while the model
   * is still loading — and starts the load, if nobody has.
   *
   * The samples are copied, never transferred, so the caller's array is
   * untouched.
   */
  probability(samples16k: Float32Array): Promise<number | null> {
    if (this.state === 'idle') {
      void this.warm()
      return Promise.resolve(null)
    }
    if (this.state !== 'ready') return Promise.resolve(null)

    return new Promise<number | null>((resolve) => {
      try {
        const samples = samples16k.slice()
        if (this.inFlight) {
          this.waiting?.resolve(null)
          this.waiting = { samples, resolve }
          return
        }
        this.send(samples, resolve)
      } catch (cause) {
        resolve(null)
        this.fail(cause instanceof Error ? cause.message : 'the request could not be sent')
      }
    })
  }

  /** Stop the worker and answer anything outstanding with null. Final. */
  dispose(): void {
    this.fail('disposed')
  }

  private send(samples: Float32Array, resolve: (probability: number | null) => void): void {
    const worker = this.worker
    if (!worker || this.state !== 'ready') {
      resolve(null)
      return
    }
    this.nextId += 1
    const id = this.nextId
    const timer = setTimeout(() => this.fail(`no answer within ${this.timeoutMs} ms`), this.timeoutMs)
    this.inFlight = { id, resolve, timer, sentAt: now() }
    worker.postMessage({ type: 'infer', id, samples }, [samples.buffer])
  }

  private onMessage(message: WorkerResponse): void {
    try {
      switch (message.type) {
        case 'ready':
          if (this.state !== 'loading') return
          this.state = 'ready'
          this.loadTiming = { loadMs: message.loadMs, warmupMs: message.warmupMs }
          this.settleWarm?.(true)
          this.settleWarm = null
          return
        case 'load-failed':
          this.fail(`the model did not load: ${message.message}`)
          return
        case 'infer-failed':
          this.fail(`an inference failed: ${message.message}`)
          return
        case 'result': {
          const pending = this.inFlight
          if (!pending || pending.id !== message.id) return
          clearTimeout(pending.timer)
          this.inFlight = null
          this.timing = {
            featureMs: message.featureMs,
            inferenceMs: message.inferenceMs,
            roundTripMs: now() - pending.sentAt,
          }
          pending.resolve(usableProbability(message.probability))
          const next = this.waiting
          this.waiting = null
          if (next) this.send(next.samples, next.resolve)
          return
        }
      }
    } catch (cause) {
      this.fail(cause instanceof Error ? cause.message : 'a worker message could not be handled')
    }
  }

  private fail(reason: string): void {
    if (this.state === 'failed') return
    this.state = 'failed'
    this.reason = reason
    this.settleWarm?.(false)
    this.settleWarm = null
    const pending = this.inFlight
    this.inFlight = null
    if (pending) {
      clearTimeout(pending.timer)
      pending.resolve(null)
    }
    this.waiting?.resolve(null)
    this.waiting = null
    const worker = this.worker
    this.worker = null
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      try {
        worker.terminate()
      } catch {
        /* Already gone. */
      }
    }
  }
}

let shared: SmartTurnDetector | null = null

/**
 * The page's detector. One model load per page, however many reps are
 * started in it. Created on first call, so importing this module costs
 * nothing.
 */
export function sharedSmartTurnDetector(): SmartTurnDetector {
  shared ??= new SmartTurnDetector()
  return shared
}
