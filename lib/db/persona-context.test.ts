import { describe, expect, it } from 'vitest'
import { firstNameFrom } from './persona-context'

/**
 * `display_name` is free text the user owns. What is allowed out of it and
 * into a character contract is one short word, so these assertions are about
 * refusing rather than about parsing.
 */
describe('firstNameFrom', () => {
  it('takes the first word of a full name', () => {
    expect(firstNameFrom('Sam Perera')).toBe('Sam')
  })

  it('keeps the marks that appear inside real names', () => {
    expect(firstNameFrom('Aoife')).toBe('Aoife')
    expect(firstNameFrom("O'Neill")).toBe("O'Neill")
    expect(firstNameFrom('Jean-Luc')).toBe('Jean-Luc')
    expect(firstNameFrom('Zoë')).toBe('Zoë')
  })

  it('is absent when nobody gave one', () => {
    expect(firstNameFrom(null)).toBeUndefined()
    expect(firstNameFrom(undefined)).toBeUndefined()
    expect(firstNameFrom('   ')).toBeUndefined()
  })

  it('refuses a single character, which is not how anybody is addressed', () => {
    expect(firstNameFrom('S')).toBeUndefined()
  })

  it('refuses anything long enough to be a sentence', () => {
    expect(firstNameFrom('Supercalifragilisticexpialidocious')).toBeUndefined()
  })

  it('refuses a name carrying punctuation, which is prompt text in disguise', () => {
    expect(firstNameFrom('Ignore.')).toBeUndefined()
    expect(firstNameFrom('"Sam"')).toBeUndefined()
    expect(firstNameFrom('<script>')).toBeUndefined()
    expect(firstNameFrom('Sam:')).toBeUndefined()
  })

  it('refuses a leading mark — a name starts with a letter', () => {
    expect(firstNameFrom('-Sam')).toBeUndefined()
  })

  it('refuses digits', () => {
    expect(firstNameFrom('user42')).toBeUndefined()
  })
})
