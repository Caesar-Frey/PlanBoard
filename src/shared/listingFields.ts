/**
 * The editable listing details (brief 4.2): one definition shared by the details form
 * (renderer) and the save handler (main), so both validate the same way. Pure, no imports.
 */

/** Listing fields, named exactly like the `listings` table columns. */
export interface ListingFields {
  title: string | null
  price: string | null
  suburb: string | null
  city: string | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  erf_size: string | null
  floor_size: string | null
  levies: string | null
  rates: string | null
  description: string | null
  agent: string | null
  agency: string | null
  // Version 3: agent contact, only as the listing shows it (never through an enquiry form).
  agent_phone: string | null
  agent_email: string | null
  agency_phone: string | null
  agency_email: string | null
  // Version 3: the listing's own bond calculator defaults and results, as shown ("R 27 855").
  bond_interest_rate: string | null
  bond_term_years: number | null
  bond_deposit: string | null
  bond_monthly_repayment: string | null
  /** Property24: "Total once-off costs" (transfer and bond registration costs together). */
  bond_once_off_costs: string | null
  /** Property24: "Min gross monthly income". */
  bond_min_income: string | null
  /** Private Property: "Total interest". */
  bond_total_interest: string | null
  /** Private Property: "Total repayment". */
  bond_total_repayment: string | null
}

export type ListingFieldKey = keyof ListingFields

/** What the form holds: every field as the text in its box. */
export type ListingFieldsInput = Record<ListingFieldKey, string>

export type ListingFieldErrors = Partial<Record<ListingFieldKey, string>>

/** Form order. */
export const LISTING_FIELD_KEYS = [
  'title',
  'price',
  'suburb',
  'city',
  'bedrooms',
  'bathrooms',
  'garages',
  'erf_size',
  'floor_size',
  'levies',
  'rates',
  'agent',
  'agency',
  'agent_phone',
  'agent_email',
  'agency_phone',
  'agency_email',
  'bond_interest_rate',
  'bond_term_years',
  'bond_deposit',
  'bond_monthly_repayment',
  'bond_once_off_costs',
  'bond_min_income',
  'bond_total_interest',
  'bond_total_repayment',
  'description'
] as const satisfies readonly ListingFieldKey[]

export const CONTACT_FIELD_KEYS = [
  'agent',
  'agent_phone',
  'agent_email',
  'agency',
  'agency_phone',
  'agency_email'
] as const satisfies readonly ListingFieldKey[]

export const BOND_FIELD_KEYS = [
  'bond_interest_rate',
  'bond_term_years',
  'bond_deposit',
  'bond_monthly_repayment',
  'bond_once_off_costs',
  'bond_min_income',
  'bond_total_interest',
  'bond_total_repayment'
] as const satisfies readonly ListingFieldKey[]

export type ListingFieldGroupId = 'property' | 'contact' | 'bond' | 'description'

/** The details form's sections, in order. Every key appears in exactly one. */
export const LISTING_FIELD_GROUPS: readonly {
  id: ListingFieldGroupId
  label: string
  keys: readonly ListingFieldKey[]
}[] = [
  {
    id: 'property',
    label: 'Listing details',
    keys: LISTING_FIELD_KEYS.filter(
      (k) =>
        k !== 'description' &&
        !(CONTACT_FIELD_KEYS as readonly string[]).includes(k) &&
        !(BOND_FIELD_KEYS as readonly string[]).includes(k)
    )
  },
  { id: 'contact', label: 'Agent contact', keys: CONTACT_FIELD_KEYS },
  { id: 'bond', label: 'Bond reference', keys: BOND_FIELD_KEYS },
  { id: 'description', label: 'Description', keys: ['description'] }
]

