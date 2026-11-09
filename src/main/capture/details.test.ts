import { describe, expect, it } from 'vitest'
import { EMPTY_DETAILS, type ListingDetails } from '../scrapers/types'
import {
  DETAILS_FILE_NAME,
  detailsFileState,
  formatPropertyDetails,
  type DetailsInput
} from './details'

const DETAILS: ListingDetails = {
  title: '4 Bedroom House for Sale in Hillcrest',
  price: 'R 3 450 000',
  suburb: 'Hillcrest',
  city: 'Durban',
  bedrooms: 4,
  bathrooms: 2.5,
  garages: 2,
  erf_size: '1 450 m²',
  floor_size: '280 m²',
  levies: null,
  rates: 'R 1 650',
  description: 'A lovely family home.\n\nBig garden with pool.',
  agent: 'Agent Name',
  agency: 'Agency Name',
  agent_phone: null,
  agent_email: null,
  agency_phone: '031 000 0000',
  agency_email: 'office@example.com',
  bond_interest_rate: '10.75%',
  bond_term_years: 20,
  bond_deposit: 'R 0',
  bond_monthly_repayment: 'R 59 898',
  bond_once_off_costs: 'R 601 865',
  bond_min_income: 'R 199 661',
  bond_total_interest: null,
  bond_total_repayment: null
}

const input = (over: Partial<DetailsInput> = {}): DetailsInput => ({
  site: 'p24',
  externalId: '115212892',
  url: 'https://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049/115212892',
  details: DETAILS,
  counts: { found: 63, listed: 64, duplicates: 1, expected: 63, onDisk: 63 },
  surveyedAt: new Date(2026, 10, 8, 14, 30),
  ...over
})

describe('formatPropertyDetails', () => {
  const text = formatPropertyDetails(input())

  it('is named Property_Details.txt', () => {
    expect(DETAILS_FILE_NAME).toBe('Property_Details.txt')
  })

  it('lists every scraped field with a readable label', () => {
    for (const line of [
      'Title:          4 Bedroom House for Sale in Hillcrest',
      'Listing URL:    https://www.property24.com/for-sale/drummond/hillcrest/kwazulu-natal/7049/115212892',
      'Site:           Property24 (listing 115212892)',
      'Price:          R 3 450 000',
      'Suburb:         Hillcrest',
      'City:           Durban',
      'Bedrooms:       4',
      'Bathrooms:      2.5',
      'Garages:        2',
      'Erf size:       1 450 m²',
      'Floor size:     280 m²',
      'Levies:         Not listed',
      'Rates & taxes:  R 1 650',
      'Agent:          Agent Name',
      'Agency:         Agency Name',
      'Date surveyed:  8 November 2026'
    ]) {
      expect(text).toContain(line)
    }
  })

  it('has an Agent contact section', () => {
    expect(text).toContain(
      'AGENT CONTACT\n' +
        '-------------\n' +
        'Agent:          Agent Name\n' +
        'Agent phone:    Not listed\n' +
        'Agent email:    Not listed\n' +
        'Agency:         Agency Name\n' +
        'Agency phone:   031 000 0000\n' +
        'Agency email:   office@example.com\n'
    )
  })

  it('has a Bond reference section with the figures the site showed, dated', () => {
    const t = formatPropertyDetails(input({ bondAsOf: new Date(2026, 10, 9) }))
    expect(t).toContain(
      'BOND REFERENCE (site defaults, 9 November 2026)\n' +
        '-----------------------------------------------\n' +
        'Interest rate:             10.75%\n' +
        'Loan term:                 20 years\n' +
        'Deposit:                   R 0\n' +
        'Monthly repayment:         R 59 898\n' +
        'Total once-off costs:      R 601 865\n' +
        'Min gross monthly income:  R 199 661\n' +
        '(The listing’s own bond calculator with its default rate and term: a reference, not a quote.)\n'
    )
    // Figures the site doesn't show are left out, not listed as missing.
    expect(t).not.toContain('Total interest')
    // Sections come before the description.
    expect(t.indexOf('AGENT CONTACT')).toBeLessThan(t.indexOf('BOND REFERENCE'))
    expect(t.indexOf('BOND REFERENCE')).toBeLessThan(t.indexOf('DESCRIPTION'))
  })

  it('dates the bond figures by the survey when no bond date is known', () => {
    expect(text).toContain('BOND REFERENCE (site defaults, 8 November 2026)')
  })

  it('says so when no bond figures were read', () => {
    const none = Object.fromEntries(
      Object.entries(DETAILS).map(([k, v]) => [k, k.startsWith('bond_') ? null : v])
    ) as unknown as ListingDetails
    const t = formatPropertyDetails(input({ details: none }))
    expect(t).toContain(
      'BOND REFERENCE\n--------------\nNo bond figures were read from the listing.\n'
    )
  })

  it('explains the photo counts, including duplicates', () => {
    expect(text).toMatch(/Photos:\s+63 in this folder · listing shows 64 \(1 photo appears twice\)/)
  })

  it('keeps the description paragraphs', () => {
    expect(text).toContain('DESCRIPTION')
    expect(text).toContain('A lovely family home.\n\nBig garden with pool.')
  })

  it('handles a minimal manual listing', () => {
    const t = formatPropertyDetails(
      input({
        site: 'pp',
        externalId: 'T1',
        details: { ...EMPTY_DETAILS, suburb: 'Stonehenge' },
        counts: { found: 3, listed: null, duplicates: 0, expected: null, onDisk: 3 }
      })
    )
    expect(t).toContain('Site:           Private Property (listing T1)')
    expect(t).toContain('Title:          Not listed')
    expect(t).toMatch(/Photos:\s+3 in this folder$/m)
    expect(t).toContain('No description.')
  })

  it('ends with a footer that marks it as ours', () => {
    expect(text.trimEnd().split('\n').at(-1)).toMatch(/planboard:[0-9a-f]{12}/)
  })
})

describe('detailsFileState', () => {
  const ours = formatPropertyDetails(input())

  it('is missing when there is no file', () => {
    expect(detailsFileState(null)).toBe('missing')
  })

  it('recognises an unchanged file we wrote', () => {
    expect(detailsFileState(ours)).toBe('ours')
  })

  it('spots any user edit', () => {
    expect(detailsFileState(ours.replace('R 3 450 000', 'R 3 200 000 (offer)'))).toBe('edited')
    expect(detailsFileState(ours + '\nOur notes: love the stoep\n')).toBe('edited')
    expect(detailsFileState('My own notes about this house')).toBe('edited')
  })

  it('treats a removed footer as edited', () => {
    const lines = ours.trimEnd().split('\n')
    expect(detailsFileState(lines.slice(0, -1).join('\n'))).toBe('edited')
  })
})
