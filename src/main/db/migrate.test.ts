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

describe('migrations', () => {
  it('is at version 2 with the survey-fact columns on a new library', () => {
    expect(SCHEMA_VERSION).toBe(2)
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    expect(columns(db, 'listings')).toEqual(
      expect.arrayContaining(['photo_count_listed', 'photo_duplicates', 'surveyed_at'])
    )
    db.close()
  })

  it('steps a version 1 library up to 2 and keeps its data', () => {
    makeV1Library()
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(2)
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
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    expect(columns(db, 'listings').filter((c) => c === 'surveyed_at')).toHaveLength(1)
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

  it('never lowers the version of a library made by a newer PlanBoard', () => {
    const newer = new Database(file)
    newer.pragma('user_version = 7')
    newer.close()
    const db = openDatabase(file)
    expect(db.pragma('user_version', { simple: true })).toBe(7)
    db.close()
  })
})
