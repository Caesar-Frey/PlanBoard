/**
 * Property24: every Property24-specific URL pattern, selector and page script lives here.
 *
 * Images: https://images.prop24.com/<numericId>[/<SizeSuffix>]. The bare id is the full-size
 * JPEG. Gallery sizes are `Ensure…` and `Crop…`; agent photos (`UpperCrop…`) and agency logos
 * (`Fit…`) share the host and are filtered out. Ids are not sequential.
 */
import {
  cleanText,
  countWarnings,
  firstNumber,
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

export const P24_HOSTS = ['property24.com', 'www.property24.com'] as const
export const P24_CANONICAL_ORIGIN = 'https://www.property24.com'

/**
 * Listing paths look like `/for-sale/<suburb>/<city>/<province>/<suburbId>/<listingId>`.
 * The same path without the last segment is the suburb search page, so the segment count matters.
 * Returns the listing id, or null when the path is not a single listing.
 */
export function parseP24ListingPath(segments: string[]): string | null {
  if (segments.length !== 6) return null
  if (!/^(for-sale|to-rent)$/i.test(segments[0] ?? '')) return null
  const id = segments[5] ?? ''
  return /^\d{5,}$/.test(id) ? id : null
}

// ---------------------------------------------------------------------------------------------
// Image URLs
// ---------------------------------------------------------------------------------------------

const IMAGE_HOST = 'images.prop24.com'
/** Gallery sizes. Everything else on the host (UpperCrop…, Fit…) is an agent photo or logo. */
const GALLERY_SUFFIX = /^(Ensure|Crop)\d+x\d+$/i

export function parseP24ImageUrl(url: string): { id: string; suffix: string | null } | null {
  const u = tryUrl(url)
  if (!u || u.hostname.toLowerCase() !== IMAGE_HOST) return null
  const m = /^\/(\d+)(?:\/([A-Za-z0-9]+))?\/?$/.exec(u.pathname)
  if (!m || !m[1]) return null
  return { id: m[1], suffix: m[2] ?? null }
}

export function isP24GalleryImageUrl(url: string): boolean {
  const parsed = parseP24ImageUrl(url)
  if (!parsed) return false
  return parsed.suffix === null || GALLERY_SUFFIX.test(parsed.suffix)
}

export function p24FullSizeUrl(id: string): string {
  return `https://${IMAGE_HOST}/${id}`
}

export function p24FileName(id: string): string {
  return `image_${id}.jpg`
}

export function p24PhotoFromId(id: string): ScrapedPhoto {
  return { sourceUrl: p24FullSizeUrl(id), photoId: id, fileName: p24FileName(id) }
}

/** Filters to gallery images, normalises to bare full-size URLs and de-duplicates in order. */
export function p24PhotosFromUrls(urls: Iterable<string>): ScrapedPhoto[] {
  const ids: string[] = []
  for (const url of urls) {
    if (!isP24GalleryImageUrl(url)) continue
    const parsed = parseP24ImageUrl(url)
    if (parsed) ids.push(parsed.id)
  }
  return uniqueBy(ids, (id) => id).map(p24PhotoFromId)
}

// ---------------------------------------------------------------------------------------------
// Page reading
// ---------------------------------------------------------------------------------------------

/** "Photos (56)" on the gallery tab, or "See all 56 images" on the gallery button. */
export function parseP24ExpectedCount(htmlOrText: string): number | null {
  const text = htmlOrText.replace(/<[^>]+>/g, ' ')
  const m =
    /\bPhotos\s*\(\s*(\d+)\s*\)/i.exec(text) ??
    /\bSee all\s+(\d+)\s+(?:images?|photos?)\b/i.exec(text)
  return m?.[1] ? Number(m[1]) : null
}

/**
 * Image ids of every gallery slot, in gallery order. Duplicates are kept: a listing can show the
 * same photo twice, and the slot count is what "Photos (N)" counts.
 */
export function extractP24GallerySlots(html: string): string[] {
  const root = parseHtml(html)
  const slots = root
    .querySelectorAll('.js_galleryImage[data-index]')
    .map((el) => ({
      index: Number(el.getAttribute('data-index')),
      url:
        el.querySelector('[data-lightbox-src]')?.getAttribute('data-lightbox-src') ??
        el.getAttribute('data-image-url') ??
        ''
    }))
    .filter((s) => Number.isFinite(s.index))
    .sort((a, b) => a.index - b.index)
    .map((s) => s.url)

  // Fallback: the "Photo Grid" thumbnails inside the gallery pop-up.
  const urls = slots.length
    ? slots
    : root
        .querySelectorAll('#gallery-thumbnails img.js_galleryThumbnail')
        .map((img) => img.getAttribute('lazy-src') ?? img.getAttribute('src') ?? '')

  return urls.filter(isP24GalleryImageUrl).map((u) => parseP24ImageUrl(u)?.id ?? '')
}

function overviewRows(root: HTMLElement): Map<string, string> {
  const rows = new Map<string, string>()
  for (const row of root.querySelectorAll('.p24_propertyOverviewRow')) {
    const key = cleanText(row.querySelector('.p24_propertyOverviewKey')?.text)
    const value = cleanText(
      (row.querySelector('.p24_info') ?? row.querySelector('.p24_propertyOverviewResult'))?.text
    )
    if (key && value && !rows.has(key.toLowerCase())) rows.set(key.toLowerCase(), value)
  }
  return rows
}

function firstOf(rows: Map<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = rows.get(k)
    if (v) return v
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

function formatRand(amount: string | null): string | null {
  if (!amount || !/^\d+$/.test(amount)) return null
  return `R ${amount.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

export function extractP24Details(html: string, listingUrl: string): ListingDetails {
  const root = parseHtml(html)
  const rows = overviewRows(root)
  const ld = jsonLdBlocks(root).find((b) => pick(b, '@type') === 'RealEstateListing')

  // "Drummond, Hillcrest" → suburb, city. Fall back to the URL's slugs.
  const address = textOf(root, 'address.p24_textAddress')
  const parts = (address ?? '')
    .split(',')
    .map((p) => cleanText(p))
    .filter(Boolean) as string[]
  const segments = (tryUrl(listingUrl)?.pathname ?? '').split('/').filter(Boolean)
  const suburb =
    parts[0] ?? pick(ld, 'about', 'address', 'addressLocality') ?? titleCaseSlug(segments[1])
  const city = (parts.length > 1 ? parts[parts.length - 1] : null) ?? titleCaseSlug(segments[2])

  // Full description is in the hidden "expanded" block; the headline is the card's <h5>.
  const about = root.querySelector('.p24_listingAbout') ?? root
  const headline = textOf(about, 'h5')
  const body =
    paragraphText(about.querySelector('.js_expandedText')) ??
    paragraphText(about.querySelector('.js_visibleText')) ??
    paragraphText(about.querySelector('.p24_descriptionContainer'))
  const description = [headline, body].filter(Boolean).join('\n\n') || null

  return {
    ...EMPTY_DETAILS,
    title: textOf(root, 'h1'),
    price:
      textOf(root, '.p24_price') ?? formatRand(pick(ld, 'offers', 'priceSpecification', 'price')),
    suburb,
    city,
    bedrooms: firstNumber(rows.get('bedrooms')),
    bathrooms: firstNumber(rows.get('bathrooms')),
    garages: firstNumber(firstOf(rows, ['garages', 'garage'])),
    erf_size: firstOf(rows, ['erf size', 'land size', 'stand size']),
    floor_size: firstOf(rows, ['floor size', 'floor area']),
    levies: firstOf(rows, ['levies', 'levy']),
    rates: firstOf(rows, ['rates and taxes', 'rates & taxes', 'rates']),
    description,
    agent: pick(ld, 'offers', 'offeredBy', 'name'),
    agency: pick(ld, 'offers', 'offeredBy', 'worksFor', 'name')
  }
}

// ---------------------------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------------------------

interface Collected {
  photos: ScrapedPhoto[]
  expected: number | null
  slots: string[]
  /** Every stated gallery slot is accounted for (even if some slots repeat a photo). */
  complete: boolean
}

function collect({ html, networkUrls }: ScrapeCapture): Collected {
  const slots = extractP24GallerySlots(html)
  const expected = parseP24ExpectedCount(html)
  const fromPage = uniqueBy(slots, (id) => id).map(p24PhotoFromId)
  // The page gallery is authoritative when complete: network-only images could belong to
  // other listings shown on the page. Otherwise add what the network saw.
  const pageComplete = fromPage.length > 0 && (expected === null || slots.length >= expected)
  const photos = pageComplete
    ? fromPage
    : uniqueBy([...fromPage, ...p24PhotosFromUrls(networkUrls)], (p) => p.photoId)
  const complete =
    expected !== null && (photos.length >= expected || (pageComplete && slots.length >= expected))
  return { photos, expected, slots, complete }
}

function duplicateWarning(slots: string[], unique: number): string | null {
  const positions = new Map<string, number[]>()
  slots.forEach((id, i) => positions.set(id, [...(positions.get(id) ?? []), i + 1]))
  const dups = [...positions.values()].filter((p) => p.length > 1)
  if (dups.length === 0) return null
  if (dups.length === 1 && dups[0]!.length === 2) {
    const [a, b] = dups[0]!
    return (
      `The listing shows ${slots.length} photos, but one photo appears twice (gallery ` +
      `positions ${a} and ${b}), so ${unique} unique photos were found.`
    )
  }
  return (
    `The listing shows ${slots.length} photos, but ${slots.length - unique} of them repeat ` +
    `earlier ones, so ${unique} unique photos were found.`
  )
}

export function buildP24Result(capture: ScrapeCapture): ScrapeResult {
  const { photos, expected, slots } = collect(capture)
  if (photos.length === 0) throw siteChangedError('p24')

  const dup =
    expected !== null && slots.length >= expected ? duplicateWarning(slots, photos.length) : null
  const warnings = dup ? [dup] : countWarnings(photos.length, expected, SITE_NAME.p24)

  return {
    site: 'p24',
    externalId: capture.listing.externalId,
    url: capture.listing.url,
    expectedPhotoCount: expected,
    photos,
    details: extractP24Details(capture.html, capture.listing.url),
    warnings
  }
}

// ---------------------------------------------------------------------------------------------
// Live page scripts (run in the hidden window; plain DOM only)
// ---------------------------------------------------------------------------------------------

const visible = `(el) => !!el && el.offsetParent !== null`

export const P24_SCRAPER: SiteScraper = {
  site: 'p24',
  imageUrlPatterns: ['*://images.prop24.com/*'],
  dismissPopupScripts: [
    // The cookie notice only has a "Close" button (no accept/reject choice).
    `(() => { const v = ${visible}; const b = document.querySelector('#cookieBannerClose');
      if (v(b)) { b.click(); return 'closed cookie notice' } return 'no cookie notice' })()`
  ],
  openGalleryScripts: [
    `(() => { const b = document.querySelector('#see-all-images-button') ||
        [...document.querySelectorAll('div,button,a')].find((e) => /^See all \\d+ images?$/i.test((e.innerText || '').trim()));
      if (!b) return 'no "See all" button'; b.click(); return 'clicked "See all"' })()`,
    // Switch the pop-up to its "Photo Grid" tab so thumbnails can be scrolled into view.
    `(() => { const t = document.querySelector('.js_showThumbnailGallery');
      if (!t) return 'no Photo Grid tab'; t.click(); return 'opened Photo Grid' })()`
  ],
  stepGalleryScript: `(() => {
    const imgs = [...document.querySelectorAll('#gallery-thumbnails img.js_galleryThumbnail')];
    const pending = imgs.filter((i) => !/images\\.prop24\\.com/.test(i.currentSrc || i.src));
    pending.slice(0, 6).forEach((i) => i.scrollIntoView({ block: 'center' }));
    const box = document.querySelector('#gallery-thumbnails .p24_scrollable');
    if (box) box.scrollTop += 400;
    return { pending: pending.length, total: imgs.length };
  })()`,
  progress(capture) {
    const { photos, expected, complete } = collect(capture)
    return { found: photos.length, expected, complete }
  },
  build: buildP24Result
}
