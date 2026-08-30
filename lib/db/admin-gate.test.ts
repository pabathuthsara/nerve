/**
 * The admin allowlist.
 *
 * The interesting case is the empty one, and it is the reason this is a pure
 * function with a list argument rather than a direct read of the environment:
 * "unset means everybody" is the reading that opens the panel on a fresh
 * deploy, and it is the one somebody will reach for while debugging.
 */

import { describe, expect, it } from 'vitest'
import { isAdminEmail } from './admin-gate'

const list = ['someone@example.com', 'other@example.com']

describe('isAdminEmail', () => {
  it('admits an address on the list', () => {
    expect(isAdminEmail('someone@example.com', list)).toBe(true)
  })

  it('is case and whitespace insensitive, because addresses are', () => {
    expect(isAdminEmail('  SomeOne@Example.com ', list)).toBe(true)
  })

  it('refuses an address that is not on it', () => {
    expect(isAdminEmail('nobody@example.com', list)).toBe(false)
  })

  it('grants nobody when the list is empty', () => {
    // Not "everybody". An unset variable is a fresh deploy, not a permission.
    expect(isAdminEmail('someone@example.com', [])).toBe(false)
  })

  it('refuses a missing address', () => {
    expect(isAdminEmail(null, list)).toBe(false)
    expect(isAdminEmail(undefined, list)).toBe(false)
    expect(isAdminEmail('', list)).toBe(false)
  })
})
