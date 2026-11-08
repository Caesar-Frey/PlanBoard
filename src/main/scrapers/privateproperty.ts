/**
 * Private Property: every Private Property-specific URL pattern, selector and page script
 * lives here.
 *
 * Images: https://images.pp.co.za/listing/<imageListingId>/<photoKey>/<w>/<h>/contain/jpegorpng.
 * `<imageListingId>` is an internal number (e.g. 12158393), NOT the T-number in the page URL, so
 * it is read from the page (og:image / photo grid). Photo keys are random and must be read from
 * the page. Without the size path the host serves the original upload, which is the largest and
 * least recompressed version; sizes above 1600/1066 return HTTP 500 (checked 8 Nov 2026).
 */
import {
  cleanText,
  countWarnings,
  firstNumber,
  isRecord,
  jsonLdBlocks,
  paragraphText,
  parseHtml,
  pick,
  textOf,
  tryUrl,
  uniqueBy,
  type HTMLElement
} from './html'
import {
  EMPTY_DETAILS,
  SITE_NAME,
  siteChangedError,
  type ListingDetails,
  type ScrapeCapture,
  type ScrapedPhoto,
  type ScrapeResult,
  type SiteScraper
} from './types'

// ---------------------------------------------------------------------------------------------
// Listing URLs
// ---------------------------------------------------------------------------------------------

export const PP_HOSTS = ['privateproperty.co.za', 'www.privateproperty.co.za'] as const
export const PP_CANONICAL_ORIGIN = 'https://www.privateproperty.co.za'

/**
 * Listing paths end in `T<number>`:
 * `/for-sale/<province>/<region>/<city>/<suburb>/<street>/T5669598`. Search and area pages end
 * in a plain number instead. Returns the upper-cased T-number, or null.
 */
export function parsePpListingPath(segments: string[]): string | null {
  if (segments.length < 2) return null
  if (!/^(for-sale|to-rent)$/i.test(segments[0] ?? '')) return null
  const last = segments[segments.length - 1] ?? ''
  return /^t\d{4,}$/i.test(last) ? last.toUpperCase() : null
}

// ---------------------------------------------------------------------------------------------
// Image URLs
// ---------------------------------------------------------------------------------------------

const IMAGE_HOST = 'images.pp.co.za'
/** Largest resized variant the image host serves; used only as a download fallback. */
export const PP_FALLBACK_SIZE = { width: 1600, height: 1066 } as const

export interface PpImageRef {
  listingId: string
  photoKey: string
  width: number | null
  height: number | null
}

export function parsePpImageUrl(url: string): PpImageRef | null {
  const u = tryUrl(url)
  if (!u || u.hostname.toLowerCase() !== IMAGE_HOST) return null
  const m = /^\/listing\/(\d+)\/([A-Za-z0-9_-]+)(?:\/(\d+)\/(\d+)(?:\/.*)?)?\/?$/.exec(u.pathname)
  if (!m || !m[1] || !m[2]) return null
  return {
    listingId: m[1],
    photoKey: m[2],
    width: m[3] ? Number(m[3]) : null,
    height: m[4] ? Number(m[4]) : null
  }
}

/** The original upload: the biggest image the host serves. */
export function ppOriginalUrl(listingId: string, photoKey: string): string {
  return `https://${IMAGE_HOST}/listing/${listingId}/${photoKey}`
}

export function ppResizedUrl(
  listingId: string,
  photoKey: string,
  { width, height }: { width: number; height: number } = PP_FALLBACK_SIZE
): string {
  return `https://${IMAGE_HOST}/listing/${listingId}/${photoKey}/${width}/${height}/contain/jpegorpng`
}

/** `image_<nn>_<photoKey>.jpg`, numbered from 01 in gallery order. */
export function ppFileName(index: number, photoKey: string): string {
  return `image_${String(index + 1).padStart(2, '0')}_${photoKey}.jpg`
}

/** Normalised photo entries for refs already known to belong to this listing. */
export function ppPhotosFromRefs(
  refs: Iterable<{ listingId: string; photoKey: string }>
): ScrapedPhoto[] {
  return uniqueBy(refs, (r) => r.photoKey).map((r, i) => ({
    sourceUrl: ppOriginalUrl(r.listingId, r.photoKey),
    fallbackUrl: ppResizedUrl(r.listingId, r.photoKey),
    photoId: r.photoKey,
    fileName: ppFileName(i, r.photoKey)
  }))
}

/** Keeps only this listing's images, rewrites them to full size and de-duplicates in order. */
export function ppPhotosFromUrls(urls: Iterable<string>, imageListingId: string): ScrapedPhoto[] {
  const refs: PpImageRef[] = []
  for (const url of urls) {
    const ref = parsePpImageUrl(url)
    if (ref && ref.listingId === imageListingId) refs.push(ref)
  }
  return ppPhotosFromRefs(refs)
}

