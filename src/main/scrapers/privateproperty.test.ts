import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildPpResult,
  extractPpDetails,
  extractPpGalleryUrls,
  findPpImageListingId,
  parsePpExpectedCount,
  parsePpImageUrl,
  ppFileName,
  ppOriginalUrl,
  ppPhotosFromUrls,
  ppResizedUrl
} from './privateproperty'
import { ScraperError } from './types'

const FIXTURES = resolve(import.meta.dirname, '../../../test/fixtures/pp')
const initialHtml = readFileSync(resolve(FIXTURES, 'listing-initial.html'), 'utf8')
const galleryHtml = readFileSync(resolve(FIXTURES, 'listing-gallery-open.html'), 'utf8')
const networkUrls = JSON.parse(
  readFileSync(resolve(FIXTURES, 'network-urls.json'), 'utf8')
) as string[]

const LISTING = {
  site: 'pp' as const,
  externalId: 'T5669598',
  url: 'https://www.privateproperty.co.za/for-sale/mpumalanga/mpumalanga-lowveld/nelspruit-mbombela/stonehenge/18-golden-weaver-turn/T5669598'
}
/** The image host uses an internal listing number, not the T-number in the page URL. */
const IMAGE_LISTING_ID = '12158393'
const FIRST_KEY = 'o6IXxlU62B5cdjk88PBzL1'
const img = (listingId: string, key: string, size = '600/450'): string =>
  `https://images.pp.co.za/listing/${listingId}/${key}/${size}/contain/jpegorpng`

describe('parsePpImageUrl', () => {
  it('reads listing id, photo key and size', () => {
    expect(parsePpImageUrl(img(IMAGE_LISTING_ID, FIRST_KEY, '1600/1066'))).toEqual({
      listingId: IMAGE_LISTING_ID,
      photoKey: FIRST_KEY,
      width: 1600,
      height: 1066
    })
  })

  it('reads the bare original URL', () => {
    expect(
      parsePpImageUrl(`https://images.pp.co.za/listing/${IMAGE_LISTING_ID}/${FIRST_KEY}`)
    ).toEqual({ listingId: IMAGE_LISTING_ID, photoKey: FIRST_KEY, width: null, height: null })
  })

  it('returns null for other hosts and paths', () => {
    expect(
      parsePpImageUrl(
        'https://helium.privateproperty.co.za/live-za-images/offices/2040/image/x.jpg'
      )
    ).toBeNull()
    expect(
      parsePpImageUrl('https://images.pp.co.za/development/1/abc/600/450/contain/jpegorpng')
    ).toBeNull()
    expect(parsePpImageUrl('garbage')).toBeNull()
  })
})

describe('naming and size rewrite', () => {
  it('downloads the original (largest) image, with the biggest resized variant as fallback', () => {
    expect(ppOriginalUrl(IMAGE_LISTING_ID, FIRST_KEY)).toBe(
      `https://images.pp.co.za/listing/${IMAGE_LISTING_ID}/${FIRST_KEY}`
    )
    expect(ppResizedUrl(IMAGE_LISTING_ID, FIRST_KEY)).toBe(
      img(IMAGE_LISTING_ID, FIRST_KEY, '1600/1066')
    )
  })

  it('names files image_<nn>_<photoKey>.jpg, numbered from 01', () => {
    expect(ppFileName(0, FIRST_KEY)).toBe(`image_01_${FIRST_KEY}.jpg`)
    expect(ppFileName(9, 'abc')).toBe('image_10_abc.jpg')
    expect(ppFileName(122, 'abc')).toBe('image_123_abc.jpg')
  })
})

describe('findPpImageListingId', () => {
  it('reads the image-host listing id from the page', () => {
    expect(findPpImageListingId(initialHtml)).toBe(IMAGE_LISTING_ID)
    expect(findPpImageListingId(galleryHtml)).toBe(IMAGE_LISTING_ID)
  })

  it('falls back to the photo grid when there is no og:image', () => {
    const page = `<div class="details-page-photogrid"><img src="${img('42', 'k1')}"></div>`
    expect(findPpImageListingId(page)).toBe('42')
  })

  it('returns null when the page has no listing images', () => {
    expect(findPpImageListingId('<html><body>nothing</body></html>')).toBeNull()
  })
})

describe('ppPhotosFromUrls', () => {
  it('keeps only this listing’s photos, rewritten to full size, de-duplicated in order', () => {
    const urls = [
      img(IMAGE_LISTING_ID, 'aaa', '600/450'),
      img('99999999', 'other', '600/450'), // another listing (e.g. "similar properties")
      img(IMAGE_LISTING_ID, 'bbb', '1024/682'),
      img(IMAGE_LISTING_ID, 'aaa', '1600/1066'),
      'https://helium.privateproperty.co.za/live-za-images/offices/2040/image/logo.jpg'
    ]
    expect(ppPhotosFromUrls(urls, IMAGE_LISTING_ID)).toEqual([
      {
        sourceUrl: `https://images.pp.co.za/listing/${IMAGE_LISTING_ID}/aaa`,
        fallbackUrl: img(IMAGE_LISTING_ID, 'aaa', '1600/1066'),
        photoId: 'aaa',
        fileName: 'image_01_aaa.jpg'
      },
      {
        sourceUrl: `https://images.pp.co.za/listing/${IMAGE_LISTING_ID}/bbb`,
        fallbackUrl: img(IMAGE_LISTING_ID, 'bbb', '1600/1066'),
        photoId: 'bbb',
        fileName: 'image_02_bbb.jpg'
      }
    ])
  })

  it('finds all 39 photos in the captured network log', () => {
    expect(ppPhotosFromUrls(networkUrls, IMAGE_LISTING_ID)).toHaveLength(39)
  })
})

