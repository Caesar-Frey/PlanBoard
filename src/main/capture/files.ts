/** File helpers for the listing folder. */
import { readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const PARTIAL_SUFFIX = '.part'

/** Downloads land here first: `.<name>.part`, hidden, next to the final file. */
export function partialPath(finalPath: string): string {
  return join(dirname(finalPath), `.${basename(finalPath)}${PARTIAL_SUFFIX}`)
}

/** Writes to the partial name, then renames, so the final name only ever holds whole files. */
export async function writeFileAtomic(finalPath: string, data: Uint8Array): Promise<void> {
  const tmp = partialPath(finalPath)
  try {
    await writeFile(tmp, data)
    await rename(tmp, finalPath)
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

/** A non-empty regular file exists at `path`: the photo is already downloaded. */
export async function hasFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile() && s.size > 0
  } catch {
    return false
  }
}

/** Deletes leftover partial downloads (from a crash or force-quit). Returns how many. */
export async function removePartials(dir: string): Promise<number> {
  let removed = 0
  for (const name of await readdir(dir)) {
    if (name.startsWith('.') && name.endsWith(PARTIAL_SUFFIX)) {
      await unlink(join(dir, name)).catch(() => undefined)
      removed += 1
    }
  }
  return removed
}

/** Image file names the scrapers produce; anything else is refused before touching disk. */
export function isSafeFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*\.(jpe?g|png|webp)$/i.test(name)
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The name this photo already has in the folder, if any. Private Property names carry a
 * gallery number (`image_<nn>_<key>.jpg`) that can shift between runs (or in the manual
 * fallback), so for those any number with the same photo key counts as the same photo.
 */
export function matchExisting(
  fileName: string,
  photoId: string,
  names: Set<string>
): string | null {
  if (names.has(fileName)) return fileName
  const numbered = new RegExp(`^image_\\d+_${escapeRe(photoId)}\\.(jpe?g|png|webp)$`, 'i')
  if (!numbered.test(fileName)) return null
  for (const name of names) if (numbered.test(name)) return name
  return null
}
