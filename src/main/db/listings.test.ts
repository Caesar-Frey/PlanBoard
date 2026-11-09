/** Listing and photo queries against real better-sqlite3 and the real schema. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_DETAILS } from '../scrapers/types'
import { openDatabase, type DB } from './index'
import {
  countPhotos,
  findListing,
  getListing,
  listRecentListings,
  recordPhotos,
  listListingPhotos,
  removedFileNames,
  updateListingDetails,
  upsertListing,
  type ListingRecord
} from './listings'

let db: DB
beforeEach(() => {
  db = openDatabase(':memory:')
})
afterEach(() => {
  db.close()
})

const record = (over: Partial<ListingRecord> = {}): ListingRecord => ({
  ...EMPTY_DETAILS,
  site: 'p24',
  external_id: '115212892',
  url: 'https://www.property24.com/for-sale/a/b/c/1/115212892',
  title: 'House',
  price: 'R 1',
  suburb: 'Hillcrest',
  folder_path: 'listings/Hillcrest_P24-115212892',
  photo_count_expected: 63,
  created_at: 1000,
  ...over
})

describe('upsertListing', () => {
  it('inserts a new listing and returns its id', () => {
    const id = upsertListing(db, record())
    expect(id).toBeGreaterThan(0)
    expect(getListing(db, id)).toMatchObject({
      site: 'p24',
      external_id: '115212892',
      price: 'R 1'
    })
  })

  it('re-run keeps the id and the first-surveyed date, and refreshes survey facts', () => {
    const id = upsertListing(db, record({ photo_count_listed: 64, photo_duplicates: 1 }))
    const again = upsertListing(
      db,
      record({ created_at: 9999, photo_count_expected: 70, surveyed_at: 9999 })
    )
    expect(again).toBe(id)
    const row = findListing(db, 'p24', '115212892')!
    expect(row).toMatchObject({
      id,
      created_at: 1000,
      surveyed_at: 9999,
      photo_count_expected: 70,
      // Not stated this time: keep what the earlier survey found.
      photo_count_listed: 64,
      photo_duplicates: 1
    })
    expect(db.prepare('SELECT COUNT(*) AS n FROM listings').get()).toEqual({ n: 1 })
  })

  it('re-run only fills fields that are empty; it never overwrites a value', () => {
    const id = upsertListing(
      db,
      record({ price: 'R 1', suburb: 'Hillcrest', bedrooms: 3, city: null, agent: '  ' })
    )
    upsertListing(
      db,
      record({
        price: 'R 2',
        suburb: 'Elsewhere',
        bedrooms: 4,
        bathrooms: 2.5,
        city: 'Durban',
        agent: 'Sam Agent',
        title: null
      })
    )
    expect(getListing(db, id)).toMatchObject({
      price: 'R 1',
      suburb: 'Hillcrest',
      bedrooms: 3,
      title: 'House',
      // Empty before, so the re-survey fills them in.
      bathrooms: 2.5,
      city: 'Durban',
      agent: 'Sam Agent'
    })
  })

  it('a value the user cleared is filled again by a re-survey', () => {
    const id = upsertListing(db, record({ price: 'R 1' }))
    updateListingDetails(db, id, { ...EMPTY_DETAILS, title: 'Mine' })
    upsertListing(db, record({ price: 'R 2', title: 'Theirs' }))
    expect(getListing(db, id)).toMatchObject({ title: 'Mine', price: 'R 2' })
  })

  it('"Survey again" fills the new contact and bond fields of an older listing', () => {
    const id = upsertListing(db, record({ agent: 'Agent Name' }))
    upsertListing(
      db,
      record({
        agent: 'Someone Else',
        agency_phone: '031 000 0000',
        bond_interest_rate: '10.75%',
        bond_term_years: 20,
        bond_monthly_repayment: 'R 59 898',
        bond_as_of: 5000
      })
    )
    expect(getListing(db, id)).toMatchObject({
      agent: 'Agent Name',
      agency_phone: '031 000 0000',
      bond_interest_rate: '10.75%',
      bond_term_years: 20,
      bond_monthly_repayment: 'R 59 898',
      bond_as_of: 5000
    })
  })

  it('keeps the bond date of figures it keeps; a later survey only dates figures it fills', () => {
    const id = upsertListing(
      db,
      record({ bond_interest_rate: '10.75%', bond_monthly_repayment: 'R 1', bond_as_of: 5000 })
    )
    upsertListing(db, record({ bond_interest_rate: '11%', bond_as_of: 9000 }))
    expect(getListing(db, id)).toMatchObject({ bond_interest_rate: '10.75%', bond_as_of: 5000 })

    // All bond figures cleared by hand: the next survey's figures come with its own date.
    updateListingDetails(db, id, { ...EMPTY_DETAILS, title: 'House' })
    upsertListing(db, record({ bond_interest_rate: '11%', bond_as_of: 9000 }))
    expect(getListing(db, id)).toMatchObject({ bond_interest_rate: '11%', bond_as_of: 9000 })

    // A survey that found no figures leaves the date alone.
    upsertListing(db, record({ bond_as_of: null }))
    expect(getListing(db, id)?.bond_as_of).toBe(9000)
  })

  it('keeps the same external id on two sites apart', () => {
    const a = upsertListing(db, record())
    const b = upsertListing(db, record({ site: 'pp' }))
    expect(a).not.toBe(b)
  })
})

describe('recordPhotos', () => {
  it('inserts new photos and ignores ones already recorded', () => {
    const id = upsertListing(db, record())
    const photos = [
      { file_name: 'image_1.jpg', source_url: 'https://images.prop24.com/1' },
      { file_name: 'image_2.jpg', source_url: 'https://images.prop24.com/2' }
    ]
    expect(recordPhotos(db, id, photos)).toBe(2)
    expect(
      recordPhotos(db, id, [
        ...photos,
        { file_name: 'image_3.jpg', source_url: 'https://images.prop24.com/3' }
      ])
    ).toBe(1)
    expect(countPhotos(db, id)).toBe(3)
  })

  it('never clears a room or a removal the user made', () => {
    const id = upsertListing(db, record())
    recordPhotos(db, id, [{ file_name: 'image_1.jpg', source_url: 'u1' }])
    db.prepare(
      "UPDATE photos SET room = 'Kitchen', deleted_at = 5 WHERE file_name = 'image_1.jpg'"
    ).run()
    recordPhotos(db, id, [{ file_name: 'image_1.jpg', source_url: 'u1-new' }])
    expect(db.prepare('SELECT room, deleted_at, source_url FROM photos').get()).toEqual({
      room: 'Kitchen',
      deleted_at: 5,
      source_url: 'u1-new'
    })
    expect(removedFileNames(db, id)).toEqual(new Set(['image_1.jpg']))
    expect(countPhotos(db, id)).toBe(0)
  })

  it('rolls back the whole batch on error', () => {
    const id = upsertListing(db, record())
    expect(() =>
      recordPhotos(db, id, [
        { file_name: 'image_1.jpg', source_url: 'u1' },
        { file_name: 'image_2.jpg', source_url: null as unknown as string }
      ])
    ).toThrow()
    expect(countPhotos(db, id)).toBe(0)
  })
})

describe('listRecentListings', () => {
  it('lists newest first with photo counts, tagged count and the first photo', () => {
    const older = upsertListing(db, record({ created_at: 1 }))
    const newer = upsertListing(
      db,
      record({ site: 'pp', external_id: 'T5', created_at: 2, suburb: 'Stonehenge' })
    )
    recordPhotos(db, older, [
      { file_name: 'image_9.jpg', source_url: 'a' },
      { file_name: 'image_1.jpg', source_url: 'b' },
      { file_name: 'image_5.jpg', source_url: 'c' },
      { file_name: 'image_7.jpg', source_url: 'd' }
    ])
    db.prepare("UPDATE photos SET room = 'Kitchen' WHERE file_name = 'image_1.jpg'").run()
    db.prepare("INSERT INTO tags(name, created_by, created_at) VALUES ('Island', 1, 0)").run()
    db.prepare(
      "INSERT INTO photo_tags(photo_id, tag_id, person_id, created_at) SELECT id, 1, 1, 0 FROM photos WHERE file_name = 'image_5.jpg'"
    ).run()
    db.prepare("UPDATE photos SET deleted_at = 1 WHERE file_name = 'image_7.jpg'").run()

    const rows = listRecentListings(db)
    expect(rows.map((r) => r.id)).toEqual([newer, older])
    expect(rows[0]).toMatchObject({ photos_on_disk: 0, tagged_photos: 0, first_photo: null })
    expect(rows[1]).toMatchObject({
      suburb: 'Hillcrest',
      photos_on_disk: 3,
      tagged_photos: 2,
      first_photo: 'image_9.jpg'
    })
  })
})

describe('updateListingDetails', () => {
  it('replaces every detail field and nothing else', () => {
    const id = upsertListing(db, record({ price: 'R 1', bedrooms: 3 }))
    updateListingDetails(db, id, {
      ...EMPTY_DETAILS,
      title: 'Edited',
      price: null,
      bedrooms: 5,
      description: 'Ours'
    })
    expect(getListing(db, id)).toMatchObject({
      title: 'Edited',
      price: null,
      bedrooms: 5,
      suburb: null,
      description: 'Ours',
      folder_path: 'listings/Hillcrest_P24-115212892',
      photo_count_expected: 63
    })
  })

  it('throws for an unknown listing', () => {
    expect(() => updateListingDetails(db, 99, EMPTY_DETAILS)).toThrow()
  })
})

describe('listListingPhotos', () => {
  it('lists the photos still in the folder, in the order they were recorded', () => {
    const id = upsertListing(db, record())
    recordPhotos(db, id, [
      { file_name: 'image_9.jpg', source_url: 'a' },
      { file_name: 'image_1.jpg', source_url: 'b' },
      { file_name: 'image_5.jpg', source_url: 'c' }
    ])
    db.prepare("UPDATE photos SET deleted_at = 1 WHERE file_name = 'image_1.jpg'").run()
    db.prepare("UPDATE photos SET room = 'Kitchen' WHERE file_name = 'image_5.jpg'").run()
    expect(listListingPhotos(db, id).map((p) => [p.file_name, p.room])).toEqual([
      ['image_9.jpg', null],
      ['image_5.jpg', 'Kitchen']
    ])
  })
})
