import { describe, expect, it } from 'vitest'
import { pipelineTokenRates, priceChatUsage } from './rates'

describe('the character-model candidates', () => {
  it('are priced, so a bake-off turn is never read as free', () => {
    // Standard tier, per million tokens, from the vendor pricing page cited
    // beside the table. A missing card prices a turn at null, and the
    // bake-off would then report a candidate as costing nothing.
    expect(pipelineTokenRates('gpt-5-mini')).toMatchObject({ textInput: 0.25, cachedTextInput: 0.025, textOutput: 2 })
    expect(pipelineTokenRates('gpt-5-nano')).toMatchObject({ textInput: 0.05, cachedTextInput: 0.005, textOutput: 0.4 })
    expect(pipelineTokenRates('gpt-5.4-mini')).toMatchObject({ textInput: 0.75, cachedTextInput: 0.075, textOutput: 4.5 })
    expect(pipelineTokenRates('gpt-5.4-nano')).toMatchObject({ textInput: 0.2, cachedTextInput: 0.02, textOutput: 1.25 })
  })

  it('resolve the dated snapshots the completion payload reports', () => {
    expect(pipelineTokenRates('gpt-5-mini-2025-08-07')).toEqual(pipelineTokenRates('gpt-5-mini'))
    expect(pipelineTokenRates('gpt-5.4-nano-2026-03-17')).toEqual(pipelineTokenRates('gpt-5.4-nano'))
  })

  it('price a typical dating turn, cached prefix and all', () => {
    // ~2,700 tokens of contract, ~1,900 of them cached, ~16 out: the shape
    // §1.8 of the realism report measured on the shipping model.
    const turn = { input: 2_700, cachedInput: 1_900, output: 16 }
    expect(priceChatUsage('gpt-4.1-mini', turn)).toBeCloseTo((800 * 0.4 + 1_900 * 0.1 + 16 * 1.6) / 1e6, 10)
    expect(priceChatUsage('gpt-5-nano', turn)).toBeCloseTo((800 * 0.05 + 1_900 * 0.005 + 16 * 0.4) / 1e6, 10)
  })

  it('leave a model nobody priced unpriced', () => {
    expect(pipelineTokenRates('gpt-5.9-mini')).toBeNull()
  })
})
