/**
 * The inspiration library snapshot (brief 4.4): every photo that hasn't been removed, with its
 * house, room, each person's tags, marks and notes. The library screen filters, counts and
 * searches this in the renderer (`shared/inspiration.ts`), so one load serves every filter.
 */
import type {
  InspirationHouse,
  InspirationPhoto,
  InspirationSnapshot,
  Mark,
  PhotoTag,
  SiteId
} from '../../shared/ipc'
import { houseNames } from '../../shared/inspiration'
import { mediaUrl } from '../media'
import { LISTINGS_DIR_NAME } from '../paths'
import type { DB } from './index'

interface HouseRow {
  id: number
  site: SiteId
  external_id: string
  suburb: string | null
  city: string | null
  title: string | null
  price: string | null
  folder_path: string
  created_at: number
  photo_count: number
}

interface PhotoRow {
  id: number
  listing_id: number
  file_name: string
  room: string | null
  folder_path: string
}

const LIVE = 'p.deleted_at IS NULL'

export function loadInspiration(db: DB): InspirationSnapshot {
  return db.transaction((): InspirationSnapshot => {
    const houseRows = db
      .prepare(
        `SELECT l.id, l.site, l.external_id, l.suburb, l.city, l.title, l.price, l.folder_path,
                l.created_at, COUNT(p.id) AS photo_count
         FROM listings l JOIN photos p ON p.listing_id = l.id AND ${LIVE}
         GROUP BY l.id
         ORDER BY l.created_at DESC, l.id DESC`
      )
      .all() as HouseRow[]
    const listingNotes = db
      .prepare(
        `SELECT listing_id, person_id, why_saved, updated_at FROM listing_notes
         ORDER BY listing_id, person_id`
      )
      .all() as {
      listing_id: number
      person_id: number
      why_saved: string | null
      updated_at: number
    }[]
    const photoRows = db
      .prepare(
        `SELECT p.id, p.listing_id, p.file_name, p.room, l.folder_path
         FROM photos p JOIN listings l ON l.id = p.listing_id
         WHERE ${LIVE}
         ORDER BY l.created_at DESC, l.id DESC, p.id`
      )
      .all() as PhotoRow[]
    const tagRows = db
      .prepare(
        `SELECT pt.photo_id, t.id AS tag_id, t.name, pt.person_id
         FROM photo_tags pt
         JOIN tags t ON t.id = pt.tag_id
         JOIN photos p ON p.id = pt.photo_id
         WHERE ${LIVE}
         ORDER BY pt.photo_id, t.name COLLATE NOCASE, t.id, pt.person_id`
      )
      .all() as { photo_id: number; tag_id: number; name: string; person_id: number }[]
    const noteRows = db
      .prepare(
        `SELECT n.photo_id, n.person_id, n.likes, n.why, n.mark, n.updated_at
         FROM photo_notes n JOIN photos p ON p.id = n.photo_id
         WHERE ${LIVE}
         ORDER BY n.photo_id, n.person_id`
      )
      .all() as {
      photo_id: number
      person_id: number
      likes: string | null
      why: string | null
      mark: Mark | null
      updated_at: number
    }[]

    const names = houseNames(
      houseRows.map((h) => ({
        id: h.id,
        site: h.site,
        externalId: h.external_id,
        suburb: h.suburb,
        title: h.title
      }))
    )
    const houses: InspirationHouse[] = houseRows.map((h) => ({
      id: h.id,
      site: h.site,
      externalId: h.external_id,
      name: names.get(h.id)!,
      suburb: h.suburb,
      city: h.city,
      title: h.title,
      price: h.price,
      folderName: h.folder_path.slice(LISTINGS_DIR_NAME.length + 1),
      photoCount: h.photo_count,
      notes: listingNotes
        .filter((n) => n.listing_id === h.id)
        .map((n) => ({ personId: n.person_id, text: n.why_saved, updatedAt: n.updated_at })),
      createdAt: h.created_at
    }))

    const photos = new Map<number, InspirationPhoto>()
    for (const r of photoRows) {
      photos.set(r.id, {
        id: r.id,
        listingId: r.listing_id,
        fileName: r.file_name,
        url: mediaUrl(`${r.folder_path}/${r.file_name}`),
        room: r.room,
        tags: [],
        notes: []
      })
    }
    for (const r of tagRows) {
      const photo = photos.get(r.photo_id)
      if (!photo) continue
      const last: PhotoTag | undefined = photo.tags.at(-1)
      if (last && last.tagId === r.tag_id) last.personIds.push(r.person_id)
      else photo.tags.push({ tagId: r.tag_id, name: r.name, personIds: [r.person_id] })
    }
    for (const r of noteRows) {
      photos.get(r.photo_id)?.notes.push({
        personId: r.person_id,
        likes: r.likes,
        why: r.why,
        mark: r.mark,
        updatedAt: r.updated_at
      })
    }
    return { houses, photos: [...photos.values()] }
  })()
}
