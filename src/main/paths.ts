import { isAbsolute, join, normalize } from 'node:path'
import type { LibraryInfo } from '../shared/ipc'

export const DEFAULT_LIBRARY_ROOT = '~/Pictures/PlanBoard'
export const DB_FILE_NAME = 'planboard.db'
export const LISTINGS_DIR_NAME = 'listings'

/** Expands a leading `~` or `~/` to the given home directory. `~user` is left alone. */
export function expandHome(p: string, home: string): string {
  if (p === '~') return home
  if (p.startsWith('~/')) return join(home, p.slice(2))
  return p
}

/** Turns a user-supplied library path into a normalised absolute path. Throws if invalid. */
export function resolveLibraryRoot(p: string, home: string): string {
  const trimmed = p.trim()
  if (trimmed === '') throw new Error('Library folder path is empty')
  const expanded = expandHome(trimmed, home)
  if (!isAbsolute(expanded)) throw new Error(`Library folder must be an absolute path: ${p}`)
  const normalised = normalize(expanded)
  return normalised.length > 1 ? normalised.replace(/\/+$/, '') : normalised
}

export function libraryPaths(root: string): LibraryInfo {
  return {
    root,
    listingsDir: join(root, LISTINGS_DIR_NAME),
    dbPath: join(root, DB_FILE_NAME)
  }
}
