import { describe, expect, it } from 'vitest'
import { MARKS, ROOMS, cleanTagName, isMark, isRoom, taggedPercent } from './tagging'

describe('rooms', () => {
  it('is the fixed list from the brief, in order', () => {
    expect(ROOMS).toEqual([
      'Whole house / Exterior',
      'Facade',
      'Entrance',
      'Lounge',
      'Dining',
      'Kitchen',
      'Scullery',
      'Main bedroom',
      'Bedroom',
      'Bathroom',
      'Study',
      'Patio',
      'Braai area',
      'Garden',
      'Pool',
      'Garage',
      'Other'
    ])
  })

  it('accepts only names on the list, exactly', () => {
    expect(isRoom('Kitchen')).toBe(true)
    expect(isRoom('Braai area')).toBe(true)
    expect(isRoom('kitchen')).toBe(false)
    expect(isRoom('Attic')).toBe(false)
    expect(isRoom('')).toBe(false)
    expect(isRoom(null)).toBe(false)
    expect(isRoom(3)).toBe(false)
  })
})

describe('marks', () => {
  it('is must / nice / maybe', () => {
    expect(MARKS.map((m) => m.id)).toEqual(['must', 'nice', 'maybe'])
    expect(MARKS.map((m) => m.label)).toEqual(['Must-have', 'Nice', 'Maybe'])
    expect(isMark('must')).toBe(true)
    expect(isMark('Must')).toBe(false)
    expect(isMark('love')).toBe(false)
    expect(isMark(null)).toBe(false)
  })
})

describe('cleanTagName', () => {
  it('trims, collapses spaces and capitalises the first letter', () => {
    expect(cleanTagName('  kitchen   island ')).toBe('Kitchen island')
    expect(cleanTagName('pendant lights')).toBe('Pendant lights')
    expect(cleanTagName('LED strip')).toBe('LED strip')
  })

  it('refuses empty and over-long names', () => {
    expect(cleanTagName('   ')).toBeNull()
    expect(cleanTagName('x'.repeat(41))).toBeNull()
    expect(cleanTagName('x'.repeat(40))).toBe('X'.concat('x'.repeat(39)))
  })
})

describe('taggedPercent', () => {
  it('rounds down and is 0 for an empty listing', () => {
    expect(taggedPercent(0, 0)).toBe(0)
    expect(taggedPercent(1, 3)).toBe(33)
    expect(taggedPercent(2, 3)).toBe(66)
    expect(taggedPercent(3, 3)).toBe(100)
  })
})
