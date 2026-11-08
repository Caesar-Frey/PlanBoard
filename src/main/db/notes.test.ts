/** "Why we saved this house": one note per listing per person. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DETAILS } from '../scrapers/types'
import { openDatabase, type DB } from './index'
import { upsertListing } from './listings'
import { listListingNotes, saveListingNote } from './notes'

let db: DB
let listingId: number
beforeEach(() => {
  db = openDatabase(':memory:')
  listingId = upsertListing(db, {
    ...EMPTY_DETAILS,
    site: 'pp',
    external_id: 'T1',
    url: 'https://www.privateproperty.co.za/for-sale/a/b/c/d/T1',
    folder_path: 'listings/A_PP-T1',
    photo_count_expected: null,
    created_at: 1
  })
})
afterEach(() => {
  db.close()
})

describe('listing notes', () => {
  it('keeps one note per person and updates it in place', () => {
    saveListingNote(db, listingId, 1, 'The stoep', 10)
    saveListingNote(db, listingId, 2, 'Big kitchen', 11)
    const updated = saveListingNote(db, listingId, 1, 'The stoep and the light', 12)
    expect(updated).toEqual({ person_id: 1, why_saved: 'The stoep and the light', updated_at: 12 })
    expect(listListingNotes(db, listingId)).toEqual([
      { person_id: 1, why_saved: 'The stoep and the light', updated_at: 12 },
      { person_id: 2, why_saved: 'Big kitchen', updated_at: 11 }
    ])
    expect(db.prepare('SELECT COUNT(*) AS n FROM listing_notes').get()).toEqual({ n: 2 })
  })

  it('stores an emptied note as null rather than deleting the row', () => {
    saveListingNote(db, listingId, 1, 'x', 10)
    expect(saveListingNote(db, listingId, 1, '   ', 20).why_saved).toBeNull()
    expect(listListingNotes(db, listingId)).toEqual([
      { person_id: 1, why_saved: null, updated_at: 20 }
    ])
  })

  it('refuses an unknown person or listing', () => {
    expect(() => saveListingNote(db, listingId, 99, 'x', 1)).toThrow()
    expect(() => saveListingNote(db, 999, 1, 'x', 1)).toThrow()
  })

  it('is removed with its listing', () => {
    saveListingNote(db, listingId, 1, 'x', 10)
    db.prepare('DELETE FROM listings WHERE id = ?').run(listingId)
    expect(listListingNotes(db, listingId)).toEqual([])
  })
})
