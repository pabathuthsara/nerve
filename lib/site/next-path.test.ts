import { describe, expect, it } from 'vitest'
import { safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it('keeps an ordinary in-app path', () => {
    expect(safeNextPath('/train')).toBe('/train')
    expect(safeNextPath('/interview/start?round=screen')).toBe('/interview/start?round=screen')
  })

  it('falls back to the router when nothing is asked for', () => {
    expect(safeNextPath(null)).toBe('/')
    expect(safeNextPath(undefined)).toBe('/')
    expect(safeNextPath('')).toBe('/')
  })

  /**
   * The reason this function exists. Each of these is one character away from
   * a path that is fine, and each one leaves the site when concatenated onto
   * an origin.
   */
  it('refuses anything that could name another host', () => {
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('//evil.com/train')).toBe('/')
    expect(safeNextPath('/\\evil.com')).toBe('/')
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('http://evil.com')).toBe('/')
  })

  it('refuses a scheme that is not a hop at all', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe('/')
    expect(safeNextPath('data:text/html,<script>')).toBe('/')
  })

  it('refuses a bare path, which is relative to whatever route reads it', () => {
    expect(safeNextPath('train')).toBe('/')
    expect(safeNextPath('../admin')).toBe('/')
  })
})
