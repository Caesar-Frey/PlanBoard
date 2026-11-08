import { describe, expect, it } from 'vitest'
import { parseManualInput } from './manual'

describe('parseManualInput: Property24', () => {
  it('accepts bare ids and image URLs separated by newlines, commas or spaces', () => {
    const text = [
      '378109205, 378109206',
      'https://images.prop24.com/378109207/Ensure1280x720',
      '  https://images.prop24.com/378109232   378109208;377176804',
      ''
    ].join('\n')
    const { photos, rejected } = parseManualInput(text, 'p24')
    expect(rejected).toEqual([])
    expect(photos.map((p) => p.photoId)).toEqual([
      '378109205',
      '378109206',
      '378109207',
      '378109232',
      '378109208',
      '377176804'
    ])
    expect(photos[2]).toEqual({
      sourceUrl: 'https://images.prop24.com/378109207',
      photoId: '378109207',
      fileName: 'image_378109207.jpg'
    })
  })

  it('de-duplicates, keeping the first position', () => {
    const { photos } = parseManualInput('5 4 5 https://images.prop24.com/4/Crop162x108', 'p24')
    expect(photos.map((p) => p.photoId)).toEqual(['5', '4'])
  })

  it('rejects agent photos, logos and things that are not image ids', () => {
    const { photos, rejected } = parseManualInput(
      'https://images.prop24.com/60954587/UpperCrop200x200 hello https://example.com/1.jpg 12',
      'p24'
    )
    expect(photos.map((p) => p.photoId)).toEqual(['12'])
    expect(rejected.map((r) => r.token)).toEqual([
      'https://images.prop24.com/60954587/UpperCrop200x200',
      'hello',
      'https://example.com/1.jpg'
    ])
    expect(rejected[0]?.reason).toMatch(/agent photo or logo/)
  })

  it('returns nothing for empty input', () => {
    expect(parseManualInput('  \n , ', 'p24')).toEqual({ photos: [], rejected: [] })
  })
})

describe('parseManualInput: Private Property', () => {
  const url = (key: string, listingId = '12158393'): string =>
    `https://images.pp.co.za/listing/${listingId}/${key}/600/450/contain/jpegorpng`

  it('accepts image URLs and numbers them in the order pasted', () => {
    const { photos, rejected } = parseManualInput(
      `${url('aaa')}\n${url('bbb')}, ${url('aaa')}`,
      'pp'
    )
    expect(rejected).toEqual([])
    expect(photos).toEqual([
      {
        sourceUrl: 'https://images.pp.co.za/listing/12158393/aaa',
        fallbackUrl: 'https://images.pp.co.za/listing/12158393/aaa/1600/1066/contain/jpegorpng',
        photoId: 'aaa',
        fileName: 'image_01_aaa.jpg'
      },
      {
        sourceUrl: 'https://images.pp.co.za/listing/12158393/bbb',
        fallbackUrl: 'https://images.pp.co.za/listing/12158393/bbb/1600/1066/contain/jpegorpng',
        photoId: 'bbb',
        fileName: 'image_02_bbb.jpg'
      }
    ])
  })

  it('accepts bare photo keys when the image listing id is known', () => {
    const { photos, rejected } = parseManualInput(
      'o6IXxlU62B5cdjk88PBzL1 iZbbuxJOl1nV6YyXftmgZ4 hi',
      'pp',
      { ppImageListingId: '12158393' }
    )
    expect(photos.map((p) => p.sourceUrl)).toEqual([
      'https://images.pp.co.za/listing/12158393/o6IXxlU62B5cdjk88PBzL1',
      'https://images.pp.co.za/listing/12158393/iZbbuxJOl1nV6YyXftmgZ4'
    ])
    expect(rejected.map((r) => r.token)).toEqual(['hi'])
  })

  it('rejects bare keys without a listing id, and other listings’ photos when one is given', () => {
    expect(parseManualInput('aaa', 'pp').rejected[0]?.reason).toMatch(/full image address/)
    const { photos, rejected } = parseManualInput(`${url('aaa')} ${url('zzz', '999')}`, 'pp', {
      ppImageListingId: '12158393'
    })
    expect(photos.map((p) => p.photoId)).toEqual(['aaa'])
    expect(rejected[0]?.reason).toMatch(/different listing/)
  })
})
