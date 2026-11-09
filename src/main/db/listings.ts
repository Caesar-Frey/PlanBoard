/** Listing and photo queries for the capture flow and Recent surveys. */
import type { ListingDetails, Site } from '../scrapers/types'
import type { DB } from './index'

/** One `listings` row as written by a capture. `folder_path` is relative to the library root. */
export interface ListingRecord extends ListingDetails {
  site: Site
  external_id: string
  url: string
  folder_path: string
  photo_count_expected: number | null
  /** Photo count the listing page stated on the last survey (null: not stated / not known). */
  photo_count_listed?: number | null
  /** How many of those were repeats of another photo. */
  photo_duplicates?: number | null
  /** When the listing was last surveyed. `created_at` is the first time. */
  surveyed_at?: number | null
  /** When the bond figures were read from the listing (null: none read). */
  bond_as_of?: number | null
  created_at: number
}

export interface ListingRow extends ListingRecord {
  id: number
}

export interface PhotoRecord {
  file_name: string
  source_url: string
  width?: number | null
  height?: number | null
}

export interface RecentRow extends ListingRow {
  photos_on_disk: number
  tagged_photos: number
  first_photo: string | null
}

const BOND_COLUMNS = [
  'bond_interest_rate',
  'bond_term_years',
  'bond_deposit',
  'bond_monthly_repayment',
  'bond_once_off_costs',
  'bond_min_income',
  'bond_total_interest',
  'bond_total_repayment'
] as const satisfies readonly (keyof ListingDetails)[]

export const DETAIL_COLUMNS = [
  'title',
  'price',
  'suburb',
  'city',
  'bedrooms',
  'bathrooms',
  'garages',
  'erf_size',
  'floor_size',
  'levies',
  'rates',
  'description',
  'agent',
  'agency',
  'agent_phone',
  'agent_email',
  'agency_phone',
  'agency_email',
  ...BOND_COLUMNS
] as const satisfies readonly (keyof ListingDetails)[]

const FACT_COLUMNS = ['photo_count_listed', 'photo_duplicates', 'surveyed_at'] as const
const INSERT_COLUMNS = [
  'site',
  'external_id',
  'url',
  ...DETAIL_COLUMNS,
  'folder_path',
  'photo_count_expected',
  ...FACT_COLUMNS,
  'bond_as_of',
  'created_at'
] as const

const isEmpty = (col: string): string => `(listings.${col} IS NULL OR TRIM(listings.${col}) = '')`

/**
 * Re-survey merge rule (agreed with the user): a detail field is only filled in when it is
 * empty in the library. A value that is there (scraped earlier or typed in the listing view) is
 * never overwritten. The survey facts are refreshed, keeping the old value when this survey
 * didn't find one. `bond_as_of` dates the bond figures, so it only changes when the library
 * had none of them (and this survey's figures fill them in).
 */
const UPSERT_SQL =
  `INSERT INTO listings (${INSERT_COLUMNS.join(', ')}) ` +
  `VALUES (${INSERT_COLUMNS.map((c) => `@${c}`).join(', ')}) ` +
  `ON CONFLICT (site, external_id) DO UPDATE SET ` +
  [
    'url = excluded.url',
    'folder_path = excluded.folder_path',
    'photo_count_expected = excluded.photo_count_expected',
    ...FACT_COLUMNS.map((c) => `${c} = COALESCE(excluded.${c}, listings.${c})`),
    `bond_as_of = CASE WHEN ${BOND_COLUMNS.map(isEmpty).join(' AND ')} ` +
      `THEN excluded.bond_as_of ELSE listings.bond_as_of END`,
    ...DETAIL_COLUMNS.map(
      (c) => `${c} = CASE WHEN ${isEmpty(c)} THEN excluded.${c} ELSE listings.${c} END`
    )
  ].join(', ') +
  ' RETURNING id'

/** Inserts or updates by (site, external_id). Keeps the id and the first `created_at`. */
export function upsertListing(db: DB, record: ListingRecord): number {
  const params = Object.fromEntries(INSERT_COLUMNS.map((c) => [c, record[c] ?? null]))
  const row = db.prepare(UPSERT_SQL).get(params) as { id: number }
  return row.id
}

const UPDATE_DETAILS_SQL = `UPDATE listings SET ${DETAIL_COLUMNS.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`

/** The listing view's Save: replaces every detail field. Throws for an unknown id. */
export function updateListingDetails(db: DB, id: number, details: ListingDetails): void {
  const params = Object.fromEntries(DETAIL_COLUMNS.map((c) => [c, details[c] ?? null]))
  const info = db.prepare(UPDATE_DETAILS_SQL).run({ ...params, id })
  if (info.changes !== 1) throw new Error(`No listing with id ${id}`)
}

