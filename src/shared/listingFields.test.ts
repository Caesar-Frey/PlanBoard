import { describe, expect, it } from 'vitest'
import {
  EMPTY_FIELDS_INPUT,
  LISTING_FIELD_GROUPS,
  LISTING_FIELD_KEYS,
  fieldsToInput,
  sameFields,
  validateListingFields,
  type ListingFieldsInput
} from './listingFields'

const input = (over: Partial<ListingFieldsInput> = {}): ListingFieldsInput => ({
  ...EMPTY_FIELDS_INPUT,
  ...over
})

describe('validateListingFields', () => {
  it('covers every scraped field', () => {
    expect([...LISTING_FIELD_KEYS].sort()).toEqual(
      [
        'agency',
        'agency_email',
        'agency_phone',
        'agent',
        'agent_email',
        'agent_phone',
        'bathrooms',
        'bond_deposit',
        'bond_interest_rate',
        'bond_min_income',
        'bond_monthly_repayment',
        'bond_once_off_costs',
        'bond_term_years',
        'bond_total_interest',
        'bond_total_repayment',
        'bedrooms',
        'city',
        'description',
        'erf_size',
        'floor_size',
        'garages',
        'levies',
        'price',
        'rates',
        'suburb',
        'title'
      ].sort()
    )
  })

  it('puts every field in exactly one form section, contacts and bond figures last', () => {
    const all = LISTING_FIELD_GROUPS.flatMap((g) => g.keys)
    expect([...all].sort()).toEqual([...LISTING_FIELD_KEYS].sort())
    expect(new Set(all).size).toBe(all.length)
    expect(LISTING_FIELD_GROUPS.map((g) => g.id)).toEqual(['property', 'contact', 'bond'])
    expect(LISTING_FIELD_GROUPS[1]?.keys).toEqual([
      'agent',
      'agent_phone',
      'agent_email',
      'agency',
      'agency_phone',
      'agency_email'
    ])
  })

  it('checks the loan term and email addresses', () => {
    const good = validateListingFields(
      input({
        bond_term_years: '20',
        bond_interest_rate: '10.75%',
        agent_email: 'agent@example.com',
        agency_email: 'a@example.com, b@example.co.za',
        agent_phone: '082 000 0000'
      })
    )
    expect(good.ok && good.value).toMatchObject({
      bond_term_years: 20,
      bond_interest_rate: '10.75%',
      agency_email: 'a@example.com, b@example.co.za',
      agent_phone: '082 000 0000'
    })
    const bad = validateListingFields(input({ bond_term_years: '20.5', agent_email: 'agent at x' }))
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(Object.keys(bad.errors).sort()).toEqual(['agent_email', 'bond_term_years'])
  })

  it('trims text, turns empty into null and parses numbers', () => {
    const r = validateListingFields(
      input({
        title: '  Family home ',
        price: 'R 3 450 000',
        suburb: '',
        bedrooms: ' 4 ',
        bathrooms: '2.5',
        garages: '',
        description: 'Line one\n\nLine two  '
      })
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({
      title: 'Family home',
      price: 'R 3 450 000',
      suburb: null,
      bedrooms: 4,
      bathrooms: 2.5,
      garages: null,
      description: 'Line one\n\nLine two'
    })
  })

  it('accepts 0 and a comma decimal for bathrooms', () => {
    const r = validateListingFields(input({ bedrooms: '0', bathrooms: '1,5', garages: '0' }))
    expect(r.ok && r.value).toMatchObject({ bedrooms: 0, bathrooms: 1.5, garages: 0 })
  })

  it.each([
    ['bedrooms', '-1'],
    ['bedrooms', '2.5'],
    ['bedrooms', 'four'],
    ['garages', '1e3'],
    ['garages', '3 garages'],
    ['bathrooms', '2.3'],
    ['bathrooms', '-0.5'],
    ['bedrooms', '1000']
  ] as const)('rejects %s = %j with a readable message', (field, raw) => {
    const r = validateListingFields(input({ [field]: raw }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors)).toEqual([field])
    expect(r.errors[field]).toMatch(/number|empty/i)
  })

  it('rejects text that is far too long and non-string input', () => {
    const r = validateListingFields(
      input({ title: 'x'.repeat(301), description: 'y'.repeat(20_001) })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['description', 'title'])
    expect(validateListingFields(null).ok).toBe(false)
    expect(validateListingFields({ ...input(), bedrooms: 3 }).ok).toBe(false)
  })
})

describe('fieldsToInput / sameFields', () => {
  it('round-trips stored values into form strings', () => {
    const v = validateListingFields(input({ bedrooms: '3', bathrooms: '2.5', title: 'A' }))
    if (!v.ok) throw new Error('should be valid')
    const back = fieldsToInput(v.value)
    expect(back).toMatchObject({ bedrooms: '3', bathrooms: '2.5', title: 'A', price: '' })
    expect(sameFields(back, input({ bedrooms: '3', bathrooms: '2.5', title: 'A' }))).toBe(true)
    expect(sameFields(back, input({ bedrooms: '4', bathrooms: '2.5', title: 'A' }))).toBe(false)
  })
})
