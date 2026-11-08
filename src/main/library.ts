import { mkdirSync } from 'node:fs'
import type { LibraryInfo } from '../shared/ipc'
import { openDatabase, type DB } from './db'
import { libraryPaths } from './paths'

/** Creates the library folder and its listings/ subfolder if missing, then opens the db. */
export function openLibrary(root: string): { info: LibraryInfo; db: DB } {
  const info = libraryPaths(root)
  mkdirSync(info.listingsDir, { recursive: true })
  const db = openDatabase(info.dbPath)
  return { info, db }
}
