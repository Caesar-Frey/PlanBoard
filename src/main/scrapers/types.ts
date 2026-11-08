/**
 * Shared scraper contracts. Site modules (property24.ts, privateproperty.ts)
 * arrive in milestone 2; keep every site-specific pattern inside its own module.
 */

export type SiteId = 'p24' | 'pp'

export interface ParsedListingUrl {
  site: SiteId
  /** Property24 numeric id, or Private Property `T<number>` id. */
  externalId: string
  url: string
}

export interface ScrapedPhoto {
  /** Full-size URL to download. */
  sourceUrl: string
  /** File name to save as inside the listing folder. */
  fileName: string
}

export interface ScrapeResult {
  listing: ParsedListingUrl
  photos: ScrapedPhoto[]
  /** Photo count the listing page states, if found. Used to warn about missing photos. */
  photoCountExpected: number | null
}
