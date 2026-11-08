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

const DETAIL_COLUMNS = [
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
  'agency'
] as const satisfies readonly (keyof ListingDetails)[]

const UPDATABLE = ['url', ...DETAIL_COLUMNS, 'folder_path', 'photo_count_expected'] as const
const INSERT_COLUMNS = ['site', 'external_id', ...UPDATABLE, 'created_at'] as const

const UPSERT_SQL =
  `INSERT INTO listings (${INSERT_COLUMNS.join(', ')}) ` +
  `VALUES (${INSERT_COLUMNS.map((c) => `@${c}`).join(', ')}) ` +
  `ON CONFLICT (site, external_id) DO UPDATE SET ` +
  UPDATABLE.map((c) => `${c} = excluded.${c}`).join(', ') +
  ' RETURNING id'

/** Inserts or updates by (site, external_id). Keeps the id and the first `created_at`. */
export function upsertListing(db: DB, record: ListingRecord): number {
  const params = Object.fromEntries(INSERT_COLUMNS.map((c) => [c, record[c] ?? null]))
  const row = db.prepare(UPSERT_SQL).get(params) as { id: number }
  return row.id
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
