import { describe, expect, it } from 'vitest'
import { KIT, MAX_DURATION_SECONDS, durationOf, type SoundName } from './kit'

const names = Object.keys(KIT) as SoundName[]

describe('the sound kit', () => {
  it('keeps every sound under §02’s 400ms', () => {
    // The rule this file exists to keep. A sound that rings on over her first
    // syllable is worse than no sound at all.
    for (const name of names) {
      expect(durationOf(KIT[name]), name).toBeLessThanOrEqual(MAX_DURATION_SECONDS)
    }
  })

  it('is one kit — every pitch is an interval from the same root', () => {
    // 392 Hz and its fifth, octave and minor third. A stray frequency here is
    // how a coherent kit turns into six unrelated beeps over three releases.
    const allowed = [392 * 0.5, 392 * 0.84, 392, 392 * 1.5, 392 * 2]
    for (const name of names) {
      for (const partial of KIT[name].partials) {
        expect(allowed.some((hz) => Math.abs(hz - partial.frequency) < 0.5), `${name} @ ${partial.frequency}Hz`).toBe(true)
      }
    }
  })

  it('never lets a sound reach a level that talks over her', () => {
    for (const name of names) {
      const peak = KIT[name].partials.reduce((sum, partial) => sum + partial.gain, 0)
      expect(peak, name).toBeLessThanOrEqual(0.35)
    }
  })

  it('makes the wrap cue the quietest thing in the kit', () => {
    // §05 forbids coaching mid-rep, and a sound that says "hurry" is coaching.
    // The thirty-second marker has to be the least insistent sound there is —
    // it is the only one that fires while she is mid-conversation.
    const peakOf = (name: SoundName) => KIT[name].partials.reduce((sum, p) => sum + p.gain, 0)
    const others = names.filter((name) => name !== 'wrap' && name !== 'reveal')
    for (const name of others) {
      expect(peakOf('wrap'), `wrap vs ${name}`).toBeLessThan(peakOf(name))
    }
  })

  it('resolves upward to start and downward to end', () => {
    // The countdown tick is the root and `go` is the octave above it, so three
    // ticks and a resolution read as a phrase. `exit` is the only sound in the
    // kit that sits below the root, because it is the only moment that should.
    const top = (name: SoundName) => Math.max(...KIT[name].partials.map((p) => p.frequency))
    expect(top('go')).toBeGreaterThan(top('tick'))
    expect(top('exit')).toBeLessThan(top('tick'))
  })

  it('gives every sound a decay that can actually be heard', () => {
    for (const name of names) {
      for (const partial of KIT[name].partials) {
        expect(partial.decay, name).toBeGreaterThan(0.01)
        expect(partial.gain, name).toBeGreaterThan(0)
      }
    }
  })

  it('says what each sound is for, in the product’s own words', () => {
    // Every user-facing string in this product is hand-authored; a sound is a
    // user-facing thing and the reason it exists belongs next to it.
    for (const name of names) {
      expect(KIT[name].role.length, name).toBeGreaterThan(12)
    }
  })
})
