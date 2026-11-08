import { describe, expect, it } from 'vitest'
import { isInside, isKnownListingUrl, listingFolderPath } from './pathGuard'

describe('isInside', () => {
  it('is true only for paths strictly inside the parent', () => {
    expect(isInside('/lib', '/lib/listings/A')).toBe(true)
    expect(isInside('/lib/', '/lib/listings')).toBe(true)
    expect(isInside('/lib', '/lib')).toBe(false)
    expect(isInside('/lib', '/lib2/x')).toBe(false)
    expect(isInside('/lib', '/lib/../etc')).toBe(false)
    expect(isInside('/lib', '/etc')).toBe(false)
  })
})

describe('listingFolderPath', () => {
  it('resolves a stored relative folder inside listings/', () => {
    expect(listingFolderPath('/lib', 'listings/Hillcrest_P24-1')).toBe(
      '/lib/listings/Hillcrest_P24-1'
    )
  })

  it('refuses anything that escapes listings/', () => {
    expect(listingFolderPath('/lib', '../x')).toBeNull()
    expect(listingFolderPath('/lib', 'listings/../planboard.db')).toBeNull()
    expect(listingFolderPath('/lib', '/etc')).toBeNull()
    expect(listingFolderPath('/lib', 'listings')).toBeNull()
    expect(listingFolderPath('/lib', 'listings/A/B')).toBeNull()
  })
})

describe('isKnownListingUrl', () => {
  it('allows https listing pages on the two sites', () => {
    expect(isKnownListingUrl('https://www.property24.com/for-sale/a/b/c/1/115212892')).toBe(true)
    expect(isKnownListingUrl('https://www.privateproperty.co.za/for-sale/x/T5669598')).toBe(true)
    expect(isKnownListingUrl('https://property24.com/for-sale/a/b/c/1/115212892')).toBe(true)
  })

  it('refuses other schemes and hosts', () => {
    for (const bad of [
      'http://www.property24.com/for-sale/1',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://www.property24.com.evil.com/x',
      'https://evil.com/?u=https://www.property24.com',
      'https://user@evil.com',
      'not a url'
    ]) {
      expect(isKnownListingUrl(bad)).toBe(false)
    }
  })
})
