/** Download retry policy (brief section 3, shared rules). Pure. */

/** Retries after the first attempt, so at most four requests per URL. */
export const MAX_RETRIES = 3
/** Polite gap between image requests. */
export const REQUEST_INTERVAL_MS = 1000

const BACKOFF_BASE_MS = 1000
const BACKOFF_CAP_MS = 8000

export type Verdict =
  | { kind: 'ok' }
  | { kind: 'not-found' }
  /** Worth another try (server busy or a passing error). */
  | { kind: 'retry'; reason: string }
  /** Retrying the same URL won't help. */
  | { kind: 'fail'; reason: string }

export function judgeResponse(status: number, contentType: string | null): Verdict {
  if (status >= 200 && status < 300) {
    const type = (contentType ?? '').trim().toLowerCase()
    if (type.startsWith('image/')) return { kind: 'ok' }
    return { kind: 'fail', reason: `not an image (${type || 'no content type'})` }
  }
  if (status === 404 || status === 410) return { kind: 'not-found' }
  if (status === 408 || status === 429 || status >= 500) {
    return { kind: 'retry', reason: `HTTP ${status}` }
  }
  return { kind: 'fail', reason: `HTTP ${status}` }
}

/** Delay before retry number `retry` (1-based): 1 s, 2 s, 4 s, capped at 8 s. */
export function backoffMs(retry: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, retry - 1))
}

/**
 * Returns a function to call before each request. It waits until `intervalMs` has passed
 * since the previous call returned, so requests are spaced out however long each one takes.
 */
export function createPacer(
  intervalMs: number,
  now: () => number,
  sleep: (ms: number) => Promise<void>
): () => Promise<void> {
  let last: number | null = null
  return async () => {
    if (last !== null) {
      const wait = intervalMs - (now() - last)
      if (wait > 0) await sleep(wait)
    }
    last = now()
  }
}