// ---------------------------------------------------------------------------------------------
// Page reading
// ---------------------------------------------------------------------------------------------

function imgSrcs(root: HTMLElement, selector: string): string[] {
  return root
    .querySelectorAll(selector)
    .map((img) => img.getAttribute('src') ?? img.getAttribute('data-src') ?? '')
    .filter((src) => parsePpImageUrl(src) !== null)
}

/** The internal listing number used on the image host, read from the page. */
export function findPpImageListingId(html: string): string | null {
  const root = parseHtml(html)
  const candidates = [
    root.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
    ...jsonLdBlocks(root).flatMap((b) =>
      isRecord(b) && Array.isArray(b['photo'])
        ? b['photo'].map((p) => pick(p, 'contentUrl') ?? '')
        : []
    ),
    ...imgSrcs(root, '.details-page-photogrid img'),
    ...imgSrcs(root, '#fs-gallery img')
  ]
  for (const url of candidates) {
    const ref = parsePpImageUrl(url)
    if (ref) return ref.listingId
  }
  return null
}

/** Gallery image URLs in gallery order: the full-screen gallery, then the photo grid, then og:image. */
export function extractPpGalleryUrls(html: string): string[] {
  const root = parseHtml(html)
  const og = root.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? ''
  return [
    ...imgSrcs(root, '#fs-gallery img'),
    ...imgSrcs(root, '.details-page-photogrid img'),
    ...(parsePpImageUrl(og) ? [og] : [])
  ]
}

/** "Photos 39" on the header button (also "Photos (39)" or "View all 39 photos"). */
export function parsePpExpectedCount(html: string): number | null {
  const root = parseHtml(html)
  for (const el of root.querySelectorAll('button, a')) {
    const text = cleanText(el.text) ?? ''
    const m =
      /^Photos\s*\(?\s*(\d+)\s*\)?$/i.exec(text) ??
      /^View all\s+(\d+)\s+(?:photos?|images?)$/i.exec(text)
    if (m?.[1]) return Number(m[1])
  }
  return null
}

/** Reads `<span class="x__name-value">Label <span class="x__value">Value</span></span>` lists. */
function nameValues(root: HTMLElement, block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const el of root.querySelectorAll(`.${block}__name-value`)) {
    const valueEl = el.querySelector(`.${block}__value`)
    const value = cleanText(valueEl?.text)
    const label = cleanText(valueEl ? el.text.replace(valueEl.text, '') : null)
    if (label && value && !out.has(label.toLowerCase())) out.set(label.toLowerCase(), value)
  }
  return out
}

function firstOf(maps: Map<string, string>[], keys: string[]): string | null {
  for (const map of maps) {
    for (const k of keys) {
      const v = map.get(k)
      if (v) return v
    }
  }
  return null
}

function titleCaseSlug(slug: string | undefined): string | null {
  if (!slug) return null
  return cleanText(
    decodeURIComponent(slug)
      .split('-')
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ')
  )
}

export function extractPpDetails(html: string, listingUrl?: string): ListingDetails {
  const root = parseHtml(html)
  const blocks = jsonLdBlocks(root)
  const residence = blocks.find((b) => isRecord(b) && isRecord(b['address']))

  // JSON-LD "additionalProperty": Bedrooms / Bathrooms / Garages.
  const ldProps = new Map<string, string>()
  const extra = isRecord(residence) ? residence['additionalProperty'] : null
  if (Array.isArray(extra)) {
    for (const p of extra) {
      const name = pick(p, 'name')
      const value = pick(p, 'value')
      if (name && value) ldProps.set(name.toLowerCase(), value)
    }
  }

  const details = nameValues(root, 'property-details')
  const features = nameValues(root, 'property-features')
  const main = new Map<string, string>()
  for (const el of root.querySelectorAll('.listing-details__main-feature[title]')) {
    const label = cleanText(el.getAttribute('title'))
    const value = cleanText(el.text)
    if (label && value) main.set(label.toLowerCase(), value)
  }

  // "Stonehenge, Nelspruit (Mbombela)" → suburb, city. Fall back to the URL's slugs.
  const locality = pick(residence, 'address', 'addressLocality')
  const comma = locality ? locality.indexOf(',') : -1
  const segments = (listingUrl ? (tryUrl(listingUrl)?.pathname ?? '') : '')
    .split('/')
    .filter(Boolean)
  const suburb =
    (comma > 0 ? cleanText(locality!.slice(0, comma)) : locality) ?? titleCaseSlug(segments[4])
  const city =
    (comma > 0 ? cleanText(locality!.slice(comma + 1)) : null) ?? titleCaseSlug(segments[3])

  const contacts = root.querySelector('#listing-contacts-container')
  const agentAlt = contacts?.querySelector('img[alt^="Photo of "]')?.getAttribute('alt') ?? null
  const agencyLink = contacts?.querySelector('a[href^="/estate-agency/"]')

  return {
    ...EMPTY_DETAILS,
    title: textOf(root, 'h1.listing-details__title') ?? textOf(root, 'h1'),
    price: textOf(root, '.listing-price-display__price'),
    suburb,
    city,
    bedrooms: firstNumber(firstOf([ldProps, features, main], ['bedrooms'])),
    bathrooms: firstNumber(firstOf([ldProps, features, main], ['bathrooms'])),
    garages: firstNumber(firstOf([ldProps, features], ['garages', 'garage parking', 'garage'])),
    erf_size: firstOf([details, main], ['erf size', 'land size', 'stand size']),
    floor_size: firstOf([details, main], ['floor size', 'floor area']),
    levies: firstOf([details], ['levies', 'levy']),
    rates: firstOf([details], ['rates and taxes', 'rates & taxes', 'rates']),
    description: paragraphText(root.querySelector('.listing-description__text')),
    agent: agentAlt ? cleanText(agentAlt.replace(/^Photo of /, '')) : null,
    agency: cleanText(agencyLink?.getAttribute('title') ?? agencyLink?.text)
  }
}

