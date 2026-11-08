/**
 * Shared live driver: loads one listing in a hidden, sandboxed window, opens its gallery and
 * collects the image URLs. Site-specific selectors and scripts come from the site modules.
 *
 * Safety: the hidden window has no preload and no Node, runs sandboxed in its own in-memory
 * session, may not open windows, navigate away, download files or get any permission.
 */
import { randomUUID } from 'node:crypto'
import { BrowserWindow, session } from 'electron'
import { detectListing } from './detect'
import { P24_SCRAPER } from './property24'
import { PP_SCRAPER } from './privateproperty'
import {
  SITE_NAME,
  ScraperError,
  type ScrapeCapture,
  type ScrapeResult,
  type Site,
  type SiteScraper
} from './types'

const SCRAPERS: Record<Site, SiteScraper> = { p24: P24_SCRAPER, pp: PP_SCRAPER }

/** A normal desktop Chrome user agent matching Electron's Chromium; nothing identifying. */
export function scraperUserAgent(): string {
  const major = (process.versions.chrome ?? '140').split('.')[0]
  return (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
  )
}

export interface ScrapeOptions {
  /** Overall time limit for stepping through the gallery. Default 60 s. */
  timeoutMs?: number
  /** Progress messages (for the dev CLI or a future progress bar). */
  log?: (message: string) => void
}

const LOAD_TIMEOUT_MS = 30_000
const SCRIPT_TIMEOUT_MS = 10_000
const SETTLE_MS = 2_500
const POPUP_PAUSE_MS = 800
const GALLERY_PAUSE_MS = 1_500
const STEP_PAUSE_MS = 700
/** Stop early once the gallery reports nothing pending and the count stops growing this often. */
const IDLE_ROUNDS = 3

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function httpError(site: Site, status: number): ScraperError {
  const name = SITE_NAME[site]
  if (status === 404 || status === 410) {
    return new ScraperError(
      'load-failed',
      `${name} says this listing doesn't exist any more (HTTP ${status}). It may have been sold or withdrawn.`,
      site
    )
  }
  if (status === 403 || status === 429) {
    return new ScraperError(
      'load-failed',
      `${name} refused the request (HTTP ${status}). Wait a few minutes and try again.`,
      site
    )
  }
  return new ScraperError(
    'load-failed',
    `${name} returned an error (HTTP ${status}). Try again later.`,
    site
  )
}

/**
 * Scrapes one listing. Resolves with the result (warnings included) or rejects with a
 * `ScraperError` whose message is written for the user.
 */
export async function scrapeListing(
  input: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const listing = detectListing(input)
  const scraper = SCRAPERS[listing.site]
  const name = SITE_NAME[listing.site]
  const log = options.log ?? (() => {})
  const timeoutMs = options.timeoutMs ?? 60_000

  // No "persist:" prefix → an in-memory session that is never written to disk.
  const ses = session.fromPartition(`planboard-scrape-${randomUUID()}`, { cache: false })
  ses.setUserAgent(scraperUserAgent())
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  const onDownload = (event: Electron.Event): void => event.preventDefault()
  ses.on('will-download', onDownload)

  const networkUrls: string[] = []
  ses.webRequest.onCompleted({ urls: scraper.imageUrlPatterns }, (details) => {
    if (details.statusCode >= 200 && details.statusCode < 300) networkUrls.push(details.url)
  })

  const win = new BrowserWindow({
    show: false,
    width: 1366,
    height: 900,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Hidden windows are throttled by default, which stalls lazy loading and timers.
      backgroundThrottling: false,
      spellcheck: false
    }
  })
  const wc = win.webContents
  wc.setAudioMuted(true)
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  // Never follow links (to other listings or anywhere else); redirects of the first load are fine.
  wc.on('will-navigate', (event) => event.preventDefault())

  let domReady = false
  let mainStatus: number | null = null
  wc.on('dom-ready', () => (domReady = true))
  wc.on('did-navigate', (_e, _url, httpResponseCode) => (mainStatus = httpResponseCode))

  const run = async <T>(script: string): Promise<T> =>
    (await withTimeout(wc.executeJavaScript(script, true), SCRIPT_TIMEOUT_MS, 'Page script')) as T
  const capture = async (): Promise<ScrapeCapture> => ({
    listing,
    html: await run<string>('document.documentElement.outerHTML'),
    networkUrls: [...networkUrls]
  })

  try {
    log(`Survey: loading ${listing.url}`)
    try {
      await withTimeout(wc.loadURL(listing.url), LOAD_TIMEOUT_MS, 'Page load')
    } catch (err) {
      // Slow ads or a script-driven redirect can reject loadURL after the page is usable.
      if (!domReady) {
        throw new ScraperError(
          'load-failed',
          `Couldn't open the ${name} listing (${(err as Error).message}). Check your internet ` +
            `connection and try again.`,
          listing.site
        )
      }
      log(`Page load did not finish cleanly (${(err as Error).message}); continuing`)
    }
    if (mainStatus !== null && mainStatus >= 400) throw httpError(listing.site, mainStatus)
    await sleep(SETTLE_MS)

    for (const script of scraper.dismissPopupScripts) {
      log(`Pop-ups: ${await run<string>(script)}`)
      await sleep(POPUP_PAUSE_MS)
    }

    log(`Foundation: opening the gallery`)
    for (const script of scraper.openGalleryScripts) {
      log(`Gallery: ${await run<string>(script)}`)
      await sleep(GALLERY_PAUSE_MS)
    }

    const deadline = Date.now() + timeoutMs
    let lastFound = -1
    let idle = 0
    let stopReason = 'timed out'
    while (Date.now() < deadline) {
      const progress = scraper.progress(await capture())
      if (progress.found !== lastFound) {
        log(`Gallery: found ${progress.found} / expected ${progress.expected ?? '?'}`)
      }
      if (progress.complete) {
        stopReason = 'all photos found'
        break
      }
      const step = await run<{ pending: number }>(scraper.stepGalleryScript)
      idle = step.pending === 0 && progress.found === lastFound ? idle + 1 : 0
      lastFound = progress.found
      if (idle >= IDLE_ROUNDS) {
        stopReason = 'gallery fully stepped through'
        break
      }
      await sleep(STEP_PAUSE_MS)
    }
    log(`Gallery: stopped (${stopReason})`)

    const result = scraper.build(await capture())
    if (stopReason === 'timed out' && result.expectedPhotoCount !== null) {
      if (result.photos.length < result.expectedPhotoCount) {
        result.warnings.push(`Stopped looking after ${Math.round(timeoutMs / 1000)} seconds.`)
      }
    }
    return result
  } finally {
    ses.webRequest.onCompleted(null)
    ses.removeListener('will-download', onDownload)
    if (!win.isDestroyed()) win.destroy()
    void ses.clearStorageData().catch(() => undefined)
    void ses.clearCache().catch(() => undefined)
  }
}
