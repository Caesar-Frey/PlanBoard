/** Editing the listing details: validate → db transaction → regenerate Property_Details.txt. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_FIELDS_INPUT, type ListingFieldsInput } from '../../shared/listingFields'
import { detailsFileState, formatPropertyDetails } from '../capture/details'
import { openDatabase, type DB } from '../db'
import { getListing, recordPhotos, upsertListing } from '../db/listings'
import { EMPTY_DETAILS } from '../scrapers/types'
import {
  parseSurveyFacts,
  readDetailsFileState,
  regenerateDetailsFile,
  saveListingDetails,
  type DetailsFileDeps
} from './details'

const FOLDER = 'Stonehenge_PP-T5'
const URL_PP = 'https://www.privateproperty.co.za/for-sale/a/b/c/stonehenge/T5'
// 8 November 2026, 10:00 UTC: the day the listing was surveyed.
const SURVEYED = Date.UTC(2026, 10, 8, 10)
// 20 November 2026: the day the user edits the details.
const TODAY = Date.UTC(2026, 10, 20, 10)

let root: string
let db: DB
let listingId: number
let deps: DetailsFileDeps
const detailsPath = (): string => join(root, 'listings', FOLDER, 'Property_Details.txt')
const readDetails = (): string => readFileSync(detailsPath(), 'utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'planboard details '))
  mkdirSync(join(root, 'listings', FOLDER), { recursive: true })
  db = openDatabase(join(root, 'planboard.db'))
  listingId = upsertListing(db, {
    ...EMPTY_DETAILS,
    title: '4 Bedroom House',
    price: 'R 4 200 000',
    suburb: 'Stonehenge',
    bedrooms: 4,
    site: 'pp',
    external_id: 'T5',
    url: URL_PP,
    folder_path: `listings/${FOLDER}`,
    photo_count_expected: 3,
    photo_count_listed: 4,
    photo_duplicates: 1,
    surveyed_at: SURVEYED,
    created_at: SURVEYED
  })
  recordPhotos(db, listingId, [
    { file_name: 'image_01_a.jpg', source_url: 'u1' },
    { file_name: 'image_02_b.jpg', source_url: 'u2' },
    { file_name: 'image_03_c.jpg', source_url: 'u3' }
  ])
  deps = { db, libraryRoot: root, now: () => TODAY }
})
afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

/** What the capture flow wrote on the survey day. */
function writeCaptureFile(onDisk = 3): string {
  const text = formatPropertyDetails({
    site: 'pp',
    externalId: 'T5',
    url: URL_PP,
    details: { ...EMPTY_DETAILS, title: '4 Bedroom House', price: 'R 4 200 000' },
    counts: { found: 3, listed: 4, duplicates: 1, expected: 3, onDisk },
    surveyedAt: new Date(SURVEYED)
  })
  writeFileSync(detailsPath(), text)
  return text
}

const form = (over: Partial<ListingFieldsInput> = {}): ListingFieldsInput => ({
  ...EMPTY_FIELDS_INPUT,
  title: '4 Bedroom House',
  price: 'R 4 200 000',
  suburb: 'Stonehenge',
  bedrooms: '4',
  ...over
})

