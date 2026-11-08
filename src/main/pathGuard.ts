/** Checks before the app opens a folder or a web page on the renderer's behalf. Pure. */
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { LISTINGS_DIR_NAME } from './paths'
import { P24_HOSTS } from './scrapers/property24'
import { PP_HOSTS } from './scrapers/privateproperty'

/** `child` is strictly inside `parent` (both resolved; no `..` escapes). */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
}

/**
 * Absolute path of a listing folder from its stored library-relative `folder_path`
 * (`listings/<name>`), or null if it would land anywhere but directly inside `listings/`.
 */
export function listingFolderPath(root: string, folderPath: string): string | null {
  if (isAbsolute(folderPath)) return null
  const listingsDir = join(root, LISTINGS_DIR_NAME)
  const abs = resolve(root, folderPath)
  if (!isInside(listingsDir, abs)) return null
  if (relative(listingsDir, abs).includes(sep)) return null
  return abs
}

const KNOWN_HOSTS: readonly string[] = [...P24_HOSTS, ...PP_HOSTS]

/** Only https pages on Property24 or Private Property may be opened in the browser. */
export function isKnownListingUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return (
    u.protocol === 'https:' &&
    u.username === '' &&
    u.password === '' &&
    u.port === '' &&
    KNOWN_HOSTS.includes(u.hostname.toLowerCase())
  )
}
