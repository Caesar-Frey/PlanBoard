/**
 * Untick to remove (brief 4.2): photos go to the macOS Trash, never a permanent delete.
 *
 * Every path is checked before the Trash is asked to touch it: the stored folder must be a
 * listing folder, the stored file name a plain image name, and the real file (after resolving
 * links) must be inside the library's listings/ folder. A removed photo gets `deleted_at`, so a
 * later survey never downloads it again. A file that is already gone is just marked removed.
 */
import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { isSafeFileName } from '../capture/files'
import type { DB } from '../db'
import { getListing, getPhotos, markPhotoDeleted } from '../db/listings'
import { isInside, listingFolderPath } from '../pathGuard'
import { LISTINGS_DIR_NAME } from '../paths'

export interface TrashDeps {
  db: DB
  libraryRoot: string
  /** `shell.trashItem` in the app; a fake in tests. Rejects when the file can't be moved. */
  trashItem(path: string): Promise<void>
  now(): number
}

export interface TrashFailure {
  photoId: number
  fileName: string
  reason: string
}

export interface TrashResult {
  /** Moved to the Trash and marked removed. */
  trashed: number[]
  /** The file was already gone; marked removed. */
  missing: number[]
  failed: TrashFailure[]
}

const OUTSIDE = 'Refused: this file is outside the library folder.'

type Check =
  { kind: 'file'; path: string } | { kind: 'missing' } | { kind: 'refused'; reason: string }

/** Where the photo's file really is, or why it must not be touched. */
async function checkFile(listingsDir: string, folder: string, fileName: string): Promise<Check> {
  if (!isSafeFileName(fileName)) return { kind: 'refused', reason: OUTSIDE }
  const path = join(folder, fileName)
  if (!isInside(listingsDir, path)) return { kind: 'refused', reason: OUTSIDE }
  try {
    const st = await lstat(path)
    // PlanBoard only ever writes plain files; a link could point anywhere.
    if (st.isSymbolicLink()) return { kind: 'refused', reason: OUTSIDE }
    if (!st.isFile()) return { kind: 'refused', reason: 'Refused: this is not a photo file.' }
    // The listing folder itself could be a link to somewhere else.
    const [realDir, realFile] = await Promise.all([realpath(listingsDir), realpath(path)])
    if (!isInside(realDir, realFile)) return { kind: 'refused', reason: OUTSIDE }
    return { kind: 'file', path }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'refused', reason: (err as Error).message }
  }
}

export async function trashPhotos(
  deps: TrashDeps,
  listingId: number,
  photoIds: readonly number[]
): Promise<TrashResult> {
  const result: TrashResult = { trashed: [], missing: [], failed: [] }
  const ids = [...new Set(photoIds)]
  const rows = new Map(getPhotos(deps.db, ids).map((r) => [r.id, r]))
  const listing = getListing(deps.db, listingId)
  const folder = listing ? listingFolderPath(deps.libraryRoot, listing.folder_path) : null
  const listingsDir = join(deps.libraryRoot, LISTINGS_DIR_NAME)

  for (const id of ids) {
    const row = rows.get(id)
    if (!row || row.listing_id !== listingId) {
      result.failed.push({
        photoId: id,
        fileName: row?.file_name ?? '',
        reason: 'This photo is not part of this listing any more.'
      })
      continue
    }
    if (row.deleted_at !== null) continue // removed already: nothing to do
    if (!folder) {
      result.failed.push({ photoId: id, fileName: row.file_name, reason: OUTSIDE })
      continue
    }
    const check = await checkFile(listingsDir, folder, row.file_name)
    if (check.kind === 'refused') {
      result.failed.push({ photoId: id, fileName: row.file_name, reason: check.reason })
      continue
    }
    if (check.kind === 'file') {
      try {
        await deps.trashItem(check.path)
      } catch (err) {
        result.failed.push({
          photoId: id,
          fileName: row.file_name,
          reason: err instanceof Error ? err.message : String(err)
        })
        continue
      }
    }
    // Mark each one straight away, so the db matches the disk even if a later one fails.
    markPhotoDeleted(deps.db, id, deps.now())
    ;(check.kind === 'file' ? result.trashed : result.missing).push(id)
  }
  return result
}
