import { describe, expect, it } from 'vitest'
import { DEFAULT_LIBRARY_ROOT, expandHome, libraryPaths, resolveLibraryRoot } from './paths'

const HOME = '/Users/alex'

describe('expandHome', () => {
  it('expands a bare ~', () => {
    expect(expandHome('~', HOME)).toBe(HOME)
  })

  it('expands ~/ prefixes', () => {
    expect(expandHome('~/Pictures/PlanBoard', HOME)).toBe('/Users/alex/Pictures/PlanBoard')
  })

  it('leaves absolute paths and ~user forms alone', () => {
    expect(expandHome('/Volumes/Data', HOME)).toBe('/Volumes/Data')
    expect(expandHome('~bob/x', HOME)).toBe('~bob/x')
  })
})

describe('resolveLibraryRoot', () => {
  it('defaults to ~/Pictures/PlanBoard', () => {
    expect(DEFAULT_LIBRARY_ROOT).toBe('~/Pictures/PlanBoard')
    expect(resolveLibraryRoot(DEFAULT_LIBRARY_ROOT, HOME)).toBe('/Users/alex/Pictures/PlanBoard')
  })

  it('normalises and strips trailing slashes', () => {
    expect(resolveLibraryRoot('~/Pictures/./PlanBoard/', HOME)).toBe(
      '/Users/alex/Pictures/PlanBoard'
    )
  })

  it('keeps paths with spaces intact', () => {
    expect(resolveLibraryRoot('~/My Docs/House', HOME)).toBe('/Users/alex/My Docs/House')
  })

  it('rejects empty and relative paths', () => {
    expect(() => resolveLibraryRoot('', HOME)).toThrow()
    expect(() => resolveLibraryRoot('   ', HOME)).toThrow()
    expect(() => resolveLibraryRoot('relative/dir', HOME)).toThrow()
  })
})

describe('libraryPaths', () => {
  it('derives listings dir and db path', () => {
    expect(libraryPaths('/Users/alex/Pictures/PlanBoard')).toEqual({
      root: '/Users/alex/Pictures/PlanBoard',
      listingsDir: '/Users/alex/Pictures/PlanBoard/listings',
      dbPath: '/Users/alex/Pictures/PlanBoard/planboard.db'
    })
  })
})
