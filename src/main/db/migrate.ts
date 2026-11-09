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
  /** `from`: the library's version before this step (equal to `version` on a re-run). */
  up(db: DB, from: number): void
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
  },
  {
    // Agent contact and the listing's bond-calculator figures, as shown (text, like `price`).
    // `bond_as_of` is when those figures were read. Also a one-off repair, see below.
    version: 3,
    up(db, from) {
      for (const col of [
        'agent_phone',
        'agent_email',
        'agency_phone',
        'agency_email',
        'bond_interest_rate',
        'bond_deposit',
        'bond_monthly_repayment',
        'bond_once_off_costs',
        'bond_min_income',
        'bond_total_interest',
        'bond_total_repayment'
      ]) {
        addColumn(db, 'listings', col, 'TEXT')
      }
      addColumn(db, 'listings', 'bond_term_years', 'REAL')
      addColumn(db, 'listings', 'bond_as_of', 'INTEGER')
      if (from < 3) repairEscapedQuotes(db)
    }
  }
]

/**
 * Private Property served some descriptions with SQL-style doubled apostrophes ("you''ll"),
 * and earlier surveys stored them as is. A re-survey never overwrites a filled field, so this
 * repairs them once, on the step up to version 3 only (so text typed later is never touched).
 * Only Private Property descriptions, and only two apostrophes between a letter or digit and a
 * letter, which is never real prose. There is no record of which fields were typed by hand, so
 * titles and names are left alone. Kept inline (not shared with the scraper) so this step never
 * changes.
 */
function repairEscapedQuotes(db: DB): void {
  const rows = db
    .prepare("SELECT id, description FROM listings WHERE site = 'pp' AND description LIKE '%''''%'")
    .all() as { id: number; description: string }[]
  const update = db.prepare('UPDATE listings SET description = ? WHERE id = ?')
  for (const row of rows) {
    const fixed = row.description.replace(/(?<=[\p{L}\p{N}])''(?=\p{L})/gu, "'")
    if (fixed !== row.description) update.run(fixed, row.id)
  }
}

export const SCHEMA_VERSION = MIGRATIONS.at(-1)!.version

/** Runs inside the caller's transaction, after `schema.sql`. */
export function migrate(db: DB): void {
  let version = db.pragma('user_version', { simple: true }) as number
  if (version > SCHEMA_VERSION) return
  for (const m of MIGRATIONS) {
    // Re-run the newest step even when the version says it is done: each step is idempotent,
    // and this repairs a file whose version was set without its columns.
    if (m.version < version) continue
    m.up(db, version)
    version = m.version
  }
  db.pragma(`user_version = ${version}`)
}
