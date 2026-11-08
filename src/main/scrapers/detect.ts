/**
 * Works out which site a pasted listing URL belongs to and its listing id.
 * The per-site path rules live in the site modules; this file only routes.
 */
import { P24_CANONICAL_ORIGIN, P24_HOSTS, parseP24ListingPath } from './property24'
import { PP_CANONICAL_ORIGIN, PP_HOSTS, parsePpListingPath } from './privateproperty'
import { SITE_CODE, SITE_NAME, ScraperError, type ParsedListingUrl, type Site } from './types'

interface SiteRule {
  site: Site
  hosts: readonly string[]
  origin: string
  parsePath(segments: string[]): string | null
}

const RULES: SiteRule[] = [
  { site: 'p24', hosts: P24_HOSTS, origin: P24_CANONICAL_ORIGIN, parsePath: parseP24ListingPath },
  { site: 'pp', hosts: PP_HOSTS, origin: PP_CANONICAL_ORIGIN, parsePath: parsePpListingPath }
]

const UNSUPPORTED =
  'PlanBoard only reads listings from Property24 or Private Property. Paste the full address ' +
  'of one listing, for example https://www.property24.com/for-sale/…/115212892.'

export function detectListing(input: string): ParsedListingUrl {
  const trimmed = input.trim()
  if (trimmed === '') throw new ScraperError('unsupported-site', UNSUPPORTED)

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new ScraperError('unsupported-site', UNSUPPORTED)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ScraperError('unsupported-site', UNSUPPORTED)
  }

  const host = url.hostname.toLowerCase()
  const rule = RULES.find((r) => r.hosts.includes(host))
  if (!rule) throw new ScraperError('unsupported-site', UNSUPPORTED)

  const segments = url.pathname.split('/').filter(Boolean)
  const externalId = rule.parsePath(segments)
  if (!externalId) {
    throw new ScraperError(
      'not-a-listing',
      `This ${SITE_NAME[rule.site]} link isn't a single listing (it looks like a search, area or ` +
        `agency page). Open one property on ${SITE_NAME[rule.site]} and copy its address from ` +
        `the browser.`,
      rule.site
    )
  }

  const path = [...segments.slice(0, -1), externalId].join('/')
  return { site: rule.site, externalId, url: `${rule.origin}/${path}` }
}

/**
 * Folder name for a listing: `<Suburb>_<P24|PP>-<id>`, for example `Cornwall-Hill_P24-117097988`.
 * Accents are dropped, anything that isn't a letter or digit becomes a single hyphen.
 */
export function suggestFolderName(suburb: string | null, site: Site, externalId: string): string {
  const safe = (s: string): string =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['\u2019]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  const place = safe(suburb ?? '') || 'Listing'
  const id = safe(externalId) || 'unknown'
  return `${place}_${SITE_CODE[site]}-${id}`
}
