/**
 * Downloads one photo with retries, an image content-type check, an optional fallback URL and
 * an atomic write. The network is injected (`FetchLike`), so tests never touch the internet.
 */
import type { ScrapedPhoto } from '../scrapers/types'
import { writeFileAtomic } from './files'
import { MAX_RETRIES, backoffMs, judgeResponse } from './retry'

/** The small part of `fetch` we use. Electron's `net.fetch` and Node's `fetch` both fit. */
export type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> }
) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
}>

export interface DownloadDeps {
  fetch: FetchLike
  /** Called before every request; waits so requests stay politely spaced. */
  pace(): Promise<void>
  /** Backoff wait; should reject when `signal` aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>
  signal: AbortSignal
  headers: Record<string, string>
}

export type DownloadResult =
  | { status: 'downloaded'; url: string; bytes: number }
  | { status: 'not-found'; url: string }
  /** `network`: no answer from the server at all (connection down), as opposed to a bad answer. */
  | { status: 'failed'; reason: string; network: boolean }

/** The user pressed Cancel. Never reported as a failure. */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelledError()
}

type Attempt =
  | { kind: 'ok'; data: Uint8Array }
  | { kind: 'not-found' }
  | { kind: 'fail'; reason: string; network: boolean }

async function fetchWithRetry(url: string, deps: DownloadDeps): Promise<Attempt> {
  let last: Attempt = { kind: 'fail', reason: 'no attempt made', network: false }
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      try {
        await deps.sleep(backoffMs(attempt), deps.signal)
      } catch {
        throw new CancelledError()
      }
    }
    throwIfCancelled(deps.signal)
    await deps.pace()
    throwIfCancelled(deps.signal)
    try {
      const res = await deps.fetch(url, { signal: deps.signal, headers: deps.headers })
      const verdict = judgeResponse(res.status, res.headers.get('content-type'))
      if (verdict.kind === 'ok') {
        const data = new Uint8Array(await res.arrayBuffer())
        if (data.byteLength > 0) return { kind: 'ok', data }
        last = { kind: 'fail', reason: 'empty response', network: false }
        continue
      }
      if (verdict.kind === 'not-found') return { kind: 'not-found' }
      if (verdict.kind === 'fail') return { kind: 'fail', reason: verdict.reason, network: false }
      last = { kind: 'fail', reason: verdict.reason, network: false }
    } catch (err) {
      throwIfCancelled(deps.signal)
      last = { kind: 'fail', reason: (err as Error).message || 'network error', network: true }
    }
  }
  return last
}

/**
 * Downloads `photo` to `dest`. Tries `sourceUrl`, then `fallbackUrl` when the first answer was
 * bad (not 404, and not a dead connection: the fallback is on the same host).
 * Throws `CancelledError` if `deps.signal` aborts; never leaves a partial file at `dest`.
 */
export async function downloadPhoto(
  photo: ScrapedPhoto,
  dest: string,
  deps: DownloadDeps
): Promise<DownloadResult> {
  const urls = photo.fallbackUrl ? [photo.sourceUrl, photo.fallbackUrl] : [photo.sourceUrl]
  let failure: DownloadResult = { status: 'failed', reason: 'no attempt made', network: false }
  for (const url of urls) {
    const attempt = await fetchWithRetry(url, deps)
    if (attempt.kind === 'ok') {
      throwIfCancelled(deps.signal)
      await writeFileAtomic(dest, attempt.data)
      return { status: 'downloaded', url, bytes: attempt.data.byteLength }
    }
    if (attempt.kind === 'not-found') return { status: 'not-found', url }
    failure = { status: 'failed', reason: `${attempt.reason} (${url})`, network: attempt.network }
    if (attempt.network) break
  }
  return failure
}
