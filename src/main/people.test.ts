import { describe, expect, it } from 'vitest'
import { validatePersonInput } from './people'

describe('validatePersonInput', () => {
  it('trims names and lower-cases colours', () => {
    expect(validatePersonInput({ id: 1, name: '  Sam  ', colour: '#1F3B33' })).toEqual({
      ok: true,
      value: { id: 1, name: 'Sam', colour: '#1f3b33' }
    })
  })

  it('rejects empty or whitespace-only names', () => {
    expect(validatePersonInput({ id: 1, name: '', colour: '#1f3b33' }).ok).toBe(false)
    expect(validatePersonInput({ id: 1, name: '   ', colour: '#1f3b33' }).ok).toBe(false)
  })

  it('rejects names longer than 40 characters', () => {
    expect(validatePersonInput({ id: 1, name: 'x'.repeat(41), colour: '#1f3b33' }).ok).toBe(false)
  })

  it('accepts only #rrggbb colours', () => {
    for (const colour of ['1f3b33', '#1f3b3', '#1f3b33aa', '#ggg000', 'red', '', '#fff']) {
      expect(validatePersonInput({ id: 1, name: 'Sam', colour }).ok, colour).toBe(false)
    }
  })

  it('rejects non-integer ids and non-string fields', () => {
    expect(validatePersonInput({ id: 1.5, name: 'Sam', colour: '#1f3b33' }).ok).toBe(false)
    expect(validatePersonInput({ id: 0, name: 'Sam', colour: '#1f3b33' }).ok).toBe(false)
    expect(validatePersonInput({ id: 1, name: 3, colour: '#1f3b33' }).ok).toBe(false)
    expect(validatePersonInput(null).ok).toBe(false)
  })
})
