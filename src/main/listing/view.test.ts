import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DB } from '../db'
import { recordPhotos, upsertListing } from '../db/listings'
import { saveListingNote } from '../db/notes'
import { addPhotoTag, findOrCreateTag, savePhotoNote, setRoom } from '../db/tagging'
import { EMPTY_DETAILS } from '../scrapers/types'
import { loadListingView } from './view'

let root: string
let db: DB
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'planboard view '))
  mkdirSync(join(root, 'listings', 'Hill Crest_P24-1'), { recursive: true })
  db = openDatabase(join(root, 'planboard.db'))
})
afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

describe('loadListingView', () => {
  it('returns the fields, photos still in the folder, notes and the file state', async () => {
    const id = upsertListing(db, {
      ...EMPTY_DETAILS,
      price: 'R 1',
      bedrooms: 3,
      site: 'p24',
      external_id: '1',
      url: 'https://www.property24.com/for-sale/a/b/c/1/1',
      folder_path: 'listings/Hill Crest_P24-1',
      photo_count_expected: 3,
      surveyed_at: 50,
      created_at: 10
    })
    recordPhotos(db, id, [
      { file_name: 'image_1.jpg', source_url: 'a' },
      { file_name: 'image_2.jpg', source_url: 'b' }
    ])
    db.prepare("UPDATE photos SET deleted_at = 1 WHERE file_name = 'image_1.jpg'").run()
    saveListingNote(db, id, 2, 'Light', 99)
    const kept = (
      db.prepare("SELECT id FROM photos WHERE file_name = 'image_2.jpg'").get() as {
        id: number
      }
    ).id
    setRoom(db, [kept], 'Kitchen')
    const { tag } = findOrCreateTag(db, 'Island', 1, 5)
    addPhotoTag(db, kept, tag.id, 1, 5)
    savePhotoNote(db, kept, 2, { mark: 'must' }, 6)
    writeFileSync(join(root, 'listings', 'Hill Crest_P24-1', 'Property_Details.txt'), 'mine')

    const view = await loadListingView(db, root, id)
    expect(view).toMatchObject({
      id,
      site: 'p24',
      siteName: 'Property24',
      folderName: 'Hill Crest_P24-1',
      fields: { price: 'R 1', bedrooms: 3, title: null },
      photosExpected: 3,
      createdAt: 10,
      surveyedAt: 50,
      detailsFile: 'edited',
      notes: [{ personId: 2, text: 'Light', updatedAt: 99 }]
    })
    expect(view!.photos).toEqual([
      {
        id: expect.any(Number),
        fileName: 'image_2.jpg',
        url: 'planboard-media://library/listings/Hill%20Crest_P24-1/image_2.jpg',
        room: 'Kitchen',
        tags: [{ tagId: tag.id, name: 'Island', personIds: [1] }],
        notes: [{ personId: 2, likes: null, why: null, mark: 'must', updatedAt: 6 }]
      }
    ])
  })

  it('is null for an unknown listing', async () => {
    expect(await loadListingView(db, root, 5)).toBeNull()
  })
})
