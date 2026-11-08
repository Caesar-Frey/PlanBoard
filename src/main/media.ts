/**
 * `planboard-media://library/listings/<folder>/<image>`: how the renderer shows local photos.
 * The renderer never gets file:// access. The handler serves only image files that are
 * really (after resolving symlinks) inside the current library's listings/ folder.
 */
import { realpath, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { LISTINGS_DIR_NAME } from './paths'
import { isInside } from './pathGuard'

export const MEDIA_SCHEME = 'planboard-media'
const MEDIA_HOST = 'library'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

/** Folder and file names we ever create: letters, digits, `_`, `-`, `.`, space; no leading dot. */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/

/** URL for a library-relative path such as `listings/Hillcrest_P24-1/image_1.jpg`. */
export function mediaUrl(relPath: string): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/')
  return `${MEDIA_SCHEME}://${MEDIA_HOST}/${encoded}`
}

/**
 * Validated path segments (`['listings', folder, file]`) for a media URL, or null.
 * Each segment is decoded on its own and must be a plain name, so `..`, `%2e%2e`, encoded
 * slashes or backslashes and NUL bytes can never become path syntax.
 */
export function mediaSegments(url: string): string[] | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${MEDIA_SCHEME}:` || u.hostname !== MEDIA_HOST) return null
  if (u.search || u.hash || u.username || u.password || u.port) return null

  const raw = u.pathname.split('/').slice(1)
  if (raw.length !== 3) return null
  const segments: string[] = []
  for (const part of raw) {
    let decoded: string
    try {
      decoded = decodeURIComponent(part)
    } catch {
      return null
    }
    if (!SAFE_SEGMENT.test(decoded) || decoded.includes('..')) return null
    segments.push(decoded)
  }
  if (segments[0] !== LISTINGS_DIR_NAME) return null
  if (!CONTENT_TYPES[extname(segments[2]!).toLowerCase()]) return null
  return segments
}

/** Absolute path of the file to serve, or null (missing, not a file, or outside the library). */
export async function resolveMediaFile(root: string, url: string): Promise<string | null> {
  const segments = mediaSegments(url)
  if (!segments) return null
  const candidate = join(root, ...segments)
  if (!isInside(join(root, LISTINGS_DIR_NAME), candidate)) return null
  try {
    const [realRoot, realFile] = await Promise.all([
      realpath(join(root, LISTINGS_DIR_NAME)),
      realpath(candidate)
    ])
    if (!isInside(realRoot, realFile)) return null
    if (!(await stat(realFile)).isFile()) return null
    return candidate
  } catch {
    return null
  }
}

export function mediaContentType(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
}
