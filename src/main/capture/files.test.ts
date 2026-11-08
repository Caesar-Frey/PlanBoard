import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  hasFile,
  isSafeFileName,
  matchExisting,
  partialPath,
  removePartials,
  writeFileAtomic
} from './files'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'planboard files '))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('partialPath', () => {
  it('is a hidden .part file next to the final file', () => {
    expect(partialPath('/lib/listings/A/image_1.jpg')).toBe('/lib/listings/A/.image_1.jpg.part')
  })
})

describe('writeFileAtomic', () => {
  it('writes the final file and leaves no partial behind', async () => {
    const file = join(dir, 'image_1.jpg')
    await writeFileAtomic(file, new Uint8Array([1, 2, 3]))
    expect([...readFileSync(file)]).toEqual([1, 2, 3])
    expect(readdirSync(dir)).toEqual(['image_1.jpg'])
  })

  it('never leaves a half file under the final name when the write fails', async () => {
    const file = join(dir, 'missing-folder', 'image_1.jpg')
    await expect(writeFileAtomic(file, new Uint8Array([1]))).rejects.toThrow()
    expect(await hasFile(file)).toBe(false)
  })
})

describe('hasFile', () => {
  it('is true only for a non-empty regular file', async () => {
    writeFileSync(join(dir, 'full.jpg'), 'x')
    writeFileSync(join(dir, 'empty.jpg'), '')
    expect(await hasFile(join(dir, 'full.jpg'))).toBe(true)
    expect(await hasFile(join(dir, 'empty.jpg'))).toBe(false)
    expect(await hasFile(join(dir, 'nope.jpg'))).toBe(false)
    expect(await hasFile(dir)).toBe(false)
  })
})

describe('removePartials', () => {
  it('deletes leftover .part files only', async () => {
    writeFileSync(join(dir, '.image_1.jpg.part'), 'half')
    writeFileSync(join(dir, 'image_2.jpg'), 'whole')
    writeFileSync(join(dir, 'Property_Details.txt'), 'notes')
    expect(await removePartials(dir)).toBe(1)
    expect(readdirSync(dir).sort()).toEqual(['Property_Details.txt', 'image_2.jpg'])
  })
})

describe('isSafeFileName', () => {
  it('accepts the scraper file names', () => {
    expect(isSafeFileName('image_377176739.jpg')).toBe(true)
    expect(isSafeFileName('image_01_kdUN0dCAEZq08ZukpkarZ6.jpg')).toBe(true)
    expect(isSafeFileName('image_02_a-b_c.jpg')).toBe(true)
  })

  it('rejects anything that could escape the folder or hide', () => {
    for (const bad of ['../x.jpg', 'a/b.jpg', '.hidden.jpg', '', 'x\\y.jpg', 'image.txt', '..']) {
      expect(isSafeFileName(bad)).toBe(false)
    }
  })
})

describe('matchExisting', () => {
  const names = new Set([
    'image_377176739.jpg',
    'image_05_kdUN0dCAEZq08ZukpkarZ6.jpg',
    'Property_Details.txt'
  ])

  it('matches the exact file name', () => {
    expect(matchExisting('image_377176739.jpg', '377176739', names)).toBe('image_377176739.jpg')
  })

  it('matches a Private Property photo saved under a different gallery number', () => {
    expect(
      matchExisting('image_01_kdUN0dCAEZq08ZukpkarZ6.jpg', 'kdUN0dCAEZq08ZukpkarZ6', names)
    ).toBe('image_05_kdUN0dCAEZq08ZukpkarZ6.jpg')
  })

  it('returns null when the photo is not there', () => {
    expect(matchExisting('image_1.jpg', '1', names)).toBeNull()
    expect(matchExisting('image_02_other.jpg', 'other', names)).toBeNull()
  })
})
