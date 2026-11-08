/**
 * Step-up migrations, tracked in `PRAGMA user_version`.
 *
 * `schema.sql` always describes the newest shape, so a new library is created complete. An
 * older library is brought up one version at a time. Every step checks before it changes
 * anything, so running it twice (or on a half-migrated file) is harmless. A library made by a
 * newer PlanBoard is never lowered.
 */
import type Database from 'better-sqlite3'

type DB = Database.Database

interface Migration {
  version: number
  up(db: DB): void
}

function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

function addColumn(db: DB, table: string, column: string, type: string): void {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}

const MIGRATIONS: readonly Migration[] = [
  {
    // Milestone 4: survey facts, so Property_Details.txt can be regenerated after an edit or a
    // removal without surveying again. Null for listings surveyed before (the listing view then
    // reads them from the existing file).
    version: 2,
    up(db) {
      addColumn(db, 'listings', 'photo_count_listed', 'INTEGER')
      addColumn(db, 'listings', 'photo_duplicates', 'INTEGER')
      addColumn(db, 'listings', 'surveyed_at', 'INTEGER')
    }
  }
]

export const SCHEMA_VERSION = MIGRATIONS.at(-1)!.version

/** Runs inside the caller's transaction, after `schema.sql`. */
export function migrate(db: DB): void {
  let version = db.pragma('user_version', { simple: true }) as number
  if (version > SCHEMA_VERSION) return
  for (const m of MIGRATIONS) {
    // Re-run the newest step even when the version says it is done: each step is idempotent,
    // and this repairs a file whose version was set without its columns.
    if (m.version < version) continue
    m.up(db)
    version = m.version
  }
  db.pragma(`user_version = ${version}`)
}
