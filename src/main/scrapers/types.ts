/**
 * Shared scraper contracts. Every site-specific selector and URL pattern lives in its own
 * module (property24.ts, privateproperty.ts); this file stays site-neutral.
 */
import type { ListingFields } from '../../shared/listingFields'

export type Site = 'p24' | 'pp'

/** Short code used in folder names (`<Suburb>_<P24|PP>-<id>`) and messages. */
export const SITE_CODE: Record<Site, 'P24' | 'PP'> = { p24: 'P24', pp: 'PP' }

export const SITE_NAME: Record<Site, string> = {
  p24: 'Property24',
  pp: 'Private Property'
}

export interface ParsedListingUrl {
  site: Site
  /** Property24 numeric id (`115212892`), or Private Property `T<number>` id (`T5669598`). */
  externalId: string
  /** Canonical listing URL: https, www host, no query string, hash or trailing slash. */
  url: string
}

export interface ScrapedPhoto {
  /** Full-size URL to download. */
  sourceUrl: string
  /**
   * A second URL to try if `sourceUrl` fails (Private Property: the largest resized variant).
   * Absent when there is no sensible alternative.
   */
  fallbackUrl?: string
  /** Property24 numeric image id, or Private Property photo key. */
  photoId: string
  /** File name inside the listing folder: `image_<id>.jpg` (P24) or `image_<nn>_<key>.jpg` (PP). */
  fileName: string
}

/** Listing fields, named exactly like the `listings` table columns so they insert 1:1. */
export type ListingDetails = ListingFields

export interface ScrapeResult {
  site: Site
  externalId: string
  url: string
  /** Photo count the listing page states, if found. Used to warn about missing photos. */
  expectedPhotoCount: number | null
  /** Unique gallery photos, in gallery order. */
  photos: ScrapedPhoto[]
  details: ListingDetails
  /**
   * How many of `expectedPhotoCount` are repeats of another photo in the same gallery
   * (Property24 sometimes lists one photo twice). The unique count is then complete.
   */
  duplicatePhotos: number
  /** Plain-English problems for the user, for example fewer photos found than the listing states. */
  warnings: string[]
  /** Plain-English information that needs no action, for example a photo listed twice. */
  notes: string[]
}

/** What a live driver hands to a site module's pure result builder. */
export interface ScrapeCapture {
  listing: ParsedListingUrl
  /** `document.documentElement.outerHTML` after the gallery was opened and stepped through. */
  html: string
  /** Image URLs seen by `session.webRequest.onCompleted`, in the order they completed. */
  networkUrls: string[]
}

/**
 * Everything the shared live driver needs from one site module. The scripts run inside the
 * hidden page via `executeJavaScript`: plain DOM code only, no Node, each returning a short
 * JSON-serialisable value for the log.
 */
export interface SiteScraper {
  site: Site
  /** `session.webRequest` URL patterns for the site's image host. */
  imageUrlPatterns: string[]
  /** Run in order, with a short pause between, to close cookie/alert pop-ups (never accept-all). */
  dismissPopupScripts: string[]
  /** Run in order, with a pause between, to open the full gallery. */
  openGalleryScripts: string[]
  /** One step through the gallery; must return `{ pending: number }` (images not loaded yet). */
  stepGalleryScript: string
  /** Quick count used to decide when to stop stepping. `complete`: nothing left to find. */
  progress(capture: ScrapeCapture): { found: number; expected: number | null; complete: boolean }
  /** Final, pure result builder. Throws `ScraperError` when nothing usable is found. */
  build(capture: ScrapeCapture): ScrapeResult
}

export type ScraperErrorCode =
  | 'unsupported-site'
  | 'not-a-listing'
  | 'load-failed'
  | 'no-photos'
  | 'invalid-manual-input'
  | 'cancelled'

/**
 * An error whose `message` is written for the user, not the developer.
 * Raised for bad URLs, pages that won't load and "site changed / scraper broke".
 */
export class ScraperError extends Error {
  readonly code: ScraperErrorCode
  readonly site: Site | null

  constructor(code: ScraperErrorCode, message: string, site: Site | null = null) {
    super(message)
    this.name = 'ScraperError'
    this.code = code
    this.site = site
  }
}

export const MANUAL_FALLBACK_HINT =
  'You can still add the photos by hand: open the listing in your browser, copy the image ' +
  'addresses (or Property24 image numbers) and paste them into the manual fallback.'

/** The "site changed / scraper broke" error: no photos found where they used to be. */
export function siteChangedError(site: Site, detail?: string): ScraperError {
  const name = SITE_NAME[site]
  const what = detail ? ` (${detail})` : ''
  return new ScraperError(
    'no-photos',
    `Couldn't find any photos on this ${name} listing${what}. ${name} may have changed its ` +
      `page layout, which breaks the automatic scraper. ${MANUAL_FALLBACK_HINT}`,
    site
  )
}

export const EMPTY_DETAILS: ListingDetails = {
  title: null,
  price: null,
  suburb: null,
  city: null,
  bedrooms: null,
  bathrooms: null,
  garages: null,
  erf_size: null,
  floor_size: null,
  levies: null,
  rates: null,
  description: null,
  agent: null,
  agency: null
}
