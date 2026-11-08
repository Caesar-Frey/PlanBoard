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
}

const NOT_LISTED = 'Not listed'
const LABEL_WIDTH = 16
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
    ['Agent', value(d.agent)],
    ['Agency', value(d.agency)],
    ['Photos', photoLine(input.counts)],
    ['Date surveyed', formatDate(input.surveyedAt)]
  ]
  const description = d.description?.trim() ? d.description.trim() : 'No description.'
  const body =
    'PROPERTY DETAILS\n' +
    '================\n\n' +
    rows.map(([label, v]) => `${`${label}:`.padEnd(LABEL_WIDTH)}${v}`).join('\n') +
    '\n\nDESCRIPTION\n' +
    '-----------\n' +
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