describe('parsePpExpectedCount', () => {
  it('reads the count from the Photos button', () => {
    expect(
      parsePpExpectedCount('<button class="btn"><svg></svg>Photos <span>39</span></button>')
    ).toBe(39)
    expect(parsePpExpectedCount('<button>Photos (12)</button>')).toBe(12)
    expect(parsePpExpectedCount('<button>View all 40 photos</button>')).toBe(40)
  })

  it('does not mistake the "Photo gallery" heading for a count', () => {
    expect(parsePpExpectedCount('<h2>Photo gallery</h2><button>View All</button>')).toBeNull()
  })

  it('reads 39 from the saved listing', () => {
    expect(parsePpExpectedCount(initialHtml)).toBe(39)
  })
})

describe('extractPpGalleryUrls', () => {
  it('reads the 9 grid photos before the gallery is opened', () => {
    const urls = extractPpGalleryUrls(initialHtml)
    const keys = new Set(urls.map((u) => parsePpImageUrl(u)?.photoKey))
    expect(keys.size).toBe(9)
    expect(parsePpImageUrl(urls[0] ?? '')?.photoKey).toBe(FIRST_KEY)
  })

  it('reads all 39 photos, in gallery order, once the gallery is open', () => {
    const urls = extractPpGalleryUrls(galleryHtml)
    const keys = [...new Set(urls.map((u) => parsePpImageUrl(u)?.photoKey))]
    expect(keys).toHaveLength(39)
    expect(keys.slice(0, 3)).toEqual([
      FIRST_KEY,
      'iZbbuxJOl1nV6YyXftmgZ4',
      'Q6275TkyxbjNvMAMFMEly6'
    ])
  })
})

describe('extractPpDetails', () => {
  it('reads the listing facts', () => {
    expect(extractPpDetails(galleryHtml)).toMatchObject({
      title: '4 Bedroom House in Stonehenge',
      price: 'R 2 790 000',
      suburb: 'Stonehenge',
      city: 'Nelspruit (Mbombela)',
      bedrooms: 4,
      bathrooms: 4,
      garages: 2,
      erf_size: '1 027 m²',
      floor_size: '323 m²',
      rates: 'R 1 430',
      levies: 'R 1 220',
      agent: 'Agent Name',
      agency: 'RE/MAX, RE/MAX Lifestyle Estates Nelspruit'
    })
  })

  it('keeps the description’s paragraphs on separate lines', () => {
    const d = extractPpDetails(galleryHtml).description ?? ''
    expect(d).toMatch(/^Exquisite Solar-Powered Family Home with Pool and Flatlet\nLooking for/)
    expect(d).toContain('perimeter beams')
  })

  it('returns nulls for a page without details', () => {
    expect(extractPpDetails('<html></html>')).toMatchObject({
      title: null,
      price: null,
      bedrooms: null
    })
  })
})

describe('buildPpResult', () => {
  it('builds the full result once the gallery is open', () => {
    const result = buildPpResult({ listing: LISTING, html: galleryHtml, networkUrls })
    expect(result).toMatchObject({ site: 'pp', externalId: 'T5669598', url: LISTING.url })
    expect(result.expectedPhotoCount).toBe(39)
    expect(result.photos).toHaveLength(39)
    expect(result.photos[0]).toEqual({
      sourceUrl: `https://images.pp.co.za/listing/${IMAGE_LISTING_ID}/${FIRST_KEY}`,
      fallbackUrl: img(IMAGE_LISTING_ID, FIRST_KEY, '1600/1066'),
      photoId: FIRST_KEY,
      fileName: `image_01_${FIRST_KEY}.jpg`
    })
    expect(result.photos[38]?.fileName).toMatch(/^image_39_/)
    expect(result.warnings).toEqual([])
    expect(result.duplicatePhotos).toBe(0)
    expect(result.notes).toEqual([])
  })

  it('warns, without failing, when only the grid photos were captured', () => {
    const result = buildPpResult({ listing: LISTING, html: initialHtml, networkUrls: [] })
    expect(result.photos).toHaveLength(9)
    expect(result.warnings.join(' ')).toMatch(/Found 9 of 39 photos/)
  })

  it('throws the "site changed" error when nothing is found', () => {
    expect(() =>
      buildPpResult({
        listing: LISTING,
        html: '<html><button>Photos 4</button></html>',
        networkUrls: []
      })
    ).toThrow(ScraperError)
  })
})
