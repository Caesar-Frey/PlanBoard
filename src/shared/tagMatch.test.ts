import { describe, expect, it } from 'vitest'
import { findEquivalentTag, suggestTags, tagKey, type TagLike } from './tagMatch'

const tags = (...names: string[]): TagLike[] => names.map((name, i) => ({ id: i + 1, name }))

const names = (input: string, pool: TagLike[]): string[] =>
  suggestTags(input, pool).map((s) => s.tag.name)

describe('tagKey', () => {
  it('ignores case, spacing, punctuation, plurals and word order', () => {
    expect(tagKey('Island')).toBe(tagKey('islands'))
    expect(tagKey('Pendant lights')).toBe(tagKey('lights, pendant'))
    expect(tagKey('  Stacker   doors ')).toBe(tagKey('stacker door'))
    expect(tagKey('Built-in braai')).toBe(tagKey('built in braai'))
    expect(tagKey('Bookshelves')).toBe(tagKey('bookshelf'))
    expect(tagKey('Bench')).toBe(tagKey('benches'))
    expect(tagKey('Pantry')).toBe(tagKey('pantries'))
  })

  it('does not strip a double s or a short word', () => {
    expect(tagKey('Glass')).toBe('glass')
    expect(tagKey('Gas')).toBe('gas')
  })
})

describe('findEquivalentTag', () => {
  const pool = tags('Island', 'Pendant lights', 'Stacker doors')

  it('finds the same tag whatever the case, plural or word order', () => {
    expect(findEquivalentTag('ISLAND', pool)?.name).toBe('Island')
    expect(findEquivalentTag('islands', pool)?.name).toBe('Island')
    expect(findEquivalentTag('lights pendant', pool)?.name).toBe('Pendant lights')
    expect(findEquivalentTag('stacker door', pool)?.name).toBe('Stacker doors')
  })

  it('returns null for a different tag', () => {
    expect(findEquivalentTag('kitchen island', pool)).toBeNull()
    expect(findEquivalentTag('', pool)).toBeNull()
  })
})

describe('suggestTags', () => {
  const pool = tags(
    'Island',
    'Pendant lights',
    'Stacker doors',
    'Skylight',
    'Fireplace',
    'Herringbone floor',
    'Pool'
  )

  it('ignores case', () => {
    expect(names('ISLAND', pool)[0]).toBe('Island')
    expect(suggestTags('ISLAND', pool)[0]?.kind).toBe('same')
  })

  it('treats plurals as the same tag', () => {
    expect(names('islands', pool)[0]).toBe('Island')
    expect(names('pendant light', pool)[0]).toBe('Pendant lights')
    expect(suggestTags('pendant light', pool)[0]?.kind).toBe('same')
  })

  it('completes a prefix', () => {
    expect(names('pend', pool)[0]).toBe('Pendant lights')
    expect(names('st', pool)).toContain('Stacker doors')
    expect(suggestTags('pend', pool)[0]?.kind).toBe('prefix')
  })

  it('suggests an existing tag contained in a longer phrase ("kitchen island" → Island)', () => {
    const s = suggestTags('kitchen island', pool)
    expect(s[0]?.tag.name).toBe('Island')
    expect(s[0]?.kind).toBe('contained')
  })

  it('matches words in any order and words inside a tag', () => {
    expect(names('doors stacker', pool)[0]).toBe('Stacker doors')
    expect(names('lights', pool)[0]).toBe('Pendant lights')
    expect(names('herringbone', pool)[0]).toBe('Herringbone floor')
  })

  it('forgives small typos', () => {
    expect(names('iland', pool)[0]).toBe('Island')
    expect(names('fireplcae', pool)[0]).toBe('Fireplace')
    expect(names('skyligth', pool)[0]).toBe('Skylight')
    expect(names('pendent lights', pool)[0]).toBe('Pendant lights')
    expect(suggestTags('iland', pool)[0]?.kind).toBe('typo')
  })

  it('does not treat short words loosely', () => {
    // "pol" is one letter from "pool", but three-letter words are too short to guess at.
    expect(names('pol', pool)).not.toContain('Pool')
    expect(names('xyz', pool)).toEqual([])
    expect(names('', pool)).toEqual([])
    expect(names('   ', pool)).toEqual([])
  })

  it('ranks closer matches first and honours the limit', () => {
    const p = tags('Light well', 'Skylight', 'Lights')
    expect(names('light', p)[0]).toBe('Lights')
    expect(suggestTags('l', tags('La', 'Lb', 'Lc', 'Ld'), 2)).toHaveLength(2)
  })

  it('leaves out tags passed in `exclude` (already on the photo)', () => {
    expect(
      names(
        'island',
        pool.filter((t) => t.name !== 'Island')
      )
    ).not.toContain('Island')
  })
})
