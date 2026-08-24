import { describe, expect, it } from 'vitest'
import { detectBrowser, micRecovery } from './mic'

const UA = {
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
}

describe('mic recovery (§12, B10)', () => {
  it('tells the browsers apart, including the ones that lie', () => {
    // Chrome's user agent contains "Safari" and Edge's contains both, which is
    // the trap: order of checks is the whole implementation.
    expect(detectBrowser(UA.chrome)).toBe('chrome')
    expect(detectBrowser(UA.edge)).toBe('edge')
    expect(detectBrowser(UA.safari)).toBe('safari')
    expect(detectBrowser(UA.firefox)).toBe('firefox')
    expect(detectBrowser(UA.ios)).toBe('safari')
  })

  it('falls back rather than guessing', () => {
    expect(detectBrowser('some-crawler/1.0')).toBe('other')
    expect(detectBrowser('')).toBe('other')
  })

  it('names a real place to go, for every browser', () => {
    // §12 asks for browser-specific instructions. "Check your browser settings"
    // is what a user reads immediately before closing the tab, so every branch
    // has to name an actual menu — including the fallback.
    for (const browser of ['chrome', 'edge', 'safari', 'firefox', 'other'] as const) {
      const copy = micRecovery(browser)
      expect(copy.length, browser).toBeGreaterThan(40)
      expect(copy, browser).toMatch(/Microphone|microphone/)
    }
  })

  it('gives Safari its own answer, since its menu is nothing like the others', () => {
    expect(micRecovery('safari')).toContain('Settings for This Website')
    expect(micRecovery('safari')).not.toBe(micRecovery('chrome'))
  })
})
