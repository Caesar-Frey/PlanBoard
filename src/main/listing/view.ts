/** Everything the listing view shows, in one serialisable object. */
import type { ListingView } from '../../shared/ipc'
import type { DB } from '../db'
import { detailsOf, getListing, listListingPhotos } from '../db/listings'
import { listListingNotes } from '../db/notes'
import { getPhotoTagging } from '../db/tagging'
import { mediaUrl } from '../media'
import { LISTINGS_DIR_NAME } from '../paths'
import { SITE_NAME } from '../scrapers/types'
import { readDetailsFileState } from './details'

export async function loadListingView(
  db: DB,
  libraryRoot: string,
  id: number
): Promise<ListingView | null> {
  const row = getListing(db, id)
  if (!row) return null
  const photos = listListingPhotos(db, id)
  const tagging = new Map(
    getPhotoTagging(
      db,
      photos.map((p) => p.id)
    ).map((t) => [t.photoId, t])
  )
  return {
    id: row.id,
    site: row.site,
    siteName: SITE_NAME[row.site],
    externalId: row.external_id,
    url: row.url,
    folderName: row.folder_path.slice(LISTINGS_DIR_NAME.length + 1),
    fields: detailsOf(row),
    photosExpected: row.photo_count_expected,
    createdAt: row.created_at,
    surveyedAt: row.surveyed_at ?? null,
    bondAsOf: row.bond_as_of ?? null,
    photos: photos.map((p) => ({
      id: p.id,
      fileName: p.file_name,
      url: mediaUrl(`${row.folder_path}/${p.file_name}`),
      room: p.room,
      tags: tagging.get(p.id)?.tags ?? [],
      notes: tagging.get(p.id)?.notes ?? []
    })),
    detailsFile: await readDetailsFileState(libraryRoot, row.folder_path),
    notes: listListingNotes(db, id).map((n) => ({
      personId: n.person_id,
      text: n.why_saved,
      updatedAt: n.updated_at
    }))
  }
}
