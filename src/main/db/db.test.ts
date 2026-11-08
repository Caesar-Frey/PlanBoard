/**
 * Runs the real schema against real better-sqlite3 under system Node.
 * better-sqlite3 v13 is a Node-API addon, so the same prebuilt binary loads in
 * both Node (Vitest) and Electron: no ABI rebuild dance needed.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, SCHEMA_VERSION } from './index'
import { listPeople, updatePerson } from './queries'

const EXPECTED_TABLES = [
  'listing_notes',
  'listings',
  'people',
  'photo_notes',
  'photo_tags',
  'photos',
  'tags'
]

function tableNames(db: Database.Database): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[]
  ).map((r) => r.name)
}

describe('openDatabase', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'planboard db '))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates every table from the brief', () => {
    const db = openDatabase(join(dir, 'planboard.db'))
    expect(tableNames(db)).toEqual(EXPECTED_TABLES)
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })

  it('is idempotent: re-opening keeps data and does not duplicate people', () => {
    const file = join(dir, 'planboard.db')
    const first = openDatabase(file)
    expect(listPeople(first)).toHaveLength(2)
    updatePerson(first, { id: 1, name: 'Sam', colour: '#123456' })
    first.close()

    const second = openDatabase(file)
    expect(tableNames(second)).toEqual(EXPECTED_TABLES)
    const people = listPeople(second)
    expect(people).toHaveLength(2)
    expect(people[0]).toEqual({ id: 1, name: 'Sam', colour: '#123456' })
    second.close()
  })

  it('enforces tag-name uniqueness case-insensitively', () => {
    const db = openDatabase(join(dir, 'planboard.db'))
    db.prepare("INSERT INTO tags(name, created_by, created_at) VALUES ('Island', 1, 0)").run()
    expect(() =>
      db.prepare("INSERT INTO tags(name, created_by, created_at) VALUES ('island', 1, 0)").run()
    ).toThrow(/UNIQUE/)
    db.close()
  })

  it('enforces the photo_notes mark check', () => {
    const db = openDatabase(join(dir, 'planboard.db'))
    db.prepare(
      "INSERT INTO listings(site, external_id, url, folder_path, created_at) VALUES ('p24', '1', 'u', 'f', 0)"
    ).run()
    db.prepare(
      "INSERT INTO photos(listing_id, file_name, source_url) VALUES (1, 'a.jpg', 'u')"
    ).run()
    const insert = db.prepare(
      'INSERT INTO photo_notes(photo_id, person_id, mark, updated_at) VALUES (1, ?, ?, 0)'
    )
    expect(() => insert.run(1, 'must')).not.toThrow()
    expect(() => insert.run(2, 'love')).toThrow(/CHECK/)
    db.close()
  })
})

describe('updatePerson', () => {
  it('throws for an unknown id', () => {
    const db = openDatabase(':memory:')
    expect(() => updatePerson(db, { id: 99, name: 'X', colour: '#000000' })).toThrow()
    db.close()
  })
})
