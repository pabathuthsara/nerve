import { describe, expect, it } from 'vitest'
import {
  countryCode,
  deviceFor,
  isBot,
  MAX_PATH,
  normalisePath,
  referrerHost,
  scrubSegment,
} from './pageview'

describe('normalisePath', () => {
  it('keeps the static routes the product actually serves', () => {
    for (const path of ['/', '/pricing', '/interviews', '/how-it-works', '/legal/privacy', '/train', '/profile/subscription', '/interview/setup/cv']) {
      expect(normalisePath(path)).toBe(path)
    }
  })

  it('drops the query and the hash', () => {
    expect(normalisePath('/pricing?period=weekly&utm_source=reddit')).toBe('/pricing')
    expect(normalisePath('/pricing#plans')).toBe('/pricing')
  })

  it('normalises case and a trailing slash', () => {
    expect(normalisePath('/Pricing/')).toBe('/pricing')
    expect(normalisePath('/')).toBe('/')
  })

  /**
   * The rule the whole module exists for. A share token in an admin table is a
   * live capability URL somebody can read over a shoulder.
   */
  it('never stores a share token', () => {
    expect(normalisePath('/share/2f9c4a1b8e7d6c5a4b3e2d1c0f9e8d7c')).toBe('/share/[token]')
    expect(normalisePath('/share/short')).toBe('/share/[token]')
  })

  it('collapses the dynamic routes into readable shapes', () => {
    expect(normalisePath('/roster/nadia')).toBe('/roster/[persona]')
    expect(normalisePath('/library/the-second-question')).toBe('/library/[card]')
    expect(normalisePath('/rep/tess/brief')).toBe('/rep/[persona]/brief')
    expect(normalisePath('/rep/marcus-vance/live')).toBe('/rep/[persona]/live')
    expect(normalisePath('/interview/rep/marcus-vance/brief')).toBe('/interview/rep/[interviewer]/brief')
    expect(normalisePath('/progress/week/2026-09-01')).toBe('/progress/week/[week]')
    expect(normalisePath('/text/nadia')).toBe('/text/[persona]')
  })

  it('scrubs an identifier on a route nothing here has heard of', () => {
    expect(normalisePath('/invite/9f8e7d6c5b4a3928')).toBe('/invite/[id]')
    expect(normalisePath('/session/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('/session/[id]')
  })

  it('refuses what it cannot read rather than bucketing it', () => {
    expect(normalisePath('pricing')).toBeNull()
    expect(normalisePath('/../../etc/passwd')).toBeNull()
    expect(normalisePath('/a//b')).toBeNull()
    expect(normalisePath('/%2e%2e/admin')).toBeNull()
    expect(normalisePath('/<script>')).toBeNull()
    expect(normalisePath(42)).toBeNull()
    expect(normalisePath('')).toBeNull()
  })

  it('never returns more than the column allows', () => {
    const long = '/' + Array.from({ length: 40 }, (_, i) => `seg${String.fromCharCode(97 + (i % 26))}`).join('/')
    const out = normalisePath(long)
    expect(out).not.toBeNull()
    expect((out as string).length).toBeLessThanOrEqual(MAX_PATH)
  })
})

describe('scrubSegment', () => {
  it('leaves route names and persona slugs alone', () => {
    for (const segment of ['brief', 'live', 'deep-technical', 'marcus-vance', 'subscription', 'how-it-works']) {
      expect(scrubSegment(segment)).toBe(segment)
    }
  })

  it('replaces anything shaped like a token', () => {
    expect(scrubSegment('a1b2c3d4e5f6a7b8')).toBe('[id]')
    expect(scrubSegment('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('[id]')
    expect(scrubSegment('x'.repeat(40))).toBe('[id]')
  })

  /** A week key is a date and reads as one. The shape table names it anyway. */
  it('leaves a short date-like segment readable', () => {
    expect(scrubSegment('2026-09-01')).toBe('2026-09-01')
  })
})

describe('referrerHost', () => {
  it('keeps the host and nothing else', () => {
    expect(referrerHost('https://www.reddit.com/r/socialskills/comments/abc/i_tried_it/')).toBe('www.reddit.com')
    expect(referrerHost('https://google.com/search?q=how+to+stop+freezing')).toBe('google.com')
  })

  it('drops our own host, so an internal hop is not an arrival', () => {
    expect(referrerHost('https://www.hellonerve.com/pricing', 'www.hellonerve.com')).toBeNull()
    expect(referrerHost('https://hellonerve.com/pricing', 'www.hellonerve.com')).toBeNull()
  })

  it('returns null for anything that is not a URL', () => {
    expect(referrerHost('')).toBeNull()
    expect(referrerHost('android-app')).toBeNull()
    expect(referrerHost(undefined)).toBeNull()
  })
})

describe('deviceFor', () => {
  it('splits phones from desktops', () => {
    expect(deviceFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('mobile')
    expect(deviceFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe('desktop')
  })

  it('does not guess desktop for something it cannot identify', () => {
    expect(deviceFor(null)).toBe('other')
    expect(deviceFor('something/1.0')).toBe('other')
  })
})

describe('isBot', () => {
  it('catches the crawlers and the link unfurlers', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'facebookexternalhit/1.1',
      'curl/8.4.0',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0',
    ]) {
      expect(isBot(ua)).toBe(true)
    }
  })

  it('treats a missing or absurdly short agent as a bot', () => {
    expect(isBot(null)).toBe(true)
    expect(isBot('x')).toBe(true)
  })

  it('lets a real browser through', () => {
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false)
  })
})

describe('countryCode', () => {
  it('takes a two-letter code and nothing else', () => {
    expect(countryCode('us')).toBe('US')
    expect(countryCode('XX')).toBeNull()
    expect(countryCode('USA')).toBeNull()
    expect(countryCode(null)).toBeNull()
  })
})
