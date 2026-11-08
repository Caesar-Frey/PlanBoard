import Database from 'better-sqlite3'
import { migrate } from './migrate'
import schemaSql from './schema.sql?raw'
import { seedPeople } from './queries'

export { SCHEMA_VERSION } from './migrate'

export type DB = Database.Database

/**
 * Opens (or creates) planboard.db, applies the schema and steps an older library up to the
 * current version (migrate.ts). Idempotent.
 * Journal mode stays at SQLite's default (DELETE) rather than WAL, so the
 * library folder is a single self-contained file that is safe to copy or sync.
 */
export function openDatabase(file: string): DB {
  const db = new Database(file)
  db.pragma('foreign_keys = ON')
  db.transaction(() => {
    db.exec(schemaSql)
    seedPeople(db)
    migrate(db)
  })()
  return db
}
