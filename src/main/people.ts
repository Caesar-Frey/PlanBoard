import type { PersonInput, Result } from '../shared/ipc'

export const MAX_NAME_LENGTH = 40
const HEX_COLOUR = /^#[0-9a-f]{6}$/i

/** Validates untrusted input from the renderer before it reaches the database. */
export function validatePersonInput(input: unknown): Result<PersonInput> {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Invalid person' }
  const { id, name, colour } = input as Record<string, unknown>

  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'Invalid person id' }
  }
  if (typeof name !== 'string') return { ok: false, error: 'Name must be text' }
  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, error: 'Name cannot be empty' }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` }
  }
  if (typeof colour !== 'string' || !HEX_COLOUR.test(colour)) {
    return { ok: false, error: 'Colour must be a hex value like #1f3b33' }
  }
  return { ok: true, value: { id, name: trimmed, colour: colour.toLowerCase() } }
}
