/** "Why we saved this house" (brief 4.2): one `listing_notes` row per listing per person. */
import type { DB } from './index'

export interface ListingNoteRow {
  person_id: number
  why_saved: string | null
  updated_at: number
}

export function listListingNotes(db: DB, listingId: number): ListingNoteRow[] {
  return db
    .prepare(
      `SELECT person_id, why_saved, updated_at FROM listing_notes
       WHERE listing_id = ? ORDER BY person_id`
    )
    .all(listingId) as ListingNoteRow[]
}

/**
 * Inserts or replaces this person's note. An all-blank note is stored as null (the row stays,
 * so "last edited" is kept). Throws for an unknown listing or person (foreign keys).
 */
export function saveListingNote(
  db: DB,
  listingId: number,
  personId: number,
  text: string,
  now: number
): ListingNoteRow {
  const why = text.trim() === '' ? null : text
  return db
    .prepare(
      `INSERT INTO listing_notes (listing_id, person_id, why_saved, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (listing_id, person_id) DO UPDATE SET
         why_saved = excluded.why_saved, updated_at = excluded.updated_at
       RETURNING person_id, why_saved, updated_at`
    )
    .get(listingId, personId, why, now) as ListingNoteRow
}
