import { describe, expect, it, vi } from 'vitest'
import { completeRep } from './rep-completion'

describe('rep completion', () => {
  it('starts grading without waiting for an audio upload', async () => {
    let release!: () => void
    const upload = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const grade = vi.fn(async () => undefined)
    const done = completeRep({ save: async () => undefined, upload, grade })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(grade).toHaveBeenCalledOnce()
    release()
    await done
  })
  it('still grades when the audio archive or best-effort persistence fails', async () => {
    const grade = vi.fn(async () => undefined)
    await completeRep({ save: async () => { throw new Error('database') }, upload: async () => { throw new Error('storage') }, grade })
    expect(grade).toHaveBeenCalledOnce()
  })
})