export const LISTING_FIELD_LABELS: Record<ListingFieldKey, string> = {
  title: 'Title',
  price: 'Price',
  suburb: 'Suburb',
  city: 'City',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  garages: 'Garages',
  erf_size: 'Erf size',
  floor_size: 'Floor size',
  levies: 'Levies',
  rates: 'Rates & taxes',
  description: 'Description',
  agent: 'Agent',
  agency: 'Agency',
  agent_phone: 'Agent phone',
  agent_email: 'Agent email',
  agency_phone: 'Agency phone',
  agency_email: 'Agency email',
  bond_interest_rate: 'Interest rate',
  bond_term_years: 'Loan term (years)',
  bond_deposit: 'Deposit',
  bond_monthly_repayment: 'Monthly repayment',
  bond_once_off_costs: 'Total once-off costs',
  bond_min_income: 'Min gross monthly income',
  bond_total_interest: 'Total interest',
  bond_total_repayment: 'Total repayment'
}

const NUMBER_FIELDS = new Set<ListingFieldKey>([
  'bedrooms',
  'bathrooms',
  'garages',
  'bond_term_years'
])

export const isNumberField = (key: ListingFieldKey): boolean => NUMBER_FIELDS.has(key)

const MAX_TEXT = 300
/** A field holding one or more email addresses ("a@x.co.za, b@x.co.za"). */
const EMAIL_FIELDS = new Set<ListingFieldKey>(['agent_email', 'agency_email'])
const EMAIL_LIST = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+(?:\s*,\s*[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$/
const MAX_DESCRIPTION = 20_000

export const EMPTY_FIELDS_INPUT: ListingFieldsInput = Object.fromEntries(
  LISTING_FIELD_KEYS.map((k) => [k, ''])
) as ListingFieldsInput

/**
 * Bedrooms and garages: whole numbers. Bathrooms may also be a half (South African listings
 * often say "2.5 bathrooms": a guest toilet), with a dot or a comma.
 */
function parseCount(key: ListingFieldKey, text: string): number | string {
  const half = key === 'bathrooms'
  const re = half ? /^\d{1,3}(?:[.,](?:0|5))?$/ : /^\d{1,3}$/
  if (!re.test(text)) {
    return half
      ? `${LISTING_FIELD_LABELS[key]} must be a number such as 2 or 2.5, or empty.`
      : `${LISTING_FIELD_LABELS[key]} must be a whole number (0 or more), or empty.`
  }
  return Number(text.replace(',', '.'))
}

export type ValidatedFields =
  { ok: true; value: ListingFields } | { ok: false; errors: ListingFieldErrors }

/** Trims every field, turns empty boxes into null and checks the numbers. */
export function validateListingFields(raw: unknown): ValidatedFields {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: { title: 'The form could not be read.' } }
  }
  const input = raw as Record<string, unknown>
  const value = {} as Record<ListingFieldKey, string | number | null>
  const errors: ListingFieldErrors = {}
  for (const key of LISTING_FIELD_KEYS) {
    const v = input[key]
    if (typeof v !== 'string') {
      errors[key] = `${LISTING_FIELD_LABELS[key]} could not be read.`
      continue
    }
    const text = v.trim()
    if (text === '') {
      value[key] = null
      continue
    }
    if (isNumberField(key)) {
      const n = parseCount(key, text)
      if (typeof n === 'string') errors[key] = n
      else value[key] = n
      continue
    }
    const max = key === 'description' ? MAX_DESCRIPTION : MAX_TEXT
    if (text.length > max) {
      errors[key] = `${LISTING_FIELD_LABELS[key]} is too long (at most ${max} characters).`
      continue
    }
    if (EMAIL_FIELDS.has(key) && !EMAIL_LIST.test(text)) {
      errors[key] =
        `${LISTING_FIELD_LABELS[key]} must be an email address (separate several with commas), or empty.`
      continue
    }
    value[key] = text
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: value as unknown as ListingFields }
}

/** Stored values → form text. */
export function fieldsToInput(fields: ListingFields): ListingFieldsInput {
  const out = { ...EMPTY_FIELDS_INPUT }
  for (const key of LISTING_FIELD_KEYS) {
    const v = fields[key]
    out[key] = v === null || v === undefined ? '' : String(v)
  }
  return out
}

/** Same text in every box (ignoring surrounding spaces): nothing to save. */
export function sameFields(a: ListingFieldsInput, b: ListingFieldsInput): boolean {
  return LISTING_FIELD_KEYS.every((k) => a[k].trim() === b[k].trim())
}
