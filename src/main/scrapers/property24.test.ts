import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildP24Result,
  extractP24Details,
  extractP24GallerySlots,
  isP24GalleryImageUrl,
  p24FileName,
  p24FullSizeUrl,
  p24PhotosFromUrls,
  parseP24ExpectedCount,
  parseP24ImageUrl
} from './property24'
import { ScraperError } from './types'

const FIXTURES = resolve(import.meta.dirname, '../../../test/fixtures/p24')
const html = readFileSync(resolve(FIXTURES, 'listing-gallery-open.html'), 'utf8')
const networkUrls = JSON.parse(
  readFileSync(resolve(FIXTURES, 'network-urls.json'), 'utf8')
) as string[]

const LISTING = {
  site: 'p24' as const,
  externalId: '115212892',
  url: 'https://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049/115212892'
}

describe('parseP24ImageUrl', () => {
  it('reads the id and optional size suffix', () => {
    expect(parseP24ImageUrl('https://images.prop24.com/378109205')).toEqual({
      id: '378109205',
      suffix: null
    })
    expect(parseP24ImageUrl('https://images.prop24.com/378109205/Ensure1280x720')).toEqual({
      id: '378109205',
      suffix: 'Ensure1280x720'
    })
    expect(parseP24ImageUrl('http://images.prop24.com/378109205/Crop162x108?x=1')).toEqual({
      id: '378109205',
      suffix: 'Crop162x108'
    })
  })

  it('returns null for other hosts and non-image paths', () => {
    expect(parseP24ImageUrl('https://www.property24.com/378109205')).toBeNull()
    expect(parseP24ImageUrl('https://images.prop24.com/Content/logo.png')).toBeNull()
    expect(parseP24ImageUrl('/Content/images/NoImage/black_320x213.png')).toBeNull()
    expect(parseP24ImageUrl('not a url')).toBeNull()
  })
})

describe('isP24GalleryImageUrl', () => {
  it('keeps bare ids and gallery sizes', () => {
    expect(isP24GalleryImageUrl('https://images.prop24.com/378109205')).toBe(true)
    expect(isP24GalleryImageUrl('https://images.prop24.com/378109205/Ensure960x540')).toBe(true)
    expect(isP24GalleryImageUrl('https://images.prop24.com/378109205/Crop320x213')).toBe(true)
  })

  it('drops agent photos and agency logos', () => {
    expect(isP24GalleryImageUrl('https://images.prop24.com/60954587/UpperCrop200x200')).toBe(false)
    expect(isP24GalleryImageUrl('https://images.prop24.com/364270662/Fit450x225')).toBe(false)
  })
})

describe('naming', () => {
  it('builds the bare full-size URL and the file name', () => {
    expect(p24FullSizeUrl('378109205')).toBe('https://images.prop24.com/378109205')
    expect(p24FileName('378109205')).toBe('image_378109205.jpg')
  })
})

describe('p24PhotosFromUrls', () => {
  it('normalises, filters and de-duplicates the captured network URLs in order', () => {
    const photos = p24PhotosFromUrls(networkUrls)
    const ids = photos.map((p) => p.photoId)
    expect(ids).not.toContain('60954587') // agent photo
    expect(ids).not.toContain('364270662') // agency logo
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(0, 4)).toEqual(['378109205', '378109207', '378109206', '378109267'])
    expect(photos[0]).toEqual({
      sourceUrl: 'https://images.prop24.com/378109205',
      photoId: '378109205',
      fileName: 'image_378109205.jpg'
    })
  })

  it('keeps non-sequential ids exactly as found (never counts up)', () => {
    const urls = [
      'https://images.prop24.com/377176739/Ensure1280x720',
      'https://images.prop24.com/377176743',
      'https://images.prop24.com/377176804/Crop162x108',
      'https://images.prop24.com/377176807/Ensure960x540',
      'https://images.prop24.com/377176743/Ensure960x540'
    ]
    expect(p24PhotosFromUrls(urls).map((p) => p.photoId)).toEqual([
      '377176739',
      '377176743',
      '377176804',
      '377176807'
    ])
  })

  it('ignores junk and placeholder URLs', () => {
    expect(
      p24PhotosFromUrls([
        '/Content/images/NoImage/black_320x213.png',
        'https://www.property24.com/blank.gif',
        ''
      ])
    ).toEqual([])
  })
})

describe('parseP24ExpectedCount', () => {
  it('reads the count the page states', () => {
    expect(parseP24ExpectedCount('<span>Photos (56)</span>')).toBe(56)
    expect(parseP24ExpectedCount('<div><span>See all 56 images</span></div>')).toBe(56)
    expect(parseP24ExpectedCount('See all 1 image')).toBe(1)
  })

  it('returns null when no count is shown', () => {
    expect(parseP24ExpectedCount('<p>Lovely house</p>')).toBeNull()
  })

  it('reads 64 from the saved listing', () => {
    expect(parseP24ExpectedCount(html)).toBe(64)
  })
})

describe('extractP24GallerySlots', () => {
  it('lists every gallery slot in order, keeping the listing’s own duplicates', () => {
    const slots = extractP24GallerySlots(html)
    expect(slots).toHaveLength(64)
    expect(slots.slice(0, 5)).toEqual([
      '378109205',
      '378109206',
      '378109207',
      '378109232',
      '378109208'
    ])
    expect(slots.at(-1)).toBe('378109267')
    // The real listing shows photo 378109216 twice (positions 13 and 59).
    expect(slots[12]).toBe('378109216')
    expect(slots[58]).toBe('378109216')
    expect(new Set(slots).size).toBe(63)
  })

  it('never includes the agent photo or agency logo', () => {
    const slots = extractP24GallerySlots(html)
    expect(slots).not.toContain('60954587')
    expect(slots).not.toContain('364270662')
  })

  it('returns an empty list for a page without a gallery', () => {
    expect(extractP24GallerySlots('<html><body><h1>Gone</h1></body></html>')).toEqual([])
  })
})

