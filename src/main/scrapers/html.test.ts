import { describe, expect, it } from 'vitest'
import {
  collapseEscapedQuotes,
  joinValues,
  mailAddress,
  percentText,
  randText,
  telNumber
} from './html'

describe('collapseEscapedQuotes', () => {
  it('turns SQL-style doubled apostrophes inside words back into one', () => {
    expect(
      collapseEscapedQuotes("Why you''ll love it: Entertainer''s Dream, Chef''s Kitchen")
    ).toBe("Why you'll love it: Entertainer's Dream, Chef's Kitchen")
    expect(collapseEscapedQuotes("O''Brien built it in the 1980''s")).toBe(
      "O'Brien built it in the 1980's"
    )
  })

  it('leaves other quote marks alone', () => {
    expect(collapseEscapedQuotes("A 'quoted' word, '' on its own, and it's fine")).toBe(
      "A 'quoted' word, '' on its own, and it's fine"
    )
    expect(collapseEscapedQuotes(null)).toBeNull()
  })
})

describe('randText', () => {
  it('writes rand amounts like the listing price', () => {
    expect(randText('r 59 898')).toBe('R 59 898')
    expect(randText('R 2 790 000')).toBe('R 2 790 000')
    expect(randText('0')).toBe('R 0')
    expect(randText('10 000 000')).toBe('R 10 000 000')
    expect(randText('R 1 101 037')).toBe('R 1 101 037')
  })

  it('returns null for empty or non-money text', () => {
    expect(randText('')).toBeNull()
    expect(randText(null)).toBeNull()
    expect(randText('Calculate')).toBeNull()
  })
})

describe('percentText', () => {
  it('adds the percent sign to a rate', () => {
    expect(percentText('10.75')).toBe('10.75%')
    expect(percentText('10,5 %')).toBe('10.5%')
    expect(percentText('abc')).toBeNull()
    expect(percentText(undefined)).toBeNull()
  })
})

describe('telNumber / mailAddress', () => {
  it('reads tel: and mailto: links', () => {
    expect(telNumber('tel:+27820000000')).toBe('+27820000000')
    expect(telNumber('tel:082%20000%200000')).toBe('082 000 0000')
    expect(telNumber('082 000 0000')).toBe('082 000 0000')
    expect(telNumber('Show number')).toBeNull()
    expect(mailAddress('mailto:agent@example.com?subject=Hi')).toBe('agent@example.com')
    expect(mailAddress('agent@example.com')).toBe('agent@example.com')
    expect(mailAddress('mailto:')).toBeNull()
  })
})

describe('joinValues', () => {
  it('joins distinct values, or returns null when there are none', () => {
    expect(joinValues(['082 000 0000', null, '082 000 0000', '031 000 0000'])).toBe(
      '082 000 0000, 031 000 0000'
    )
    expect(joinValues([null, ''])).toBeNull()
  })
})
