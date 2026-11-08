import type Database from 'better-sqlite3'
import type { Person, PersonInput } from '../../shared/ipc'

type DB = Database.Database

/** The two profiles created on first open. Colours mirror the theme's green and brass. */
export const DEFAULT_PEOPLE: readonly Person[] = [
  { id: 1, name: 'Person 1', colour: '#1f3b33' },
  { id: 2, name: 'Person 2', colour: '#b08a3e' }
]

/** Inserts the two default people only when the table is empty. */
export function seedPeople(db: DB): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM people').get() as { n: number }
  if (n > 0) return
  const insert = db.prepare('INSERT INTO people (id, name, colour) VALUES (@id, @name, @colour)')
  for (const person of DEFAULT_PEOPLE) insert.run(person)
}

export function listPeople(db: DB): Person[] {
  return db.prepare('SELECT id, name, colour FROM people ORDER BY id').all() as Person[]
}

/** Expects already-validated input (see validatePersonInput). Throws for an unknown id. */
export function updatePerson(db: DB, person: PersonInput): void {
  const info = db
    .prepare('UPDATE people SET name = @name, colour = @colour WHERE id = @id')
    .run(person)
  if (info.changes !== 1) throw new Error(`No person with id ${person.id}`)
}
