import { describe, expect, it } from 'vitest'
import { siteOrigin, siteUrl, SITE_ORIGIN } from './origin'

/** A bare environment, so each case states everything it depends on. */
function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv
}

describe('the site origin', () => {
  it('prefers the explicit variable over everything else', () => {
    expect(
      siteOrigin(env({
        NEXT_PUBLIC_APP_URL: 'https://hellonerve.com',
        VERCEL_PROJECT_PRODUCTION_URL: 'nerve-henna.vercel.app',
        VERCEL_URL: 'nerve-git-branch.vercel.app',
      })),
    ).toBe('https://hellonerve.com')
  })

  it('prefers the stable production domain to the per-deployment one', () => {
    // A canonical tag and an OG image should point at the address that
    // outlives the deploy, not at the preview that happened to render them.
    expect(
      siteOrigin(env({
        VERCEL_PROJECT_PRODUCTION_URL: 'nerve-henna.vercel.app',
        VERCEL_URL: 'nerve-git-branch.vercel.app',
      })),
    ).toBe('https://nerve-henna.vercel.app')
  })

  it('falls back to the per-deployment address when that is all there is', () => {
    expect(siteOrigin(env({ VERCEL_URL: 'nerve-git-branch.vercel.app' }))).toBe('https://nerve-git-branch.vercel.app')
  })

  it('adds the scheme Vercel leaves off, and keeps one that is already there', () => {
    expect(siteOrigin(env({ VERCEL_URL: 'nerve.vercel.app' }))).toBe('https://nerve.vercel.app')
    expect(siteOrigin(env({ NEXT_PUBLIC_APP_URL: 'http://localhost:4000' }))).toBe('http://localhost:4000')
  })

  it('strips a trailing slash so callers can concatenate a path', () => {
    expect(siteOrigin(env({ NEXT_PUBLIC_APP_URL: 'https://hellonerve.com/' }))).toBe('https://hellonerve.com')
  })

  it('never resolves to localhost in production', () => {
    // This is the whole reason the module exists. `metadataBase` resolves the
    // relative `/og.png`, so a production build that answered `localhost` here
    // published link previews that no other machine on earth could load —
    // silently, and invisibly from inside the app.
    const origin = siteOrigin(env({ NODE_ENV: 'production' }))
    expect(origin).not.toContain('localhost')
    expect(origin.startsWith('https://')).toBe(true)
  })

  it('does resolve to localhost in development, on the port in use', () => {
    expect(siteOrigin(env({ NODE_ENV: 'development' }))).toBe('http://localhost:3000')
    expect(siteOrigin(env({ NODE_ENV: 'development', PORT: '4321' }))).toBe('http://localhost:4321')
  })

  it('ignores a variable that is present but blank', () => {
    // An empty string in a deployment's environment is a real and common
    // shape, and `??` would have accepted it.
    expect(siteOrigin(env({ NEXT_PUBLIC_APP_URL: '   ', VERCEL_URL: 'nerve.vercel.app' }))).toBe('https://nerve.vercel.app')
  })

  it('builds absolute URLs with exactly one slash', () => {
    expect(siteUrl('/pricing')).toBe(`${SITE_ORIGIN}/pricing`)
    expect(siteUrl('pricing')).toBe(`${SITE_ORIGIN}/pricing`)
    expect(siteUrl()).toBe(`${SITE_ORIGIN}/`)
  })
})
