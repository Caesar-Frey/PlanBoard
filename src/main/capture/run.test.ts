/** The whole capture flow with a fake scraper, a fake fetch, a temp library and a real db. */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CaptureProgress } from '../../shared/ipc'
import { openDatabase, type DB } from '../db'
import { countPhotos, findListing } from '../db/listings'
import { p24PhotoFromId } from '../scrapers/property24'
import { EMPTY_DETAILS, ScraperError, type ScrapeResult } from '../scrapers/types'
import type { FetchLike } from './download'
import { trashPhotos } from '../listing/trash'
import { runCapture, type CaptureDeps } from './run'

const URL24 = 'https://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049/115212892'
const FOLDER = 'Hillcrest_P24-115212892'

let root: string
let db: DB
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'planboard run '))
  db = openDatabase(join(root, 'planboard.db'))
})
afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

function scrapeResult(ids: string[], over: Partial<ScrapeResult> = {}): ScrapeResult {
  return {
    site: 'p24',
    externalId: '115212892',
    url: URL24,
    expectedPhotoCount: ids.length,
    duplicatePhotos: 0,
    photos: ids.map(p24PhotoFromId),
    details: { ...EMPTY_DETAILS, suburb: 'Hillcrest', price: 'R 3 450 000', title: 'House' },
    warnings: [],
    notes: [],
    ...over
  }
}

type FakeFetch = FetchLike & { calls: string[] }
function imageFetch(
  behaviour: (url: string, n: number) => number | 'network' = () => 200
): FakeFetch {
  const calls: string[] = []
  const fn = (async (url: string, init: { signal: AbortSignal }) => {
    if (init.signal.aborted) throw new DOMException('aborted', 'AbortError')
    calls.push(url)
    const status = behaviour(url, calls.length)
    if (status === 'network') throw new TypeError('fetch failed')
    return {
      status,
      headers: { get: () => (status === 200 ? 'image/jpeg' : 'text/html') },
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer
    }
  }) as unknown as FakeFetch
  fn.calls = calls
  return fn
}

function makeDeps(scrape: CaptureDeps['scrape'], fetch: FetchLike): CaptureDeps {
  let clock = 0
  return {
    db,
    libraryRoot: root,
    scrape,
    fetch,
    sleep: async (ms) => {
      clock += ms
    },
    now: () => (clock += 5),
    headers: {}
  }
}

const folder = (): string => join(root, 'listings', FOLDER)
const images = (): string[] =>
  readdirSync(folder())
    .filter((f) => f.endsWith('.jpg'))
    .sort()

