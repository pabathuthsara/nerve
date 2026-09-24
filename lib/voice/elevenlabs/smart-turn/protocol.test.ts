import { describe, expect, it } from 'vitest'
import type { Inference } from './engine'
import { createWorkerHandler, type EngineLike, type WorkerResponse } from './protocol'

function harness(engine: Partial<EngineLike> = {}) {
  const posted: WorkerResponse[] = []
  const calls: Float32Array[] = []
  let made = 0
  const full: EngineLike = {
    load: engine.load ?? (async () => undefined),
    infer:
      engine.infer ??
      (async (samples: Float32Array): Promise<Inference> => {
        calls.push(samples)
        return { probability: 0.75, featureMs: 2, inferenceMs: 100 }
      }),
  }
  const handle = createWorkerHandler(
    () => {
      made += 1
      return full
    },
    (message) => posted.push(message),
  )
  return { handle, posted, calls, made: () => made }
}

describe('the worker’s message handler', () => {
  it('loads, runs one warm-up inference on 8 s of silence, then says ready', async () => {
    const h = harness()
    await h.handle({ type: 'load', modelUrl: 'https://example.test/m.onnx' })
    expect(h.posted).toEqual([{ type: 'ready', loadMs: expect.any(Number), warmupMs: expect.any(Number) }])
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]!.length).toBe(128_000)
    expect(h.calls[0]!.every((v) => v === 0)).toBe(true)
  })

  it('a second load after a good one is answered ready without loading again', async () => {
    const h = harness()
    await h.handle({ type: 'load', modelUrl: '/m.onnx' })
    await h.handle({ type: 'load', modelUrl: '/m.onnx' })
    expect(h.made()).toBe(1)
    expect(h.posted.map((m) => m.type)).toEqual(['ready', 'ready'])
  })

  it('reports a load that throws, with the reason', async () => {
    const h = harness({
      load: async () => {
        throw new Error('model fetch failed: 404')
      },
    })
    await h.handle({ type: 'load', modelUrl: '/m.onnx' })
    expect(h.posted).toEqual([{ type: 'load-failed', message: 'model fetch failed: 404' }])
  })

  it('a warm-up inference that fails is a failed load, not a ready one', async () => {
    const h = harness({
      infer: async () => {
        throw new Error('bad kernel')
      },
    })
    await h.handle({ type: 'load', modelUrl: '/m.onnx' })
    expect(h.posted).toEqual([{ type: 'load-failed', message: 'bad kernel' }])
    await h.handle({ type: 'infer', id: 1, samples: new Float32Array(4) })
    expect(h.posted[1]).toEqual({ type: 'infer-failed', id: 1, message: 'model is not loaded' })
  })

  it('refuses to infer before a load', async () => {
    const h = harness()
    await h.handle({ type: 'infer', id: 7, samples: new Float32Array(4) })
    expect(h.posted).toEqual([{ type: 'infer-failed', id: 7, message: 'model is not loaded' }])
  })

  it('answers an inference with its id, probability and timings', async () => {
    const h = harness()
    await h.handle({ type: 'load', modelUrl: '/m.onnx' })
    await h.handle({ type: 'infer', id: 3, samples: new Float32Array(16) })
    expect(h.posted[1]).toEqual({ type: 'result', id: 3, probability: 0.75, featureMs: 2, inferenceMs: 100 })
  })

  it('answers requests in the order they arrived, even when an earlier one is slower', async () => {
    let first = true
    const h = harness({
      infer: async (samples) => {
        if (samples.length === 128_000) return { probability: 0, featureMs: 0, inferenceMs: 0 }
        if (first) {
          first = false
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        return { probability: samples[0]!, featureMs: 0, inferenceMs: 0 }
      },
    })
    await h.handle({ type: 'load', modelUrl: '/m.onnx' })
    const a = h.handle({ type: 'infer', id: 1, samples: Float32Array.from([0.1]) })
    const b = h.handle({ type: 'infer', id: 2, samples: Float32Array.from([0.2]) })
    await Promise.all([a, b])
    expect(h.posted.slice(1).map((m) => (m.type === 'result' ? m.id : -1))).toEqual([1, 2])
  })
})
