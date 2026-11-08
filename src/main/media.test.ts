import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mediaContentType, mediaSegments, mediaUrl, resolveMediaFile } from './media'

let base: string
let root: string
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'planboard media '))
  root = join(base, 'Library Root')
  mkdirSync(join(root, 'listings', 'Hillcrest_P24-1'), { recursive: true })
  writeFileSync(join(root, 'listings', 'Hillcrest_P24-1', 'image_1.jpg'), 'jpg')
  writeFileSync(join(root, 'listings', 'Hillcrest_P24-1', 'Property_Details.txt'), 'txt')
  writeFileSync(join(root, 'planboard.db'), 'db')
  writeFileSync(join(base, 'secret.jpg'), 'outside')
})
afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('mediaUrl', () => {
  it('builds an encoded planboard-media URL from a library-relative path', () => {
    expect(mediaUrl('listings/Hillcrest_P24-1/image_1.jpg')).toBe(
      'planboard-media://library/listings/Hillcrest_P24-1/image_1.jpg'
    )
    expect(mediaUrl('listings/A B/image 1.jpg')).toBe(
      'planboard-media://library/listings/A%20B/image%201.jpg'
    )
  })
})

describe('mediaSegments', () => {
  it('accepts listing images', () => {
    expect(mediaSegments('planboard-media://library/listings/Hillcrest_P24-1/image_1.jpg')).toEqual(
      ['listings', 'Hillcrest_P24-1', 'image_1.jpg']
    )
  })

  it('rejects other schemes, hosts and anything outside listings/', () => {
    for (const bad of [
      'file:///etc/passwd',
      'planboard-media://other/listings/A/image_1.jpg',
      'planboard-media://library/planboard.db',
      'planboard-media://library/listings/A/Property_Details.txt',
      'planboard-media://library/listings/A/.image_1.jpg.part',
      'not a url'
    ]) {
      expect(mediaSegments(bad)).toBeNull()
    }
  })

  it('rejects traversal attempts, plain or encoded', () => {
    for (const bad of [
      'planboard-media://library/listings/../../secret.jpg',
      'planboard-media://library/listings/%2e%2e/%2e%2e/secret.jpg',
      'planboard-media://library/listings/%2E%2E/secret.jpg',
      'planboard-media://library/listings/A%2f..%2f..%2fsecret.jpg',
      'planboard-media://library/listings/A%5c..%5csecret.jpg',
      'planboard-media://library/listings/%252e%252e/secret.jpg',
      'planboard-media://library/listings/A/image%00.jpg',
      'planboard-media://library/listings//image_1.jpg'
    ]) {
      expect(mediaSegments(bad)).toBeNull()
    }
  })
})

describe('resolveMediaFile', () => {
  it('serves an image inside the library', async () => {
    expect(
      await resolveMediaFile(root, 'planboard-media://library/listings/Hillcrest_P24-1/image_1.jpg')
    ).toBe(join(root, 'listings', 'Hillcrest_P24-1', 'image_1.jpg'))
  })

  it('returns null for missing files and folders', async () => {
    expect(
      await resolveMediaFile(root, 'planboard-media://library/listings/Hillcrest_P24-1/image_2.jpg')
    ).toBeNull()
    expect(
      await resolveMediaFile(root, 'planboard-media://library/listings/Hillcrest_P24-1.jpg')
    ).toBeNull()
  })

  it('refuses a symlink that points out of the library', async () => {
    symlinkSync(join(base, 'secret.jpg'), join(root, 'listings', 'Hillcrest_P24-1', 'image_9.jpg'))
    expect(
      await resolveMediaFile(root, 'planboard-media://library/listings/Hillcrest_P24-1/image_9.jpg')
    ).toBeNull()
  })

  it('refuses a symlinked folder that points out of the library', async () => {
    mkdirSync(join(base, 'elsewhere'))
    writeFileSync(join(base, 'elsewhere', 'image_1.jpg'), 'x')
    symlinkSync(join(base, 'elsewhere'), join(root, 'listings', 'Linked_P24-2'))
    expect(
      await resolveMediaFile(root, 'planboard-media://library/listings/Linked_P24-2/image_1.jpg')
    ).toBeNull()
  })

  it('works when the library root itself is reached through a symlink', async () => {
    const link = join(base, 'root-link')
    symlinkSync(root, link)
    expect(
      await resolveMediaFile(link, 'planboard-media://library/listings/Hillcrest_P24-1/image_1.jpg')
    ).not.toBeNull()
  })
})

describe('mediaContentType', () => {
  it('maps image extensions', () => {
    expect(mediaContentType('a.jpg')).toBe('image/jpeg')
    expect(mediaContentType('a.JPEG')).toBe('image/jpeg')
    expect(mediaContentType('a.png')).toBe('image/png')
    expect(mediaContentType('a.webp')).toBe('image/webp')
  })
})
