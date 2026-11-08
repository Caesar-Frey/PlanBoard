import Database from 'better-sqlite3'
import schemaSql from './schema.sql?raw'
import { seedPeople } from './queries'

export const SCHEMA_VERSION = 1

export type DB = Database.Database

/**
 * Opens (or creates) planboard.db and applies the schema. Idempotent.
 * Journal mode stays at SQLite's default (DELETE) rather than WAL, so the
 * library folder is a single self-contained file that is safe to copy or sync.
 */
export function openDatabase(file: string): DB {
  const db = new Database(file)
  db.pragma('foreign_keys = ON')
  db.transaction(() => {
    db.exec(schemaSql)
    seedPeople(db)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
  })()
  return db
}