// ---------------------------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------------------------

function mostCommonListingId(urls: string[]): string | null {
  const counts = new Map<string, number>()
  for (const url of urls) {
    const ref = parsePpImageUrl(url)
    if (ref) counts.set(ref.listingId, (counts.get(ref.listingId) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [id, n] of counts) {
    if (n > bestCount) [best, bestCount] = [id, n]
  }
  return best
}

function collect({ html, networkUrls }: ScrapeCapture): {
  photos: ScrapedPhoto[]
  expected: number | null
  complete: boolean
} {
  const expected = parsePpExpectedCount(html)
  const imageListingId = findPpImageListingId(html) ?? mostCommonListingId(networkUrls)
  const photos = imageListingId
    ? ppPhotosFromUrls([...extractPpGalleryUrls(html), ...networkUrls], imageListingId)
    : []
  return { photos, expected, complete: expected !== null && photos.length >= expected }
}

export function buildPpResult(capture: ScrapeCapture): ScrapeResult {
  const { photos, expected } = collect(capture)
  if (photos.length === 0) throw siteChangedError('pp')
  return {
    site: 'pp',
    externalId: capture.listing.externalId,
    url: capture.listing.url,
    expectedPhotoCount: expected,
    photos,
    details: extractPpDetails(capture.html, capture.listing.url),
    warnings: countWarnings(photos.length, expected, SITE_NAME.pp)
  }
}

// ---------------------------------------------------------------------------------------------
// Live page scripts (run in the hidden window; plain DOM only)
// ---------------------------------------------------------------------------------------------

/**
 * Cookie prompt: click "Reject all" if it is showing; otherwise open "Cookie settings" so the
 * next run can reject. Never clicks an accept button. (Their "Accept all" button carries a
 * `reject-all` CSS class, so match on the visible label, not the class.)
 */
const REJECT_COOKIES = `(() => {
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const buttons = [...document.querySelectorAll('button')];
  const byLabel = (re) => buttons.find((b) => re.test((b.innerText || '').trim()) && shown(b));
  const reject = byLabel(/^reject all$/i);
  if (reject) { reject.click(); return 'rejected non-essential cookies' }
  const settings = byLabel(/^cookie settings$/i);
  if (settings) { settings.click(); return 'opened cookie settings' }
  return 'no cookie prompt';
})()`

export const PP_SCRAPER: SiteScraper = {
  site: 'pp',
  imageUrlPatterns: ['*://images.pp.co.za/*'],
  dismissPopupScripts: [REJECT_COOKIES, REJECT_COOKIES],
  openGalleryScripts: [
    `(() => {
      const buttons = [...document.querySelectorAll('button')];
      const b = document.querySelector('#photo-grid-view-all') ||
        buttons.find((x) => /^view all$/i.test((x.innerText || '').trim())) ||
        buttons.find((x) => /^photos\\s*\\(?\\d+\\)?$/i.test((x.innerText || '').trim()));
      if (!b) return 'no "View All" button';
      b.click();
      return 'clicked "View All"';
    })()`
  ],
  stepGalleryScript: `(() => {
    const imgs = [...document.querySelectorAll('#fs-gallery img')];
    const pending = imgs.filter((i) => !(i.complete && i.naturalWidth > 0));
    pending.slice(0, 6).forEach((i) => i.scrollIntoView({ block: 'center' }));
    return { pending: pending.length, total: imgs.length };
  })()`,
  progress(capture) {
    const { photos, expected, complete } = collect(capture)
    return { found: photos.length, expected, complete }
  },
  build: buildPpResult
}
