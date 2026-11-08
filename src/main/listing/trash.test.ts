/** Untick → Move to Trash, with a fake `shell.trashItem`, a temp library and a real db. */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../db'
import { countPhotos, listRecentListings, recordPhotos, upsertListing } from '../db/listings'
import { EMPTY_DETAILS } from '../scrapers/types'
import { trashPhotos, type TrashDeps } from './trash'

const FOLDER = 'Hillcrest_P24-1'

let root: string
let trash: string
let db: DB
let listingId: number
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'planboard trash '))
  trash = join(root, 'fake-trash')
  mkdirSync(trash)
  mkdirSync(join(root, 'listings', FOLDER), { recursive: true })
  db = openDatabase(join(root, 'planboard.db'))
  listingId = upsertListing(db, {
    ...EMPTY_DETAILS,
    site: 'p24',
    external_id: '1',
    url: 'https://www.property24.com/for-sale/a/b/c/1/1',
    folder_path: `listings/${FOLDER}`,
    photo_count_expected: 4,
    created_at: 1
  })
  const names = ['image_1.jpg', 'image_2.jpg', 'image_3.jpg', 'image_4.jpg']
  for (const n of names) writeFileSync(join(root, 'listings', FOLDER, n), 'jpg')
  recordPhotos(
    db,
    listingId,
    names.map((n) => ({ file_name: n, source_url: `https://images.prop24.com/${n}` }))
  )
})
afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

const photoId = (name: string): number =>
  (db.prepare('SELECT id FROM photos WHERE file_name = ?').get(name) as { id: number }).id

const deletedAt = (name: string): number | null =>
  (
    db.prepare('SELECT deleted_at FROM photos WHERE file_name = ?').get(name) as {
      deleted_at: number | null
    }
  ).deleted_at

type FakeTrash = TrashDeps['trashItem'] & { calls: string[] }
function fakeTrash(fail: (path: string) => string | null = () => null): FakeTrash {
  const calls: string[] = []
  const fn = (async (path: string) => {
    calls.push(path)
    const reason = fail(path)
    if (reason) throw new Error(reason)
    renameSync(path, join(trash, basename(path)))
  }) as FakeTrash
  fn.calls = calls
  return fn
}

const deps = (trashItem: FakeTrash): TrashDeps => ({
  db,
  libraryRoot: root,
  trashItem,
  now: () => 4242
})

describe('trashPhotos', () => {
  it('moves the files to the Trash, sets deleted_at and drops the counts', async () => {
    const t = fakeTrash()
    const r = await trashPhotos(deps(t), listingId, [
      photoId('image_1.jpg'),
      photoId('image_3.jpg')
    ])
    expect(r).toEqual({
      trashed: [photoId('image_1.jpg'), photoId('image_3.jpg')],
      missing: [],
      failed: []
    })
    expect(t.calls).toEqual([
      join(root, 'listings', FOLDER, 'image_1.jpg'),
      join(root, 'listings', FOLDER, 'image_3.jpg')
    ])
    expect(readdirSync(trash).sort()).toEqual(['image_1.jpg', 'image_3.jpg'])
    expect(deletedAt('image_1.jpg')).toBe(4242)
    expect(deletedAt('image_2.jpg')).toBeNull()
    expect(countPhotos(db, listingId)).toBe(2)
    expect(listRecentListings(db)[0]!.photos_on_disk).toBe(2)
  })

  it('reports a file the Trash refused and leaves it in the library', async () => {
    const t = fakeTrash((p) => (p.endsWith('image_2.jpg') ? 'Permission denied' : null))
    const r = await trashPhotos(deps(t), listingId, [
      photoId('image_1.jpg'),
      photoId('image_2.jpg')
    ])
    expect(r.trashed).toEqual([photoId('image_1.jpg')])
    expect(r.failed).toEqual([
      { photoId: photoId('image_2.jpg'), fileName: 'image_2.jpg', reason: 'Permission denied' }
    ])
    expect(deletedAt('image_2.jpg')).toBeNull()
    expect(existsSync(join(root, 'listings', FOLDER, 'image_2.jpg'))).toBe(true)
    expect(countPhotos(db, listingId)).toBe(3)
  })

  it('marks a file that is already gone as removed without calling the Trash', async () => {
    rmSync(join(root, 'listings', FOLDER, 'image_4.jpg'))
    const t = fakeTrash()
    const r = await trashPhotos(deps(t), listingId, [photoId('image_4.jpg')])
    expect(r).toEqual({ trashed: [], missing: [photoId('image_4.jpg')], failed: [] })
    expect(t.calls).toEqual([])
    expect(deletedAt('image_4.jpg')).toBe(4242)
  })

  it('refuses a stored folder outside the library', async () => {
    db.prepare('UPDATE listings SET folder_path = ? WHERE id = ?').run('../../etc', listingId)
    const t = fakeTrash()
    const r = await trashPhotos(deps(t), listingId, [photoId('image_1.jpg')])
    expect(t.calls).toEqual([])
    expect(r.trashed).toEqual([])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0]!.reason).toMatch(/outside the library/i)
    expect(deletedAt('image_1.jpg')).toBeNull()
  })

  it('refuses a stored file name that would escape the listing folder', async () => {
    const outside = join(root, 'precious.jpg')
    writeFileSync(outside, 'x')
    db.prepare(
      "UPDATE photos SET file_name = '../../precious.jpg' WHERE file_name = 'image_1.jpg'"
    ).run()
    const id = photoId('../../precious.jpg')
    const t = fakeTrash()
    const r = await trashPhotos(deps(t), listingId, [id])
    expect(t.calls).toEqual([])
    expect(r.failed).toEqual([
      { photoId: id, fileName: '../../precious.jpg', reason: expect.stringMatching(/outside/i) }
    ])
    expect(existsSync(outside)).toBe(true)
  })

  it('refuses a photo whose file is a link to somewhere outside the library', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'planboard outside '))
    try {
      writeFileSync(join(outside, 'real.jpg'), 'x')
      const link = join(root, 'listings', FOLDER, 'image_2.jpg')
      rmSync(link)
      symlinkSync(join(outside, 'real.jpg'), link)
      const t = fakeTrash()
      const r = await trashPhotos(deps(t), listingId, [photoId('image_2.jpg')])
      expect(t.calls).toEqual([])
      expect(r.failed[0]!.reason).toMatch(/outside/i)
      expect(existsSync(join(outside, 'real.jpg'))).toBe(true)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('ignores photos of another listing, unknown ids and photos already removed', async () => {
    const otherId = upsertListing(db, {
      ...EMPTY_DETAILS,
      site: 'p24',
      external_id: '2',
      url: 'https://www.property24.com/for-sale/a/b/c/1/2',
      folder_path: 'listings/Other_P24-2',
      photo_count_expected: null,
      created_at: 2
    })
    recordPhotos(db, otherId, [{ file_name: 'image_9.jpg', source_url: 'u' }])
    db.prepare("UPDATE photos SET deleted_at = 1 WHERE file_name = 'image_3.jpg'").run()
    const t = fakeTrash()
    const r = await trashPhotos(deps(t), listingId, [
      photoId('image_9.jpg'),
      photoId('image_3.jpg'),
      99999
    ])
    expect(t.calls).toEqual([])
    expect(r.trashed).toEqual([])
    expect(r.failed.map((f) => f.photoId).sort((a, b) => a - b)).toEqual(
      [photoId('image_9.jpg'), 99999].sort((a, b) => a - b)
    )
    expect(deletedAt('image_3.jpg')).toBe(1)
  })
})
