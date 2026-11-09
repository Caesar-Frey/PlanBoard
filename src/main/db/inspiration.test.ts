/** The inspiration library snapshot (brief 4.4): every live photo with its house, tags and notes. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DETAILS } from '../scrapers/types'
import { openDatabase, type DB } from './index'
import { loadInspiration } from './inspiration'
import { recordPhotos, upsertListing } from './listings'
import { saveListingNote } from './notes'
import { addPhotoTag, findOrCreateTag, savePhotoNote, setRoom } from './tagging'

let db: DB

function listing(externalId: string, suburb: string | null, createdAt: number): number {
  return upsertListing(db, {
    ...EMPTY_DETAILS,
    suburb,
    city: 'Pretoria',
    price: 'R 3 000 000',
    site: 'p24',
    external_id: externalId,
    url: `https://www.property24.com/for-sale/a/b/c/${externalId}`,
    folder_path: `listings/${suburb ?? 'X'}_P24-${externalId}`,
    photo_count_expected: null,
    created_at: createdAt
  })
}

function photosOf(listingId: number, count: number): number[] {
  recordPhotos(
    db,
    listingId,
    Array.from({ length: count }, (_, i) => ({
      file_name: `image_${listingId}_${i + 1}.jpg`,
      source_url: `u${listingId}-${i}`
    }))
  )
  return (
    db.prepare('SELECT id FROM photos WHERE listing_id = ? ORDER BY id').all(listingId) as {
      id: number
    }[]
  ).map((r) => r.id)
}

const remove = (photoId: number): void => {
  db.prepare('UPDATE photos SET deleted_at = 5 WHERE id = ?').run(photoId)
}

beforeEach(() => {
  db = openDatabase(':memory:')
})
afterEach(() => {
  db.close()
})

describe('loadInspiration', () => {
  it('is empty for an empty library', () => {
    expect(loadInspiration(db)).toEqual({ houses: [], photos: [] })
  })

  it('lists houses newest first with their live photos in gallery order', () => {
    const older = listing('1', 'Irene', 10)
    const newer = listing('2', 'Cornwall Hill', 20)
    const [a, b] = photosOf(older, 2)
    const [c] = photosOf(newer, 1)
    const snap = loadInspiration(db)
    expect(snap.houses.map((h) => [h.id, h.name, h.photoCount])).toEqual([
      [newer, 'Cornwall Hill', 1],
      [older, 'Irene', 2]
    ])
    expect(snap.houses[1]).toMatchObject({
      site: 'p24',
      externalId: '1',
      suburb: 'Irene',
      city: 'Pretoria',
      price: 'R 3 000 000',
      folderName: 'Irene_P24-1',
      createdAt: 10,
      notes: []
    })
    expect(snap.photos.map((p) => p.id)).toEqual([c, a, b])
    expect(snap.photos[1]).toEqual({
      id: a,
      listingId: older,
      fileName: `image_${older}_1.jpg`,
      url: `planboard-media://library/listings/Irene_P24-1/image_${older}_1.jpg`,
      room: null,
      tags: [],
      notes: []
    })
  })

  it('carries rooms, each person’s tags, marks, notes and the listing notes', () => {
    const id = listing('1', 'Irene', 10)
    const [a] = photosOf(id, 1)
    setRoom(db, [a!], 'Kitchen')
    const island = findOrCreateTag(db, 'Island', 1, 1).tag
    const pendant = findOrCreateTag(db, 'Pendant lights', 1, 1).tag
    addPhotoTag(db, a!, pendant.id, 2, 1)
    addPhotoTag(db, a!, island.id, 2, 1)
    addPhotoTag(db, a!, island.id, 1, 1)
    savePhotoNote(db, a!, 2, { likes: 'Stone top', mark: 'must' }, 7)
    saveListingNote(db, id, 1, 'Big garden', 8)

    const snap = loadInspiration(db)
    expect(snap.photos[0]).toMatchObject({
      room: 'Kitchen',
      tags: [
        { tagId: island.id, name: 'Island', personIds: [1, 2] },
        { tagId: pendant.id, name: 'Pendant lights', personIds: [2] }
      ],
      notes: [{ personId: 2, likes: 'Stone top', why: null, mark: 'must', updatedAt: 7 }]
    })
    expect(snap.houses[0]?.notes).toEqual([{ personId: 1, text: 'Big garden', updatedAt: 8 }])
  })

  it('never includes removed photos, nor houses whose photos were all removed', () => {
    const kept = listing('1', 'Irene', 10)
    const gone = listing('2', 'Midstream', 20)
    const [a, b] = photosOf(kept, 2)
    const [c] = photosOf(gone, 1)
    const tag = findOrCreateTag(db, 'Island', 1, 1).tag
    addPhotoTag(db, b!, tag.id, 1, 1)
    savePhotoNote(db, b!, 1, { mark: 'must' }, 1)
    remove(b!)
    remove(c!)

    const snap = loadInspiration(db)
    expect(snap.houses.map((h) => [h.id, h.photoCount])).toEqual([[kept, 1]])
    expect(snap.photos.map((p) => p.id)).toEqual([a])
    expect(snap.photos[0]?.tags).toEqual([])
    expect(snap.photos[0]?.notes).toEqual([])
  })

  it('names houses uniquely when two share a suburb', () => {
    photosOf(listing('1', 'Irene', 10), 1)
    photosOf(listing('2', 'Irene', 20), 1)
    expect(loadInspiration(db).houses.map((h) => h.name)).toEqual([
      'Irene · P24-2',
      'Irene · P24-1'
    ])
  })
})
