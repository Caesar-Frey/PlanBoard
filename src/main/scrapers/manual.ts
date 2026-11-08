/**
 * Manual fallback: the user pastes image ids or image addresses copied from their browser.
 * Pure; the UI arrives in milestone 3.
 */
import { uniqueBy } from './html'
import { isP24GalleryImageUrl, p24PhotoFromId, parseP24ImageUrl } from './property24'
import { parsePpImageUrl, ppPhotosFromRefs } from './privateproperty'
import type { ScrapedPhoto, Site } from './types'

export interface ManualRejection {
  token: string
  reason: string
}

export interface ManualParseResult {
  photos: ScrapedPhoto[]
  rejected: ManualRejection[]
}

export interface ManualOptions {
  /**
   * Private Property's internal image listing number (e.g. `12158393`, from an image address).
   * When given, bare photo keys are accepted and other listings' images are rejected.
   */
  ppImageListingId?: string
}

/** Splits on newlines, commas, semicolons and whitespace. */
function tokens(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function parseP24(list: string[]): ManualParseResult {
  const ids: string[] = []
  const rejected: ManualRejection[] = []
  for (const token of list) {
    if (/^\d+$/.test(token)) {
      ids.push(token)
      continue
    }
    const parsed = parseP24ImageUrl(token)
    if (parsed && isP24GalleryImageUrl(token)) ids.push(parsed.id)
    else if (parsed)
      rejected.push({ token, reason: 'This is an agent photo or logo, not a listing photo.' })
    else {
      rejected.push({
        token,
        reason: 'Not a Property24 image number or an images.prop24.com address.'
      })
    }
  }
  return { photos: uniqueBy(ids, (id) => id).map(p24PhotoFromId), rejected }
}

/** Private Property photo keys seen so far are 22 letters and digits (a short UUID). */
const PP_BARE_KEY = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9]{20,24}$/

function parsePp(list: string[], listingId: string | undefined): ManualParseResult {
  const refs: { listingId: string; photoKey: string }[] = []
  const rejected: ManualRejection[] = []
  for (const token of list) {
    const ref = parsePpImageUrl(token)
    if (ref) {
      if (listingId && ref.listingId !== listingId) {
        rejected.push({ token, reason: 'This image belongs to a different listing.' })
      } else {
        refs.push(ref)
      }
    } else if (listingId && PP_BARE_KEY.test(token)) {
      refs.push({ listingId, photoKey: token })
    } else {
      rejected.push({
        token,
        reason: 'Paste the full image address (it starts with https://images.pp.co.za/listing/).'
      })
    }
  }
  return { photos: ppPhotosFromRefs(refs), rejected }
}

export function parseManualInput(
  text: string,
  site: Site,
  options: ManualOptions = {}
): ManualParseResult {
  const list = tokens(text)
  return site === 'p24' ? parseP24(list) : parsePp(list, options.ppImageListingId)
}
