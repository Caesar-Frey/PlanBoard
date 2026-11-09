/**
 * `Property_Details.txt`: every scraped field in a plain, readable layout.
 *
 * Re-run rule: the last line carries a short checksum of everything above it. When the
 * listing is surveyed again, the file is regenerated only if it is missing or still exactly
 * what PlanBoard wrote (checksum matches). If someone edited it, it is left alone and the
 * Handover screen says so.
 */
import { createHash } from 'node:crypto'
import type { CaptureCounts } from '../../shared/ipc'
import { SITE_NAME, type ListingDetails, type Site } from '../scrapers/types'

export const DETAILS_FILE_NAME = 'Property_Details.txt'

export interface DetailsInput {
  site: Site
  externalId: string
  url: string
  details: ListingDetails
  counts: Pick<CaptureCounts, 'found' | 'listed' | 'duplicates' | 'expected' | 'onDisk'>
  surveyedAt: Date
  /** When this copy of the file is written. Defaults to `surveyedAt` (a capture). */
  writtenAt?: Date
  /** When the bond figures were read. Defaults to `surveyedAt`. */
  bondAsOf?: Date | null
}

const NOT_LISTED = 'Not listed'
const LABEL_WIDTH = 16
const BOND_LABEL_WIDTH = 27
const MARKER = /\[planboard:([0-9a-f]{12})\]/

const checksum = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12)

const formatDate = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const value = (v: string | number | null): string => {
  if (v === null) return NOT_LISTED
  const s = String(v).trim()
  return s === '' ? NOT_LISTED : s
}

function photoLine(c: DetailsInput['counts']): string {
  let line = `${c.onDisk} in this folder`
  if (c.listed !== null) {
    line += ` · listing shows ${c.listed}`
    if (c.duplicates === 1) line += ' (1 photo appears twice)'
    else if (c.duplicates > 1) line += ` (${c.duplicates} photos appear twice)`
  }
  return line
}

const lines = (rows: [string, string][], width = LABEL_WIDTH): string =>
  rows.map(([label, v]) => `${`${label}:`.padEnd(width)}${v}`).join('\n')

const heading = (title: string): string => `${title}\n${'-'.repeat(title.length)}\n`

function contactSection(d: ListingDetails): string {
  return (
    heading('AGENT CONTACT') +
    lines([
      ['Agent', value(d.agent)],
      ['Agent phone', value(d.agent_phone)],
      ['Agent email', value(d.agent_email)],
      ['Agency', value(d.agency)],
      ['Agency phone', value(d.agency_phone)],
      ['Agency email', value(d.agency_email)]
    ]) +
    '\n'
  )
}

/** Only the figures the listing showed (each site shows a different set). */
function bondSection(d: ListingDetails, asOf: Date): string {
  const term = d.bond_term_years === null ? null : `${d.bond_term_years} years`
  const rows = (
    [
      ['Interest rate', d.bond_interest_rate],
      ['Loan term', term],
      ['Deposit', d.bond_deposit],
      ['Monthly repayment', d.bond_monthly_repayment],
      ['Total once-off costs', d.bond_once_off_costs],
      ['Min gross monthly income', d.bond_min_income],
      ['Total interest', d.bond_total_interest],
      ['Total repayment', d.bond_total_repayment]
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => r[1] !== null && r[1].trim() !== '')
  if (rows.length === 0) {
    return heading('BOND REFERENCE') + 'No bond figures were read from the listing.\n'
  }
  return (
    heading(`BOND REFERENCE (site defaults, ${formatDate(asOf)})`) +
    lines(rows, BOND_LABEL_WIDTH) +
    '\n(The listing’s own bond calculator with its default rate and term: a reference, not a quote.)\n'
  )
}

export function formatPropertyDetails(input: DetailsInput): string {
  const d = input.details
  const rows: [string, string][] = [
    ['Title', value(d.title)],
    ['Listing URL', input.url],
    ['Site', `${SITE_NAME[input.site]} (listing ${input.externalId})`],
    ['Price', value(d.price)],
    ['Suburb', value(d.suburb)],
    ['City', value(d.city)],
    ['Bedrooms', value(d.bedrooms)],
    ['Bathrooms', value(d.bathrooms)],
    ['Garages', value(d.garages)],
    ['Erf size', value(d.erf_size)],
    ['Floor size', value(d.floor_size)],
    ['Levies', value(d.levies)],
    ['Rates & taxes', value(d.rates)],
    ['Photos', photoLine(input.counts)],
    ['Date surveyed', formatDate(input.surveyedAt)]
  ]
  const description = d.description?.trim() ? d.description.trim() : 'No description.'
  const body =
    'PROPERTY DETAILS\n' +
    '================\n\n' +
    lines(rows) +
    '\n\n' +
    contactSection(d) +
    '\n' +
    bondSection(d, input.bondAsOf ?? input.surveyedAt) +
    '\n' +
    heading('DESCRIPTION') +
    `${description}\n\n`
  const footer =
    `— Written by PlanBoard on ${formatDate(input.writtenAt ?? input.surveyedAt)}. Edit freely: once this file ` +
    `is changed, surveying the listing again leaves it as it is. [planboard:${checksum(body)}] —`
  return `${body}${footer}\n`
}

/**
 * `ours`: unchanged since PlanBoard wrote it (safe to regenerate).
 * `edited`: changed by someone, or not written by PlanBoard (leave it alone).
 */
export function detailsFileState(content: string | null): 'missing' | 'ours' | 'edited' {
  if (content === null) return 'missing'
  const trimmed = content.replace(/\s+$/, '')
  const lastBreak = trimmed.lastIndexOf('\n')
  const lastLine = trimmed.slice(lastBreak + 1)
  const match = MARKER.exec(lastLine)
  if (!match) return 'edited'
  return checksum(content.slice(0, lastBreak + 1)) === match[1] ? 'ours' : 'edited'
}
