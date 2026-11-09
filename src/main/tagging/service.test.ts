/** Tagging requests from the renderer: shape checks, the room list and the "Tagging as" rule. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../db'
import { recordPhotos, upsertListing } from '../db/listings'
import { EMPTY_DETAILS } from '../scrapers/types'
import {
  addPhotoTagRequest,
  listTags,
  mergeTagsRequest,
  removePhotoTagRequest,
  renameTagRequest,
  savePhotoNoteRequest,
  setPhotoRoomRequest,
  type TaggingContext
} from './service'

let db: DB
let ctx: TaggingContext
let photos: number[]

beforeEach(() => {
  db = openDatabase(':memory:')
  const listingId = upsertListing(db, {
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
    { file_name: 'image_2.jpg', source_url: 'b' }
  ])
  photos = (db.prepare('SELECT id FROM photos ORDER BY id').all() as { id: number }[]).map(
    (r) => r.id
  )
  ctx = { db, currentPersonId: 1, now: () => 100 }
})
afterEach(() => {
  db.close()
})

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`)
  return r.value
}

describe('setPhotoRoomRequest', () => {
  it('sets a room from the fixed list on one or several photos', () => {
    const value = ok(setPhotoRoomRequest(ctx, { photoIds: photos, room: 'Braai area' }))
    expect(value.map((p) => [p.photoId, p.room])).toEqual([
      [photos[0], 'Braai area'],
      [photos[1], 'Braai area']
    ])
    expect(ok(setPhotoRoomRequest(ctx, { photoIds: [photos[0]], room: null }))[0]?.room).toBeNull()
  })

  it('refuses a room that is not on the list, and malformed requests', () => {
    for (const room of ['Attic', 'kitchen', '', 3]) {
      expect(setPhotoRoomRequest(ctx, { photoIds: photos, room })).toEqual({
        ok: false,
        error: 'Invalid request'
      })
    }
    expect(setPhotoRoomRequest(ctx, { photoIds: [], room: 'Kitchen' }).ok).toBe(false)
    expect(setPhotoRoomRequest(ctx, { photoIds: ['1'], room: 'Kitchen' }).ok).toBe(false)
    expect(setPhotoRoomRequest(ctx, null).ok).toBe(false)
  })

  it('refuses a removed photo', () => {
    db.prepare('UPDATE photos SET deleted_at = 1 WHERE id = ?').run(photos[1])
    const r = setPhotoRoomRequest(ctx, { photoIds: photos, room: 'Kitchen' })
    expect(r.ok).toBe(false)
  })
})

describe('tags through the service', () => {
  it('adds a tag as the person tagging, reusing an equivalent one', () => {
    const first = ok(addPhotoTagRequest(ctx, { photoId: photos[0], personId: 1, name: 'island' }))
    expect(first.created).toBe(true)
    expect(first.tag).toMatchObject({ name: 'Island', photoCount: 1 })
    expect(first.photo.tags).toEqual([{ tagId: first.tag.id, name: 'Island', personIds: [1] }])

    const again = ok(addPhotoTagRequest(ctx, { photoId: photos[1], personId: 1, name: 'Islands' }))
    expect(again.created).toBe(false)
    expect(again.tag).toMatchObject({ id: first.tag.id, photoCount: 2 })
    expect(ok(listTags(ctx))).toHaveLength(1)
  })

  it('refuses to tag for the other person, and blank names', () => {
    expect(addPhotoTagRequest(ctx, { photoId: photos[0], personId: 2, name: 'Island' })).toEqual({
      ok: false,
      error: expect.stringMatching(/Tagging as/)
    })
    expect(addPhotoTagRequest(ctx, { photoId: photos[0], personId: 1, name: '  ' }).ok).toBe(false)
    expect(ok(listTags(ctx))).toEqual([])
  })

  it('removes only the current person’s tag', () => {
    const { tag } = ok(addPhotoTagRequest(ctx, { photoId: photos[0], personId: 1, name: 'Island' }))
    const other = { ...ctx, currentPersonId: 2 }
    ok(addPhotoTagRequest(other, { photoId: photos[0], personId: 2, name: 'Island' }))
    expect(removePhotoTagRequest(ctx, { photoId: photos[0], personId: 2, tagId: tag.id }).ok).toBe(
      false
    )
    const after = ok(removePhotoTagRequest(ctx, { photoId: photos[0], personId: 1, tagId: tag.id }))
    expect(after.tags).toEqual([{ tagId: tag.id, name: 'Island', personIds: [2] }])
  })

  it('renames, reports a clash, and merges', () => {
    const a = ok(addPhotoTagRequest(ctx, { photoId: photos[0], personId: 1, name: 'Island' })).tag
    const b = ok(
      addPhotoTagRequest(ctx, { photoId: photos[1], personId: 1, name: 'Kitchen island' })
    ).tag
    expect(ok(renameTagRequest(ctx, { tagId: b.id, name: ' island ' }))).toMatchObject({
      status: 'exists',
      existing: { id: a.id }
    })
    expect(renameTagRequest(ctx, { tagId: b.id, name: '' }).ok).toBe(false)
    expect(renameTagRequest(ctx, { tagId: 999, name: 'X' }).ok).toBe(false)
    expect(ok(mergeTagsRequest(ctx, { fromTagId: b.id, intoTagId: a.id }))).toMatchObject({
      into: { id: a.id, name: 'Island', photoCount: 2 },
      moved: 1,
      duplicates: 0
    })
    expect(mergeTagsRequest(ctx, { fromTagId: a.id, intoTagId: a.id }).ok).toBe(false)
  })
})

describe('savePhotoNoteRequest', () => {
  it('saves the current person’s mark and notes', () => {
    const note = ok(
      savePhotoNoteRequest(ctx, { photoId: photos[0], personId: 1, likes: 'Light', mark: 'nice' })
    )
    expect(note).toEqual({ personId: 1, likes: 'Light', why: null, mark: 'nice', updatedAt: 100 })
    expect(
      ok(savePhotoNoteRequest(ctx, { photoId: photos[0], personId: 1, mark: null })).mark
    ).toBeNull()
  })

  it('refuses to edit the other person’s note', () => {
    const r = savePhotoNoteRequest(ctx, { photoId: photos[0], personId: 2, likes: 'Mine now' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Tagging as/) })
    const nobody = { ...ctx, currentPersonId: null }
    expect(savePhotoNoteRequest(nobody, { photoId: photos[0], personId: 1, likes: 'x' }).ok).toBe(
      false
    )
    expect(db.prepare('SELECT COUNT(*) AS n FROM photo_notes').get()).toEqual({ n: 0 })
  })

  it('refuses a mark outside must / nice / maybe and over-long text', () => {
    expect(savePhotoNoteRequest(ctx, { photoId: photos[0], personId: 1, mark: 'love' }).ok).toBe(
      false
    )
    expect(
      savePhotoNoteRequest(ctx, { photoId: photos[0], personId: 1, why: 'x'.repeat(10_001) }).ok
    ).toBe(false)
    expect(savePhotoNoteRequest(ctx, { photoId: photos[0], personId: 1 }).ok).toBe(false)
  })
})
