/** Electron wiring for `planboard-media://` (the checks themselves live in media.ts). */
import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'
import { MEDIA_SCHEME, mediaContentType, resolveMediaFile } from './media'

/** Must run before `app.whenReady()`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true } }
  ])
}

/** Serves images from the library the app currently has open. Call after the app is ready. */
export function handleMediaProtocol(getLibraryRoot: () => string): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    const file = await resolveMediaFile(getLibraryRoot(), request.url)
    if (!file) return new Response(null, { status: 404 })
    try {
      const data = await readFile(file)
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': mediaContentType(file), 'cache-control': 'no-cache' }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
