/**
 * What the page and the Smart Turn worker say to each other, and the
 * worker's side of the conversation as a plain function.
 *
 * ── WHY A WORKER AT ALL ─────────────────────────────────────────────────
 *
 * One answer is ~5 ms of log-mel and ~305 ms of single-threaded WebAssembly
 * on an Apple M4 in Chrome, and several times that on a phone. On the page's thread
 * that is a frozen UI and — worse — a stalled audio schedule for her next
 * line, exactly at the moment he stops talking. In a worker it costs the page
 * one 0.5 MB copy. ONNX Runtime's own `env.wasm.proxy` would move the
 * inference but not the features, and its proxy has to re-load ORT's script
 * by URL, which is the one thing a bundler hides; a worker of our own that
 * imports ORT like any other module has neither problem.
 *
 * The handler is here rather than in `worker.ts` so it can be tested in Node
 * with a stand-in engine: `worker.ts` is only the three lines that bind it to
 * `self`.
 */

import type { Inference } from './engine'
import { WINDOW_SAMPLES } from './features'

export type WorkerRequest =
  | { type: 'load'; modelUrl: string; wasmPaths?: string }
  | { type: 'infer'; id: number; samples: Float32Array }

export type WorkerResponse =
  | { type: 'ready'; loadMs: number; warmupMs: number }
  | { type: 'load-failed'; message: string }
  | ({ type: 'result'; id: number } & Inference)
  | { type: 'infer-failed'; id: number; message: string }

/** The slice of `SmartTurnEngine` the worker uses. */
export interface EngineLike {
  load(): Promise<void>
  infer(samples: Float32Array): Promise<Inference>
}

export interface EngineConfig {
  modelUrl: string
  wasmPaths?: string
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function reason(cause: unknown): string {
  if (cause instanceof Error) return cause.message || cause.name
  return typeof cause === 'string' ? cause : 'unknown failure'
}

/**
 * The worker's message handler.
 *
 * Loading ends with one inference on 8 s of silence. The first run through a
 * freshly compiled WebAssembly module is several times slower than the rest,
 * and it should be paid during the countdown, not in the first pause of the
 * rep. Requests are served one at a time in arrival order; the page never
 * sends a second before the first is answered (`detector.ts`), so this is a
 * guarantee, not a queue.
 */
export function createWorkerHandler(
  makeEngine: (config: EngineConfig) => EngineLike,
  post: (message: WorkerResponse) => void,
): (request: WorkerRequest) => Promise<void> {
  let engine: EngineLike | null = null
  let chain: Promise<void> = Promise.resolve()

  const handle = async (request: WorkerRequest): Promise<void> => {
    if (request.type === 'load') {
      if (engine) {
        post({ type: 'ready', loadMs: 0, warmupMs: 0 })
        return
      }
      const started = now()
      try {
        const candidate = makeEngine({ modelUrl: request.modelUrl, wasmPaths: request.wasmPaths })
        await candidate.load()
        const loaded = now()
        await candidate.infer(new Float32Array(WINDOW_SAMPLES))
        engine = candidate
        post({ type: 'ready', loadMs: loaded - started, warmupMs: now() - loaded })
      } catch (cause) {
        post({ type: 'load-failed', message: reason(cause) })
      }
      return
    }

    if (!engine) {
      post({ type: 'infer-failed', id: request.id, message: 'model is not loaded' })
      return
    }
    try {
      const result = await engine.infer(request.samples)
      post({ type: 'result', id: request.id, ...result })
    } catch (cause) {
      post({ type: 'infer-failed', id: request.id, message: reason(cause) })
    }
  }

  return (request) => {
    chain = chain.then(() => handle(request))
    return chain
  }
}
