/** Rooms, feature tags, marks and per-person photo notes (brief 4.3). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DETAILS } from '../scrapers/types'
import { openDatabase, type DB } from './index'
import { listRecentListings, recordPhotos, upsertListing } from './listings'
import {
  addPhotoTag,
  findOrCreateTag,
  getPhotoTagging,
  listTagSummaries,
  mergeTags,
  removePhotoTag,
  renameTag,
  savePhotoNote,
  setRoom
} from './tagging'

let db: DB
let listingId: number
let photos: number[]

beforeEach(() => {
  db = openDatabase(':memory:')
  listingId = upsertListing(db, {
    ...EMPTY_DETAILS,
    site: 'p24',
    external_id: '1',
    url: 'https://www.property24.com/for-sale/a/b/c/1',
    folder_path: 'listings/A_P24-1',
    photo_count_expected: null,
    created_at: 1
  })
  recordPhotos(db, listingId, [
    { file_name: 'image_1.jpg', source_url: 'a' },
    { file_name: 'image_2.jpg', source_url: 'b' },
    { file_name: 'image_3.jpg', source_url: 'c' }
  ])
  photos = (db.prepare('SELECT id FROM photos ORDER BY id').all() as { id: number }[]).map(
    (r) => r.id
  )
})
afterEach(() => {
  db.close()
})

const tagRows = (): { photo_id: number; tag_id: number; person_id: number }[] =>
  db
    .prepare('SELECT photo_id, tag_id, person_id FROM photo_tags ORDER BY photo_id, person_id')
    .all() as { photo_id: number; tag_id: number; person_id: number }[]

describe('setRoom', () => {
  it('sets and clears the room of several photos at once', () => {
    expect(setRoom(db, [photos[0]!, photos[1]!], 'Kitchen')).toBe(2)
    expect(getPhotoTagging(db, photos).map((p) => p.room)).toEqual(['Kitchen', 'Kitchen', null])
    setRoom(db, [photos[0]!], null)
    expect(getPhotoTagging(db, [photos[0]!])[0]?.room).toBeNull()
  })

  it('changes nothing when one of the photos is unknown', () => {
    expect(() => setRoom(db, [photos[0]!, 999], 'Kitchen')).toThrow(/no longer/i)
    expect(getPhotoTagging(db, [photos[0]!])[0]?.room).toBeNull()
  })
})

describe('tags', () => {
  it('keeps names unique regardless of case (COLLATE NOCASE)', () => {
    db.prepare("INSERT INTO tags (name, created_at) VALUES ('Island', 0)").run()
    expect(() =>
      db.prepare("INSERT INTO tags (name, created_at) VALUES ('ISLAND', 0)").run()
    ).toThrow(/UNIQUE/)
  })

  it('reuses an existing tag for the same name in another case, plural or word order', () => {
    const a = findOrCreateTag(db, 'Island', 1, 10)
    expect(a.created).toBe(true)
    expect(findOrCreateTag(db, 'island', 2, 11)).toEqual({ tag: a.tag, created: false })
    expect(findOrCreateTag(db, 'Islands', 2, 11)).toEqual({ tag: a.tag, created: false })
    const p = findOrCreateTag(db, 'Pendant lights', 1, 12)
    expect(findOrCreateTag(db, 'Lights pendant', 2, 13).tag.id).toBe(p.tag.id)
    expect(listTagSummaries(db).map((t) => t.name)).toEqual(['Island', 'Pendant lights'])
  })

  it('records the tag per person, once each, and removes only that person’s', () => {
    const { tag } = findOrCreateTag(db, 'Island', 1, 10)
    expect(addPhotoTag(db, photos[0]!, tag.id, 1, 20)).toBe(true)
    expect(addPhotoTag(db, photos[0]!, tag.id, 1, 21)).toBe(false)
    expect(addPhotoTag(db, photos[0]!, tag.id, 2, 22)).toBe(true)
    expect(getPhotoTagging(db, [photos[0]!])[0]?.tags).toEqual([
      { tagId: tag.id, name: 'Island', personIds: [1, 2] }
    ])
    expect(removePhotoTag(db, photos[0]!, tag.id, 1)).toBe(true)
    expect(getPhotoTagging(db, [photos[0]!])[0]?.tags).toEqual([
      { tagId: tag.id, name: 'Island', personIds: [2] }
    ])
    expect(removePhotoTag(db, photos[0]!, tag.id, 1)).toBe(false)
  })

  it('counts photos per tag, leaving out removed photos, A–Z', () => {
    const island = findOrCreateTag(db, 'Island', 1, 10).tag
    const bench = findOrCreateTag(db, 'bench', 1, 11).tag
    addPhotoTag(db, photos[0]!, island.id, 1, 0)
    addPhotoTag(db, photos[0]!, island.id, 2, 0)
    addPhotoTag(db, photos[1]!, island.id, 1, 0)
    addPhotoTag(db, photos[2]!, island.id, 1, 0)
    db.prepare('UPDATE photos SET deleted_at = 5 WHERE id = ?').run(photos[2])
    expect(listTagSummaries(db)).toEqual([
      { id: bench.id, name: 'Bench', photo_count: 0, created_at: 11 },
      { id: island.id, name: 'Island', photo_count: 2, created_at: 10 }
    ])
  })
})

describe('renameTag', () => {
  it('renames, including a change of case only', () => {
    const { tag } = findOrCreateTag(db, 'Iland', 1, 10)
    expect(renameTag(db, tag.id, 'Island')).toMatchObject({
      status: 'renamed',
      tag: { id: tag.id, name: 'Island' }
    })
    expect(renameTag(db, tag.id, 'ISLAND')).toMatchObject({
      status: 'renamed',
      tag: { name: 'ISLAND' }
    })
  })

  it('reports another tag with that name (any case) instead of renaming', () => {
    const a = findOrCreateTag(db, 'Island', 1, 10).tag
    const b = findOrCreateTag(db, 'Kitchen island', 1, 11).tag
    expect(renameTag(db, b.id, 'island')).toMatchObject({
      status: 'exists',
      existing: { id: a.id }
    })
    expect(listTagSummaries(db).map((t) => t.name)).toEqual(['Island', 'Kitchen island'])
  })

  it('reports an unknown tag', () => {
    expect(renameTag(db, 999, 'X')).toEqual({ status: 'not-found' })
  })
})

describe('mergeTags', () => {
  it('moves photo tags, drops duplicates, keeps each person’s rows and removes the old tag', () => {
    const into = findOrCreateTag(db, 'Island', 1, 10).tag
    const from = findOrCreateTag(db, 'Kitchen island', 2, 11).tag
    // Photo 1: person 1 has both tags (a duplicate after the merge); person 2 only the old one.
    addPhotoTag(db, photos[0]!, into.id, 1, 0)
    addPhotoTag(db, photos[0]!, from.id, 1, 0)
    addPhotoTag(db, photos[0]!, from.id, 2, 0)
    // Photo 2: only the old tag.
    addPhotoTag(db, photos[1]!, from.id, 2, 0)

    expect(mergeTags(db, from.id, into.id)).toEqual({ moved: 2, duplicates: 1 })
    expect(tagRows()).toEqual([
      { photo_id: photos[0], tag_id: into.id, person_id: 1 },
      { photo_id: photos[0], tag_id: into.id, person_id: 2 },
      { photo_id: photos[1], tag_id: into.id, person_id: 2 }
    ])
    expect(listTagSummaries(db).map((t) => t.name)).toEqual(['Island'])
  })

  it('refuses to merge a tag into itself or an unknown tag', () => {
    const a = findOrCreateTag(db, 'Island', 1, 10).tag
    expect(() => mergeTags(db, a.id, a.id)).toThrow()
    expect(() => mergeTags(db, a.id, 999)).toThrow()
    expect(() => mergeTags(db, 999, a.id)).toThrow()
    expect(listTagSummaries(db)).toHaveLength(1)
  })
})

describe('savePhotoNote', () => {
  it('keeps one row per person and only changes the fields given', () => {
    savePhotoNote(db, photos[0]!, 1, { likes: 'The light' }, 10)
    savePhotoNote(db, photos[0]!, 1, { why: 'South facing' }, 11)
    savePhotoNote(db, photos[0]!, 1, { mark: 'must' }, 12)
    savePhotoNote(db, photos[0]!, 2, { likes: 'Tiles' }, 13)
    expect(getPhotoTagging(db, [photos[0]!])[0]?.notes).toEqual([
      { personId: 1, likes: 'The light', why: 'South facing', mark: 'must', updatedAt: 12 },
      { personId: 2, likes: 'Tiles', why: null, mark: null, updatedAt: 13 }
    ])
  })

  it('stores blank text as null and clears the mark with null', () => {
    savePhotoNote(db, photos[0]!, 1, { likes: 'x', mark: 'nice' }, 10)
    const row = savePhotoNote(db, photos[0]!, 1, { likes: '   ', mark: null }, 11)
    expect(row).toEqual({ personId: 1, likes: null, why: null, mark: null, updatedAt: 11 })
  })

  it('only allows must / nice / maybe (CHECK constraint)', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO photo_notes (photo_id, person_id, mark, updated_at) VALUES (?, 1, 'love', 0)"
        )
        .run(photos[0])
    ).toThrow(/CHECK/)
  })

  it('throws for an unknown photo or person (foreign keys)', () => {
    expect(() => savePhotoNote(db, 999, 1, { likes: 'x' }, 0)).toThrow()
    expect(() => savePhotoNote(db, photos[0]!, 99, { likes: 'x' }, 0)).toThrow()
  })
})

describe('tagged photos in Recent surveys', () => {
  it('counts photos with a room or a tag, leaving out removed photos', () => {
    const { tag } = findOrCreateTag(db, 'Island', 1, 10)
    setRoom(db, [photos[0]!], 'Kitchen')
    addPhotoTag(db, photos[1]!, tag.id, 2, 0)
    // A removed photo with a room and a tag doesn't count, on either side of the fraction.
    setRoom(db, [photos[2]!], 'Pool')
    addPhotoTag(db, photos[2]!, tag.id, 1, 0)
    db.prepare('UPDATE photos SET deleted_at = 5 WHERE id = ?').run(photos[2])
    // A mark or a note alone is not "tagged".
    recordPhotos(db, listingId, [{ file_name: 'image_4.jpg', source_url: 'd' }])
    const fourth = (
      db.prepare("SELECT id FROM photos WHERE file_name = 'image_4.jpg'").get() as {
        id: number
      }
    ).id
    savePhotoNote(db, fourth, 1, { mark: 'must' }, 0)
    expect(listRecentListings(db)[0]).toMatchObject({ photos_on_disk: 3, tagged_photos: 2 })
  })
})
