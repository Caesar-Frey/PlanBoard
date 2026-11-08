import { describe, expect, it } from 'vitest'
import { detectListing, suggestFolderName } from './detect'
import { ScraperError } from './types'

const P24 = 'https://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049/115212892'
const PP =
  'https://www.privateproperty.co.za/for-sale/mpumalanga/mpumalanga-lowveld/nelspruit-mbombela/stonehenge/18-golden-weaver-turn/T5669598'

function errorOf(fn: () => unknown): ScraperError {
  try {
    fn()
  } catch (err) {
    if (err instanceof ScraperError) return err
    throw err
  }
  throw new Error('expected a ScraperError')
}

describe('detectListing: Property24', () => {
  it('reads the site and numeric listing id', () => {
    expect(detectListing(P24)).toEqual({ site: 'p24', externalId: '115212892', url: P24 })
  })

  it.each([
    ['no www', P24.replace('www.', '')],
    ['http', P24.replace('https:', 'http:')],
    ['trailing slash', `${P24}/`],
    ['query string', `${P24}?utm_source=share&x=1`],
    ['hash', `${P24}#gallery`],
    ['surrounding spaces', `  ${P24}\n`],
    ['no scheme', P24.replace('https://', '')],
    ['upper-case host', P24.replace('www.property24.com', 'WWW.Property24.COM')]
  ])('normalises %s to the canonical URL', (_label, input) => {
    expect(detectListing(input)).toEqual({ site: 'p24', externalId: '115212892', url: P24 })
  })

  it('accepts rental listings', () => {
    const url =
      'https://www.property24.com/to-rent/sea-point/cape-town/western-cape/11021/116000001'
    expect(detectListing(url).externalId).toBe('116000001')
  })

  it.each([
    [
      'suburb search page',
      'https://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049'
    ],
    ['province page', 'https://www.property24.com/for-sale/kwazulu-natal/2'],
    ['home page', 'https://www.property24.com/'],
    [
      'agency page',
      'https://www.property24.com/estate-agents/wakefields-estate-agents-hillcrest/24332'
    ],
    [
      'non-numeric id',
      'https://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049/abc'
    ]
  ])('rejects a %s as not a listing', (_label, url) => {
    const err = errorOf(() => detectListing(url))
    expect(err.code).toBe('not-a-listing')
    expect(err.site).toBe('p24')
    expect(err.message).toMatch(/Property24/)
  })
})

describe('detectListing: Private Property', () => {
  it('reads the site and T-number listing id', () => {
    expect(detectListing(PP)).toEqual({ site: 'pp', externalId: 'T5669598', url: PP })
  })

  it.each([
    ['no www', PP.replace('www.', '')],
    ['http', PP.replace('https:', 'http:')],
    ['trailing slash', `${PP}/`],
    ['query string', `${PP}?ref=email`],
    ['lower-case t', PP.replace('/T5669598', '/t5669598')]
  ])('normalises %s', (_label, input) => {
    expect(detectListing(input)).toEqual({ site: 'pp', externalId: 'T5669598', url: PP })
  })

  it.each([
    [
      'suburb search page',
      'https://www.privateproperty.co.za/for-sale/mpumalanga/mpumalanga-lowveld/nelspruit-mbombela/stonehenge/1355'
    ],
    [
      'estate agency page',
      'https://www.privateproperty.co.za/estate-agency/remax-lifestyle-estates-nelspruit/2040'
    ],
    ['home page', 'https://www.privateproperty.co.za']
  ])('rejects a %s as not a listing', (_label, url) => {
    const err = errorOf(() => detectListing(url))
    expect(err.code).toBe('not-a-listing')
    expect(err.site).toBe('pp')
  })
})

describe('detectListing: other input', () => {
  it.each([
    ['another property site', 'https://www.remax.co.za/listing/123'],
    ['a look-alike host', 'https://property24.com.evil.example/for-sale/a/b/c/1/115212892'],
    ['a sub-domain image host', 'https://images.prop24.com/378109205'],
    ['plain text', 'not a url'],
    ['an empty string', '   '],
    [
      'an ftp URL',
      'ftp://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049/115212892'
    ]
  ])('rejects %s with a clear message', (_label, input) => {
    const err = errorOf(() => detectListing(input))
    expect(err.code).toBe('unsupported-site')
    expect(err.message).toMatch(/Property24 or Private Property/)
  })
})

describe('suggestFolderName', () => {
  it('builds <Suburb>_<P24|PP>-<id>', () => {
    expect(suggestFolderName('Cornwall Hill', 'p24', '117097988')).toBe(
      'Cornwall-Hill_P24-117097988'
    )
    expect(suggestFolderName('Centurion Golf Estate', 'pp', 'T5670119')).toBe(
      'Centurion-Golf-Estate_PP-T5670119'
    )
  })

  it('makes awkward suburb names filesystem-safe', () => {
    expect(suggestFolderName('Nelspruit (Mbombela)', 'pp', 'T1')).toBe('Nelspruit-Mbombela_PP-T1')
    expect(suggestFolderName("St. Lucia / Mtubatuba's", 'p24', '1')).toBe(
      'St-Lucia-Mtubatubas_P24-1'
    )
    expect(suggestFolderName('  Île   de   Café  ', 'p24', '1')).toBe('Ile-de-Cafe_P24-1')
    expect(suggestFolderName('../../etc', 'p24', '1')).toBe('etc_P24-1')
  })

  it('falls back to "Listing" when the suburb is missing or unusable', () => {
    expect(suggestFolderName(null, 'p24', '115212892')).toBe('Listing_P24-115212892')
    expect(suggestFolderName('  ', 'pp', 'T5669598')).toBe('Listing_PP-T5669598')
    expect(suggestFolderName('???', 'pp', 'T5669598')).toBe('Listing_PP-T5669598')
  })
})
