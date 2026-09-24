/**
 * Smart Turn v3.2, loaded and run: samples in, P(turn complete) out.
 *
 * This is the part that THROWS. It is used in exactly two places — inside the
 * detector's Web Worker (`worker.ts`), and directly by the Node end-to-end
 * check (`scripts/smart-turn-check.ts`) — and neither is the live rep. The
 * live rep only ever talks to `SmartTurnDetector`, which turns every failure
 * in here into `null` and today's fixed silence.
 *
 * ── HOW ONNX RUNTIME IS REACHED ──────────────────────────────────────────
 *
 * `onnxruntime-web/wasm`, by DYNAMIC import, so no server bundle and no page
 * that never starts a rep ever parses it. The `/wasm` entry is the CPU-only
 * build. WebGPU would need the 32 MB fp32 export and a browser that has it;
 * WebGL does not run this graph's quantised operators at all. The int8 file
 * is the CPU variant, and on a CPU it is what upstream ships.
 *
 * Its `.wasm` binary is resolved by the package itself as
 * `new URL('ort-wasm-simd-threaded.wasm', import.meta.url)`, which webpack
 * recognises as an asset: `next build` copies the binary into
 * `/_next/static/media/` under a content hash and rewrites the URL. That is
 * self-hosting with no copy step, no CDN and no version to keep in step by
 * hand — the binary and the JavaScript that loads it come from the same
 * installed package, and a mismatch between the two is ONNX Runtime's one
 * truly fatal misconfiguration. `wasmPaths` exists only as an override.
 *
 * One thread, no proxy. We are already off the main thread (the worker), and
 * ORT's threaded mode needs `crossOriginIsolated` — COOP/COEP headers on the
 * rep's pages, which constrain every cross-origin resource those pages load.
 * It is worth knowing what that would buy: 305 ms → 119 ms per answer in
 * Chrome on an M4 with four threads (`policy.ts` has the table). It is not
 * switched on here because ORT's threads are Emscripten pthreads, spawned as
 * nested workers from a script URL that the bundler rewrites, and that has
 * not been proven to survive `next build`. Prove it, add the headers, then
 * raise `numThreads`.
 */

import type { InferenceSession } from 'onnxruntime-web'
import { FEATURE_DIMS, FEATURE_LENGTH, LogMelExtractor } from './features'

/** The ONNX graph's input, as exported upstream. */
const INPUT_NAME = 'input_features'

export interface SmartTurnEngineOptions {
  /** Fetched when `modelBytes` is not given (`DEFAULT_MODEL_URL` in `detector.ts`). */
  modelUrl?: string
  /** The model itself, for hosts with a filesystem (the Node check). */
  modelBytes?: Uint8Array
  /** ORT's wasm binary, for hosts where it cannot fetch one (Node). */
  wasmBinary?: Uint8Array
  /** Override where ORT fetches its wasm. Unset: the bundler-emitted asset. */
  wasmPaths?: string
  fetchImpl?: typeof fetch
}

export interface Inference {
  /** P(turn complete), 0–1. */
  probability: number
  /** Log-mel extraction time. */
  featureMs: number
  /** ONNX Runtime time. */
  inferenceMs: number
}

type OrtModule = typeof import('onnxruntime-web')

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class SmartTurnEngine {
  private readonly options: SmartTurnEngineOptions
  private readonly extractor = new LogMelExtractor()
  private readonly features = new Float32Array(FEATURE_LENGTH)
  private ort: OrtModule | null = null
  private session: InferenceSession | null = null
  private loading: Promise<void> | null = null

  constructor(options: SmartTurnEngineOptions = {}) {
    this.options = options
  }

  get loaded(): boolean {
    return this.session !== null
  }

  /** Idempotent. Rejects on any failure; a failed load may be retried by calling again. */
  load(): Promise<void> {
    if (this.session) return Promise.resolve()
    if (!this.loading) {
      this.loading = this.open().catch((cause: unknown) => {
        this.loading = null
        throw cause
      })
    }
    return this.loading
  }

  /**
   * P(turn complete) for 16 kHz mono samples of any length (the last 8 s are
   * read). Loads first if needed. Throws on any failure.
   */
  async infer(samples: Float32Array): Promise<Inference> {
    await this.load()
    const ort = this.ort
    const session = this.session
    if (!ort || !session) throw new Error('Smart Turn session is not open')

    const started = now()
    this.extractor.extract(samples, this.features)
    const extracted = now()

    const input = new ort.Tensor('float32', this.features, [...FEATURE_DIMS])
    const outputs = await session.run({ [INPUT_NAME]: input })
    const finished = now()

    const name = session.outputNames[0]
    const tensor = name === undefined ? undefined : outputs[name]
    const value = tensor ? Number((tensor.data as ArrayLike<number>)[0]) : Number.NaN
    if (!Number.isFinite(value)) throw new Error('Smart Turn returned no probability')
    return {
      probability: Math.min(1, Math.max(0, value)),
      featureMs: extracted - started,
      inferenceMs: finished - extracted,
    }
  }

  async dispose(): Promise<void> {
    const session = this.session
    this.session = null
    this.loading = null
    if (session) await session.release().catch(() => undefined)
  }

  private async open(): Promise<void> {
    const ort: OrtModule = await import('onnxruntime-web/wasm')
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    if (this.options.wasmBinary) ort.env.wasm.wasmBinary = this.options.wasmBinary
    else if (this.options.wasmPaths) ort.env.wasm.wasmPaths = this.options.wasmPaths

    const model = this.options.modelBytes ?? (await this.fetchModel())
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    if (!session.inputNames.includes(INPUT_NAME)) {
      await session.release().catch(() => undefined)
      throw new Error(`Smart Turn model has no "${INPUT_NAME}" input`)
    }
    this.ort = ort
    this.session = session
  }

  private async fetchModel(): Promise<Uint8Array> {
    const url = this.options.modelUrl
    if (!url) throw new Error('Smart Turn needs a modelUrl or modelBytes')
    // Called as `fetch(url)`, never through a detached reference: a bare
    // `fetch` lifted off the global has thrown "Illegal invocation" in some
    // engines.
    const response = await (this.options.fetchImpl ? this.options.fetchImpl(url) : fetch(url))
    if (!response.ok) throw new Error(`Smart Turn model fetch failed: ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }
}