/** Just the detail fields of a row. */
export function detailsOf(row: ListingRow): ListingDetails {
  return Object.fromEntries(
    DETAIL_COLUMNS.map((c) => [c, row[c] ?? null])
  ) as unknown as ListingDetails
}

export function findListing(db: DB, site: Site, externalId: string): ListingRow | undefined {
  return db
    .prepare('SELECT * FROM listings WHERE site = ? AND external_id = ?')
    .get(site, externalId) as ListingRow | undefined
}

export function getListing(db: DB, id: number): ListingRow | undefined {
  return db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as ListingRow | undefined
}

/**
 * Records photos that are now on disk, in one transaction. Existing rows only get their
 * `source_url` (and size, if given) refreshed: room, tags and removals are never touched.
 * Returns how many rows were new.
 */
export function recordPhotos(db: DB, listingId: number, photos: PhotoRecord[]): number {
  const exists = db.prepare('SELECT 1 FROM photos WHERE listing_id = ? AND file_name = ?')
  const upsert = db.prepare(
    `INSERT INTO photos (listing_id, file_name, source_url, width, height)
     VALUES (@listing_id, @file_name, @source_url, @width, @height)
     ON CONFLICT (listing_id, file_name) DO UPDATE SET
       source_url = excluded.source_url,
       width = COALESCE(excluded.width, photos.width),
       height = COALESCE(excluded.height, photos.height)`
  )
  return db.transaction((list: PhotoRecord[]) => {
    let added = 0
    for (const p of list) {
      if (!exists.get(listingId, p.file_name)) added += 1
      upsert.run({
        listing_id: listingId,
        file_name: p.file_name,
        source_url: p.source_url,
        width: p.width ?? null,
        height: p.height ?? null
      })
    }
    return added
  })(photos)
}

/** File names the user removed (milestone 4). A re-run must not download them again. */
export function removedFileNames(db: DB, listingId: number): Set<string> {
  const rows = db
    .prepare('SELECT file_name FROM photos WHERE listing_id = ? AND deleted_at IS NOT NULL')
    .all(listingId) as { file_name: string }[]
  return new Set(rows.map((r) => r.file_name))
}

export interface ListingPhotoRow {
  id: number
  file_name: string
  room: string | null
}

/** Photos still in the listing (not removed), in the order they were recorded (gallery order). */
export function listListingPhotos(db: DB, listingId: number): ListingPhotoRow[] {
  return db
    .prepare(
      `SELECT id, file_name, room FROM photos
       WHERE listing_id = ? AND deleted_at IS NULL ORDER BY id`
    )
    .all(listingId) as ListingPhotoRow[]
}

export interface PhotoFileRow {
  id: number
  listing_id: number
  file_name: string
  deleted_at: number | null
}

export function getPhotos(db: DB, ids: readonly number[]): PhotoFileRow[] {
  const get = db.prepare('SELECT id, listing_id, file_name, deleted_at FROM photos WHERE id = ?')
  return ids.flatMap((id) => {
    const row = get.get(id) as PhotoFileRow | undefined
    return row ? [row] : []
  })
}

/** Marks a photo as removed by the user. Capture never downloads it again (removedFileNames). */
export function markPhotoDeleted(db: DB, photoId: number, at: number): void {
  db.prepare('UPDATE photos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(
    at,
    photoId
  )
}

export function countPhotos(db: DB, listingId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM photos WHERE listing_id = ? AND deleted_at IS NULL')
    .get(listingId) as { n: number }
  return row.n
}

/** Newest first. A photo counts as tagged when it has a room or at least one feature tag. */
export function listRecentListings(db: DB): RecentRow[] {
  return db
    .prepare(
      `SELECT l.*,
         (SELECT COUNT(*) FROM photos p
            WHERE p.listing_id = l.id AND p.deleted_at IS NULL) AS photos_on_disk,
         (SELECT COUNT(*) FROM photos p
            WHERE p.listing_id = l.id AND p.deleted_at IS NULL
              AND (p.room IS NOT NULL
                   OR EXISTS (SELECT 1 FROM photo_tags t WHERE t.photo_id = p.id))) AS tagged_photos,
         (SELECT p.file_name FROM photos p
            WHERE p.listing_id = l.id AND p.deleted_at IS NULL
            ORDER BY p.id LIMIT 1) AS first_photo
       FROM listings l
       ORDER BY l.created_at DESC, l.id DESC`
    )
    .all() as RecentRow[]
}