describe('runCapture', () => {
  it('downloads every photo, writes details and records the listing', async () => {
    const fetch = imageFetch()
    const events: CaptureProgress[] = []
    const scrape: CaptureDeps['scrape'] = async (_url, opts) => {
      opts.onStage('foundation')
      return scrapeResult(['1', '2', '3'])
    }
    const out = await runCapture(
      makeDeps(scrape, fetch),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      (p) => events.push(p)
    )

    expect(out.status).toBe('complete')
    expect(out.error).toBeNull()
    expect(out.counts).toMatchObject({
      found: 3,
      expected: 3,
      downloaded: 3,
      alreadyHad: 0,
      onDisk: 3
    })
    expect(out.listing).toMatchObject({ folderName: FOLDER, site: 'p24', suburb: 'Hillcrest' })
    expect(out.detailsFile).toBe('written')
    expect(images()).toEqual(['image_1.jpg', 'image_2.jpg', 'image_3.jpg'])
    expect(readFileSync(join(folder(), 'Property_Details.txt'), 'utf8')).toContain('R 3 450 000')

    const row = findListing(db, 'p24', '115212892')!
    expect(row.folder_path).toBe(`listings/${FOLDER}`)
    expect(countPhotos(db, row.id)).toBe(3)

    const stages = [...new Set(events.map((e) => e.stage))]
    expect(stages).toEqual(['survey', 'foundation', 'framing', 'handover'])
    const framing = events.filter((e) => e.stage === 'framing')
    expect(framing.at(-1)).toMatchObject({ done: 3, total: 3 })
    expect(events.at(-1)!.fraction).toBe(1)
  })

  it('re-running the same listing makes no image requests and keeps the user’s edited details', async () => {
    const scrape: CaptureDeps['scrape'] = async () => scrapeResult(['1', '2'])
    await runCapture(
      makeDeps(scrape, imageFetch()),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    const detailsPath = join(folder(), 'Property_Details.txt')
    writeFileSync(detailsPath, 'Our own notes')

    const fetch = imageFetch()
    const out = await runCapture(
      makeDeps(scrape, fetch),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(fetch.calls).toEqual([])
    expect(out.counts).toMatchObject({ downloaded: 0, alreadyHad: 2, onDisk: 2 })
    expect(out.status).toBe('complete')
    expect(out.detailsFile).toBe('kept-edited')
    expect(readFileSync(detailsPath, 'utf8')).toBe('Our own notes')
    expect(countPhotos(db, out.listing!.id)).toBe(2)
  })

  it('regenerates an unedited details file and adds new photos on re-run', async () => {
    await runCapture(
      makeDeps(async () => scrapeResult(['1']), imageFetch()),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    const fetch = imageFetch()
    const out = await runCapture(
      makeDeps(
        async () =>
          scrapeResult(['1', '2'], {
            details: { ...EMPTY_DETAILS, suburb: 'Hillcrest', price: 'R 9' }
          }),
        fetch
      ),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(fetch.calls).toEqual(['https://images.prop24.com/2'])
    expect(out.detailsFile).toBe('written')
    const text = readFileSync(join(folder(), 'Property_Details.txt'), 'utf8')
    // Re-survey rule: a stored value is never overwritten (only empty fields are filled).
    expect(text).toContain('R 3 450 000')
    expect(text).toMatch(/^Photos:\s+2 in this folder/m)
    expect(findListing(db, 'p24', '115212892')!.price).toBe('R 3 450 000')
  })

  it('a re-survey fills empty fields only, and the details file shows the merged values', async () => {
    await runCapture(
      makeDeps(async () => scrapeResult(['1']), imageFetch()),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    const id = findListing(db, 'p24', '115212892')!.id
    // The user edits the title in the listing view and leaves the agent empty.
    db.prepare("UPDATE listings SET title = 'Our favourite' WHERE id = ?").run(id)
    const out = await runCapture(
      makeDeps(
        async () =>
          scrapeResult(['1'], {
            details: {
              ...EMPTY_DETAILS,
              title: 'Scraped title',
              suburb: 'Hillcrest',
              price: 'R 9',
              agent: 'New Agent'
            }
          }),
        imageFetch()
      ),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(findListing(db, 'p24', '115212892')).toMatchObject({
      title: 'Our favourite',
      price: 'R 3 450 000',
      agent: 'New Agent'
    })
    expect(out.listing?.title).toBe('Our favourite')
    const text = readFileSync(join(folder(), 'Property_Details.txt'), 'utf8')
    expect(text).toMatch(/^Title:\s+Our favourite$/m)
    expect(text).toMatch(/^Agent:\s+New Agent$/m)
    expect(text).not.toContain('R 9')
  })

  it('stores the listed count, duplicates and survey time for later regeneration', async () => {
    await runCapture(
      makeDeps(
        async () => scrapeResult(['1', '2', '3'], { expectedPhotoCount: 4, duplicatePhotos: 1 }),
        imageFetch()
      ),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    const row = findListing(db, 'p24', '115212892')!
    expect(row).toMatchObject({ photo_count_listed: 4, photo_duplicates: 1 })
    expect(row.surveyed_at).toEqual(expect.any(Number))
  })

  it('treats the unique count as complete when the listing repeats a photo', async () => {
    const scrape: CaptureDeps['scrape'] = async () =>
      scrapeResult(['1', '2', '3'], { expectedPhotoCount: 4, duplicatePhotos: 1 })
    const out = await runCapture(
      makeDeps(scrape, imageFetch()),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(out.status).toBe('complete')
    expect(out.counts).toMatchObject({ listed: 4, duplicates: 1, expected: 3, onDisk: 3 })
    expect(out.notes).toEqual(['1 photo appears twice in the listing'])
    expect(out.warnings).toEqual([])
    expect(findListing(db, 'p24', '115212892')!.photo_count_expected).toBe(3)
  })

  it('cancel stops requests, keeps downloaded files and the db matches the disk', async () => {
    const ac = new AbortController()
    const fetch = imageFetch((_url, n) => {
      if (n === 2) ac.abort()
      return 200
    })
    const out = await runCapture(
      makeDeps(async () => scrapeResult(['1', '2', '3', '4']), fetch),
      { kind: 'scrape', url: URL24 },
      ac.signal,
      () => {}
    )
    expect(out.status).toBe('cancelled')
    expect(fetch.calls).toHaveLength(2)
    const onDisk = images()
    expect(onDisk.length).toBeLessThanOrEqual(2)
    expect(readdirSync(folder()).some((f) => f.endsWith('.part'))).toBe(false)
    expect(countPhotos(db, out.listing!.id)).toBe(onDisk.length)
    expect(out.counts.onDisk).toBe(onDisk.length)
  })

  it('cancel during the scrape stops before any folder is made', async () => {
    const ac = new AbortController()
    const scrape: CaptureDeps['scrape'] = async () => {
      ac.abort()
      throw new ScraperError('cancelled', 'Cancelled.', 'p24')
    }
    const events: CaptureProgress[] = []
    const out = await runCapture(
      makeDeps(scrape, imageFetch()),
      { kind: 'scrape', url: URL24 },
      ac.signal,
      (p) => events.push(p)
    )
    expect(out.status).toBe('cancelled')
    expect(out.listing).toBeNull()
    expect(events.map((e) => e.stage)).toEqual(['survey'])
    expect(existsSync(join(root, 'listings'))).toBe(false)
  })

  it('turns a scraper failure into a plain error that offers the manual fallback', async () => {
    const scrape: CaptureDeps['scrape'] = async () => {
      throw new ScraperError('no-photos', 'Couldn’t find any photos.', 'p24')
    }
    const out = await runCapture(
      makeDeps(scrape, imageFetch()),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(out.status).toBe('failed')
    expect(out.error).toEqual({
      code: 'no-photos',
      message: 'Couldn’t find any photos.',
      manualFallback: true,
      site: 'p24'
    })
    expect(Object.getPrototypeOf(out.error)).toBe(Object.prototype)
  })

  it('rejects a bad URL without scraping', async () => {
    let scraped = false
    const out = await runCapture(
      makeDeps(async () => {
        scraped = true
        return scrapeResult([])
      }, imageFetch()),
      { kind: 'scrape', url: 'https://example.com/house' },
      new AbortController().signal,
      () => {}
    )
    expect(scraped).toBe(false)
    expect(out.error).toMatchObject({ code: 'unsupported-site', manualFallback: false })
  })

  it('stops with a readable message when the network goes down', async () => {
    const fetch = imageFetch(() => 'network')
    const out = await runCapture(
      makeDeps(async () => scrapeResult(['1', '2', '3', '4', '5', '6']), fetch),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(out.status).toBe('failed')
    expect(out.error?.code).toBe('network')
    expect(out.error?.message).toMatch(/internet connection/)
    expect(out.counts.failed).toBe(3)
    expect(fetch.calls).toHaveLength(3 * 4) // three photos, four attempts each, then stop
  })

  it('records 404s as skipped and warns', async () => {
    const fetch = imageFetch((url) => (url.endsWith('/2') ? 404 : 200))
    const out = await runCapture(
      makeDeps(async () => scrapeResult(['1', '2', '3']), fetch),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(out.status).toBe('complete')
    expect(out.counts).toMatchObject({ downloaded: 2, notFound: 1, onDisk: 2 })
    expect(out.warnings.join(' ')).toMatch(/no longer exists/)
  })

  it('never re-downloads a photo the user removed', async () => {
    await runCapture(
      makeDeps(async () => scrapeResult(['1', '2']), imageFetch()),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    db.prepare("UPDATE photos SET deleted_at = 1 WHERE file_name = 'image_2.jpg'").run()
    rmSync(join(folder(), 'image_2.jpg'))
    const fetch = imageFetch()
    const out = await runCapture(
      makeDeps(async () => scrapeResult(['1', '2']), fetch),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(fetch.calls).toEqual([])
    expect(out.counts).toMatchObject({ removed: 1, alreadyHad: 1, onDisk: 1 })
    expect(out.status).toBe('complete')
  })

  it('photos moved to the Trash from the listing view are never downloaded again', async () => {
    await runCapture(
      makeDeps(async () => scrapeResult(['1', '2', '3']), imageFetch()),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    const id = findListing(db, 'p24', '115212892')!.id
    const photoIds = (
      db
        .prepare("SELECT id FROM photos WHERE file_name IN ('image_1.jpg', 'image_3.jpg')")
        .all() as { id: number }[]
    ).map((r) => r.id)
    const trashed = await trashPhotos(
      {
        db,
        libraryRoot: root,
        trashItem: async (p) => rmSync(p),
        now: () => 77
      },
      id,
      photoIds
    )
    expect(trashed.trashed).toHaveLength(2)

    const fetch = imageFetch()
    const out = await runCapture(
      makeDeps(async () => scrapeResult(['1', '2', '3', '4']), fetch),
      { kind: 'scrape', url: URL24 },
      new AbortController().signal,
      () => {}
    )
    expect(fetch.calls).toEqual(['https://images.prop24.com/4'])
    expect(out.counts).toMatchObject({ removed: 2, alreadyHad: 1, downloaded: 1, onDisk: 2 })
    expect(images()).toEqual(['image_2.jpg', 'image_4.jpg'])
    expect(readFileSync(join(folder(), 'Property_Details.txt'), 'utf8')).toMatch(
      /^Photos:\s+2 in this folder/m
    )
  })

  describe('manual fallback', () => {
    it('downloads pasted ids into a folder named after the given suburb', async () => {
      const fetch = imageFetch()
      const out = await runCapture(
        makeDeps(async () => {
          throw new Error('should not scrape')
        }, fetch),
        {
          kind: 'manual',
          url: URL24,
          text: '11\nhttps://images.prop24.com/12/Ensure1280x720\nnonsense',
          suburb: 'Hill Crest'
        },
        new AbortController().signal,
        () => {}
      )
      expect(out.status).toBe('complete')
      expect(out.listing?.folderName).toBe('Hill-Crest_P24-115212892')
      expect(out.counts).toMatchObject({ found: 2, downloaded: 2, expected: null })
      expect(out.rejected).toHaveLength(1)
      expect(out.detailsFile).toBe('written')
    })

    it('falls back to "Listing" without a suburb, and reuses a known listing’s folder', async () => {
      const out = await runCapture(
        makeDeps(async () => scrapeResult([]), imageFetch()),
        { kind: 'manual', url: URL24, text: '11', suburb: null },
        new AbortController().signal,
        () => {}
      )
      expect(out.listing?.folderName).toBe('Listing_P24-115212892')

      const again = await runCapture(
        makeDeps(async () => scrapeResult([]), imageFetch()),
        { kind: 'manual', url: URL24, text: '12', suburb: 'Elsewhere' },
        new AbortController().signal,
        () => {}
      )
      expect(again.listing?.folderName).toBe('Listing_P24-115212892')
      expect(again.counts.onDisk).toBe(2)
    })

    it('keeps the stated photo count and details of a listing surveyed before', async () => {
      await runCapture(
        makeDeps(async () => scrapeResult(['1', '2'], { expectedPhotoCount: 3 }), imageFetch()),
        { kind: 'scrape', url: URL24 },
        new AbortController().signal,
        () => {}
      )
      const fetch = imageFetch()
      const out = await runCapture(
        makeDeps(async () => scrapeResult([]), fetch),
        { kind: 'manual', url: URL24, text: '1 3', suburb: 'Ignored' },
        new AbortController().signal,
        () => {}
      )
      expect(fetch.calls).toEqual(['https://images.prop24.com/3'])
      expect(out.listing?.folderName).toBe(FOLDER)
      expect(out.counts).toMatchObject({ listed: 3, expected: 3, onDisk: 3, alreadyHad: 1 })
      expect(out.status).toBe('complete')
      expect(findListing(db, 'p24', '115212892')!.price).toBe('R 3 450 000')
      expect(readFileSync(join(folder(), 'Property_Details.txt'), 'utf8')).toMatch(
        /3 in this folder · listing shows 3/
      )
    })

    it('fails clearly when nothing pasted is usable', async () => {
      const out = await runCapture(
        makeDeps(async () => scrapeResult([]), imageFetch()),
        { kind: 'manual', url: URL24, text: 'hello there', suburb: 'X' },
        new AbortController().signal,
        () => {}
      )
      expect(out.status).toBe('failed')
      expect(out.error?.code).toBe('invalid-manual-input')
      expect(out.rejected).toHaveLength(2)
    })
  })
})
