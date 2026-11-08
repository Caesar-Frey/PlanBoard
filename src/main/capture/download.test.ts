import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScrapedPhoto } from '../scrapers/types'
import { CancelledError, downloadPhoto, type DownloadDeps, type FetchLike } from './download'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'planboard download '))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type Reply = { status: number; type?: string | null; body?: number[] } | 'network-error'

/** A fake fetch that replays scripted replies per URL and records every call. */
function fakeFetch(script: Record<string, Reply[]>): FetchLike & { calls: string[] } {
  const calls: string[] = []
  const fn = (async (url: string, init: { signal: AbortSignal }) => {
    calls.push(url)
    if (init.signal.aborted) throw new DOMException('aborted', 'AbortError')
    const reply = script[url]?.shift()
    if (!reply) throw new Error(`unexpected request ${url}`)
    if (reply === 'network-error') throw new TypeError('fetch failed')
    return {
      status: reply.status,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? (reply.type ?? null) : null)
      },
      arrayBuffer: async () => new Uint8Array(reply.body ?? [9, 9]).buffer
    }
  }) as unknown as FetchLike & { calls: string[] }
  fn.calls = calls
  return fn
}

function deps(
  fetch: FetchLike,
  signal = new AbortController().signal
): DownloadDeps & { sleeps: number[] } {
  const sleeps: number[] = []
  return {
    fetch,
    signal,
    pace: async () => undefined,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    headers: { 'User-Agent': 'test' },
    sleeps
  }
}

const P24: ScrapedPhoto = {
  sourceUrl: 'https://images.prop24.com/1',
  photoId: '1',
  fileName: 'image_1.jpg'
}
const PP: ScrapedPhoto = {
  sourceUrl: 'https://images.pp.co.za/listing/9/key',
  fallbackUrl: 'https://images.pp.co.za/listing/9/key/1600/1066/contain/jpegorpng',
  photoId: 'key',
  fileName: 'image_01_key.jpg'
}

describe('downloadPhoto', () => {
  it('saves an image and leaves no partial file', async () => {
    const fetch = fakeFetch({
      [P24.sourceUrl]: [{ status: 200, type: 'image/jpeg', body: [1, 2] }]
    })
    const dest = join(dir, P24.fileName)
    const r = await downloadPhoto(P24, dest, deps(fetch))
    expect(r).toMatchObject({ status: 'downloaded', url: P24.sourceUrl, bytes: 2 })
    expect([...readFileSync(dest)]).toEqual([1, 2])
    expect(readdirSync(dir)).toEqual([P24.fileName])
  })

  it('retries network errors and 5xx three times with backoff, then succeeds', async () => {
    const fetch = fakeFetch({
      [P24.sourceUrl]: [
        'network-error',
        { status: 503 },
        'network-error',
        { status: 200, type: 'image/jpeg' }
      ]
    })
    const d = deps(fetch)
    const r = await downloadPhoto(P24, join(dir, P24.fileName), d)
    expect(r.status).toBe('downloaded')
    expect(fetch.calls).toHaveLength(4)
    expect(d.sleeps).toEqual([1000, 2000, 4000])
  })

  it('gives up after three retries and reports a network failure', async () => {
    const fetch = fakeFetch({ [P24.sourceUrl]: Array(4).fill('network-error') as Reply[] })
    const r = await downloadPhoto(P24, join(dir, P24.fileName), deps(fetch))
    expect(r).toMatchObject({ status: 'failed', network: true })
    expect(fetch.calls).toHaveLength(4)
    expect(existsSync(join(dir, P24.fileName))).toBe(false)
  })

  it('skips a 404 without retrying', async () => {
    const fetch = fakeFetch({ [P24.sourceUrl]: [{ status: 404, type: 'text/html' }] })
    const r = await downloadPhoto(P24, join(dir, P24.fileName), deps(fetch))
    expect(r.status).toBe('not-found')
    expect(fetch.calls).toHaveLength(1)
  })

  it('refuses non-image content and never writes it', async () => {
    const fetch = fakeFetch({ [P24.sourceUrl]: [{ status: 200, type: 'text/html' }] })
    const r = await downloadPhoto(P24, join(dir, P24.fileName), deps(fetch))
    expect(r).toMatchObject({ status: 'failed', network: false })
    expect(readdirSync(dir)).toEqual([])
  })

  it('Private Property: falls back to the resized URL when the original is not an image', async () => {
    const fetch = fakeFetch({
      [PP.sourceUrl]: [{ status: 200, type: 'text/html' }],
      [PP.fallbackUrl!]: [{ status: 200, type: 'image/jpeg' }]
    })
    const r = await downloadPhoto(PP, join(dir, PP.fileName), deps(fetch))
    expect(r).toMatchObject({ status: 'downloaded', url: PP.fallbackUrl })
  })

  it('Private Property: falls back after a 403 or exhausted 5xx retries', async () => {
    const fetch = fakeFetch({
      [PP.sourceUrl]: [{ status: 403 }],
      [PP.fallbackUrl!]: [{ status: 200, type: 'image/jpeg' }]
    })
    expect((await downloadPhoto(PP, join(dir, 'a.jpg'), deps(fetch))).status).toBe('downloaded')

    const fetch2 = fakeFetch({
      [PP.sourceUrl]: Array(4).fill({ status: 500 }) as Reply[],
      [PP.fallbackUrl!]: [{ status: 200, type: 'image/jpeg' }]
    })
    const r2 = await downloadPhoto(PP, join(dir, 'b.jpg'), deps(fetch2))
    expect(r2).toMatchObject({ status: 'downloaded', url: PP.fallbackUrl })
  })

  it('Private Property: a 404 on the original is skipped, not retried at the fallback', async () => {
    const fetch = fakeFetch({ [PP.sourceUrl]: [{ status: 404 }] })
    const r = await downloadPhoto(PP, join(dir, PP.fileName), deps(fetch))
    expect(r.status).toBe('not-found')
    expect(fetch.calls).toEqual([PP.sourceUrl])
  })

  it('throws CancelledError when aborted, and leaves no file', async () => {
    const ac = new AbortController()
    ac.abort()
    const fetch = fakeFetch({ [P24.sourceUrl]: [{ status: 200, type: 'image/jpeg' }] })
    await expect(
      downloadPhoto(P24, join(dir, P24.fileName), deps(fetch, ac.signal))
    ).rejects.toBeInstanceOf(CancelledError)
    expect(readdirSync(dir)).toEqual([])
  })

  it('paces every request, including retries and the fallback', async () => {
    let paced = 0
    const fetch = fakeFetch({
      [PP.sourceUrl]: [{ status: 500 }, { status: 403 }],
      [PP.fallbackUrl!]: [{ status: 200, type: 'image/jpeg' }]
    })
    const d = deps(fetch)
    d.pace = async () => {
      paced += 1
    }
    await downloadPhoto(PP, join(dir, PP.fileName), d)
    expect(paced).toBe(fetch.calls.length)
  })
})
