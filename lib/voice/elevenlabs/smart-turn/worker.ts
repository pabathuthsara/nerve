/**
 * The Smart Turn Web Worker. Everything it does is `createWorkerHandler`
 * (`protocol.ts`); this file only binds that to the worker's global scope.
 *
 * Created by `SmartTurnDetector` as
 * `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` —
 * the exact expression webpack recognises, so `next build` emits this file
 * (and ONNX Runtime, which it imports dynamically through the engine) as its
 * own chunk that no page loads until a rep asks for it.
 */

import { SmartTurnEngine } from './engine'
import { createWorkerHandler, type WorkerRequest, type WorkerResponse } from './protocol'

// Typed by hand: the `webworker` lib and the `dom` lib the rest of the
// project compiles against declare the same globals and cannot both be on.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse): void
}

const handle = createWorkerHandler(
  (config) => new SmartTurnEngine({ modelUrl: config.modelUrl, wasmPaths: config.wasmPaths }),
  (message) => scope.postMessage(message),
)

scope.onmessage = (event) => {
  void handle(event.data)
}