describe('extractP24Details', () => {
  const details = extractP24Details(html, LISTING.url)

  it('reads the headline facts', () => {
    expect(details).toMatchObject({
      title: 'Farm for Sale in Drummond',
      price: 'R 5 900 000',
      suburb: 'Drummond',
      city: 'Hillcrest',
      bedrooms: 4,
      bathrooms: 3,
      garages: 2,
      floor_size: '450 m²',
      erf_size: null,
      levies: null,
      rates: null,
      agent: 'Agent Name',
      agency: 'Wakefields Estate Agents Hillcrest'
    })
  })

  it('reads the full description with its headline', () => {
    expect(details.description).toMatch(/^Valley views & stunning sunsets\n\nEnjoy fresh air/)
    expect(details.description).toContain('ClearVu fencing')
    expect(details.description).not.toMatch(/Read full description/)
  })

  it('reads erf size, levies and rates when the overview lists them', () => {
    const row = (k: string, v: string): string =>
      `<div class="row p24_propertyOverviewRow"><div class="col-6 p24_propertyOverviewKey">${k}</div>` +
      `<div class="col-6 p24_propertyOverviewResult"><div class="p24_info">${v}</div></div></div>`
    const page =
      '<html><body><h1>House</h1>' +
      row('Erf Size', '1 200 m²') +
      row('Levies', 'R 2 150') +
      row('Rates and Taxes', 'R 1 100') +
      row('Bathrooms', '2.5') +
      row('Garages', '3') +
      '</body></html>'
    expect(extractP24Details(page, LISTING.url)).toMatchObject({
      erf_size: '1 200 m²',
      levies: 'R 2 150',
      rates: 'R 1 100',
      bathrooms: 2.5,
      garages: 3
    })
  })

  it('falls back to the URL for suburb and city when the page shows none', () => {
    const d = extractP24Details('<html><body></body></html>', LISTING.url)
    expect(d.suburb).toBe('Drummond')
    expect(d.city).toBe('Hillcrest')
    expect(d.title).toBeNull()
  })
})

describe('buildP24Result', () => {
  it('builds the full result from the saved page and network log', () => {
    const result = buildP24Result({ listing: LISTING, html, networkUrls })
    expect(result.site).toBe('p24')
    expect(result.externalId).toBe('115212892')
    expect(result.url).toBe(LISTING.url)
    expect(result.expectedPhotoCount).toBe(64)
    expect(result.photos).toHaveLength(63)
    expect(result.photos[0]?.sourceUrl).toBe('https://images.prop24.com/378109205')
    expect(result.photos.map((p) => p.fileName)).toContain('image_378109267.jpg')
    expect(result.details.suburb).toBe('Drummond')
  })

  it('explains a duplicate photo in the listing instead of reporting a missing one', () => {
    const result = buildP24Result({ listing: LISTING, html, networkUrls })
    expect(result.duplicatePhotos).toBe(1)
    expect(result.warnings).toEqual([])
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]).toMatch(/appears twice/)
    expect(result.notes[0]).toMatch(/63/)
  })

  it('ignores network-only images when the page gallery is already complete', () => {
    const extra = [...networkUrls, 'https://images.prop24.com/999999999/Crop320x213']
    const result = buildP24Result({ listing: LISTING, html, networkUrls: extra })
    expect(result.photos.map((p) => p.photoId)).not.toContain('999999999')
  })

  it('falls back to network images when the page has no gallery markup', () => {
    const page = '<html><body><span>Photos (64)</span></body></html>'
    const result = buildP24Result({ listing: LISTING, html: page, networkUrls })
    expect(result.photos).toHaveLength(10)
    expect(result.photos.map((p) => p.photoId)).not.toContain('60954587')
    expect(result.warnings.join(' ')).toMatch(/Found 10 of 64 photos/)
  })

  it('warns when fewer photos are found than the listing states', () => {
    const page = '<html><body><span>Photos (20)</span></body></html>'
    const result = buildP24Result({
      listing: LISTING,
      html: page,
      networkUrls: ['https://images.prop24.com/1/Ensure960x540', 'https://images.prop24.com/2']
    })
    expect(result.photos).toHaveLength(2)
    expect(result.warnings.join(' ')).toMatch(/Found 2 of 20 photos/)
    expect(result.warnings.join(' ')).toMatch(/manual/)
  })

  it('warns when the page shows no photo count', () => {
    const result = buildP24Result({
      listing: LISTING,
      html: '<html></html>',
      networkUrls: ['https://images.prop24.com/1']
    })
    expect(result.expectedPhotoCount).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/photo count/)
  })

  it('throws the "site changed" error when nothing is found', () => {
    let caught: unknown
    try {
      buildP24Result({
        listing: LISTING,
        html: '<html><span>Photos (3)</span></html>',
        networkUrls: ['https://images.prop24.com/60954587/UpperCrop200x200']
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ScraperError)
    expect((caught as ScraperError).code).toBe('no-photos')
    expect((caught as ScraperError).message).toMatch(/may have changed/)
    expect((caught as ScraperError).message).toMatch(/manual fallback/)
  })
})
