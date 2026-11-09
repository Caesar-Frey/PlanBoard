/** Step-up migrations on PRAGMA user_version, against real better-sqlite3 files. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, SCHEMA_VERSION } from './index'

/** The milestone 1–3 `listings` table, exactly as version 1 libraries have it on disk. */
const V1_LISTINGS = `
CREATE TABLE listings (
  id INTEGER PRIMARY KEY, site TEXT NOT NULL CHECK (site IN ('p24', 'pp')),
  external_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT, price TEXT, suburb TEXT, city TEXT,
  bedrooms REAL, bathrooms REAL, garages REAL, erf_size TEXT, floor_size TEXT, levies TEXT,
  rates TEXT, description TEXT, agent TEXT, agency TEXT, folder_path TEXT NOT NULL,
  photo_count_expected INTEGER, created_at INTEGER NOT NULL, UNIQUE (site, external_id)
);`

const columns = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'planboard migrate '))
  file = join(dir, 'planboard.db')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function makeV1Library(): void {
  const old = new Database(file)
  old.exec(V1_LISTINGS)
  old
    .prepare(
      `INSERT INTO listings (site, external_id, url, price, folder_path, photo_count_expected, created_at)
       VALUES ('p24', '1', 'https://www.property24.com/for-sale/a/b/c/1/1', 'R 1', 'listings/A_P24-1', 63, 5)`
    )
    .run()
  old.pragma('user_version = 1')
  old.close()
}

const V3_COLUMNS = [
  'photo_count_listed',
  'photo_duplicates',
  'surveyed_at',
  'agent_phone',
  'agent_email',
  'agency_phone',
  'agency_email',
  'bond_interest_rate',
  'bond_term_years',
  'bond_deposit',
  'bond_monthly_repayment',
  'bond_once_off_costs',
  'bond_min_income',
  'bond_total_interest',
  'bond_total_repayment',
  'bond_as_of'
]

/** A version 2 library: the v1 table plus the survey facts, with two listings. */
function makeV2Library(): void {
  const old = new Database(file)
  old.exec(V1_LISTINGS)
  for (const col of ['photo_count_listed', 'photo_duplicates', 'surveyed_at']) {
    old.exec(`ALTER TABLE listings ADD COLUMN ${col} INTEGER`)
  }
  const insert = old.prepare(
    `INSERT INTO listings (site, external_id, url, title, description, folder_path, created_at, surveyed_at)
     VALUES (?, ?, ?, ?, ?, ?, 5, 7)`
  )
  insert.run(
    'pp',
    'T1',
    'https://www.privateproperty.co.za/for-sale/a/b/c/d/T1',
    "Owner''s pick",
    "Why you''ll love it:\n- Entertainer''s Dream\nA 'quoted' word and '' alone",
    'listings/D_PP-T1'
  )
  insert.run(
    'p24',
    '2',
    'https://www.property24.com/for-sale/a/b/c/1/2',
    'House',
    "It''s a P24 listing",
    'listings/A_P24-2'
  )
  old.pragma('user_version = 2')
  old.close()
}

describe('migrations', () => {
  it('is at version 3 with the survey-fact, contact and bond columns on a new library', () => {
    expect(SCHEMA_VERSION).toBe(3)
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(3)
    expect(columns(db, 'listings')).toEqual(expect.arrayContaining(V3_COLUMNS))
    expect(columns(db, 'listings')).toEqual(
      expect.arrayContaining(['photo_count_listed', 'photo_duplicates', 'surveyed_at'])
    )
    db.close()
  })

  it('steps a version 1 library up to 3 and keeps its data', () => {
    makeV1Library()
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(3)
    expect(columns(db, 'listings')).toEqual(expect.arrayContaining(V3_COLUMNS))
    expect(columns(db, 'listings')).toEqual(
      expect.arrayContaining(['photo_count_listed', 'photo_duplicates', 'surveyed_at'])
    )
    expect(db.prepare('SELECT * FROM listings').get()).toMatchObject({
      external_id: '1',
      price: 'R 1',
      photo_count_expected: 63,
      photo_count_listed: null,
      surveyed_at: null
    })
    // The other tables from the brief are created alongside.
    expect(columns(db, 'listing_notes')).toContain('why_saved')
    db.close()
  })

  it('is idempotent: opening a migrated library again changes nothing', () => {
    makeV1Library()
    openDatabase(file).close()
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(3)
    expect(columns(db, 'listings').filter((c) => c === 'surveyed_at')).toHaveLength(1)
    expect(columns(db, 'listings').filter((c) => c === 'agent_phone')).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM listings').get()).toEqual({ n: 1 })
    db.close()
  })

  it('adds a column that is missing even if user_version already claims 2', () => {
    const half = new Database(file)
    half.exec(V1_LISTINGS)
    half.pragma('user_version = 1')
    half.exec('ALTER TABLE listings ADD COLUMN surveyed_at INTEGER')
    half.close()
    const db = openDatabase(file)
    expect(columns(db, 'listings')).toEqual(
      expect.arrayContaining(['photo_count_listed', 'photo_duplicates', 'surveyed_at'])
    )
    db.close()
  })

  it('repairs Private Property descriptions with doubled apostrophes, once and safely', () => {
    makeV2Library()
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(3)
    const rows = db
      .prepare('SELECT external_id, title, description FROM listings ORDER BY id')
      .all() as { external_id: string; title: string; description: string }[]
    expect(rows).toEqual([
      {
        external_id: 'T1',
        // Only the description is repaired: titles could have been typed by hand.
        title: "Owner''s pick",
        description: "Why you'll love it:\n- Entertainer's Dream\nA 'quoted' word and '' alone"
      },
      // Property24 never had the artefact, so its text is left exactly as it was.
      { external_id: '2', title: 'House', description: "It''s a P24 listing" }
    ])
    db.close()
    // Opening again is harmless.
    const again = openDatabase(file)
    expect(
      (
        again.prepare("SELECT description FROM listings WHERE external_id = 'T1'").get() as {
          description: string
        }
      ).description
    ).toBe("Why you'll love it:\n- Entertainer's Dream\nA 'quoted' word and '' alone")
    // Text typed after the step up is never touched again.
    again
      .prepare("UPDATE listings SET description = 'Typed: it''''s' WHERE external_id = 'T1'")
      .run()
    again.close()
    const third = openDatabase(file)
    expect(
      third.prepare("SELECT description FROM listings WHERE external_id = 'T1'").get()
    ).toEqual({ description: "Typed: it''s" })
    third.close()
  })

  it('steps a version 2 library up to 3 and leaves the new columns empty', () => {
    makeV2Library()
    const db = openDatabase(file)
    expect(db.prepare("SELECT * FROM listings WHERE external_id = 'T1'").get()).toMatchObject({
      agent_phone: null,
      bond_interest_rate: null,
      bond_term_years: null,
      bond_as_of: null,
      surveyed_at: 7
    })
    db.close()
  })

  it('never lowers the version of a library made by a newer PlanBoard', () => {
    const newer = new Database(file)
    newer.pragma('user_version = 7')
    newer.close()
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(7)
    db.close()
  })
})