describe('saveListingDetails', () => {
  it('updates the db and regenerates the file with a fresh checksum', async () => {
    writeCaptureFile()
    const r = await saveListingDetails(
      deps,
      listingId,
      form({ price: 'R 3 999 000', bathrooms: '2.5', agent: 'Thandi' }),
      'ask'
    )
    expect(r).toEqual({ status: 'saved', detailsFile: 'written', warning: null })
    expect(getListing(db, listingId)).toMatchObject({
      price: 'R 3 999 000',
      bathrooms: 2.5,
      agent: 'Thandi',
      title: '4 Bedroom House'
    })
    const text = readDetails()
    expect(text).toMatch(/^Price:\s+R 3 999 000$/m)
    expect(text).toMatch(/^Bathrooms:\s+2\.5$/m)
    expect(text).toMatch(/^Agent:\s+Thandi$/m)
    // Same format as capture: photo facts and the survey date are kept, the footer is new.
    expect(text).toMatch(
      /^Photos:\s+3 in this folder · listing shows 4 \(1 photo appears twice\)$/m
    )
    expect(text).toMatch(/^Date surveyed:\s+8 November 2026$/m)
    expect(text).toContain('Written by PlanBoard on 20 November 2026')
    expect(detailsFileState(text)).toBe('ours')
  })

  it('rejects invalid numbers without touching the db or the file', async () => {
    const before = writeCaptureFile()
    const r = await saveListingDetails(deps, listingId, form({ bedrooms: '3.5' }), 'ask')
    expect(r.status).toBe('invalid')
    if (r.status === 'invalid') expect(Object.keys(r.errors)).toEqual(['bedrooms'])
    expect(getListing(db, listingId)!.bedrooms).toBe(4)
    expect(readDetails()).toBe(before)
  })

  it('asks before overwriting a file edited outside the app, and changes nothing', async () => {
    writeFileSync(detailsPath(), `${writeCaptureFile()}\nOur own note at the bottom\n`)
    const before = readDetails()
    const r = await saveListingDetails(deps, listingId, form({ price: 'R 1' }), 'ask')
    expect(r).toEqual({ status: 'file-edited' })
    expect(getListing(db, listingId)!.price).toBe('R 4 200 000')
    expect(readDetails()).toBe(before)
  })

  it('keeps the hand-edited file when asked, but still saves to the library', async () => {
    writeFileSync(detailsPath(), 'Hand written')
    const r = await saveListingDetails(deps, listingId, form({ price: 'R 1' }), 'keep')
    expect(r).toEqual({ status: 'saved', detailsFile: 'kept-edited', warning: null })
    expect(getListing(db, listingId)!.price).toBe('R 1')
    expect(readDetails()).toBe('Hand written')
  })

  it('overwrites the hand-edited file when the user chooses to', async () => {
    writeFileSync(detailsPath(), 'Hand written')
    const r = await saveListingDetails(deps, listingId, form({ price: 'R 1' }), 'overwrite')
    expect(r).toMatchObject({ status: 'saved', detailsFile: 'written' })
    expect(readDetails()).toMatch(/^Price:\s+R 1$/m)
    expect(detailsFileState(readDetails())).toBe('ours')
  })

  it('writes the file when it is missing', async () => {
    const r = await saveListingDetails(deps, listingId, form(), 'ask')
    expect(r).toMatchObject({ status: 'saved', detailsFile: 'written' })
    expect(readDetails()).toContain('4 Bedroom House')
  })

  it('reports a listing that is gone', async () => {
    expect(await saveListingDetails(deps, 999, form(), 'ask')).toEqual({ status: 'not-found' })
  })

  it('saves to the db and warns when the file cannot be written', async () => {
    rmSync(join(root, 'listings', FOLDER), { recursive: true })
    writeFileSync(join(root, 'listings', FOLDER), 'not a folder')
    const r = await saveListingDetails(deps, listingId, form({ price: 'R 7' }), 'ask')
    expect(r).toMatchObject({ status: 'saved', detailsFile: 'not-written' })
    if (r.status === 'saved') expect(r.warning).toMatch(/Property_Details\.txt/)
    expect(getListing(db, listingId)!.price).toBe('R 7')
  })
})

describe('regenerateDetailsFile', () => {
  it('counts only photos still in the folder after some were removed', async () => {
    writeCaptureFile()
    db.prepare("UPDATE photos SET deleted_at = 1 WHERE file_name = 'image_01_a.jpg'").run()
    expect(await regenerateDetailsFile(deps, listingId, 'if-ours')).toBe('written')
    expect(readDetails()).toMatch(/^Photos:\s+2 in this folder · listing shows 4/m)
  })

  it('leaves a hand-edited file alone', async () => {
    writeFileSync(detailsPath(), 'Hand written')
    expect(await regenerateDetailsFile(deps, listingId, 'if-ours')).toBe('kept-edited')
    expect(readDetails()).toBe('Hand written')
  })

  it('for a library from before the survey facts were stored, reads them from the file', async () => {
    db.prepare(
      'UPDATE listings SET photo_count_listed = NULL, photo_duplicates = NULL, surveyed_at = NULL, created_at = ? WHERE id = ?'
    ).run(Date.UTC(2026, 0, 1), listingId)
    writeCaptureFile()
    await regenerateDetailsFile(deps, listingId, 'if-ours')
    const text = readDetails()
    expect(text).toMatch(/listing shows 4 \(1 photo appears twice\)$/m)
    expect(text).toMatch(/^Date surveyed:\s+8 November 2026$/m)
  })
})

describe('readDetailsFileState', () => {
  it('tells the listing view whether the file was edited by hand', async () => {
    expect(await readDetailsFileState(root, `listings/${FOLDER}`)).toBe('missing')
    writeCaptureFile()
    expect(await readDetailsFileState(root, `listings/${FOLDER}`)).toBe('ours')
    writeFileSync(detailsPath(), 'Hand written')
    expect(await readDetailsFileState(root, `listings/${FOLDER}`)).toBe('edited')
    expect(await readDetailsFileState(root, '../outside')).toBe('missing')
  })
})

describe('parseSurveyFacts', () => {
  it('reads the listed count, duplicates and survey date from a file we wrote', () => {
    expect(parseSurveyFacts(writeCaptureFile())).toEqual({
      listed: 4,
      duplicates: 1,
      surveyedAt: expect.any(Number)
    })
    const facts = parseSurveyFacts(writeCaptureFile())
    expect(new Date(facts.surveyedAt!).getDate()).toBe(8)
  })

  it('copes with a file without those lines', () => {
    expect(parseSurveyFacts('Hello')).toEqual({ listed: null, duplicates: null, surveyedAt: null })
  })
})
