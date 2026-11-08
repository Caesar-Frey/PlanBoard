import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Settings } from '../shared/ipc'
import { DEFAULT_LIBRARY_ROOT, resolveLibraryRoot } from './paths'

export function defaultSettings(home: string): Settings {
  return { libraryRoot: resolveLibraryRoot(DEFAULT_LIBRARY_ROOT, home), currentPersonId: null }
}

/** Validates untrusted JSON. Each invalid field falls back to its default on its own. */
export function parseSettings(raw: unknown, home: string): Settings {
  const settings = defaultSettings(home)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return settings
  const obj = raw as Record<string, unknown>

  if (typeof obj.libraryRoot === 'string') {
    try {
      settings.libraryRoot = resolveLibraryRoot(obj.libraryRoot, home)
    } catch {
      // keep default
    }
  }
  const id = obj.currentPersonId
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
    settings.currentPersonId = id
  }
  return settings
}

/** Reads settings.json. A missing or corrupt file yields defaults rather than an error. */
export function loadSettings(file: string, home: string): Settings {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return defaultSettings(home)
  }
  return parseSettings(raw, home)
}

/** Writes settings.json atomically (temp file + rename) so a crash can't leave half a file. */
export function saveSettings(file: string, settings: Settings): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}
