import { describe, expect, it } from 'vitest'
import { EMPTY_FIELDS_INPUT } from '../../shared/listingFields'
import {
  MAX_NOTE_LENGTH,
  parseSaveDetailsRequest,
  parseSaveNoteRequest,
  parseTrashRequest
} from './requests'

describe('IPC request parsing (the renderer is not trusted)', () => {
  it('trash: listing id and a non-empty list of photo ids', () => {
    expect(parseTrashRequest({ listingId: 1, photoIds: [3, 4, 3] })).toEqual({
      listingId: 1,
      photoIds: [3, 4]
    })
    expect(parseTrashRequest({ listingId: 1, photoIds: [] })).toBeNull()
    expect(parseTrashRequest({ listingId: 1, photoIds: ['3'] })).toBeNull()
    expect(parseTrashRequest({ listingId: 0, photoIds: [1] })).toBeNull()
    expect(parseTrashRequest({ listingId: 1, photoIds: Array(5001).fill(1) })).toBeNull()
    expect(parseTrashRequest(null)).toBeNull()
  })

  it('details: listing id, a file mode and the form', () => {
    const fields = { ...EMPTY_FIELDS_INPUT, title: 'x' }
    expect(parseSaveDetailsRequest({ listingId: 2, fields, fileMode: 'keep' })).toEqual({
      listingId: 2,
      fields,
      fileMode: 'keep'
    })
    expect(parseSaveDetailsRequest({ listingId: 2, fields, fileMode: 'delete' })).toBeNull()
    expect(parseSaveDetailsRequest({ listingId: 2, fileMode: 'ask' })).toBeNull()
  })

  it('note: listing, person and text of a sensible length', () => {
    expect(parseSaveNoteRequest({ listingId: 1, personId: 2, text: 'Light' })).toEqual({
      listingId: 1,
      personId: 2,
      text: 'Light'
    })
    expect(
      parseSaveNoteRequest({ listingId: 1, personId: 2, text: 'x'.repeat(MAX_NOTE_LENGTH + 1) })
    ).toBeNull()
    expect(parseSaveNoteRequest({ listingId: 1, personId: 1.5, text: '' })).toBeNull()
    expect(parseSaveNoteRequest({ listingId: 1, personId: 1 })).toBeNull()
  })
})
